-- =========================================================
-- PRUEBAS DE add_barra.sql — SOLO PARA UN POSTGRES DESECHABLE
-- (Docker, local, embedded-postgres). NO pegar en el SQL Editor de Supabase:
-- inserta y borra datos de prueba. Se protege solo: falla si no corrió antes
-- test_add_comandas_stubs.sql (que fija varos.es_test).
--
-- Orden: stubs -> add_garzones.sql -> add_pos_cobros.sql ->
--        add_registrar_cobro_garzon.sql -> add_comandas.sql ->
--        add_barra.sql (DOS veces: idempotencia) ->
--        test_add_comandas.sql   (REGRESIÓN: la suite base corre entera contra
--                                 las funciones ya modificadas) ->
--        este archivo.
--
-- IMPORTANTE: cada sentencia es AUTÓNOMA y debe ejecutarse con su propio
-- commit (psql -f lo hace): los triggers de versión son DEFERRED y se
-- disparan al COMMIT, así que los cambios de versión solo se ven entre
-- sentencias distintas.
--
-- Cada chequeo es `select t.ok(condición, 'BR-...')`: si falla, lanza
-- 'FALLA: nombre'. Al final se imprime el resumen (solo los 'BR-').
-- =========================================================

do $$
begin
  if current_setting('varos.es_test', true) is distinct from 'si' then
    raise exception 'Este archivo es solo para un Postgres desechable (correr test_add_comandas_stubs.sql antes).';
  end if;
end $$;

-- ---------- helpers (los mismos de test_add_comandas.sql) ----------
create schema if not exists t;
grant usage on schema t to public;

create table if not exists t.vars (k text primary key, v text);
create table if not exists t.results (n serial, msg text);
grant all on t.vars, t.results to public;
grant all on all sequences in schema t to public;

