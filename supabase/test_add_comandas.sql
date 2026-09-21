-- =========================================================
-- PRUEBAS DE add_comandas.sql — SOLO PARA UN POSTGRES DESECHABLE
-- (PGlite, Docker, local). NO pegar en el SQL Editor de Supabase: inserta y
-- borra datos de prueba y crea roles/esquemas falsos. Se protege solo: falla
-- si no corrió antes test_add_comandas_stubs.sql (que fija varos.es_test).
--
-- Orden: stubs -> add_garzones.sql -> add_pos_cobros.sql ->
--        add_registrar_cobro_garzon.sql -> add_comandas.sql (dos veces) -> este.
--
-- IMPORTANTE: cada sentencia de este archivo es AUTÓNOMA y debe ejecutarse
-- con su propio commit (psql -f lo hace; un runner que mande todo en un solo
-- string NO: los triggers de versión son DEFERRED y se disparan al COMMIT,
-- así que los cambios de versión solo se ven entre sentencias distintas).
--
-- Cada chequeo es `select t.ok(condición, 'nombre')`: si falla, lanza
-- 'FALLA: nombre'. Los que esperan un error usan t.err(sql), que devuelve el
-- mensaje de la excepción. Al final se imprime el resumen de t.results.
-- =========================================================

do $$
begin
  if current_setting('varos.es_test', true) is distinct from 'si' then
    raise exception 'Este archivo es solo para un Postgres desechable (correr test_add_comandas_stubs.sql antes).';
  end if;
end $$;

-- ---------- helpers ----------
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

-- Ejecuta p_sql con el rol actual; devuelve el mensaje del error, o '<sin error>'.
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

-- Cambia de "usuario": root (postgres), anon, admin, user (autenticado NO admin).
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

-- Envuelve la sección concurrente opcional (dblink).
create or replace function t.agregar_lento(p_codigo text, p_mesa text, p_sector text, p_items jsonb, p_seg numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := public.crear_o_agregar_comanda(p_codigo, p_mesa, p_sector, p_items);
  perform pg_sleep(p_seg);   -- mantiene abierta la transacción (y el lock) un rato
  return v;
end $$;

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
  ('Beto', '222222', true),
  ('Inactivo', '333333', false);
insert into public.pos_config (clave, valor) values ('codigo_cocina', 'COCINA1')
  on conflict (clave) do update set valor = excluded.valor;
update public.pos_config set valor = '12' where clave = 'comandas_vence_horas';
update public.pos_config set valor = 'worker' where clave = 'comandas_backend';

-- =========================================================
-- A. Interruptor comandas_backend() (anon, sin login)
-- =========================================================
select t.as('anon');
select t.ok(public.comandas_backend() = 'worker', 'A1 comandas_backend() default = worker (anon)');
select t.as('root');
update public.pos_config set valor = 'supabase' where clave = 'comandas_backend';
select t.as('anon');
select t.ok(public.comandas_backend() = 'supabase', 'A2 comandas_backend() = supabase tras el cambio');
select t.as('root');
update public.pos_config set valor = 'cualquier-cosa' where clave = 'comandas_backend';
select t.as('anon');
select t.ok(public.comandas_backend() = 'worker', 'A3 valor inválido en pos_config cae a worker');
select t.as('root');
update public.pos_config set valor = 'worker' where clave = 'comandas_backend';

-- =========================================================
-- B. anon no puede tocar NINGUNA de las tres tablas
-- =========================================================
select t.as('anon');
select t.ok(t.err('select * from public.comandas') like 'permission denied%', 'B1 anon no hace select a comandas');
select t.ok(t.err('select * from public.comanda_items') like 'permission denied%', 'B2 anon no hace select a comanda_items');
select t.ok(t.err('select * from public.pos_config') like 'permission denied%', 'B3 anon no hace select a pos_config (guarda el código de cocina)');
select t.ok(t.err($$insert into public.comandas (mesa) values ('x')$$) like 'permission denied%', 'B4 anon no inserta directo en comandas');
select t.ok(t.err($$update public.pos_config set valor = 'x'$$) like 'permission denied%', 'B5 anon no escribe pos_config');
select t.ok(t.err('delete from public.comandas') like 'permission denied%', 'B6 anon no borra comandas');
select t.as('root');

-- =========================================================
-- C. crear_o_agregar_comanda: validaciones y creación
-- =========================================================
select t.as('anon');
select t.ok(t.err($$select public.crear_o_agregar_comanda('999999','5','Carpa','[{"cant":1,"nombre":"Lomo"}]')$$) = 'Código de garzón inválido', 'C1 código inexistente falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda('333333','5','Carpa','[{"cant":1,"nombre":"Lomo"}]')$$) = 'Código de garzón inválido', 'C2 garzón inactivo falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda(null,'5','Carpa','[{"cant":1,"nombre":"Lomo"}]')$$) = 'Código de garzón inválido', 'C3 código null falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda('','5','Carpa','[{"cant":1,"nombre":"Lomo"}]')$$) = 'Código de garzón inválido', 'C4 código vacío falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda('111111','5','Carpa','[]')$$) = 'Faltan mesa o ítems', 'C5 sin ítems falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda('111111','','Carpa','[{"cant":1,"nombre":"Lomo"}]')$$) = 'Faltan mesa o ítems', 'C6 sin mesa falla');
select t.ok(t.err($$select public.crear_o_agregar_comanda('111111','5','Carpa','{"cant":1}')$$) = 'Faltan mesa o ítems', 'C7 ítems que no son arreglo fallan');
select t.ok(t.err($$select public.crear_o_agregar_comanda('111111','5','Carpa','[{"cant":1,"nombre":"   "}]')$$) = 'Faltan mesa o ítems', 'C8 ítems sin nombre se descartan -> falla');

select t.set('c5', public.crear_o_agregar_comanda('111111', '5', 'Carpa', $j$[
  {"cant":2,"nombre":"Lomo Vetado","comentario":"punto medio"},
  {"cant":1,"nombre":"Coca Cola 350"},
  {"cant":1,"nombre":"Pastel de vino tinto","estacion":"cocina"},
  {"cant":1,"nombre":"Ceviche con vino blanco"},
  {"cant":1,"nombre":"Papas Fritas"},
  {"cant":1,"nombre":"Cerveza Kunstmann","estacion":" BARRA "},
  {"cant":1,"nombre":"Sopa X","estacion":"xyz"},
  {"cant":"3","nombre":"Empanada"},
  {"cant":0,"nombre":"Cant Cero"},
  {"cant":-2,"nombre":"Cant Neg"},
  {"cant":2,"nombre":"Menú del Día","menus":[
     {"entrada":"Sopa","principal":"Pollo","postre":"Flan","basura":1},
     {"entrada":"Ensalada","principal":"Pollo","postre":"Helado"}]}
]$j$::jsonb)::text);
select t.as('root');

