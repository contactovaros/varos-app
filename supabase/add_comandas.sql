-- =========================================================
-- COMANDAS Y PANTALLA DE COCINA EN SUPABASE (retiro del Worker varos-kds)
-- Pegar en Supabase → SQL Editor → Run
--
-- Decisión aprobada: varos-pos/DECISIONES.md, sección "Comandas y pantalla
-- de cocina en Supabase; retirar el Worker varos-kds" (2026-09-21).
--
-- Qué problema resuelve:
--  * Las comandas viven en un Worker de Cloudflare (dos nubes para un flujo)
--    y Mozo, para agregar una ronda, lee la lista y la REEMPLAZA entera: dos
--    garzones agregando a la misma mesa a la vez se pisan y se pierde un
--    pedido. Acá los ítems son FILAS: agregar = insertar filas, nunca
--    reemplazar una lista.
--  * Cobrar y cerrar la mesa eran dos sistemas (pos_cobros en Supabase +
--    /cerrar-mesa en el Worker): si fallaba el segundo, la mesa quedaba
--    cobrada y abierta. Acá es UNA función, UNA transacción.
--  * No había historial ni respaldo de comandas: al cobrar se borraban.
--
-- Es una migración ADITIVA: no toca nada existente (tablas nuevas, funciones
-- de nombres nuevos: verificado con grep contra supabase/*.sql). Con el
-- interruptor comandas_backend = 'worker' (valor inicial) producción sigue
-- exactamente igual; nada la lee todavía.
--
-- Idempotente: se puede pegar dos veces (if not exists, drop policy if
-- exists, create or replace, on conflict do nothing).
--
-- ACCESO (mismo criterio que garzones / pos_cobros):
--  * RLS activado y SIN acceso público. Solo los admins tienen select. Un
--    cliente anon NO puede leer ni escribir estas tablas directo. Además se
--    le quita a anon/authenticated todo privilegio de tabla salvo el select
--    de los admins (cinturón y tirantes: TRUNCATE no pasa por RLS).
--  * El garzón (sin login) y la cocina (tablet) entran SOLO por funciones
--    security definer que validan un código. Las funciones devuelven el id /
--    el JSON: el cliente NUNCA debe encadenar .select() a un insert().
--  * pos_config guarda el código de cocina: NUNCA exponerla con select
--    público. El interruptor lo lee cualquiera vía comandas_backend().
--
-- GRANTS (lección de fix_garzones_anon_execute_v2.sql): cada función hace
-- `revoke all ... from public, anon, authenticated` y después un `grant`
-- explícito. Las que el cliente llama SIN login van a anon+authenticated; las
-- de admin solo a authenticated Y además chequean auth.uid() adentro (con
-- `is null` explícito: en plpgsql `if null not in (...)` se evalúa NULL y la
-- excepción nunca salta). Los helpers internos no se le otorgan a nadie.
--
-- VERSIÓN (consultas baratas, no Realtime):
--  * comandas_abiertas / cocina_estado reciben la última `version` que vio el
--    cliente; si coincide devuelven ~100 bytes.
--  * La versión = contador global + nº de comandas vigentes + ventana de
--    vencimiento. El contador sube por triggers DEFERRED (se disparan al
--    COMMIT, una vez por fila) ante CUALQUIER insert/update/delete en
--    comandas o comanda_items (incluye cancelar, cerrar, quitar ítems y
--    borrados). Se descartó max(updated_at): now() es la hora de INICIO de
--    la transacción, así que una transacción lenta puede confirmar con un
--    updated_at MENOR que otra ya leída y el cliente nunca vería el cambio;
--    y un delete no mueve el máximo. Deferred además evita interbloqueos
--    (la fila del contador se toma recién al final).
--  * El nº de comandas vigentes hace que la versión cambie sola cuando una
--    comanda VENCE por el paso del tiempo (sin ninguna escritura).
--
-- VENCIMIENTO: una comanda abierta cuyo último movimiento (estado_at, que se
-- toca en cada alta/edición/marcado, o el último ítem) es de hace más de
-- pos_config.comandas_vence_horas horas (default 12) se considera VENCIDA:
-- no aparece en cocina_estado ni en comandas_abiertas. Se cierra de verdad
-- (cierre = 'vencida', historial intacto) con comandas_cerrar_vencidas()
-- (admin) o, por mesa, cuando alguien abre/cobra esa misma mesa. Para un
-- evento con tramos largos sin pedidos, subir la ventana sin tocar código:
--   update public.pos_config set valor = '20' where clave = 'comandas_vence_horas';
--
-- PASOS MANUALES DEL USUARIO (en el SQL Editor, que corre como `postgres`;
-- ahí auth.uid() es NULL, por eso no se usan las funciones de admin):
--
--   -- 1) Elegir el código de la tablet de cocina (6+ caracteres; NO hay
--   --    ninguno por defecto: sin esto, cocina_estado falla con
--   --    'Código de cocina inválido'):
--   insert into public.pos_config (clave, valor) values ('codigo_cocina', 'TU_CODIGO')
--     on conflict (clave) do update set valor = excluded.valor;
--   -- (desde la app, con sesión de admin, también: select definir_codigo_cocina('TU_CODIGO'))
--
--   -- 2) Piloto: cambiar el interruptor (Mozo/Caja/cocina lo leen al cargar):
--   update public.pos_config set valor = 'supabase' where clave = 'comandas_backend';
--   -- y para volver atrás:
--   update public.pos_config set valor = 'worker'   where clave = 'comandas_backend';
--
-- Estadísticas: estadisticas_cocina() reemplaza las claves stats_* del KV.
-- Mantenimiento: comandas_purgar(18) borra comandas cerradas de +18 meses
-- (pos_cobros no se toca).
-- =========================================================


-- =========================================================
-- 1. TABLAS
-- =========================================================

create table if not exists public.pos_config (
  clave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.comandas (
  id uuid primary key default gen_random_uuid(),
  mesa text not null,
  sector text not null default '',
  garzon text not null default '',          -- nombre (texto libre, igual que hoy)
  estado text not null default 'nuevo' check (estado in ('nuevo', 'preparando', 'listo')),
  creado_at timestamptz not null default clock_timestamp(),
  estado_at timestamptz not null default clock_timestamp(),  -- último movimiento (alta/edición/marcado)
  listo_at timestamptz,                     -- última vez que se marcó 'listo' (estadísticas)
  cerrada_at timestamptz,                   -- null = abierta
  cierre text check (cierre in ('cobrada', 'cancelada', 'vencida')),
  cobro_id uuid references public.pos_cobros(id) on delete set null,
  constraint comandas_cierre_coherente check ((cerrada_at is null) = (cierre is null))
);

create table if not exists public.comanda_items (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  orden bigint generated always as identity,   -- orden estable de aparición
  cant int not null check (cant > 0),
  nombre text not null,
  comentario text not null default '',
  menus jsonb,                              -- desglose Entrada/Principal/Postre del Menú del Día
  estacion text not null default 'cocina' check (estacion in ('cocina', 'barra')),
  created_at timestamptz not null default clock_timestamp()
);

-- Una sola comanda abierta por mesa+sector. Las funciones ya serializan con
-- un advisory lock; esto es la red de seguridad a nivel de base.
create unique index if not exists comandas_una_abierta_por_mesa
  on public.comandas (mesa, sector) where cerrada_at is null;
create index if not exists comandas_abiertas_idx
  on public.comandas (estado_at) where cerrada_at is null;
create index if not exists comandas_listo_idx
  on public.comandas (listo_at) where listo_at is not null;
create index if not exists comandas_cerrada_idx
  on public.comandas (cerrada_at) where cerrada_at is not null;
create index if not exists comandas_cobro_idx
  on public.comandas (cobro_id) where cobro_id is not null;
create index if not exists comanda_items_comanda_idx
  on public.comanda_items (comanda_id, orden);

-- =========================================================
-- 2. RLS: sin acceso público; solo los admins leen
-- =========================================================

alter table public.pos_config enable row level security;
alter table public.comandas enable row level security;
alter table public.comanda_items enable row level security;

drop policy if exists "admins ven pos_config" on public.pos_config;
create policy "admins ven pos_config" on public.pos_config
  for select using (auth.uid() in (select user_id from public.admins));

drop policy if exists "admins ven comandas" on public.comandas;
create policy "admins ven comandas" on public.comandas
  for select using (auth.uid() in (select user_id from public.admins));

drop policy if exists "admins ven comanda_items" on public.comanda_items;
create policy "admins ven comanda_items" on public.comanda_items
  for select using (auth.uid() in (select user_id from public.admins));

-- Sin privilegios de tabla para anon; authenticated solo select (que la RLS
-- limita a admins). Toda escritura pasa por las funciones security definer.
revoke all on table public.pos_config, public.comandas, public.comanda_items from anon;
revoke all on table public.pos_config, public.comandas, public.comanda_items from authenticated;
grant select on table public.pos_config, public.comandas, public.comanda_items to authenticated;

-- Valores iniciales (no pisan lo que ya exista al re-correr).
insert into public.pos_config (clave, valor) values ('comandas_backend', 'worker')
  on conflict (clave) do nothing;
insert into public.pos_config (clave, valor) values ('comandas_vence_horas', '12')
  on conflict (clave) do nothing;
-- Contador de versión: arranca en epoch-ms para no repetir valores si alguna
-- vez se recrea la tabla.
insert into public.pos_config (clave, valor)
  values ('comandas_version', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text)
  on conflict (clave) do nothing;
-- (NO se siembra 'codigo_cocina': lo elige el usuario, ver el encabezado.)


-- =========================================================
-- 3. HELPERS INTERNOS (nadie los llama desde el cliente)
-- =========================================================

-- norm() del Worker: minúsculas + NFD + quitar marcas combinantes (U+0300-036F).
-- Se normaliza ANTES de bajar a minúsculas para no depender del locale de la base.
create or replace function public.kds_norm(p_s text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(normalize(coalesce(p_s, ''), NFD), '[̀-ͯ]', '', 'g'))
$$;

-- esBarra() de varos-kds/worker.js con la lista BAR_KEYWORDS de wrangler.toml.
-- Semántica replicada: texto = norm(nombre) || ' ' || norm(categoria); cada
-- palabra se normaliza igual y se busca como PALABRA COMPLETA (\b de JS =
-- borde contra [A-Za-z0-9_]); si la palabra no empieza (o no termina) en
-- alfanumérico, ese lado no exige borde (ej. 'beb.'). Es solo el RESPALDO
-- para ítems que no traen `estacion` explícita (ver comandas_normalizar_items).
-- Para cambiar la lista: nueva migración con create or replace de esta función.
create or replace function public.es_barra(p_nombre text, p_categoria text default null)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  -- Copia literal de BAR_KEYWORDS (varos-kds/wrangler.toml).
  v_words constant text[] := string_to_array(
    'jugo,sour,mojito,spritz,pisco,vino,vinos,espumante,espumantes,cerveza,gin,cocktail,cocktails,mocktail,mocktails,coctel,limonada,agua mineral,agua tonica,bebida,beb.,colada,michelada,te de hoja,frozen,hugo,negroni,caipirinha,margarita,amaretto,ramazzotti,cynar,aperol,chambord,st germain,parfait,michellada,red bull,schweppes,coca cola,sprite,fanta,pap,ginger,tonic,base michelada,reserva,gran reserva,cosecha,sauvignon,cabernet,carmenere,carmenère,merlot,chardonnay,syrah,shiraz,pinot noir,pinot,malbec,champagne,champaña,cava,brut,750cc,187cc',
    ',');
  v_n text := public.kds_norm(p_nombre) || ' ' || public.kds_norm(p_categoria);
  v_w text;
  v_esc text;
  v_pat text;
begin
  foreach v_w in array v_words loop
    v_w := public.kds_norm(btrim(v_w));
    continue when v_w = '';
    v_esc := regexp_replace(v_w, '([.*+?^${}()|\[\]\\])', '\\\1', 'g');
    v_pat := case when v_w ~ '^[A-Za-z0-9]' then '(?<![A-Za-z0-9_])' else '' end
             || v_esc
             || case when v_w ~ '[A-Za-z0-9]$' then '(?![A-Za-z0-9_])' else '' end;
    if v_n ~ v_pat then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.comandas_limpiar(p_txt text, p_max int)
returns text
language sql
immutable
as $$
  select left(btrim(coalesce(p_txt, ''), E' \t\r\n'), p_max)
$$;

-- parseInt() de JS: dígitos iniciales o null.
create or replace function public.comandas_int(p_txt text)
returns int
language sql
immutable
as $$
  select case when p_txt ~ '^\s*-?[0-9]{1,9}'
              then substring(p_txt from '^\s*(-?[0-9]{1,9})')::int end
$$;

create or replace function public.comandas_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.admins a where a.user_id = auth.uid())
$$;

-- Garzón por código (mismo criterio que validar_codigo_garzon): devuelve el
-- nombre o lanza. Sin código: sesión de admin (Caja) y devuelve su nombre.
create or replace function public.comandas_autorizar(p_codigo text, p_permitir_admin boolean default true)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_codigo text := nullif(btrim(p_codigo), '');
begin
  if v_codigo is not null then
    select g.nombre into v_nombre
    from public.garzones g
    where g.codigo = p_codigo and g.activo = true;
    if v_nombre is null then
      raise exception 'Código de garzón inválido';
    end if;
    return v_nombre;
  end if;

  if p_permitir_admin and public.comandas_es_admin() then
    return coalesce((select c.full_name from public.customers c where c.id = auth.uid()), 'admin');
  end if;
  if p_permitir_admin then
    raise exception 'No autorizado';
  end if;
  raise exception 'Código de garzón inválido';
end;
$$;

create or replace function public.comandas_autorizar_cocina(p_codigo_cocina text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_real text;
begin
  select valor into v_real from public.pos_config where clave = 'codigo_cocina';
  if v_real is null or p_codigo_cocina is null or v_real <> p_codigo_cocina then
    raise exception 'Código de cocina inválido';
  end if;
end;
$$;

-- Ventana de vencimiento (horas), editable en pos_config sin tocar código.
create or replace function public.comandas_vence_horas()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when c.valor ~ '^[0-9]+(\.[0-9]+)?$'
                 then case when c.valor::numeric > 0 then c.valor::numeric end
            end
     from public.pos_config c where c.clave = 'comandas_vence_horas'),
    12)
$$;

-- Comandas abiertas y NO vencidas.
create or replace function public.comandas_vigentes()
returns setof public.comandas
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.comandas c
  where c.cerrada_at is null
    and greatest(
          c.estado_at,
          coalesce((select max(i.created_at) from public.comanda_items i where i.comanda_id = c.id), c.creado_at)
        ) > now() - (public.comandas_vence_horas() * interval '1 hour')
$$;

create or replace function public.comandas_version_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select valor from public.pos_config where clave = 'comandas_version'), '0')
         || ':' || (select count(*) from public.comandas_vigentes())::text
         || ':' || public.comandas_vence_horas()::text
$$;

-- Trigger DEFERRED (se ejecuta al COMMIT): sube el contador global.
create or replace function public.comandas_subir_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Una subida por transacción alcanza (todo se hace visible junto al COMMIT);
  -- así un purge de miles de filas no actualiza el contador miles de veces.
  if current_setting('varos.comandas_bump_txid', true) = txid_current()::text then
    return null;
  end if;
  perform set_config('varos.comandas_bump_txid', txid_current()::text, true);

  insert into public.pos_config (clave, valor)
  values ('comandas_version', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text)
  on conflict (clave) do update
    set valor = (public.pos_config.valor::bigint + 1)::text,
        updated_at = now();
  return null;
end;
$$;

drop trigger if exists comandas_version_t on public.comandas;
create constraint trigger comandas_version_t
  after insert or update or delete on public.comandas
  deferrable initially deferred
  for each row execute function public.comandas_subir_version();

drop trigger if exists comanda_items_version_t on public.comanda_items;
create constraint trigger comanda_items_version_t
  after insert or update or delete on public.comanda_items
  deferrable initially deferred
  for each row execute function public.comandas_subir_version();

-- Normaliza p_items como lo hacía el Worker (/pedido-nuevo): máx. 40 ítems,
-- cant >= 1, nombre 120, comentario 200, menus (máx. 40, solo
-- entrada/principal/postre, 120). Descarta los sin nombre.
-- ESTACIÓN: si el ítem trae `estacion` = 'cocina'|'barra' se RESPETA (el
-- cliente la calcula desde la categoría de menu_items); si no la trae o es
-- inválida, se calcula con es_barra(nombre[, categoria]) como respaldo.
create or replace function public.comandas_normalizar_items(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'cant', s.cant,
        'nombre', s.nombre,
        'comentario', s.comentario,
        'menus', s.menus,
        'estacion', case
          when s.est_pedida in ('cocina', 'barra') then s.est_pedida
          when public.es_barra(s.nombre, s.categoria) then 'barra'
          else 'cocina' end
      ) order by s.ord)
    from (
      select
        e.ord,
        greatest(1, coalesce(nullif(public.comandas_int(e.it->>'cant'), 0), 1)) as cant,
        public.comandas_limpiar(e.it->>'nombre', 120) as nombre,
        public.comandas_limpiar(e.it->>'comentario', 200) as comentario,
        lower(btrim(coalesce(e.it->>'estacion', ''))) as est_pedida,
        e.it->>'categoria' as categoria,
        case when jsonb_typeof(e.it->'menus') = 'array' and jsonb_array_length(e.it->'menus') > 0
          then (
            select jsonb_agg(jsonb_build_object(
                     'entrada', public.comandas_limpiar(m.m->>'entrada', 120),
                     'principal', public.comandas_limpiar(m.m->>'principal', 120),
                     'postre', public.comandas_limpiar(m.m->>'postre', 120)) order by m.o)
            from jsonb_array_elements(e.it->'menus') with ordinality as m(m, o)
            where m.o <= 40)
        end as menus
      from jsonb_array_elements(p_items) with ordinality as e(it, ord)
      where e.ord <= 40
    ) s
    where s.nombre <> ''
  ), '[]'::jsonb);
end;
$$;

-- Arma el arreglo de comandas vigentes para Mozo/Caja (todos los ítems) o
-- para cocina (solo estacion = 'cocina', omitiendo comandas sin ítems de cocina).
create or replace function public.comandas_json(p_solo_cocina boolean)
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
        'estado', c.estado,
        'creado_at', c.creado_at,
        'estado_at', c.estado_at,
        'min_estado', greatest(0, floor(extract(epoch from (now() - c.estado_at)) / 60))::int,
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
            and (not p_solo_cocina or i.estacion = 'cocina'))
      ) as j
    from public.comandas_vigentes() c
    where not p_solo_cocina
       or exists (select 1 from public.comanda_items i
                  where i.comanda_id = c.id and i.estacion = 'cocina')
  ) x
$$;

revoke all on function public.kds_norm(text) from public, anon, authenticated;
revoke all on function public.es_barra(text, text) from public, anon, authenticated;
revoke all on function public.comandas_limpiar(text, int) from public, anon, authenticated;
revoke all on function public.comandas_int(text) from public, anon, authenticated;
revoke all on function public.comandas_es_admin() from public, anon, authenticated;
revoke all on function public.comandas_autorizar(text, boolean) from public, anon, authenticated;
revoke all on function public.comandas_autorizar_cocina(text) from public, anon, authenticated;
revoke all on function public.comandas_vence_horas() from public, anon, authenticated;
revoke all on function public.comandas_vigentes() from public, anon, authenticated;
revoke all on function public.comandas_version_actual() from public, anon, authenticated;
revoke all on function public.comandas_subir_version() from public, anon, authenticated;
revoke all on function public.comandas_normalizar_items(jsonb) from public, anon, authenticated;
revoke all on function public.comandas_json(boolean) from public, anon, authenticated;


-- =========================================================
-- 4. FUNCIONES PÚBLICAS (las llama el cliente)
-- =========================================================

-- Interruptor de piloto: lo leen Mozo/Caja/cocina al cargar, SIN login.
create or replace function public.comandas_backend()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.valor from public.pos_config c
     where c.clave = 'comandas_backend' and c.valor in ('worker', 'supabase')),
    'worker')
$$;

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
begin
  v_garzon := public.comandas_autorizar(p_codigo, false);

  v_items := public.comandas_normalizar_items(p_items);
  if v_mesa = '' or jsonb_array_length(v_items) = 0 then
    raise exception 'Faltan mesa o ítems';
  end if;

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
    -- Agregar platos a una comanda listo/preparando la vuelve a 'nuevo'
    -- (igual que el Worker al editar): cocina ve que hay algo pendiente.
    update public.comandas
       set estado = 'nuevo', estado_at = clock_timestamp()
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

  delete from public.comanda_items i
  where i.comanda_id = v_c.id
    and i.id in (select r.id from unnest(v_ids, v_cants) as r(id, cant) where r.cant = 0);
  get diagnostics v_n = row_count;
  v_cambios := v_cambios + v_n;

  -- menus es "una entrada por unidad": si baja la cantidad, se recorta.
  update public.comanda_items i
     set cant = r.cant,
         menus = case
           when jsonb_typeof(i.menus) = 'array' and jsonb_array_length(i.menus) > r.cant
             then (select jsonb_agg(m.m order by m.o)
                   from jsonb_array_elements(i.menus) with ordinality as m(m, o)
                   where m.o <= r.cant)
           else i.menus end
    from unnest(v_ids, v_cants) as r(id, cant)
   where i.id = r.id and i.comanda_id = v_c.id and r.cant > 0 and r.cant <> i.cant;
  get diagnostics v_n = row_count;
  v_cambios := v_cambios + v_n;

  if v_cambios > 0 then
    update public.comandas
       set estado = 'nuevo', estado_at = clock_timestamp()
     where id = v_c.id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_c.id, 'cancelada', false, 'cambios', v_cambios);
end;
$$;

-- Mozo y Caja: comandas abiertas (no vencidas) con TODOS los ítems (bar incluido).
create or replace function public.comandas_abiertas(p_codigo text, p_version text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version text;
begin
  perform public.comandas_autorizar(p_codigo, true);
  v_version := public.comandas_version_actual();
  if p_version is not null and p_version = v_version then
    return jsonb_build_object('version', v_version, 'sin_cambios', true);
  end if;
  return jsonb_build_object(
    'version', v_version,
    'ahora', now(),
    'comandas', public.comandas_json(false));
end;
$$;

-- Cocina: solo ítems de cocina; omite comandas sin ítems de cocina.
create or replace function public.cocina_estado(p_codigo_cocina text, p_version text default null)
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
    'comandas', public.comandas_json(true));
end;
$$;

-- Cocina: nuevo | preparando | listo. `avisar` = true cuando pasa a 'listo'
-- y antes no lo estaba (la pantalla entonces llama a notificar-garzon).
create or replace function public.cocina_marcar(p_codigo_cocina text, p_comanda_id uuid, p_estado text)
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

  if v_c.estado = p_estado then
    return jsonb_build_object('ok', true, 'id', v_c.id, 'estado', v_c.estado, 'cambio', false,
      'avisar', false, 'garzon', v_c.garzon, 'mesa', v_c.mesa, 'sector', v_c.sector);
  end if;

  update public.comandas
     set estado = p_estado,
         estado_at = clock_timestamp(),
         listo_at = case when p_estado = 'listo' then clock_timestamp() else listo_at end
   where id = v_c.id;

  return jsonb_build_object('ok', true, 'id', v_c.id, 'estado', p_estado, 'cambio', true,
    'avisar', (p_estado = 'listo'),
    'garzon', v_c.garzon, 'mesa', v_c.mesa, 'sector', v_c.sector);
end;
$$;

-- Cobrar y cerrar la mesa en UNA transacción. Autoriza con código de garzón
-- (Mozo, celular) o, si p_codigo es null, con sesión de admin (Caja).
create or replace function public.cerrar_mesa_y_cobrar(
  p_codigo text,
  p_mesa text,
  p_sector text,
  p_items jsonb,
  p_total numeric,
  p_medio_pago text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_por_codigo boolean := nullif(btrim(p_codigo), '') is not null;
  v_mesa text := public.comandas_limpiar(p_mesa, 10);
  v_sector text := public.comandas_limpiar(p_sector, 20);
  v_garzon text;
  v_cobro_id uuid;
begin
  v_quien := public.comandas_autorizar(p_codigo, true);

  if p_medio_pago is null or p_medio_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Medio de pago inválido';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'Total inválido';
  end if;
  if v_mesa = '' then
    raise exception 'Falta la mesa';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Ítems inválidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comanda:' || v_mesa || '|' || v_sector, 0));

  if v_por_codigo then
    v_garzon := v_quien;   -- igual que registrar_cobro_garzon: el del código
  else
    select c.garzon into v_garzon
    from public.comandas c
    where c.mesa = v_mesa and c.sector = v_sector and c.cerrada_at is null
    order by c.creado_at
    limit 1;
    v_garzon := coalesce(v_garzon, '');
  end if;

  insert into public.pos_cobros (mesa, sector, garzon, items, total, medio_pago, cobrado_por)
  values (v_mesa, v_sector, v_garzon, p_items, p_total, p_medio_pago, v_quien)
  returning id into v_cobro_id;

  -- Fantasmas vencidos de esa mesa: se cierran como 'vencida', no como cobradas.
  update public.comandas c
     set cerrada_at = clock_timestamp(), cierre = 'vencida'
   where c.mesa = v_mesa and c.sector = v_sector and c.cerrada_at is null
     and not exists (select 1 from public.comandas_vigentes() v where v.id = c.id);

  update public.comandas c
     set cerrada_at = clock_timestamp(), cierre = 'cobrada', cobro_id = v_cobro_id
   where c.mesa = v_mesa and c.sector = v_sector and c.cerrada_at is null;

  return v_cobro_id;
end;
$$;

-- Ranking de preparaciones (reemplaza las claves stats_* del KV). Cuenta lo
-- que llegó a 'listo' (comandas.listo_at en el rango, hora de Chile), solo
-- ítems de cocina agregados hasta ese momento, sin comandas canceladas. Menú
-- del Día: cuenta cada elección de entrada/principal/postre (1 por comensal),
-- no el contenedor. Mismos criterios de limpieza de nombre que sumarStats().
create or replace function public.estadisticas_cocina(p_codigo_cocina text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde date := coalesce(p_desde, (now() at time zone 'America/Santiago')::date);
  v_hasta date := coalesce(p_hasta, (now() at time zone 'America/Santiago')::date);
  v_ranking jsonb;
begin
  perform public.comandas_autorizar_cocina(p_codigo_cocina);
  if v_desde > v_hasta then
    raise exception 'Rango de fechas inválido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', r.nombre, 'unidades', r.unidades)
                            order by r.unidades desc, r.nombre), '[]'::jsonb)
  into v_ranking
  from (
    select max(x.n) as nombre, sum(x.u)::int as unidades
    from (
      select btrim(regexp_replace(y.nombre, '^[+*\s-]+', '')) as n, y.u
      from (
        select i.nombre, i.cant as u
        from public.comanda_items i
        join public.comandas c on c.id = i.comanda_id
        where c.listo_at is not null
          and c.cierre is distinct from 'cancelada'
          and (c.listo_at at time zone 'America/Santiago')::date between v_desde and v_hasta
          and i.estacion = 'cocina'
          and i.created_at <= c.listo_at
          and (jsonb_typeof(i.menus) is distinct from 'array' or jsonb_array_length(i.menus) = 0)
        union all
        select k.val, 1
        from public.comanda_items i
        join public.comandas c on c.id = i.comanda_id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(i.menus) = 'array' then i.menus else '[]'::jsonb end) as e(m)
        cross join lateral (values (e.m->>'entrada'), (e.m->>'principal'),
                                   (e.m->>'guarnicion'), (e.m->>'postre')) as k(val)
        where c.listo_at is not null
          and c.cierre is distinct from 'cancelada'
          and (c.listo_at at time zone 'America/Santiago')::date between v_desde and v_hasta
          and i.estacion = 'cocina'
          and i.created_at <= c.listo_at
          and k.val is not null and k.val <> ''
      ) y
    ) x
    where length(x.n) >= 2
    group by public.kds_norm(x.n)
  ) r;

  return jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'ranking', v_ranking);
end;
$$;


-- =========================================================
-- 5. FUNCIONES DE ADMIN (solo sesión de admin; auth.uid() is null -> rechazo)
-- =========================================================

create or replace function public.definir_codigo_cocina(p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.comandas_es_admin() then
    raise exception 'No autorizado';
  end if;
  if p_codigo is null or length(btrim(p_codigo)) < 6 then
    raise exception 'El código de cocina debe tener al menos 6 caracteres';
  end if;
  insert into public.pos_config (clave, valor, updated_at)
  values ('codigo_cocina', btrim(p_codigo), now())
  on conflict (clave) do update set valor = excluded.valor, updated_at = now();
end;
$$;

-- Cierra (cierre = 'vencida') las comandas abiertas sin movimiento hace más
-- de p_horas (default: pos_config.comandas_vence_horas). Devuelve cuántas.
create or replace function public.comandas_cerrar_vencidas(p_horas numeric default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horas numeric := coalesce(p_horas, public.comandas_vence_horas());
  v_n int;
begin
  if auth.uid() is null or not public.comandas_es_admin() then
    raise exception 'No autorizado';
  end if;
  if v_horas <= 0 then
    raise exception 'Ventana inválida';
  end if;
  update public.comandas c
     set cerrada_at = clock_timestamp(), cierre = 'vencida'
   where c.cerrada_at is null
     and greatest(
           c.estado_at,
           coalesce((select max(i.created_at) from public.comanda_items i where i.comanda_id = c.id), c.creado_at)
         ) <= now() - (v_horas * interval '1 hour');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Borra comandas CERRADAS de más de p_meses meses (sus ítems caen por
-- cascade). No toca pos_cobros ni comandas abiertas. Devuelve cuántas.
create or replace function public.comandas_purgar(p_meses int default 18)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if auth.uid() is null or not public.comandas_es_admin() then
    raise exception 'No autorizado';
  end if;
  if p_meses is null or p_meses < 1 then
    raise exception 'Meses inválido';
  end if;
  delete from public.comandas
   where cerrada_at is not null
     and cerrada_at < now() - make_interval(months => p_meses);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- =========================================================
-- 6. GRANTS EXPLÍCITOS
-- =========================================================

-- Sin login (anon) y con login:
revoke all on function public.comandas_backend() from public, anon, authenticated;
grant execute on function public.comandas_backend() to anon, authenticated;

revoke all on function public.crear_o_agregar_comanda(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.crear_o_agregar_comanda(text, text, text, jsonb) to anon, authenticated;

revoke all on function public.editar_items_comanda(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.editar_items_comanda(text, uuid, jsonb) to anon, authenticated;

revoke all on function public.comandas_abiertas(text, text) from public, anon, authenticated;
grant execute on function public.comandas_abiertas(text, text) to anon, authenticated;

revoke all on function public.cocina_estado(text, text) from public, anon, authenticated;
grant execute on function public.cocina_estado(text, text) to anon, authenticated;

revoke all on function public.cocina_marcar(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cocina_marcar(text, uuid, text) to anon, authenticated;

revoke all on function public.cerrar_mesa_y_cobrar(text, text, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.cerrar_mesa_y_cobrar(text, text, text, jsonb, numeric, text) to anon, authenticated;

revoke all on function public.estadisticas_cocina(text, date, date) from public, anon, authenticated;
grant execute on function public.estadisticas_cocina(text, date, date) to anon, authenticated;

-- Solo admins autenticados (además chequean auth.uid() adentro):
revoke all on function public.definir_codigo_cocina(text) from public, anon, authenticated;
grant execute on function public.definir_codigo_cocina(text) to authenticated;

revoke all on function public.comandas_cerrar_vencidas(numeric) from public, anon, authenticated;
grant execute on function public.comandas_cerrar_vencidas(numeric) to authenticated;

revoke all on function public.comandas_purgar(int) from public, anon, authenticated;
grant execute on function public.comandas_purgar(int) to authenticated;

-- Para verificar grants después de correr (mismo estilo que diagnose_garzones_grants.sql):
--   select p.proname, pg_get_function_identity_arguments(p.oid) args, a.grantee::regrole, a.privilege_type
--   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--   where p.pronamespace = 'public'::regnamespace
--     and (p.proname like 'comandas_%' or p.proname like 'cocina_%' or p.proname in
--          ('crear_o_agregar_comanda','editar_items_comanda','cerrar_mesa_y_cobrar','estadisticas_cocina',
--           'definir_codigo_cocina','es_barra','kds_norm'))
--   order by 1, 2, 3;