create or replace function t.ok(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FALLA: %', p_msg;
  end if;
  insert into t.results (msg) values (p_msg);
end $$;

create or replace function t.err(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '<sin error>';
exception when others then
  return sqlerrm;
end $$;

create or replace function t.set(p_k text, p_v text) returns void
language sql as $$
  insert into t.vars (k, v) values (p_k, p_v)
  on conflict (k) do update set v = excluded.v
$$;

create or replace function t.get(p_k text) returns text
language sql stable as $$ select v from t.vars where k = p_k $$;

create or replace function t.as(p_modo text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',
    case p_modo when 'admin' then '00000000-0000-0000-0000-0000000000a1'
                when 'user'  then '00000000-0000-0000-0000-0000000000a2'
                else '' end, false);
  perform set_config('role',
    case p_modo when 'anon' then 'anon'
                when 'admin' then 'authenticated'
                when 'user' then 'authenticated'
                else 'none' end, false);
end $$;

-- ---------- helpers propios de barra ----------
-- Claves de un objeto jsonb, ordenadas.
create or replace function t.keys(p jsonb) returns text
language sql immutable as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(p) k
$$;
-- La comanda de esa mesa dentro de una respuesta de cocina_estado/barra_estado.
create or replace function t.com(p_json jsonb, p_mesa text) returns jsonb
language sql immutable as $$
  select c from jsonb_array_elements(p_json->'comandas') c where c->>'mesa' = p_mesa limit 1
$$;
-- id (texto) de un ítem por comanda y nombre.
create or replace function t.item(p_comanda text, p_nombre text) returns text
language sql stable as $$
  select id::text from public.comanda_items where comanda_id = p_comanda::uuid and nombre = p_nombre limit 1
$$;

-- ---------- fixtures ----------
delete from public.comandas;
delete from public.pos_cobros;
delete from public.garzones;
delete from public.admins;
delete from public.customers;
delete from auth.users;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.customers (id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Caja'),
  ('00000000-0000-0000-0000-0000000000a2', 'Cliente Común');
insert into public.garzones (nombre, codigo, activo) values
  ('Ana', '111111', true),
  ('Beto', '222222', true);
insert into public.pos_config (clave, valor) values ('codigo_cocina', 'COCINA1')
  on conflict (clave) do update set valor = excluded.valor;
-- La barra tiene su PROPIO código, distinto del de cocina (se inserta más abajo).
delete from public.pos_config where clave = 'codigo_barra';
update public.pos_config set valor = '12' where clave = 'comandas_vence_horas';

-- =========================================================
-- A. Esquema: columnas nuevas, defaults, check, idempotencia
-- =========================================================
select t.ok((select count(*) from information_schema.columns
             where table_schema = 'public' and table_name = 'comandas'
               and column_name in ('estado_barra', 'estado_barra_at', 'listo_barra_at')) = 3,
            'BR-A1 las 3 columnas nuevas existen (y una sola vez: la migración corrió 2 veces)');
select t.ok((select is_nullable = 'NO' and column_default like '%nuevo%' from information_schema.columns
             where table_schema = 'public' and table_name = 'comandas' and column_name = 'estado_barra'),
            'BR-A2 estado_barra es not null con default nuevo');
select t.ok((select is_nullable = 'YES' from information_schema.columns
             where table_schema = 'public' and table_name = 'comandas' and column_name = 'estado_barra_at')
        and (select is_nullable = 'YES' from information_schema.columns
             where table_schema = 'public' and table_name = 'comandas' and column_name = 'listo_barra_at'),
            'BR-A3 estado_barra_at y listo_barra_at son nullables');
select t.ok(t.err($$insert into public.comandas (mesa, estado_barra) values ('zz', 'roto')$$) like '%comandas_estado_barra_check%',
            'BR-A4 el check rechaza un estado_barra inválido');
select t.ok((select count(*) from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('barra_estado', 'barra_marcar', 'comandas_json_barra', 'comandas_autorizar_barra', 'crear_o_agregar_comanda', 'editar_items_comanda')) = 6,
            'BR-A5 una sola versión de cada función (sin sobrecargas duplicadas tras correr dos veces)');

-- =========================================================
-- B. Seguridad: anon, código, grants
-- =========================================================
-- Sin 'codigo_barra' en pos_config nadie entra a la barra (no hay código por defecto).
select t.as('anon');
select t.ok(t.err($$select public.barra_estado('BARRA1', null)$$) = 'Código de barra inválido', 'BR-B0a sin codigo_barra configurado, barra_estado rechaza cualquier código');
select t.ok(t.err($$select public.barra_estado('COCINA1', null)$$) = 'Código de barra inválido', 'BR-B0b ni siquiera el de cocina abre la barra sin código de barra');
select t.ok(t.err($$select public.barra_marcar('BARRA1', gen_random_uuid(), 'listo')$$) = 'Código de barra inválido', 'BR-B0c sin codigo_barra configurado, barra_marcar rechaza');
select t.ok(t.err($$select public.barra_estado('', null)$$) = 'Código de barra inválido', 'BR-B0d y el código vacío tampoco');
select t.as('root');
insert into public.pos_config (clave, valor) values ('codigo_barra', 'BARRA1');
select t.as('anon');
select t.ok(t.err('select estado_barra from public.comandas') like 'permission denied%', 'BR-B1 anon no lee estado_barra directo');
select t.ok(t.err($$update public.comandas set estado_barra = 'listo'$$) like 'permission denied%', 'BR-B2 anon no escribe estado_barra directo');
select t.ok(t.err($$select public.barra_estado('mal', null)$$) = 'Código de barra inválido', 'BR-B3 barra_estado con código malo falla');
select t.ok(t.err($$select public.barra_estado(null, null)$$) = 'Código de barra inválido', 'BR-B4 barra_estado con null falla');
select t.ok(t.err($$select public.barra_marcar('mal', gen_random_uuid(), 'listo')$$) = 'Código de barra inválido', 'BR-B5 barra_marcar con código malo falla');
select t.ok(t.err($$select public.barra_marcar(null, gen_random_uuid(), 'listo')$$) = 'Código de barra inválido', 'BR-B6 barra_marcar con null falla');
select t.ok(t.err($$select public.barra_estado('COCINA1', null)$$) = 'Código de barra inválido', 'BR-B7a SEPARACIÓN: el código de cocina NO abre barra_estado');
select t.ok(t.err($$select public.barra_marcar('COCINA1', gen_random_uuid(), 'listo')$$) = 'Código de barra inválido', 'BR-B7b SEPARACIÓN: el código de cocina NO abre barra_marcar');
select t.ok(t.err($$select public.cocina_estado('BARRA1', null)$$) = 'Código de cocina inválido', 'BR-B7c SEPARACIÓN: el código de barra NO abre cocina_estado');
select t.ok(t.err($$select public.cocina_marcar('BARRA1', gen_random_uuid(), 'listo')$$) = 'Código de cocina inválido', 'BR-B7d SEPARACIÓN: el código de barra NO abre cocina_marcar');
select t.ok(t.err($$select public.estadisticas_cocina('BARRA1', null, null)$$) = 'Código de cocina inválido', 'BR-B7e ni las estadísticas de cocina');
select t.ok(t.err($$select public.comandas_abiertas('BARRA1', null)$$) = 'Código de garzón inválido', 'BR-B7f ni Mozo/Caja (comandas_abiertas)');
select t.ok(t.err($$select public.barra_estado('barra1', null)$$) = 'Código de barra inválido', 'BR-B7g el código distingue mayúsculas');
select t.ok(t.err($$select public.barra_marcar('BARRA1', gen_random_uuid(), 'listo')$$) = 'Comanda no encontrada o ya cerrada', 'BR-B7 barra_marcar de una comanda inexistente falla');
select t.ok(t.err($$select public.comandas_json_barra()$$) like 'permission denied%', 'BR-B8 el helper comandas_json_barra no es ejecutable por anon');
select t.ok(t.err($$select public.comandas_autorizar_barra('BARRA1')$$) like 'permission denied%', 'BR-B8b el helper comandas_autorizar_barra no es ejecutable por anon');
select t.as('root');
select t.ok(bool_and(has_function_privilege('anon', f, 'execute') and has_function_privilege('authenticated', f, 'execute')),
            'BR-B9 anon y authenticated ejecutan barra_estado, barra_marcar y las dos funciones recreadas')
from unnest(array[
  'public.barra_estado(text,text)',
  'public.barra_marcar(text,uuid,text)',
  'public.crear_o_agregar_comanda(text,text,text,jsonb)',
  'public.editar_items_comanda(text,uuid,jsonb)']) f;
select t.ok(not has_function_privilege('anon', 'public.comandas_json_barra()', 'execute')
        and not has_function_privilege('authenticated', 'public.comandas_json_barra()', 'execute')
        and not has_function_privilege('anon', 'public.comandas_autorizar_barra(text)', 'execute')
        and not has_function_privilege('authenticated', 'public.comandas_autorizar_barra(text)', 'execute'),
            'BR-B10 los helpers comandas_json_barra y comandas_autorizar_barra no son ejecutables por anon ni authenticated');
select t.ok(not exists (
  select 1
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('barra_estado', 'barra_marcar', 'comandas_json_barra', 'comandas_autorizar_barra', 'crear_o_agregar_comanda', 'editar_items_comanda')
    and a.grantee = 0),
            'BR-B11 ninguna de las 6 funciones quedó con execute para PUBLIC');
select t.ok(not has_table_privilege('anon', 'public.comandas', 'select') and not has_table_privilege('anon', 'public.comandas', 'update'),
            'BR-B12 anon sigue sin privilegios sobre comandas (las columnas nuevas no abrieron nada)');
select t.as('user');
select t.ok((select count(*) from public.comandas) = 0, 'BR-B13 un autenticado no admin sigue viendo 0 filas de comandas');
select t.as('root');

select t.ok((select proargnames[1] from pg_proc where proname = 'barra_estado' and pronamespace = 'public'::regnamespace) = 'p_codigo_barra'
        and (select proargnames[1] from pg_proc where proname = 'barra_marcar' and pronamespace = 'public'::regnamespace) = 'p_codigo_barra',
            'BR-B14 el primer parámetro de barra_estado y barra_marcar se llama p_codigo_barra');
-- Cambiar codigo_barra en pos_config toma efecto de inmediato; el de cocina no se entera.
update public.pos_config set valor = 'BARRA-NUEVO' where clave = 'codigo_barra';
select t.as('anon');
select t.ok(t.err($$select public.barra_estado('BARRA1', null)$$) = 'Código de barra inválido', 'BR-B15 tras cambiar codigo_barra, el viejo deja de servir');
select t.ok(public.barra_estado('BARRA-NUEVO', null) ? 'comandas', 'BR-B16 y el nuevo abre');
select t.ok(public.cocina_estado('COCINA1', null) ? 'comandas', 'BR-B17 la cocina no se afecta');
select t.as('root');
update public.pos_config set valor = 'BARRA1' where clave = 'codigo_barra';

-- =========================================================
-- C. Comanda MIXTA: cocina ve solo comida, barra solo bebida
-- =========================================================
select t.as('anon');
select t.set('m1', public.crear_o_agregar_comanda('111111', 'B1', 'Carpa', $j$[
  {"cant":2,"nombre":"Lomo Vetado"},
  {"cant":1,"nombre":"Papas Fritas"},
  {"cant":2,"nombre":"Coca Cola 350"},
  {"cant":1,"nombre":"Pisco Sour","estacion":"barra"}]$j$::jsonb)::text);
select t.set('cocina1', public.cocina_estado('COCINA1', null)::text);
select t.set('barra1', public.barra_estado('BARRA1', null)::text);
select t.as('root');
select t.ok((t.get('barra1')::jsonb) ? 'version' and (t.get('barra1')::jsonb) ? 'ahora' and (t.get('barra1')::jsonb) ? 'comandas',
            'BR-C1 barra_estado devuelve version, ahora y comandas');
select t.ok(t.keys(t.get('barra1')::jsonb) = t.keys(t.get('cocina1')::jsonb), 'BR-C2 mismas claves de primer nivel que cocina_estado');
select t.ok(t.keys(t.com(t.get('barra1')::jsonb, 'B1')) = t.keys(t.com(t.get('cocina1')::jsonb, 'B1')),
            'BR-C3 cada comanda de barra tiene EXACTAMENTE las mismas claves que la de cocina');
select t.ok(t.keys(t.com(t.get('barra1')::jsonb, 'B1')->'items'->0) = t.keys(t.com(t.get('cocina1')::jsonb, 'B1')->'items'->0),
            'BR-C4 y cada ítem, las mismas claves');
select t.ok(jsonb_array_length(t.com(t.get('cocina1')::jsonb, 'B1')->'items') = 2
        and not jsonb_path_exists(t.com(t.get('cocina1')::jsonb, 'B1'), '$.items[*] ? (@.estacion == "barra")'),
            'BR-C5 la mixta aparece en cocina con SOLO sus 2 ítems de comida');
select t.ok(jsonb_array_length(t.com(t.get('barra1')::jsonb, 'B1')->'items') = 2
        and not jsonb_path_exists(t.com(t.get('barra1')::jsonb, 'B1'), '$.items[*] ? (@.estacion == "cocina")'),
            'BR-C6 la mixta aparece en barra con SOLO sus 2 ítems de bebida');
select t.ok((select array_agg(i->>'nombre' order by i->>'nombre') = array['Coca Cola 350', 'Pisco Sour']
             from jsonb_array_elements(t.com(t.get('barra1')::jsonb, 'B1')->'items') i),
            'BR-C7 los ítems de barra son las bebidas correctas');
select t.ok((select (c->>'hora') ~ '^[0-2][0-9]:[0-5][0-9]$' and (c->>'min_estado')::int >= 0 and (c->>'min_creado')::int >= 0
                    and c->>'garzon' = 'Ana' and c->>'estado' = 'nuevo' and c->>'sector' = 'Carpa' and c ? 'id'
             from (select t.com(t.get('barra1')::jsonb, 'B1') c) x),
            'BR-C8 forma de la comanda de barra: hora HH:MM, minutos, garzon, sector, estado nuevo, id');
select t.ok((select estado = 'nuevo' and estado_barra = 'nuevo' and estado_barra_at is null and listo_barra_at is null
             from public.comandas where id = t.get('m1')::uuid),
            'BR-C9 comanda recién creada: ambos estados nuevo, sin marcas de barra');

-- =========================================================
-- D. Estados INDEPENDIENTES y aviso por estación
-- =========================================================
select t.as('anon');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, 'quemado')$$, t.get('m1'))) = 'Estado inválido', 'BR-D0 estado inválido falla');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, null)$$, t.get('m1'))) = 'Estado inválido', 'BR-D0b estado null falla');
select t.set('bm1', public.barra_marcar('BARRA1', t.get('m1')::uuid, 'preparando')::text);
select t.ok((t.get('bm1')::jsonb->>'cambio')::boolean and not (t.get('bm1')::jsonb->>'avisar')::boolean
            and t.get('bm1')::jsonb->>'estado' = 'preparando' and t.get('bm1')::jsonb->>'estacion' = 'barra'
            and t.get('bm1')::jsonb->>'garzon' = 'Ana' and t.get('bm1')::jsonb->>'mesa' = 'B1' and t.get('bm1')::jsonb->>'sector' = 'Carpa',
            'BR-D1 barra nuevo->preparando: cambio, sin aviso, estacion=barra, garzon/mesa/sector');
