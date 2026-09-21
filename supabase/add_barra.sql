-- =========================================================
-- PANTALLA DE BARRA CON ESTADO PROPIO (/barra)
-- Pegar en Supabase → SQL Editor → Run
--
-- Requiere add_comandas.sql YA aplicado (usa sus tablas y helpers).
-- Decisión aprobada: varos-pos/DECISIONES.md, sección "Pantalla de barra
-- (/barra) con estado propio" (2026-09-21).
--
-- Qué problema resuelve:
--  * comandas.estado (nuevo/preparando/listo) es UNO por comanda. Si la barra
--    usara ese mismo estado, marcar "listo" en la barra marcaría también la
--    cocina (y al revés) y el aviso al garzón saldría antes de tiempo. Acá la
--    barra tiene su propio estado: estado_barra / estado_barra_at /
--    listo_barra_at. La cocina sigue con estado / estado_at / listo_at.
--
-- Qué hace (todo ADITIVO salvo las dos funciones recreadas, ver abajo):
--  1. Tres columnas nuevas en comandas (las comandas existentes toman el
--     default 'nuevo'; nada las lee todavía).
--  2. barra_estado(código, versión)  — gemela de cocina_estado: solo comandas
--     con >= 1 ítem de barra, con los ítems filtrados a barra y
--     estado = estado_barra. MISMA forma de JSON que cocina_estado (la
--     pantalla se reutiliza) y mismo mecanismo de `version`.
--  3. barra_marcar(código, comanda, estado) — gemela de cocina_marcar sobre
--     estado_barra. Devuelve lo mismo MÁS estacion = 'barra'.
--  4. REGLAS DE REINICIO. Hasta hoy crear_o_agregar_comanda y
--     editar_items_comanda devolvían la comanda entera a 'nuevo' ante
--     cualquier cambio. Ahora:
--       - agregar ítems de barra  -> reinicia SOLO estado_barra (+ su _at)
--       - agregar ítems de cocina -> reinicia SOLO estado (+ estado_at)
--       - agregar ambos          -> reinicia los dos
--       - editar/quitar ítems    -> reinicia SOLO la estación de los ítems
--                                   afectados (cambiados o quitados)
--     Ambas se recrean con `create or replace` (mismas firmas, mismo tipo de
--     retorno). Todo lo demás (validaciones, mensajes de error, advisory
--     lock, for update, vencimiento, cancelación) es idéntico al original.
--  5. cocina_estado / cocina_marcar / comandas_json / comandas_abiertas /
--     cerrar_mesa_y_cobrar / estadisticas_cocina / vencimiento: NO se tocan.
--     La cocina sigue viendo solo ítems de cocina con `estado`.
--
-- Código de acceso: la barra usa el MISMO código que la cocina
-- (pos_config.codigo_cocina, vía comandas_autorizar_cocina).
--
-- VERSIÓN: los triggers comandas_version_t / comanda_items_version_t de
-- add_comandas.sql son por FILA y sin lista de columnas (after insert or
-- update or delete), así que un cambio en estado_barra & co. ya sube el
-- contador. No hace falta tocarlos.
--
-- Idempotente: se puede pegar dos veces (add column if not exists, create or
-- replace). La segunda vez PostgreSQL avisa "column ... already exists,
-- skipping": es normal, no es un error.
--
-- Cómo volver atrás: las columnas y funciones nuevas pueden quedar sin uso; el
-- interruptor comandas_backend = 'worker' desactiva todo el sistema de
-- comandas. Para restaurar el reinicio "todo a nuevo" bastaría volver a pegar
-- las dos funciones de add_comandas.sql.
-- =========================================================


-- =========================================================
-- 1. COLUMNAS
-- =========================================================

alter table public.comandas
  add column if not exists estado_barra text not null default 'nuevo'
    check (estado_barra in ('nuevo', 'preparando', 'listo'));
alter table public.comandas
  add column if not exists estado_barra_at timestamptz;   -- último movimiento de la barra (null = desde creado_at)
alter table public.comandas
  add column if not exists listo_barra_at timestamptz;    -- última vez que la barra marcó 'listo'

-- (Privilegios: las columnas heredan los de la tabla, que add_comandas.sql ya
-- dejó en "anon: nada; authenticated: solo select limitado por RLS a admins".)


-- =========================================================
-- 2. HELPER INTERNO (nadie lo llama desde el cliente)
-- =========================================================