select t.ok((select count(*) from public.comandas where mesa = '5' and sector = 'Carpa') = 1, 'C9 se creó UNA comanda para 5|Carpa');
select t.ok((select garzon from public.comandas where id = t.get('c5')::uuid) = 'Ana', 'C10 garzon = nombre de garzones.codigo, no texto del cliente');
select t.ok((select estado from public.comandas where id = t.get('c5')::uuid) = 'nuevo', 'C11 estado inicial nuevo');
select t.ok((select count(*) from public.comanda_items where comanda_id = t.get('c5')::uuid) = 11, 'C12 11 filas de ítems');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Lomo Vetado') = 'cocina', 'C13 Lomo -> cocina');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Coca Cola 350') = 'barra', 'C14 Coca Cola sin estacion -> barra (palabras clave)');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Pastel de vino tinto') = 'cocina', 'C15 estacion explícita cocina se RESPETA aunque diga "vino"');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Ceviche con vino blanco') = 'barra', 'C16 sin estacion, el respaldo por palabras clave manda (dice vino)');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Papas Fritas') = 'cocina', 'C17 "pap" no atrapa "Papas" (palabra completa)');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Cerveza Kunstmann') = 'barra', 'C18 estacion explícita se normaliza (espacios/mayúsculas)');
select t.ok((select estacion from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Sopa X') = 'cocina', 'C19 estacion inválida cae al respaldo');
select t.ok((select cant from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Empanada') = 3, 'C20 cant "3" (texto) -> 3');
select t.ok((select cant from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Cant Cero') = 1, 'C21 cant 0 -> 1 (como el Worker)');
select t.ok((select cant from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Cant Neg') = 1, 'C22 cant negativa -> 1 (como el Worker)');
select t.ok((select menus from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Menú del Día')
            = '[{"entrada":"Sopa","principal":"Pollo","postre":"Flan"},{"entrada":"Ensalada","principal":"Pollo","postre":"Helado"}]'::jsonb,
            'C23 menus conserva solo entrada/principal/postre');
select t.ok((select comentario from public.comanda_items where comanda_id = t.get('c5')::uuid and nombre = 'Lomo Vetado') = 'punto medio', 'C24 comentario se guarda');

-- =========================================================
-- D. Agregar a la misma mesa = insertar filas, no reemplazar
-- =========================================================
select t.as('anon');
select t.set('c5b', public.crear_o_agregar_comanda('222222', ' 5 ', 'Carpa', '[{"cant":1,"nombre":"Tomahawk"}]'::jsonb)::text);
select t.set('c5t', public.crear_o_agregar_comanda('111111', '5', 'Terraza', '[{"cant":1,"nombre":"Pisco Sour"}]'::jsonb)::text);
select t.as('root');
select t.ok(t.get('c5b') = t.get('c5'), 'D1 agregar a 5|Carpa devuelve la MISMA comanda (mesa con espacios se recorta)');
select t.ok((select count(*) from public.comanda_items where comanda_id = t.get('c5')::uuid) = 12, 'D2 quedaron 12 filas: las 11 originales + 1 (no se reemplazó nada)');
select t.ok((select garzon from public.comandas where id = t.get('c5')::uuid) = 'Ana', 'D3 la comanda conserva al garzón original');
select t.ok((select count(*) from public.comandas where mesa = '5' and cerrada_at is null) = 2, 'D4 otro sector de la misma mesa = otra comanda');
select t.ok(t.get('c5t') <> t.get('c5'), 'D5 5|Terraza es distinta de 5|Carpa');

-- Red de seguridad a nivel de base: dos abiertas para la misma mesa+sector es imposible.
select t.ok(t.err($$insert into public.comandas (mesa, sector) values ('5', 'Carpa')$$) like '%comandas_una_abierta_por_mesa%', 'D6 el índice único parcial impide dos comandas abiertas en la misma mesa+sector');

-- =========================================================
-- E. Cocina: estado, marcar, aviso
-- =========================================================
select t.as('anon');
select t.ok(t.err($$select public.cocina_estado('mal', null)$$) = 'Código de cocina inválido', 'E1 cocina_estado con código malo falla');
select t.ok(t.err($$select public.cocina_estado(null, null)$$) = 'Código de cocina inválido', 'E2 cocina_estado con null falla');
select t.ok(t.err($$select public.cocina_marcar('mal', gen_random_uuid(), 'listo')$$) = 'Código de cocina inválido', 'E3 cocina_marcar con código malo falla');
select t.ok(t.err($$select public.cocina_marcar('COCINA1', gen_random_uuid(), 'listo')$$) = 'Comanda no encontrada o ya cerrada', 'E4 marcar comanda inexistente falla');
select t.ok(t.err(format($$select public.cocina_marcar('COCINA1', %L, 'quemado')$$, t.get('c5'))) = 'Estado inválido', 'E5 estado inválido falla');
select t.set('cocina1', public.cocina_estado('COCINA1', null)::text);
select t.ok((t.get('cocina1')::jsonb) ? 'version' and (t.get('cocina1')::jsonb) ? 'comandas' and (t.get('cocina1')::jsonb) ? 'ahora', 'E6 cocina_estado devuelve version, ahora y comandas');
select t.ok(jsonb_path_exists(t.get('cocina1')::jsonb, '$.comandas[*] ? (@.mesa == "5" && @.sector == "Carpa")'), 'E7 5|Carpa aparece en cocina');
select t.ok(not jsonb_path_exists(t.get('cocina1')::jsonb, '$.comandas[*] ? (@.mesa == "5" && @.sector == "Terraza")'), 'E8 5|Terraza (solo un trago) se OMITE de cocina');
select t.ok((select jsonb_array_length(c->'items') from jsonb_array_elements(t.get('cocina1')::jsonb->'comandas') c where c->>'mesa' = '5' and c->>'sector' = 'Carpa') = 9, 'E9 cocina ve solo los 9 ítems de cocina (sin los 3 de barra)');
select t.ok(not jsonb_path_exists(t.get('cocina1')::jsonb, '$.comandas[*].items[*] ? (@.estacion == "barra")'), 'E10 ningún ítem de barra llega a cocina');
select t.ok((select (c->>'hora') ~ '^[0-2][0-9]:[0-5][0-9]$' and (c->>'min_estado')::int >= 0 and (c->>'min_creado')::int >= 0 and c->>'garzon' = 'Ana' and c->>'estado' = 'nuevo' and c ? 'id' and c ? 'estado_at' and c ? 'creado_at'
             from jsonb_array_elements(t.get('cocina1')::jsonb->'comandas') c where c->>'mesa' = '5' and c->>'sector' = 'Carpa'), 'E11 forma de cada comanda: hora HH:MM, minutos, garzon, estado, id');
select t.set('m1', public.cocina_marcar('COCINA1', t.get('c5')::uuid, 'preparando')::text);
select t.ok((t.get('m1')::jsonb->>'cambio')::boolean and not (t.get('m1')::jsonb->>'avisar')::boolean, 'E12 nuevo->preparando: cambio, sin aviso');
select t.set('m2', public.cocina_marcar('COCINA1', t.get('c5')::uuid, 'listo')::text);
select t.ok((t.get('m2')::jsonb->>'avisar')::boolean and t.get('m2')::jsonb->>'garzon' = 'Ana' and t.get('m2')::jsonb->>'mesa' = '5' and t.get('m2')::jsonb->>'sector' = 'Carpa', 'E13 ->listo: avisar=true con garzon/mesa/sector');
select t.set('m3', public.cocina_marcar('COCINA1', t.get('c5')::uuid, 'listo')::text);
select t.ok(not (t.get('m3')::jsonb->>'cambio')::boolean and not (t.get('m3')::jsonb->>'avisar')::boolean, 'E14 listo->listo: sin cambio ni aviso (no avisa dos veces)');
select t.as('root');
select t.ok((select estado from public.comandas where id = t.get('c5')::uuid) = 'listo' and (select listo_at from public.comandas where id = t.get('c5')::uuid) is not null, 'E15 estado=listo y listo_at registrado');

-- Agregar platos a una comanda LISTA la vuelve a 'nuevo' (estado por comanda entera).
select t.as('anon');
select t.set('c5c', public.crear_o_agregar_comanda('222222', '5', 'Carpa', '[{"cant":1,"nombre":"Arroz al Olivo"}]'::jsonb)::text);
select t.as('root');
select t.ok((select estado from public.comandas where id = t.get('c5')::uuid) = 'nuevo', 'E16 agregar a una comanda listo la vuelve a nuevo');
select t.ok(t.get('c5c') = t.get('c5'), 'E17 sigue siendo la misma comanda');

-- =========================================================
-- F. comandas_abiertas (Mozo/Caja) y VERSIÓN
-- =========================================================
select t.as('anon');
select t.ok(t.err($$select public.comandas_abiertas(null, null)$$) = 'No autorizado', 'F1 anon sin código no entra a comandas_abiertas');
select t.ok(t.err($$select public.comandas_abiertas('999999', null)$$) = 'Código de garzón inválido', 'F2 código malo falla');
select t.set('ab1', public.comandas_abiertas('111111', null)::text);
select t.ok((select jsonb_array_length(c->'items') from jsonb_array_elements(t.get('ab1')::jsonb->'comandas') c where c->>'mesa' = '5' and c->>'sector' = 'Carpa') = 13, 'F3 Mozo/Caja ven TODOS los ítems (13, bar incluido)');
select t.ok(jsonb_path_exists(t.get('ab1')::jsonb, '$.comandas[*] ? (@.mesa == "5" && @.sector == "Terraza")'), 'F4 5|Terraza sí aparece en comandas_abiertas');
select t.ok(jsonb_path_exists(t.get('ab1')::jsonb, '$.comandas[*].items[*] ? (@.estacion == "barra")'), 'F5 los ítems de barra viajan a Mozo/Caja');
select t.ok(jsonb_path_exists(t.get('ab1')::jsonb, '$.comandas[*].items[*] ? (@.id != null && @.cant != null && @.nombre != null && @.comentario != null && @.estacion != null)'), 'F6 cada ítem trae id, cant, nombre, comentario, estacion');

select t.set('v1', public.comandas_abiertas('111111', null)->>'version');
select t.ok(public.comandas_abiertas('111111', t.get('v1')) = jsonb_build_object('version', t.get('v1'), 'sin_cambios', true), 'F7 misma versión -> solo {version, sin_cambios:true}');
select t.ok(length(public.comandas_abiertas('111111', t.get('v1'))::text) < 120, 'F8 la respuesta "sin cambios" pesa < 120 bytes');
select t.ok(public.cocina_estado('COCINA1', t.get('v1')) ->> 'sin_cambios' = 'true', 'F9 cocina_estado con la misma versión -> sin_cambios');
select t.ok(public.comandas_abiertas('111111', t.get('v1'))->>'version' = public.comandas_abiertas('222222', t.get('v1'))->>'version', 'F10 la versión es global (igual para todos los garzones)');
select t.ok(public.comandas_abiertas('111111', t.get('v1'))->>'version' = public.cocina_estado('COCINA1', null)->>'version', 'F11 Mozo y cocina comparten versión');

-- Cada tipo de cambio mueve la versión (sentencias separadas = commits separados).
select t.set('c8', public.crear_o_agregar_comanda('111111', '8', 'Andino', '[{"cant":1,"nombre":"Plato Ocho"}]'::jsonb)::text);
select t.ok(public.comandas_abiertas('111111', t.get('v1'))->>'sin_cambios' is null, 'F12 crear comanda cambia la versión');
select t.set('v2', public.comandas_abiertas('111111', null)->>'version');
select t.set('c8b', public.crear_o_agregar_comanda('111111', '8', 'Andino', '[{"cant":1,"nombre":"Plato Nueve"}]'::jsonb)::text);
select t.ok(public.comandas_abiertas('111111', t.get('v2'))->>'sin_cambios' is null, 'F13 agregar ítems cambia la versión');
select t.set('v3', public.comandas_abiertas('111111', null)->>'version');
select public.cocina_marcar('COCINA1', t.get('c8')::uuid, 'preparando');
select t.ok(public.comandas_abiertas('111111', t.get('v3'))->>'sin_cambios' is null, 'F14 marcar estado cambia la versión');
select t.set('v4', public.comandas_abiertas('111111', null)->>'version');
select t.ok(public.comandas_abiertas('111111', t.get('v4'))->>'sin_cambios' = 'true', 'F15 releer sin cambios NO mueve la versión');
select t.as('root');
delete from public.comanda_items where comanda_id = t.get('c8')::uuid and nombre = 'Plato Nueve';
select t.as('anon');
select t.ok(public.comandas_abiertas('111111', t.get('v4'))->>'sin_cambios' is null, 'F16 un DELETE de ítem también cambia la versión');
select t.set('v5', public.comandas_abiertas('111111', null)->>'version');
select t.as('root');
select t.set('it8', (select id::text from public.comanda_items where comanda_id = t.get('c8')::uuid limit 1));
select t.as('anon');
select t.set('e8', public.editar_items_comanda('111111', t.get('c8')::uuid, jsonb_build_array(jsonb_build_object('id', t.get('it8')::uuid, 'cant', 0)))::text);
select t.ok((t.get('e8')::jsonb->>'cancelada')::boolean, 'F17 dejar todo en cero cancela la comanda');
select t.ok(public.comandas_abiertas('111111', t.get('v5'))->>'sin_cambios' is null, 'F18 cancelar cambia la versión');
select t.ok(not jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "8")'), 'F19 la comanda cancelada ya no aparece en abiertas');
select t.set('v6', public.comandas_abiertas('111111', null)->>'version');
select t.set('cobro8', public.cerrar_mesa_y_cobrar('222222', '5', 'Terraza', '[{"nombre":"Pisco Sour","cant":1,"precioUnit":4500}]'::jsonb, 4950, 'tarjeta')::text);
select t.ok(public.comandas_abiertas('111111', t.get('v6'))->>'sin_cambios' is null, 'F20 cobrar y cerrar cambia la versión');

-- Vencimiento por el paso del tiempo: sin ninguna escritura, la versión cambia sola.
select t.set('cT', public.crear_o_agregar_comanda('111111', 'T1', 'Carpa', '[{"cant":1,"nombre":"Plato Tiempo"}]'::jsonb)::text);
select t.as('root');
update public.comanda_items set created_at = now() - interval '11 hours 59 minutes 58 seconds' where comanda_id = t.get('cT')::uuid;
update public.comandas set creado_at = now() - interval '11 hours 59 minutes 58 seconds', estado_at = now() - interval '11 hours 59 minutes 58 seconds' where id = t.get('cT')::uuid;
select t.as('anon');
select t.set('vT', public.comandas_abiertas('111111', null)->>'version');
select t.ok(jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "T1")'), 'F21 a 11h59m58s la comanda todavía es vigente');
select pg_sleep(3);
select t.ok(public.comandas_abiertas('111111', t.get('vT'))->>'sin_cambios' is null, 'F22 al vencer por tiempo la versión cambia SIN ninguna escritura');
select t.ok(not jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "T1")'), 'F23 y la comanda vencida desaparece de comandas_abiertas');
select t.ok(not jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*] ? (@.mesa == "T1")'), 'F24 y de cocina_estado');
select t.as('root');
update public.comandas set cerrada_at = now(), cierre = 'vencida' where id = t.get('cT')::uuid;

-- =========================================================
-- G. editar_items_comanda
-- =========================================================
select t.as('anon');
select t.set('cE', public.crear_o_agregar_comanda('111111', 'E1', 'Carpa', $j$[
  {"cant":3,"nombre":"Menú del Día","menus":[{"entrada":"A","principal":"B","postre":"C"},{"entrada":"A","principal":"B","postre":"C"},{"entrada":"D","principal":"B","postre":"C"}]},
  {"cant":1,"nombre":"Plato B"},
  {"cant":2,"nombre":"Plato C"}]$j$::jsonb)::text);
select t.as('root');
select t.set('eMenu', (select id::text from public.comanda_items where comanda_id = t.get('cE')::uuid and nombre = 'Menú del Día'));
select t.set('eB', (select id::text from public.comanda_items where comanda_id = t.get('cE')::uuid and nombre = 'Plato B'));
select t.set('eC', (select id::text from public.comanda_items where comanda_id = t.get('cE')::uuid and nombre = 'Plato C'));
select t.set('eOtro', (select id::text from public.comanda_items where comanda_id = t.get('c5')::uuid limit 1));
select t.as('anon');
select public.cocina_marcar('COCINA1', t.get('cE')::uuid, 'listo');
select t.ok(t.err(format($$select public.editar_items_comanda('999999', %L, '[]')$$, t.get('cE'))) = 'Código de garzón inválido', 'G1 código malo falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '[]')$$, gen_random_uuid())) = 'Comanda no encontrada o ya cerrada', 'G2 comanda inexistente falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '{"a":1}')$$, t.get('cE'))) = 'Ítems inválidos', 'G3 p_items no arreglo falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '[{"id":"nada","cant":1}]')$$, t.get('cE'))) = 'Ítem inválido', 'G4 id malformado falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, %L)$$, t.get('cE'), jsonb_build_array(jsonb_build_object('id', t.get('eB'), 'cant', 'x'))::text)) = 'Cantidad inválida', 'G5 cantidad no numérica falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, %L)$$, t.get('cE'), jsonb_build_array(jsonb_build_object('id', t.get('eB'), 'cant', -1))::text)) = 'Cantidad inválida', 'G6 cantidad negativa falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, %L)$$, t.get('cE'), jsonb_build_array(jsonb_build_object('id', t.get('eB'), 'cant', 1), jsonb_build_object('id', t.get('eB'), 'cant', 2))::text)) = 'Ítem repetido', 'G7 ítem repetido falla');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, %L)$$, t.get('cE'), jsonb_build_array(jsonb_build_object('id', t.get('eOtro'), 'cant', 1))::text)) = 'Ítem no pertenece a la comanda', 'G8 ítem de OTRA comanda falla');
select t.set('ed1', public.editar_items_comanda('111111', t.get('cE')::uuid, format('[{"id":"%s","cant":1},{"id":"%s","cant":0}]', t.get('eMenu'), t.get('eB'))::jsonb)::text);
select t.as('root');
select t.ok(not (t.get('ed1')::jsonb->>'cancelada')::boolean and (t.get('ed1')::jsonb->>'cambios')::int = 2, 'G9 editar devuelve {cancelada:false, cambios:2}');
select t.ok((select cant from public.comanda_items where id = t.get('eMenu')::uuid) = 1 and (select jsonb_array_length(menus) from public.comanda_items where id = t.get('eMenu')::uuid) = 1, 'G10 bajar la cantidad del Menú del Día recorta sus menus (1 por unidad)');
select t.ok(not exists (select 1 from public.comanda_items where id = t.get('eB')::uuid), 'G11 cant 0 quita el ítem');
select t.ok((select cant from public.comanda_items where id = t.get('eC')::uuid) = 2, 'G12 los ítems NO mencionados quedan intactos');
select t.ok((select estado from public.comandas where id = t.get('cE')::uuid) = 'nuevo', 'G13 editar una comanda "listo" la vuelve a nuevo');