select t.ok(t.keys(t.get('bm1')::jsonb) = 'avisar,cambio,estacion,estado,garzon,id,mesa,ok,sector', 'BR-D2 contrato exacto de barra_marcar');
select t.ok(public.cocina_estado('COCINA1', null)->'comandas' @> '[{"mesa":"B1","estado":"nuevo"}]'::jsonb
        and public.barra_estado('BARRA1', null)->'comandas' @> '[{"mesa":"B1","estado":"preparando"}]'::jsonb,
            'BR-D3 tras marcar en barra: cocina sigue en nuevo y barra muestra preparando');
select t.set('bm2', public.barra_marcar('BARRA1', t.get('m1')::uuid, 'listo')::text);
select t.ok((t.get('bm2')::jsonb->>'avisar')::boolean and (t.get('bm2')::jsonb->>'cambio')::boolean and t.get('bm2')::jsonb->>'estacion' = 'barra',
            'BR-D4 barra ->listo: avisar=true (estacion barra)');
select t.set('bm3', public.barra_marcar('BARRA1', t.get('m1')::uuid, 'listo')::text);
select t.ok(not (t.get('bm3')::jsonb->>'cambio')::boolean and not (t.get('bm3')::jsonb->>'avisar')::boolean and t.get('bm3')::jsonb->>'estacion' = 'barra',
            'BR-D5 barra listo->listo: sin cambio ni aviso (no avisa dos veces), y trae estacion');