-- Gemela de comandas_json(true) para la barra: comandas vigentes con >= 1
-- ítem de barra, ítems filtrados a barra, estado = estado_barra. Mismas claves
-- que comandas_json para que la pantalla de cocina se reutilice tal cual.
create or replace function public.comandas_json_barra()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x.j order by x.creado_at, x.id), '[]'::jsonb)
  from (
    select
      c.id,
      c.creado_at,
      jsonb_build_object(
        'id', c.id,
        'mesa', c.mesa,
        'sector', c.sector,
        'garzon', c.garzon,
        'hora', to_char(c.creado_at at time zone 'America/Santiago', 'HH24:MI'),
        'estado', c.estado_barra,
        'creado_at', c.creado_at,
        'estado_at', coalesce(c.estado_barra_at, c.creado_at),
        'min_estado', greatest(0, floor(extract(epoch from (now() - coalesce(c.estado_barra_at, c.creado_at))) / 60))::int,
        'min_creado', greatest(0, floor(extract(epoch from (now() - c.creado_at)) / 60))::int,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id,
                   'cant', i.cant,
                   'nombre', i.nombre,
                   'comentario', i.comentario,
                   'menus', i.menus,
                   'estacion', i.estacion) order by i.orden), '[]'::jsonb)
          from public.comanda_items i
          where i.comanda_id = c.id
            and i.estacion = 'barra')
      ) as j
    from public.comandas_vigentes() c
    where exists (select 1 from public.comanda_items i
                  where i.comanda_id = c.id and i.estacion = 'barra')
  ) x
$$;


-- =========================================================
-- 3. FUNCIONES PÚBLICAS DE BARRA (las llama la tablet, sin login)
-- =========================================================