-- Ítem agregado por otro garzón mientras el primero edita: no se pierde.
select t.as('anon');
select public.crear_o_agregar_comanda('222222', 'E1', 'Carpa', '[{"cant":1,"nombre":"Plato Nuevo de Beto"}]'::jsonb);
select t.set('ed2', public.editar_items_comanda('111111', t.get('cE')::uuid, format('[{"id":"%s","cant":0},{"id":"%s","cant":0}]', t.get('eMenu'), t.get('eC'))::jsonb)::text);
select t.ok(not (t.get('ed2')::jsonb->>'cancelada')::boolean, 'G14 si otro garzón agregó un plato, poner en cero lo que uno veía NO cancela la comanda');
select t.as('root');
select t.ok(exists (select 1 from public.comanda_items where comanda_id = t.get('cE')::uuid and nombre = 'Plato Nuevo de Beto'), 'G15 el plato de Beto sigue ahí');

-- Cancelar: todo en cero.
select t.as('root');
select t.set('eBeto', (select id::text from public.comanda_items where comanda_id = t.get('cE')::uuid and nombre = 'Plato Nuevo de Beto'));
select t.as('anon');
select t.set('ed3', public.editar_items_comanda('111111', t.get('cE')::uuid, format('[{"id":"%s","cant":0}]', t.get('eBeto'))::jsonb)::text);
select t.ok((t.get('ed3')::jsonb->>'cancelada')::boolean, 'G16 dejar todo en cero cancela');
select t.as('root');
select t.ok((select cerrada_at is not null and cierre = 'cancelada' from public.comandas where id = t.get('cE')::uuid), 'G17 cancelada: cerrada_at + cierre=cancelada (sin borrado físico)');
select t.ok((select count(*) from public.comanda_items where comanda_id = t.get('cE')::uuid) = 1, 'G18 las filas de la comanda cancelada se conservan como historial');
select t.as('anon');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '[]')$$, t.get('cE'))) = 'Comanda no encontrada o ya cerrada', 'G19 no se puede editar una comanda cancelada');
select t.ok(t.err(format($$select public.cocina_marcar('COCINA1', %L, 'listo')$$, t.get('cE'))) = 'Comanda no encontrada o ya cerrada', 'G20 ni marcarla');
select t.set('cE2', public.crear_o_agregar_comanda('111111', 'E1', 'Carpa', '[{"cant":1,"nombre":"Plato Después"}]'::jsonb)::text);
select t.ok(t.get('cE2') <> t.get('cE'), 'G21 agregar a la mesa tras cancelar crea una comanda NUEVA');