select t.as('root');
select t.ok((select estado = 'nuevo' and estado_barra = 'listo' and listo_barra_at is not null and listo_at is null and estado_barra_at is not null
             from public.comandas where id = t.get('m1')::uuid),
            'BR-D6 barra listo NO tocó estado/listo_at de cocina; sí registró listo_barra_at');
select t.as('anon');
select t.set('cm1', public.cocina_marcar('COCINA1', t.get('m1')::uuid, 'preparando')::text);
select t.ok(not (t.get('cm1')::jsonb->>'avisar')::boolean, 'BR-D7 cocina ->preparando: sin aviso');
select t.set('cm2', public.cocina_marcar('COCINA1', t.get('m1')::uuid, 'listo')::text);
select t.ok((t.get('cm2')::jsonb->>'avisar')::boolean and t.get('cm2')::jsonb->>'estado' = 'listo', 'BR-D8 cocina ->listo: avisar=true');
select t.ok(t.keys(t.get('cm2')::jsonb) = 'avisar,cambio,estado,garzon,id,mesa,ok,sector', 'BR-D9 contrato de cocina_marcar SIN cambios (no trae estacion)');
select t.as('root');
select t.ok((select estado = 'listo' and estado_barra = 'listo' and listo_at is not null and listo_barra_at is not null
             from public.comandas where id = t.get('m1')::uuid),
            'BR-D10 cocina listo NO tocó estado_barra (siguió en listo por lo suyo) y cada estación tiene su marca');
select t.as('anon');
select t.ok(public.cocina_estado('COCINA1', null)->'comandas' @> '[{"mesa":"B1","estado":"listo"}]'::jsonb
        and public.barra_estado('BARRA1', null)->'comandas' @> '[{"mesa":"B1","estado":"listo"}]'::jsonb,
            'BR-D11 ambas pantallas muestran listo, cada una por su estado');