-- Barra: solo ítems de barra; omite comandas sin ítems de barra.
create or replace function public.barra_estado(p_codigo_cocina text, p_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version text;
begin
  perform public.comandas_autorizar_cocina(p_codigo_cocina);
  v_version := public.comandas_version_actual();
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('version', v_version, 'sin_cambios', true);
  end if;
  return jsonb_build_object(
    'version', v_version,
    'ahora', now(),
    'comandas', public.comandas_json_barra());
end;
$$;

-- Barra: nuevo | preparando | listo sobre estado_barra. `avisar` = true cuando
-- pasa a 'listo' y antes no lo estaba (la pantalla entonces llama a
-- notificar-garzon con el texto de barra: "Bebidas listas").
create or replace function public.barra_marcar(p_codigo_cocina text, p_comanda_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.comandas;
begin
  perform public.comandas_autorizar_cocina(p_codigo_cocina);
  if p_estado is null or p_estado not in ('nuevo', 'preparando', 'listo') then
    raise exception 'Estado inválido';
  end if;

  select c.* into v_c
  from public.comandas c
  where c.id = p_comanda_id and c.cerrada_at is null
  for update;
  if not found
     or not exists (select 1 from public.comandas_vigentes() v where v.id = v_c.id) then
    raise exception 'Comanda no encontrada o ya cerrada';
  end if;

  -- Solo comandas que la barra puede ver.
  if not exists (select 1 from public.comanda_items i
                 where i.comanda_id = v_c.id and i.estacion = 'barra') then
    raise exception 'La comanda no tiene ítems de barra';
  end if;

  if v_c.estado_barra = p_estado then
    return jsonb_build_object('ok', true, 'id', v_c.id, 'estado', v_c.estado_barra, 'cambio', false,
      'avisar', false, 'garzon', v_c.garzon, 'mesa', v_c.mesa, 'sector', v_c.sector,
      'estacion', 'barra');
  end if;

  update public.comandas
     set estado_barra = p_estado,
         estado_barra_at = clock_timestamp(),
         listo_barra_at = case when p_estado = 'listo' then clock_timestamp() else listo_barra_at end
   where id = v_c.id;

  return jsonb_build_object('ok', true, 'id', v_c.id, 'estado', p_estado, 'cambio', true,
    'avisar', (p_estado = 'listo'),
    'garzon', v_c.garzon, 'mesa', v_c.mesa, 'sector', v_c.sector,
    'estacion', 'barra');
end;
$$;


-- =========================================================
-- 4. FUNCIONES RECREADAS (reglas de reinicio por estación)
--    Copia de add_comandas.sql salvo lo marcado con  -- [BARRA]
-- =========================================================

-- Mozo: crea la comanda de la mesa o AGREGA filas a la abierta.
create or replace function public.crear_o_agregar_comanda(
  p_codigo text,
  p_mesa text,
  p_sector text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_garzon text;
  v_mesa text := public.comandas_limpiar(p_mesa, 10);
  v_sector text := public.comandas_limpiar(p_sector, 20);
  v_items jsonb;
  v_id uuid;
  v_hay_cocina boolean;   -- [BARRA]
  v_hay_barra boolean;    -- [BARRA]
begin
  v_garzon := public.comandas_autorizar(p_codigo, false);

  v_items := public.comandas_normalizar_items(p_items);
  if v_mesa = '' or jsonb_array_length(v_items) = 0 then
    raise exception 'Faltan mesa o ítems';
  end if;

  -- [BARRA] qué estaciones traen los ítems nuevos
  select coalesce(bool_or(e.it->>'estacion' = 'cocina'), false),
         coalesce(bool_or(e.it->>'estacion' = 'barra'), false)
    into v_hay_cocina, v_hay_barra
  from jsonb_array_elements(v_items) as e(it);

  -- Una a la vez por mesa+sector: cierra la carrera "no existe comanda
  -- abierta" -> dos comandas (y la de "agregar" vs "cobrar/cancelar").
  perform pg_advisory_xact_lock(hashtextextended('comanda:' || v_mesa || '|' || v_sector, 0));

  select c.id into v_id
  from public.comandas c
  where c.mesa = v_mesa and c.sector = v_sector and c.cerrada_at is null
  for update;

  -- Una comanda fantasma (vencida) no se revive: se cierra y se abre una nueva.
  if v_id is not null
     and not exists (select 1 from public.comandas_vigentes() v where v.id = v_id) then
    update public.comandas
       set cerrada_at = clock_timestamp(), cierre = 'vencida'
     where id = v_id;
    v_id := null;
  end if;

  if v_id is null then
    insert into public.comandas (mesa, sector, garzon)
    values (v_mesa, v_sector, v_garzon)
    returning id into v_id;
  else
    -- [BARRA] Agregar platos a una comanda listo/preparando la vuelve a
    -- 'nuevo' SOLO en la estación de los ítems agregados: cocina no se entera
    -- de un trago nuevo, ni la barra de un plato nuevo.
    update public.comandas
       set estado          = case when v_hay_cocina then 'nuevo' else estado end,
           estado_at       = case when v_hay_cocina then clock_timestamp() else estado_at end,
           estado_barra    = case when v_hay_barra then 'nuevo' else estado_barra end,
           estado_barra_at = case when v_hay_barra then clock_timestamp() else estado_barra_at end
     where id = v_id;
  end if;

  insert into public.comanda_items (comanda_id, cant, nombre, comentario, menus, estacion, created_at)
  select v_id,
         (it->>'cant')::int,
         it->>'nombre',
         it->>'comentario',
         case when jsonb_typeof(it->'menus') = 'array' then it->'menus' end,
         it->>'estacion',
         clock_timestamp()
  from jsonb_array_elements(v_items) with ordinality as e(it, ord)
  order by e.ord;

  return v_id;
end;
$$;

-- Mozo (o Caja con sesión de admin): editar cantidades / quitar ítems.
-- p_items = [{id: <comanda_items.id>, cant: <int >= 0>}]. Los ítems que NO se
-- mencionan quedan intactos (así un plato que otro garzón agregó mientras
-- tanto no se pierde). cant = 0 quita el ítem; si TODOS los ítems de la
-- comanda quedan en cero, la comanda se CANCELA (cerrada_at + cierre =
-- 'cancelada', las filas se conservan como historial).
create or replace function public.editar_items_comanda(
  p_codigo text,
  p_comanda_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa text;
  v_sector text;
  v_c public.comandas;
  v_el jsonb;
  v_ids uuid[] := '{}';
  v_cants int[] := '{}';
  v_cant int;
  v_restantes int;
  v_n int;
  v_cambios int := 0;
  v_coc boolean := false;   -- [BARRA] ¿se afectó algún ítem de cocina?
  v_bar boolean := false;   -- [BARRA] ¿se afectó algún ítem de barra?
  v_c1 boolean;             -- [BARRA]
  v_b1 boolean;             -- [BARRA]
begin
  perform public.comandas_autorizar(p_codigo, true);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Ítems inválidos';
  end if;

  for v_el in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_el) <> 'object'
       or coalesce(v_el->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Ítem inválido';
    end if;
    if coalesce(v_el->>'cant', '') !~ '^\s*[0-9]{1,6}\s*$' then
      raise exception 'Cantidad inválida';
    end if;
    v_cant := (btrim(v_el->>'cant'))::int;
    if (v_el->>'id')::uuid = any(v_ids) then
      raise exception 'Ítem repetido';
    end if;
    v_ids := v_ids || (v_el->>'id')::uuid;
    v_cants := v_cants || v_cant;
  end loop;

  select c.mesa, c.sector into v_mesa, v_sector
  from public.comandas c where c.id = p_comanda_id;
  if not found then
    raise exception 'Comanda no encontrada o ya cerrada';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comanda:' || v_mesa || '|' || v_sector, 0));

  select c.* into v_c
  from public.comandas c
  where c.id = p_comanda_id and c.cerrada_at is null
  for update;
  if not found then
    raise exception 'Comanda no encontrada o ya cerrada';
  end if;
  if not exists (select 1 from public.comandas_vigentes() v where v.id = v_c.id) then
    raise exception 'La comanda venció por inactividad';
  end if;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select count(*) into v_n
    from public.comanda_items i
    where i.comanda_id = v_c.id and i.id = any(v_ids);
    if v_n <> array_length(v_ids, 1) then
      raise exception 'Ítem no pertenece a la comanda';
    end if;
  end if;

  select count(*) into v_restantes
  from public.comanda_items i
  where i.comanda_id = v_c.id
    and coalesce((select r.cant from unnest(v_ids, v_cants) as r(id, cant) where r.id = i.id), i.cant) > 0;

  if v_restantes = 0 then
    update public.comandas
       set cerrada_at = clock_timestamp(), cierre = 'cancelada', estado_at = clock_timestamp()
     where id = v_c.id;
    return jsonb_build_object('ok', true, 'id', v_c.id, 'cancelada', true, 'cambios', coalesce(array_length(v_ids, 1), 0));
  end if;

  -- [BARRA] antes: delete + get diagnostics. Ahora el delete devuelve la
  -- estación de lo quitado para saber a quién reiniciar.
  with d as (
    delete from public.comanda_items i
    where i.comanda_id = v_c.id
      and i.id in (select r.id from unnest(v_ids, v_cants) as r(id, cant) where r.cant = 0)
    returning i.estacion
  )
  select count(*)::int,
         coalesce(bool_or(d.estacion = 'cocina'), false),
         coalesce(bool_or(d.estacion = 'barra'), false)
    into v_n, v_c1, v_b1
  from d;
  v_cambios := v_cambios + v_n;
  v_coc := v_coc or v_c1;
  v_bar := v_bar or v_b1;

  -- menus es "una entrada por unidad": si baja la cantidad, se recorta.
  -- [BARRA] igual: el update devuelve la estación de lo cambiado.
  with u as (
    update public.comanda_items i
       set cant = r.cant,
           menus = case
             when jsonb_typeof(i.menus) = 'array' and jsonb_array_length(i.menus) > r.cant
               then (select jsonb_agg(m.m order by m.o)
                     from jsonb_array_elements(i.menus) with ordinality as m(m, o)
                     where m.o <= r.cant)
             else i.menus end
      from unnest(v_ids, v_cants) as r(id, cant)
     where i.id = r.id and i.comanda_id = v_c.id and r.cant > 0 and r.cant <> i.cant
    returning i.estacion
  )
  select count(*)::int,
         coalesce(bool_or(u.estacion = 'cocina'), false),
         coalesce(bool_or(u.estacion = 'barra'), false)
    into v_n, v_c1, v_b1
  from u;
  v_cambios := v_cambios + v_n;
  v_coc := v_coc or v_c1;
  v_bar := v_bar or v_b1;

  if v_cambios > 0 then
    -- [BARRA] antes: estado = 'nuevo', estado_at = now() siempre.
    update public.comandas
       set estado          = case when v_coc then 'nuevo' else estado end,
           estado_at       = case when v_coc then clock_timestamp() else estado_at end,
           estado_barra    = case when v_bar then 'nuevo' else estado_barra end,
           estado_barra_at = case when v_bar then clock_timestamp() else estado_barra_at end
     where id = v_c.id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_c.id, 'cancelada', false, 'cambios', v_cambios);
end;
$$;


-- =========================================================
-- 5. GRANTS EXPLÍCITOS (nuevas + las dos recreadas)
--    Mismo criterio que add_comandas.sql: revoke all y grant explícito.
-- =========================================================

revoke all on function public.comandas_json_barra() from public, anon, authenticated;

revoke all on function public.barra_estado(text, text) from public, anon, authenticated;
grant execute on function public.barra_estado(text, text) to anon, authenticated;

revoke all on function public.barra_marcar(text, uuid, text) from public, anon, authenticated;
grant execute on function public.barra_marcar(text, uuid, text) to anon, authenticated;

revoke all on function public.crear_o_agregar_comanda(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.crear_o_agregar_comanda(text, text, text, jsonb) to anon, authenticated;

revoke all on function public.editar_items_comanda(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.editar_items_comanda(text, uuid, jsonb) to anon, authenticated;

-- Para verificar después de correr (esperado: barra_estado, barra_marcar,
-- crear_o_agregar_comanda y editar_items_comanda con anon y authenticated;
-- comandas_json_barra sin ninguno de los dos):
--   select p.proname, pg_get_function_identity_arguments(p.oid) args, a.grantee::regrole, a.privilege_type
--   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('barra_estado','barra_marcar','comandas_json_barra',
--                       'crear_o_agregar_comanda','editar_items_comanda')
--   order by 1, 2, 3;