-- Camino de admin (Caja) y quién no puede.
select t.as('admin');
select t.set('ed4', public.editar_items_comanda(null, t.get('cE2')::uuid, format('[{"id":"%s","cant":4}]', (select id from public.comanda_items where comanda_id = t.get('cE2')::uuid))::jsonb)::text);
select t.ok((select cant from public.comanda_items where comanda_id = t.get('cE2')::uuid) = 4, 'G22 un admin con sesión edita sin código de garzón');
select t.as('user');
select t.ok(t.err(format($$select public.editar_items_comanda(null, %L, '[]')$$, t.get('cE2'))) = 'No autorizado', 'G23 un autenticado que NO es admin no edita');
select t.as('anon');
select t.ok(t.err(format($$select public.editar_items_comanda(null, %L, '[]')$$, t.get('cE2'))) = 'No autorizado', 'G24 anon sin código no edita');
select t.as('root');

-- =========================================================
-- H. cerrar_mesa_y_cobrar (una transacción: cobro + cierre)
-- =========================================================
select t.set('cobros_antes', (select count(*)::text from public.pos_cobros));
select t.as('anon');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar('222222','5','Carpa','[]',100,'cheque')$$) = 'Medio de pago inválido', 'H1 medio de pago inválido');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar('222222','5','Carpa','[]',-1,'efectivo')$$) = 'Total inválido', 'H2 total negativo inválido');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar('999999','5','Carpa','[]',100,'efectivo')$$) = 'Código de garzón inválido', 'H3 código malo falla');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar(null,'5','Carpa','[]',100,'efectivo')$$) = 'No autorizado', 'H4 anon sin código no cobra');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar('222222','','Carpa','[]',100,'efectivo')$$) = 'Falta la mesa', 'H5 sin mesa falla');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar('222222','5','Carpa',null,100,'efectivo')$$) = 'Ítems inválidos', 'H6 sin snapshot de ítems falla');
select t.as('root');
select t.ok((select count(*)::text from public.pos_cobros) = t.get('cobros_antes'), 'H7 ningún intento fallido dejó un cobro huérfano');
select t.as('anon');
select t.set('cobro5', public.cerrar_mesa_y_cobrar('222222', '5', 'Carpa', '[{"nombre":"Lomo Vetado","cant":2,"precioUnit":15000}]'::jsonb, 33000, 'tarjeta')::text);
select t.as('root');
select t.ok((select garzon = 'Beto' and cobrado_por = 'Beto' and total = 33000 and medio_pago = 'tarjeta' and items->0->>'nombre' = 'Lomo Vetado' from public.pos_cobros where id = t.get('cobro5')::uuid), 'H8 pos_cobros: snapshot, total, medio; garzon/cobrado_por = el del código');
select t.ok((select bool_and(cierre = 'cobrada' and cerrada_at is not null and cobro_id = t.get('cobro5')::uuid) from public.comandas where mesa = '5' and sector = 'Carpa'), 'H9 las comandas de la mesa quedaron cerradas y enlazadas al cobro');
select t.as('anon');
select t.ok(not jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "5" && @.sector == "Carpa")'), 'H10 la mesa cobrada ya no está abierta');
select t.set('cobro999', public.cerrar_mesa_y_cobrar('111111', '999', 'Carpa', '[{"nombre":"Bebida suelta","cant":1}]'::jsonb, 2000, 'efectivo')::text);
select t.as('root');
select t.ok(exists (select 1 from public.pos_cobros where id = t.get('cobro999')::uuid), 'H11 sin comandas abiertas igual registra el cobro');