select t.set('cm3', public.cocina_marcar('COCINA1', t.get('m1')::uuid, 'nuevo')::text);
select t.ok(public.cocina_estado('COCINA1', null)->'comandas' @> '[{"mesa":"B1","estado":"nuevo"}]'::jsonb
        and public.barra_estado('BARRA1', null)->'comandas' @> '[{"mesa":"B1","estado":"listo"}]'::jsonb,
            'BR-D12 devolver cocina a nuevo NO mueve la barra');
select public.cocina_marcar('COCINA1', t.get('m1')::uuid, 'listo');
select t.as('root');

-- =========================================================
-- E. REGLAS DE REINICIO al agregar ítems (m1: cocina=listo, barra=listo)
-- =========================================================
select t.set('e_estado_at', (select estado_at::text from public.comandas where id = t.get('m1')::uuid));
select t.set('e_barra_at', (select estado_barra_at::text from public.comandas where id = t.get('m1')::uuid));
select pg_sleep(0.05);
select t.as('anon');
select t.set('e1', public.crear_o_agregar_comanda('222222', 'B1', 'Carpa', '[{"cant":1,"nombre":"Cerveza Kunstmann","estacion":"barra"}]'::jsonb)::text);
select t.as('root');
select t.ok(t.get('e1') = t.get('m1'), 'BR-E0 sigue siendo la misma comanda');
select t.ok((select estado = 'listo' and estado_at::text = t.get('e_estado_at') from public.comandas where id = t.get('m1')::uuid),
            'BR-E1 agregar una BEBIDA a una comanda con cocina listo NO reinicia cocina (ni su estado_at)');
select t.ok((select estado_barra = 'nuevo' and estado_barra_at > t.get('e_barra_at')::timestamptz from public.comandas where id = t.get('m1')::uuid),
            'BR-E2 y sí reinicia la barra (estado_barra=nuevo, estado_barra_at avanza)');
select t.as('anon');
select t.ok(public.cocina_estado('COCINA1', null)->'comandas' @> '[{"mesa":"B1","estado":"listo"}]'::jsonb
        and public.barra_estado('BARRA1', null)->'comandas' @> '[{"mesa":"B1","estado":"nuevo"}]'::jsonb,
            'BR-E3 lo que ven las pantallas: cocina listo, barra nuevo');
select public.barra_marcar('BARRA1', t.get('m1')::uuid, 'listo');
select t.as('root');
select t.set('e_estado_at', (select estado_at::text from public.comandas where id = t.get('m1')::uuid));
select t.set('e_barra_at', (select estado_barra_at::text from public.comandas where id = t.get('m1')::uuid));
select pg_sleep(0.05);
select t.as('anon');
select public.crear_o_agregar_comanda('222222', 'B1', 'Carpa', '[{"cant":1,"nombre":"Arroz al Olivo"}]'::jsonb);
select t.as('root');
select t.ok((select estado = 'nuevo' and estado_at > t.get('e_estado_at')::timestamptz from public.comandas where id = t.get('m1')::uuid),
            'BR-E4 agregar COMIDA reinicia cocina (estado=nuevo, estado_at avanza)');
select t.ok((select estado_barra = 'listo' and estado_barra_at::text = t.get('e_barra_at') from public.comandas where id = t.get('m1')::uuid),
            'BR-E5 y NO reinicia la barra');
select t.as('anon');
select public.cocina_marcar('COCINA1', t.get('m1')::uuid, 'listo');
select public.crear_o_agregar_comanda('222222', 'B1', 'Carpa', '[{"cant":1,"nombre":"Tomahawk"},{"cant":1,"nombre":"Mojito"}]'::jsonb);
select t.as('root');
select t.ok((select estado = 'nuevo' and estado_barra = 'nuevo' from public.comandas where id = t.get('m1')::uuid),
            'BR-E6 agregar comida Y bebida en la misma ronda reinicia las dos estaciones');
select t.ok((select count(*) from public.comanda_items where comanda_id = t.get('m1')::uuid) = 8, 'BR-E7 no se perdió ningún ítem (4 + 1 + 1 + 2)');

-- =========================================================
-- F. REGLAS DE REINICIO al editar ítems
-- =========================================================
select t.as('anon');
select t.set('f', public.crear_o_agregar_comanda('111111', 'B4', 'Andino', $j$[
  {"cant":2,"nombre":"Lomo F"},
  {"cant":1,"nombre":"Ceviche F"},
  {"cant":2,"nombre":"Coca Cola F"},
  {"cant":1,"nombre":"Mojito F"}]$j$::jsonb)::text);
select public.cocina_marcar('COCINA1', t.get('f')::uuid, 'listo');
select public.barra_marcar('BARRA1', t.get('f')::uuid, 'listo');
select t.as('root');
select t.set('f_lomo', t.item(t.get('f'), 'Lomo F'));
select t.set('f_cev', t.item(t.get('f'), 'Ceviche F'));
select t.set('f_coca', t.item(t.get('f'), 'Coca Cola F'));
select t.set('f_moj', t.item(t.get('f'), 'Mojito F'));
select t.ok((select estado = 'listo' and estado_barra = 'listo' from public.comandas where id = t.get('f')::uuid), 'BR-F0 punto de partida: ambas listas');