-- Admin (Caja) cobra sin código: cobrado_por = su nombre, garzon = el de la comanda.
select t.as('anon');
select t.set('cH2', public.crear_o_agregar_comanda('111111', 'H2', 'Carpa', '[{"cant":1,"nombre":"Plato H2"}]'::jsonb)::text);
select t.as('user');
select t.ok(t.err($$select public.cerrar_mesa_y_cobrar(null,'H2','Carpa','[]',100,'efectivo')$$) = 'No autorizado', 'H12 un autenticado no admin no cobra');
select t.as('admin');
select t.set('cobroH2', public.cerrar_mesa_y_cobrar(null, 'H2', 'Carpa', '[{"nombre":"Plato H2","cant":1}]'::jsonb, 5000, 'efectivo')::text);
select t.as('root');
select t.ok((select cobrado_por = 'Admin Caja' and garzon = 'Ana' from public.pos_cobros where id = t.get('cobroH2')::uuid), 'H13 cobro por admin: cobrado_por=nombre del admin, garzon=el de la comanda');
select t.ok((select cierre = 'cobrada' from public.comandas where id = t.get('cH2')::uuid), 'H14 y la comanda queda cobrada');

-- Fantasma vencido en la misma mesa: no se marca "cobrada" con el cobro de hoy.
select t.as('anon');
select t.set('cG', public.crear_o_agregar_comanda('111111', 'G1', 'Carpa', '[{"cant":1,"nombre":"Plato Fantasma"}]'::jsonb)::text);
select t.as('root');
update public.comanda_items set created_at = now() - interval '13 hours' where comanda_id = t.get('cG')::uuid;
update public.comandas set creado_at = now() - interval '13 hours', estado_at = now() - interval '13 hours' where id = t.get('cG')::uuid;
select t.as('anon');
select t.set('cobroG', public.cerrar_mesa_y_cobrar('111111', 'G1', 'Carpa', '[]'::jsonb, 0, 'efectivo')::text);
select t.as('root');
select t.ok((select cierre = 'vencida' and cobro_id is null from public.comandas where id = t.get('cG')::uuid), 'H15 la comanda fantasma se cierra como vencida, no como cobrada');