select t.as('anon');
select t.set('f1', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":3}]', t.get('f_lomo'))::jsonb)::text);
select t.as('root');
select t.ok((t.get('f1')::jsonb->>'cambios')::int = 1 and (select estado = 'nuevo' and estado_barra = 'listo' from public.comandas where id = t.get('f')::uuid),
            'BR-F1 cambiar la cantidad de un plato reinicia SOLO cocina');
select t.as('anon');
select public.cocina_marcar('COCINA1', t.get('f')::uuid, 'listo');
select t.set('f2', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":1}]', t.get('f_coca'))::jsonb)::text);
select t.as('root');
select t.ok((select estado = 'listo' and estado_barra = 'nuevo' from public.comandas where id = t.get('f')::uuid),
            'BR-F2 cambiar la cantidad de una bebida reinicia SOLO la barra');
select t.as('anon');
select public.barra_marcar('BARRA1', t.get('f')::uuid, 'listo');
select t.set('f3', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":1},{"id":"%s","cant":1}]', t.get('f_coca'), t.get('f_cev'))::jsonb)::text);
select t.as('root');
select t.ok((t.get('f3')::jsonb->>'cambios')::int = 0 and (select estado = 'listo' and estado_barra = 'listo' from public.comandas where id = t.get('f')::uuid),
            'BR-F3 "editar" con las mismas cantidades no cambia nada y no reinicia a nadie');
select t.as('anon');
select t.set('f4', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":0}]', t.get('f_moj'))::jsonb)::text);
select t.as('root');
select t.ok((t.get('f4')::jsonb->>'cambios')::int = 1 and not (t.get('f4')::jsonb->>'cancelada')::boolean
            and (select estado = 'listo' and estado_barra = 'nuevo' from public.comandas where id = t.get('f')::uuid),
            'BR-F4 quitar una bebida reinicia SOLO la barra');
select t.as('anon');
select public.barra_marcar('BARRA1', t.get('f')::uuid, 'listo');
select t.set('f5', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":2},{"id":"%s","cant":2}]', t.get('f_cev'), t.get('f_coca'))::jsonb)::text);
select t.as('root');
select t.ok((t.get('f5')::jsonb->>'cambios')::int = 2 and (select estado = 'nuevo' and estado_barra = 'nuevo' from public.comandas where id = t.get('f')::uuid),
            'BR-F5 editar un plato y una bebida en la misma llamada reinicia las dos');
select t.as('anon');
select public.cocina_marcar('COCINA1', t.get('f')::uuid, 'listo');
select public.barra_marcar('BARRA1', t.get('f')::uuid, 'listo');
select public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":0}]', t.get('f_cev'))::jsonb);
select t.as('root');
select t.ok((select estado = 'nuevo' and estado_barra = 'listo' from public.comandas where id = t.get('f')::uuid),
            'BR-F6 quitar un plato reinicia SOLO cocina');
select t.as('anon');
select t.ok(t.err(format($$select public.editar_items_comanda('999999', %L, '[]')$$, t.get('f'))) = 'Código de garzón inválido', 'BR-F7 editar sigue validando el código');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, %L)$$, t.get('f'), jsonb_build_array(jsonb_build_object('id', t.get('f_coca'), 'cant', 1), jsonb_build_object('id', t.get('f_coca'), 'cant', 2))::text)) = 'Ítem repetido', 'BR-F8 y "Ítem repetido"');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '[{"id":"%s","cant":-1}]')$$, t.get('f'), t.get('f_coca'))) = 'Cantidad inválida', 'BR-F9 y "Cantidad inválida"');
select t.set('f6', public.editar_items_comanda('111111', t.get('f')::uuid, format('[{"id":"%s","cant":0},{"id":"%s","cant":0}]', t.get('f_lomo'), t.get('f_coca'))::jsonb)::text);
select t.ok((t.get('f6')::jsonb->>'cancelada')::boolean, 'BR-F10 dejar todo en cero sigue cancelando la comanda');
select t.ok(not jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B4")')
        and not jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*] ? (@.mesa == "B4")'),
            'BR-F11 la cancelada desaparece de barra y de cocina');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, 'listo')$$, t.get('f'))) = 'Comanda no encontrada o ya cerrada', 'BR-F12 barra no puede marcar una cancelada');
select t.as('root');