-- =========================================================
-- I. Vencimiento (12 h por defecto, ventana editable en pos_config)
-- =========================================================
select t.as('anon');
select t.set('cV1', public.crear_o_agregar_comanda('111111', 'V1', 'Carpa', '[{"cant":1,"nombre":"Plato V1"}]'::jsonb)::text);
select t.as('root');
update public.comanda_items set created_at = now() - interval '13 hours' where comanda_id = t.get('cV1')::uuid;
update public.comandas set creado_at = now() - interval '13 hours', estado_at = now() - interval '13 hours' where id = t.get('cV1')::uuid;
select t.as('anon');
select t.set('vV', public.comandas_abiertas('111111', null)->>'version');
select t.ok(not jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "V1")'), 'I1 una comanda de hace 13 h no aparece en comandas_abiertas');
select t.ok(not jsonb_path_exists(public.cocina_estado('COCINA1', null), '$.comandas[*] ? (@.mesa == "V1")'), 'I2 ni en cocina_estado');
select t.ok(t.err(format($$select public.cocina_marcar('COCINA1', %L, 'listo')$$, t.get('cV1'))) = 'Comanda no encontrada o ya cerrada', 'I3 cocina no puede marcar una vencida');
select t.ok(t.err(format($$select public.editar_items_comanda('111111', %L, '[]')$$, t.get('cV1'))) = 'La comanda venció por inactividad', 'I4 Mozo no puede editar una vencida');
select t.as('root');
select t.ok((select cerrada_at is null from public.comandas where id = t.get('cV1')::uuid), 'I5 sigue "abierta" en la tabla hasta que alguien la cierre (solo se oculta)');
update public.pos_config set valor = '20' where clave = 'comandas_vence_horas';
select t.as('anon');
select t.ok(jsonb_path_exists(public.comandas_abiertas('111111', null), '$.comandas[*] ? (@.mesa == "V1")'), 'I6 subir la ventana a 20 h en pos_config la hace reaparecer, sin tocar código');
select t.ok(public.comandas_abiertas('111111', t.get('vV'))->>'sin_cambios' is null, 'I7 y la versión cambia al cambiar la ventana');
select t.as('root');
update public.pos_config set valor = '12' where clave = 'comandas_vence_horas';
select t.as('anon');
select t.set('cV1n', public.crear_o_agregar_comanda('111111', 'V1', 'Carpa', '[{"cant":1,"nombre":"Plato V1 nuevo"}]'::jsonb)::text);
select t.as('root');
select t.ok(t.get('cV1n') <> t.get('cV1'), 'I8 abrir la mesa con un fantasma vencido crea una comanda NUEVA (no revive la vieja)');
select t.ok((select cierre = 'vencida' from public.comandas where id = t.get('cV1')::uuid), 'I9 y la vieja quedó cerrada como vencida');

-- comandas_cerrar_vencidas (admin)
select t.as('anon');
select t.set('cV2', public.crear_o_agregar_comanda('111111', 'V2', 'Carpa', '[{"cant":1,"nombre":"Plato V2"}]'::jsonb)::text);
select t.as('root');
update public.comanda_items set created_at = now() - interval '14 hours' where comanda_id = t.get('cV2')::uuid;
update public.comandas set creado_at = now() - interval '14 hours', estado_at = now() - interval '14 hours' where id = t.get('cV2')::uuid;
select t.as('anon');
select t.ok(t.err($$select public.comandas_cerrar_vencidas()$$) like 'permission denied%', 'I10 anon no puede ejecutar comandas_cerrar_vencidas');
select t.as('user');
select t.ok(t.err($$select public.comandas_cerrar_vencidas()$$) = 'No autorizado', 'I11 un autenticado no admin recibe No autorizado');
select t.as('admin');
select t.ok(t.err($$select public.comandas_cerrar_vencidas(0)$$) = 'Ventana inválida', 'I12 ventana <= 0 inválida');
select t.set('nv', public.comandas_cerrar_vencidas()::text);
select t.as('root');
select t.ok(t.get('nv')::int >= 1 and (select cierre = 'vencida' and cerrada_at is not null from public.comandas where id = t.get('cV2')::uuid), 'I13 admin cierra las vencidas con cierre=vencida (historial intacto)');
select t.ok(exists (select 1 from public.comanda_items where comanda_id = t.get('cV2')::uuid), 'I14 los ítems de la vencida se conservan');

-- =========================================================
-- J. estadisticas_cocina
-- =========================================================
select t.as('anon');
select t.set('cS', public.crear_o_agregar_comanda('111111', 'S1', 'Carpa', $j$[
  {"cant":2,"nombre":"Lomo Stat"},
  {"cant":2,"nombre":"Menú Stat","menus":[
    {"entrada":"Sopa S","principal":"Pollo S","postre":"Flan S"},
    {"entrada":"Sopa S","principal":"Pollo S","postre":"Flan S"}]},
  {"cant":3,"nombre":"Bebida Stat","estacion":"barra"},
  {"cant":1,"nombre":"+ Pan Stat"},
  {"cant":1,"nombre":"X"}]$j$::jsonb)::text);
select t.set('cS2', public.crear_o_agregar_comanda('111111', 'S2', 'Carpa', '[{"cant":5,"nombre":"Cancel Stat"}]'::jsonb)::text);
select t.ok(t.err($$select public.estadisticas_cocina('mal', null, null)$$) = 'Código de cocina inválido', 'J1 código malo falla');
select t.ok(t.err($$select public.estadisticas_cocina('COCINA1', '2026-02-01', '2026-01-01')$$) = 'Rango de fechas inválido', 'J2 rango invertido falla');
select t.ok(jsonb_array_length(public.estadisticas_cocina('COCINA1', null, null)->'ranking') >= 0, 'J3 sin fechas usa hoy (Chile)');
select t.set('st0', public.estadisticas_cocina('COCINA1', null, null)::text);
select t.ok(not (t.get('st0')::jsonb->'ranking' @> '[{"nombre":"Lomo Stat"}]'), 'J4 lo que aún no llegó a listo no cuenta');
select public.cocina_marcar('COCINA1', t.get('cS')::uuid, 'listo');
select public.cocina_marcar('COCINA1', t.get('cS2')::uuid, 'listo');
select t.as('admin');
select public.editar_items_comanda(null, t.get('cS2')::uuid, format('[{"id":"%s","cant":0}]', (select id from public.comanda_items where comanda_id = t.get('cS2')::uuid))::jsonb);
select t.as('anon');
select t.set('st1', public.estadisticas_cocina('COCINA1', null, null)::text);
select t.ok(t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Lomo Stat","unidades":2}]', 'J5 Lomo Stat x2');
select t.ok(t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Sopa S","unidades":2},{"nombre":"Pollo S","unidades":2},{"nombre":"Flan S","unidades":2}]', 'J6 Menú del Día: cuenta cada elección por comensal (no el contenedor)');
select t.ok(not (t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Menú Stat"}]'), 'J7 el contenedor "Menú" no se cuenta');
select t.ok(not (t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Bebida Stat"}]'), 'J8 la barra no se cuenta');
select t.ok(t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Pan Stat","unidades":1}]', 'J9 el nombre se limpia (sin "+ ")');
select t.ok(not (t.get('st1')::jsonb->'ranking' @> '[{"nombre":"X"}]'), 'J10 nombres de 1 letra se descartan (igual que el Worker)');
select t.ok(not (t.get('st1')::jsonb->'ranking' @> '[{"nombre":"Cancel Stat"}]'), 'J11 una comanda cancelada no cuenta');
select public.crear_o_agregar_comanda('111111', 'S1', 'Carpa', '[{"cant":4,"nombre":"Extra Stat"}]'::jsonb);
select t.ok(not (public.estadisticas_cocina('COCINA1', null, null)->'ranking' @> '[{"nombre":"Extra Stat"}]'), 'J12 un plato agregado después de "listo" no cuenta hasta que vuelva a estar listo');
select public.cocina_marcar('COCINA1', t.get('cS')::uuid, 'listo');
select t.ok(public.estadisticas_cocina('COCINA1', null, null)->'ranking' @> '[{"nombre":"Extra Stat","unidades":4}]', 'J13 al marcarlo listo de nuevo, sí');
select t.ok(public.estadisticas_cocina('COCINA1', null, null)->'ranking' @> '[{"nombre":"Lomo Stat","unidades":2}]', 'J14 y lo anterior no se duplica');
select t.ok(jsonb_array_length(public.estadisticas_cocina('COCINA1', '2000-01-01', '2000-01-02')->'ranking') = 0, 'J15 un rango sin actividad da ranking vacío');
select t.as('root');

-- =========================================================
-- K. Funciones de admin: purgar y definir_codigo_cocina
-- =========================================================
update public.comandas set cerrada_at = now() - interval '20 months' where id = t.get('cE')::uuid;
select t.set('abiertas_antes', (select count(*)::text from public.comandas where cerrada_at is null));
select t.set('cobros_k', (select count(*)::text from public.pos_cobros));
select t.as('anon');
select t.ok(t.err($$select public.comandas_purgar()$$) like 'permission denied%', 'K1 anon no ejecuta comandas_purgar');
select t.as('user');
select t.ok(t.err($$select public.comandas_purgar()$$) = 'No autorizado', 'K2 no admin: No autorizado');
select t.as('admin');
select t.ok(t.err($$select public.comandas_purgar(0)$$) = 'Meses inválido', 'K3 meses inválido');
select t.set('purgadas', public.comandas_purgar(18)::text);
select t.as('root');
select t.ok(t.get('purgadas')::int >= 1 and not exists (select 1 from public.comandas where id = t.get('cE')::uuid), 'K4 purgar borra comandas cerradas de +18 meses');
select t.ok(not exists (select 1 from public.comanda_items where comanda_id = t.get('cE')::uuid), 'K5 y sus ítems (cascade)');
select t.ok((select count(*)::text from public.comandas where cerrada_at is null) = t.get('abiertas_antes'), 'K6 no toca las comandas abiertas');
select t.ok((select count(*)::text from public.pos_cobros) = t.get('cobros_k'), 'K7 no toca pos_cobros');

select t.as('anon');
select t.ok(t.err($$select public.definir_codigo_cocina('CODIGO-NUEVO')$$) like 'permission denied%', 'K8 anon no ejecuta definir_codigo_cocina');
select t.as('user');
select t.ok(t.err($$select public.definir_codigo_cocina('CODIGO-NUEVO')$$) = 'No autorizado', 'K9 no admin: No autorizado');
select t.as('admin');
select t.ok(t.err($$select public.definir_codigo_cocina('abc')$$) = 'El código de cocina debe tener al menos 6 caracteres', 'K10 código corto rechazado');
select public.definir_codigo_cocina('CODIGO-NUEVO');
select t.as('anon');
select t.ok(public.cocina_estado('CODIGO-NUEVO', null) ? 'comandas', 'K11 el código nuevo abre cocina_estado');
select t.ok(t.err($$select public.cocina_estado('COCINA1', null)$$) = 'Código de cocina inválido', 'K12 y el viejo deja de servir');
select t.as('root');
update public.pos_config set valor = 'COCINA1' where clave = 'codigo_cocina';

-- Sin código de cocina configurado, cocina no entra (no hay código por defecto).
delete from public.pos_config where clave = 'codigo_cocina';
select t.as('anon');
select t.ok(t.err($$select public.cocina_estado('COCINA1', null)$$) = 'Código de cocina inválido', 'K13 sin codigo_cocina en pos_config nadie entra a cocina');
select t.ok(t.err($$select public.cocina_estado(null, null)$$) = 'Código de cocina inválido', 'K14 ni con null');
select t.as('root');
insert into public.pos_config (clave, valor) values ('codigo_cocina', 'COCINA1');

-- =========================================================
-- L. Grants y RLS
-- =========================================================
select t.ok(bool_and(has_function_privilege('anon', f, 'execute')), 'L1 anon puede ejecutar las 8 funciones de cliente')
from unnest(array[
  'public.comandas_backend()',
  'public.crear_o_agregar_comanda(text,text,text,jsonb)',
  'public.editar_items_comanda(text,uuid,jsonb)',
  'public.comandas_abiertas(text,text)',
  'public.cocina_estado(text,text)',
  'public.cocina_marcar(text,uuid,text)',
  'public.cerrar_mesa_y_cobrar(text,text,text,jsonb,numeric,text)',
  'public.estadisticas_cocina(text,date,date)']) f;
select t.ok(not bool_or(has_function_privilege('anon', f, 'execute')), 'L2 anon NO puede ejecutar las 3 funciones de admin')
from unnest(array['public.definir_codigo_cocina(text)', 'public.comandas_cerrar_vencidas(numeric)', 'public.comandas_purgar(int)']) f;
select t.ok(bool_and(has_function_privilege('authenticated', f, 'execute')), 'L3 authenticated puede ejecutar las 3 funciones de admin')
from unnest(array['public.definir_codigo_cocina(text)', 'public.comandas_cerrar_vencidas(numeric)', 'public.comandas_purgar(int)']) f;
select t.ok(not bool_or(has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')), 'L4 los helpers internos no son ejecutables por anon ni authenticated')
from unnest(array[
  'public.kds_norm(text)', 'public.es_barra(text,text)', 'public.comandas_limpiar(text,int)', 'public.comandas_int(text)',
  'public.comandas_es_admin()', 'public.comandas_autorizar(text,boolean)', 'public.comandas_autorizar_cocina(text)',
  'public.comandas_vence_horas()', 'public.comandas_vigentes()', 'public.comandas_version_actual()',
  'public.comandas_subir_version()', 'public.comandas_normalizar_items(jsonb)', 'public.comandas_json(boolean)']) f;
select t.ok(not has_table_privilege('anon', 'public.comandas', 'select') and not has_table_privilege('anon', 'public.comanda_items', 'select') and not has_table_privilege('anon', 'public.pos_config', 'select'), 'L5 anon sin privilegio de select en las tres tablas');
select t.ok(not has_table_privilege('authenticated', 'public.comandas', 'insert') and not has_table_privilege('authenticated', 'public.comandas', 'truncate') and has_table_privilege('authenticated', 'public.comandas', 'select'), 'L6 authenticated: solo select (que la RLS limita a admins)');
select t.ok((select relrowsecurity from pg_class where oid = 'public.comandas'::regclass) and (select relrowsecurity from pg_class where oid = 'public.comanda_items'::regclass) and (select relrowsecurity from pg_class where oid = 'public.pos_config'::regclass), 'L7 RLS activada en las tres tablas');

-- RLS de verdad: con el privilegio de select, un no-admin ve 0 filas y el admin ve las suyas.
select t.as('user');
select t.ok((select count(*) from public.comandas) = 0 and (select count(*) from public.comanda_items) = 0 and (select count(*) from public.pos_config) = 0, 'L8 un autenticado que NO es admin ve 0 filas (RLS)');
select t.as('admin');
select t.ok((select count(*) from public.comandas) > 0 and (select count(*) from public.comanda_items) > 0 and (select count(*) from public.pos_config) > 0, 'L9 un admin sí lee las tres tablas');
select t.ok(t.err($$insert into public.comandas (mesa) values ('x')$$) like 'permission denied%', 'L10 ni un admin escribe directo: solo por funciones');
select t.as('root');

-- =========================================================
-- M. es_barra replica esBarra() del Worker (valores calculados con el código JS real)
-- =========================================================
create table if not exists t.esperado (nombre text, barra boolean);
delete from t.esperado;
insert into t.esperado (nombre, barra) values
  ('Papas Fritas', false),
  ('PAPAS FRITAS', false),
  ('Pap smear', true),
  ('Lomo con pap', true),
  ('Ginger ale', true),
  ('Original gin', true),
  ('Engine', false),
  ('Reserva especial', true),
  ('Reservado', false),
  ('bebida_x', false),
  ('Bebida 1.5L', true),
  ('Bebidas', false),
  ('Beb.Coca', true),
  ('Beb. Coca', true),
  ('cava2', false),
  ('Cava', true),
  ('750cc', true),
  ('x750cc', false),
  ('Sábado', false),
  ('Champaña', true),
  ('CHAMPAÑA', true),
  ('Ñandú', false),
  ('Ñoquis', false),
  ('Vinos de la casa', true),
  ('Pastel de vino tinto', true),
  ('Ceviche con vino blanco', true),
  ('Piña colada', true),
  ('Colada de Mote', true),
  ('AGUA   mineral', false),
  ('agua mineral', true),
  ('Agua Tónica', true),
  ('Té de hoja', true),
  ('Té de Hoja Menta', true),
  ('Tè de hoja', true),
  ('Café', false),
  ('Cafe Americano', false),
  ('St Germain', true),
  ('st-germain', false),
  ('Jugo de Piña', true),
  ('Jugo', true),
  ('Pisco Sour', true),
  ('Mojito', true),
  ('Merlot Reserva 750cc', true),
  ('Carmenère', true),
  ('CARMENERE', true),
  ('Carmenère Gran Reserva', true),
  ('Malbec', true),
  ('Pinot Noir', true),
  ('Pinot', true),
  ('Sauvignon Blanc', true),
  ('Espumante Brut', true),
  ('Cerveza Kunstmann', true),
  ('Cervezas', false),
  ('Lomo Vetado', false),
  ('Ceviche Mixto', false),
  ('Tomahawk', false),
  ('Ensalada de Papas Mayo', false),
  ('Menú del Día', false),
  ('Coca Cola Zero', true),
  ('Coca-Cola', false),
  ('Sprite 350', true),
  ('Red Bull', true),
  ('Red-Bull', false),
  ('Michelada', true),
  ('Base Michelada', true),
  ('Hugo Spritz', true),
  ('Aperol Spritz', true),
  ('Tonic', true),
  ('Aguas', false),
  ('tonic water', true),
  ('Gin Tonic', true),
  ('Margarita de fruta', true),
  ('Cocktail de camarón', true),
  ('Cocteles', false),
  ('Coctel de camarón', true),
  ('Brutal', false),
  ('Brut Nature', true),
  ('Cosecha Tardía', true),
  ('Frozen de mango', true),
  ('187cc', true),
  ('187 cc', false),
  ('pap_a', false),
  ('Papa', false),
  ('Papas', false),
  ('Dulce de leche y pap', true),
  ('Pisco', true),
  ('piscola', false),
  ('Néctar', false),
  ('Limonada Menta', true),
  ('Limonadas', false),
  (' reserva', true),
  ('reserva ', true),
  ('(reserva)', true),
  ('Vino+', true),
  ('+vino', true),
  ('Mocktail', true),
  ('Mocktails', true),
  ('Amaretto Sour', true),
  ('Caipirinha', true),
  ('Negroni', true),
  ('Parfait de frutilla', true),
  ('Cynar', true),
  ('Chambord', true),
  ('Ramazzotti', true),
  ('Shiraz', true),
  ('Syrah', true),
  ('Chardonnay', true),
  ('Cabernet Sauvignon', true),
  ('Ñu', false),
  ('İstanbul', false);
select t.ok(coalesce((select string_agg(nombre || '=' || public.es_barra(nombre)::text, ' | ') from t.esperado where public.es_barra(nombre) is distinct from barra), '') = '',
  'M1 es_barra coincide con esBarra() de worker.js en los 110 casos (palabra completa, acentos, puntuación)');
select t.ok(public.es_barra('Lomo', 'vino tinto') and not public.es_barra('Lomo', 'Carnes'), 'M2 la categoría opcional también se evalúa, como esBarra(nombre, categoria)');
select t.ok(public.es_barra(null) = false, 'M3 es_barra(null) = false (sin error)');

-- =========================================================
-- N. Concurrencia real (OPCIONAL: necesita el módulo dblink y un Postgres
-- con conexión local sin contraseña; en PGlite se salta sola)
-- =========================================================
do $$
begin
  begin
    create extension if not exists dblink;
    perform t.set('dblink', '1');
  exception when others then
    perform t.set('dblink', '0');
  end;
end $$;

do $$
declare
  i int;
  n_com int;
  n_items int;
begin
  if t.get('dblink') is distinct from '1' then
    raise notice 'N: SALTADO (dblink no disponible)';
    return;
  end if;
  -- 6 garzones agregando a la MISMA mesa nueva a la vez; cada transacción
  -- se queda abierta 0.4 s para forzar el solapamiento.
  for i in 1..6 loop
    perform dblink_connect('cc' || i, 'dbname=' || current_database() || ' user=' || current_user);
    perform dblink_send_query('cc' || i,
      format($f$select t.agregar_lento('111111','CONC','Carpa','[{"cant":1,"nombre":"Plato %s"}]'::jsonb, 0.4)$f$, i));
  end loop;
  for i in 1..6 loop
    perform * from dblink_get_result('cc' || i) as r(v uuid);
    perform * from dblink_get_result('cc' || i) as r(v uuid);
    perform dblink_disconnect('cc' || i);
  end loop;
  select count(*) into n_com from public.comandas where mesa = 'CONC' and sector = 'Carpa';
  select count(*) into n_items from public.comanda_items i join public.comandas c on c.id = i.comanda_id where c.mesa = 'CONC';
  if n_com <> 1 or n_items <> 6 then
    raise exception 'FALLA: concurrencia: % comandas y % ítems (esperado 1 y 6)', n_com, n_items;
  end if;
  insert into t.results (msg) values ('N1 seis garzones simultáneos en la misma mesa: 1 comanda, 6 ítems, ninguno se pisó');
end $$;

-- =========================================================
-- Resumen
-- =========================================================
select count(*) as chequeos_ok from t.results;