-- =========================================================
-- G. Quién aparece dónde
-- =========================================================
select t.as('anon');
select t.set('g_bar', public.crear_o_agregar_comanda('111111', 'B2', 'Carpa', '[{"cant":1,"nombre":"Mojito"},{"cant":2,"nombre":"Pisco Sour"}]'::jsonb)::text);
select t.set('g_coc', public.crear_o_agregar_comanda('111111', 'B3', 'Carpa', '[{"cant":1,"nombre":"Lomo G"},{"cant":1,"nombre":"Ensalada G"}]'::jsonb)::text);
select t.ok(not jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*] ? (@.mesa == "B2")'), 'BR-G1 una comanda SOLO de bebidas no aparece en cocina');
select t.ok(jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B2")'), 'BR-G2 pero sí en barra');
select t.ok(not jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B3")'), 'BR-G3 una comanda SOLO de comida no aparece en barra');
select t.ok(jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*] ? (@.mesa == "B3")'), 'BR-G4 pero sí en cocina');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, 'listo')$$, t.get('g_coc'))) = 'La comanda no tiene ítems de barra', 'BR-G5 barra_marcar sobre una comanda sin ítems de barra se rechaza');
select t.set('g1', public.barra_marcar('BARRA1', t.get('g_bar')::uuid, 'listo')::text);
select t.ok((t.get('g1')::jsonb->>'avisar')::boolean and t.get('g1')::jsonb->>'mesa' = 'B2', 'BR-G6 una comanda solo de bebidas se marca lista en barra y avisa');
select t.as('root');
select t.ok((select estado = 'nuevo' and estado_barra = 'listo' from public.comandas where id = t.get('g_bar')::uuid), 'BR-G7 sin tocar el estado de cocina de esa comanda');
select t.as('anon');
-- Agregar una bebida a una comanda que era solo comida: entra a la barra como nueva.
select public.crear_o_agregar_comanda('111111', 'B3', 'Carpa', '[{"cant":1,"nombre":"Jugo natural"}]'::jsonb);
select t.ok(jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B3" && @.estado == "nuevo")'), 'BR-G8 al agregar una bebida a una comanda solo de comida, aparece en barra como nueva');
select t.ok(jsonb_array_length(t.com(public.cocina_estado('COCINA1', null), 'B3')->'items') = 2, 'BR-G9 y cocina sigue viendo solo sus 2 platos');

-- Cobrar cierra la comanda para las dos pantallas.
select t.set('g_cobro', public.cerrar_mesa_y_cobrar('111111', 'B2', 'Carpa', '[{"nombre":"Mojito","cant":1}]'::jsonb, 5000, 'efectivo')::text);
select t.ok(not jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B2")'), 'BR-G10 cerrar_mesa_y_cobrar saca la comanda de la barra');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, 'preparando')$$, t.get('g_bar'))) = 'Comanda no encontrada o ya cerrada', 'BR-G11 y barra no puede marcar una cobrada');

-- Vencimiento (no cambia): una comanda de hace 13 h no aparece ni se marca.
select t.set('g_old', public.crear_o_agregar_comanda('111111', 'B5', 'Carpa', '[{"cant":1,"nombre":"Mojito Viejo"}]'::jsonb)::text);
select t.as('root');
update public.comanda_items set created_at = now() - interval '13 hours' where comanda_id = t.get('g_old')::uuid;
update public.comandas set creado_at = now() - interval '13 hours', estado_at = now() - interval '13 hours' where id = t.get('g_old')::uuid;
select t.as('anon');
select t.ok(not jsonb_path_exists(public.barra_estado('BARRA1', null), '$.comandas[*] ? (@.mesa == "B5")'), 'BR-G12 una comanda de barra de hace 13 h no aparece (vencida)');
select t.ok(t.err(format($$select public.barra_marcar('BARRA1', %L, 'listo')$$, t.get('g_old'))) = 'Comanda no encontrada o ya cerrada', 'BR-G13 y barra no puede marcarla');
select t.as('root');
update public.comandas set cerrada_at = now(), cierre = 'vencida' where id = t.get('g_old')::uuid;

-- =========================================================
-- H. VERSIÓN
-- =========================================================
select t.as('anon');
select t.set('v1', public.barra_estado('BARRA1', null)->>'version');
select t.ok(public.barra_estado('BARRA1', t.get('v1')) = jsonb_build_object('version', t.get('v1'), 'sin_cambios', true), 'BR-H1 misma versión -> solo {version, sin_cambios:true}');
select t.ok(length(public.barra_estado('BARRA1', t.get('v1'))::text) < 120, 'BR-H2 la respuesta "sin cambios" pesa < 120 bytes');
select t.ok(t.get('v1') = public.cocina_estado('COCINA1', null)->>'version' and t.get('v1') = public.comandas_abiertas('111111', null)->>'version',
            'BR-H3 barra, cocina y Mozo comparten la misma versión global');
select t.set('h_com', public.crear_o_agregar_comanda('111111', 'B6', 'Terraza', '[{"cant":1,"nombre":"Pisco Sour"}]'::jsonb)::text);
select t.ok(public.barra_estado('BARRA1', t.get('v1'))->>'sin_cambios' is null, 'BR-H4 crear una comanda cambia la versión que ve la barra');
select t.set('v2', public.barra_estado('BARRA1', null)->>'version');
select public.barra_marcar('BARRA1', t.get('h_com')::uuid, 'preparando');
select t.ok(public.barra_estado('BARRA1', t.get('v2'))->>'sin_cambios' is null, 'BR-H5 marcar en barra cambia la versión');
select t.set('v3', public.barra_estado('BARRA1', null)->>'version');
select t.ok(public.cocina_estado('COCINA1', t.get('v3'))->>'sin_cambios' = 'true', 'BR-H6 y cocina, con esa misma versión, recibe sin_cambios');
select t.as('root');
update public.comandas set estado_barra_at = clock_timestamp() where id = t.get('h_com')::uuid;
select t.as('anon');
select t.ok(public.barra_estado('BARRA1', t.get('v3'))->>'sin_cambios' is null, 'BR-H7 un cambio SOLO de estado_barra_at (trigger por fila) ya cambia la versión');
select t.set('v4', public.barra_estado('BARRA1', null)->>'version');
select t.as('root');
update public.comandas set listo_barra_at = clock_timestamp() where id = t.get('h_com')::uuid;
select t.as('anon');
select t.ok(public.barra_estado('BARRA1', t.get('v4'))->>'sin_cambios' is null, 'BR-H8 y de listo_barra_at también');
select t.set('v5', public.barra_estado('BARRA1', null)->>'version');
select t.ok(public.barra_estado('BARRA1', t.get('v5'))->>'sin_cambios' = 'true', 'BR-H9 releer sin cambios NO mueve la versión');
select t.as('root');

-- =========================================================
-- I. min_estado de la barra: desde estado_barra_at, o desde creado_at si es null
-- =========================================================
select t.as('anon');
select t.set('i1', public.crear_o_agregar_comanda('111111', 'B7', 'Carpa', '[{"cant":1,"nombre":"Mojito Tiempo"}]'::jsonb)::text);
select t.as('root');
update public.comandas set creado_at = now() - interval '10 minutes', estado_at = now() - interval '10 minutes' where id = t.get('i1')::uuid;
select t.as('anon');
select t.ok((t.com(public.barra_estado('BARRA1', null), 'B7')->>'min_estado')::int between 10 and 11
        and (t.com(public.barra_estado('BARRA1', null), 'B7')->>'min_creado')::int between 10 and 11,
            'BR-I1 con estado_barra_at null, min_estado cuenta desde creado_at');
select t.as('root');
update public.comandas set estado_barra_at = now() - interval '4 minutes' where id = t.get('i1')::uuid;
select t.as('anon');
select t.ok((t.com(public.barra_estado('BARRA1', null), 'B7')->>'min_estado')::int between 4 and 5
        and (t.com(public.barra_estado('BARRA1', null), 'B7')->>'min_creado')::int between 10 and 11,
            'BR-I2 con estado_barra_at, min_estado cuenta desde ahí (min_creado sigue desde la creación)');
select t.ok(t.com(public.barra_estado('BARRA1', null), 'B7')->>'estado_at' <> t.com(public.barra_estado('BARRA1', null), 'B7')->>'creado_at',
            'BR-I3 estado_at de barra refleja estado_barra_at');
select t.as('root');

-- =========================================================
-- J. Regresión puntual de cocina (la suite base completa corre además, antes de este archivo)
-- =========================================================
select t.as('anon');
select t.ok(t.keys(public.cocina_estado('COCINA1', null)) = 'ahora,comandas,version', 'BR-J1 cocina_estado: mismo contrato (version, ahora, comandas)');
select t.ok(not jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*].items[*] ? (@.estacion == "barra")'), 'BR-J2 ningún ítem de barra llega a cocina');
select t.ok(t.keys(public.comandas_abiertas('111111', null)->'comandas'->0) = 'creado_at,estado,estado_at,garzon,hora,id,items,mesa,min_creado,min_estado,sector',
            'BR-J3 comandas_abiertas (Mozo/Caja): mismas claves por comanda (no se agregó estado_barra)');
select t.ok(jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*].items[*] ? (@.estacion == "barra")'), 'BR-J4 y Mozo/Caja siguen viendo los ítems de barra');
select t.set('j1', public.crear_o_agregar_comanda('111111', 'J1', 'Carpa', '[{"cant":1,"nombre":"Lomo J"},{"cant":1,"nombre":"Mojito J"}]'::jsonb)::text);
select t.set('jm', public.cocina_marcar('COCINA1', t.get('j1')::uuid, 'listo')::text);
select t.ok(t.get('jm')::jsonb->>'estado' = 'listo' and (t.get('jm')::jsonb->>'avisar')::boolean, 'BR-J5 cocina_marcar listo sigue avisando');
select t.as('root');
select t.ok((select estado = 'listo' and estado_barra = 'nuevo' and estado_barra_at is null from public.comandas where id = t.get('j1')::uuid), 'BR-J6 y no toca nada de barra');
-- estadisticas_cocina no cuenta bebidas aunque la barra las marque listas.
select t.as('anon');
select public.barra_marcar('BARRA1', t.get('j1')::uuid, 'listo');
select t.ok(not (public.estadisticas_cocina('COCINA1', null, null)->'ranking' @> '[{"nombre":"Mojito J"}]'), 'BR-J7 estadisticas_cocina sigue sin contar la barra');
select t.ok(public.estadisticas_cocina('COCINA1', null, null)->'ranking' @> '[{"nombre":"Lomo J","unidades":1}]', 'BR-J8 y sí cuenta la comida lista');
select t.as('root');

-- =========================================================
-- Resumen
-- =========================================================
select count(*) as chequeos_barra_ok from t.results where msg like 'BR-%';
