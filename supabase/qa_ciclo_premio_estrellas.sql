-- ============================================================
-- QA CLUB VARO'S — CICLO COMPLETO DE ESTRELLAS Y PREMIO
-- Socio de prueba: dddddddd-dddd-dddd-dddd-dddddddddddd
-- No toca socios reales. El BLOQUE 6 borra todo rastro.
--
-- Pegar en Supabase -> SQL Editor. Correr BLOQUE POR BLOQUE (estan
-- numerados). El editor NO muestra 'raise notice': los bloques 2 y 4 dejan
-- su resultado en una temp table que se ve en la grilla. Los bloques con
-- 'drop table'/'delete' disparan el aviso "destructive operation" -> Run query.
--
-- Objetivo: verificar de punta a punta el camino
-- check-in -> 5a estrella -> premio -> reinicio -> entrega.
--
-- CORRIDO COMPLETO EL 2026-09-07: todo el ciclo paso. Preflight ok
-- (los 3 RPC existen, premios_ganados con canjeado/fecha_canjeado, RLS
-- SELECT para socio y admin). Unico hallazgo: la FK
-- premios_ganados.customer_id -> customers.id no cascadea (ver BLOQUE 6).
-- ============================================================


-- ------------------------------------------------------------
-- BLOQUE 0 — PREFLIGHT: la base esta como el codigo espera?
-- ------------------------------------------------------------
-- 0a) Existen los 3 RPC del club?
select proname
from pg_proc
where proname in ('register_visit','admin_add_star','admin_entregar_premio')
order by proname;
--  -> Deben aparecer LOS TRES. Si falta 'admin_entregar_premio',
--     add_entrega_premios.sql NUNCA se corrio: la entrega no funciona.

-- 0b) Forma real de premios_ganados (la trampa del "if not exists")
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'premios_ganados'
order by ordinal_position;
--  -> Tiene que haber columnas 'canjeado' (boolean) y 'fecha_canjeado'.
--     Si los nombres son otros, Admin.jsx y TarjetaFidelidad.jsx tiran 400.

-- 0c) Politicas RLS de premios_ganados
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'premios_ganados'
order by cmd;
--  -> Debe haber al menos 2 policies de SELECT (socio / admins).
--     Si no hay ninguna de SELECT, el socio y el admin ven CERO premios.

-- 0d) Columnas de estrellas en customers
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'customers'
  and column_name in ('estrellas_actuales','ciclos_completados','visit_count','last_visit_at');
--  -> estrellas_actuales y ciclos_completados deben existir con default 0.

-- 0e) Config del premio (revisar texto y 'visible')
select * from public.config_recompensa_estrellas where id = 1;
--  -> Hoy: producto con parentesis sin cerrar y visible=false. Anotalo.


-- ------------------------------------------------------------
-- BLOQUE 1 — CREAR EL SOCIO DE PRUEBA
-- El trigger on_auth_user_created crea la fila en public.customers.
-- ------------------------------------------------------------
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated',
   'qa-club-estrellas@varos.cl',
   'no-login-solo-qa',
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Socio QA Estrellas"}',
   now(), now(),
   '', '', '', '');

-- Verificar que el trigger creo la ficha de socio
select id, full_name, member_number, estrellas_actuales, ciclos_completados,
       visit_count, last_visit_at
from public.customers
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
--  -> estrellas_actuales=0, ciclos_completados=0, visit_count=0, last_visit_at=null


-- ------------------------------------------------------------
-- BLOQUE 2 — SIMULAR 5 CHECK-INS REALES (llama al RPC vivo)
-- Nota: auth.uid() es NULL en el SQL Editor, y 'NULL <> uuid' da NULL,
-- asi que el guard 'No autorizado' de register_visit NO se dispara aca.
-- Backdateamos last_visit_at antes de cada llamada para saltar el
-- candado diario y poder hacer las 5 visitas en una corrida.
-- ------------------------------------------------------------
-- OJO: el SQL Editor de Supabase NO muestra la salida de 'raise notice'.
-- Por eso guardamos cada resultado en una temp table y la seleccionamos al
-- final (asi se ve en la grilla). El 'drop table' dispara el warning de
-- "destructive operation" del editor -> confirmar con "Run query".
drop table if exists qa_visitas;
create temp table qa_visitas (n int, resultado json);
do $$
declare
  v_id  uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  i     int;
begin
  for i in 1..5 loop
    update public.customers
      set last_visit_at = now() - interval '2 days'
      where id = v_id;
    insert into qa_visitas values (i, public.register_visit(v_id));
  end loop;

  -- 6a llamada SIN backdate: debe pegar el candado diario
  insert into qa_visitas values (6, public.register_visit(v_id));
end $$;
select * from qa_visitas order by n;
--  ESPERADO (comprobado 2026-09-07):
--   1 -> {"gano_premio":false,"estrellas":1}
--   2 -> {"gano_premio":false,"estrellas":2}
--   3 -> {"gano_premio":false,"estrellas":3}
--   4 -> {"gano_premio":false,"estrellas":4}
--   5 -> {"gano_premio":true,"producto":"...","estrellas":0}
--   6 -> {"ya_registrado_hoy":true,"gano_premio":false}


-- ------------------------------------------------------------
-- BLOQUE 3 — VERIFICAR PASOS 3 y 4 (premio generado + reinicio)
-- ------------------------------------------------------------
select id, full_name, estrellas_actuales, ciclos_completados, visit_count
from public.customers
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
--  ESPERADO: estrellas_actuales=0, ciclos_completados=1, visit_count=5

select id, customer_id, producto, canjeado, fecha_ganado, fecha_canjeado
from public.premios_ganados
where customer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
--  ESPERADO: 1 fila, canjeado=false, fecha_ganado con timestamp, fecha_canjeado null
--  Si esta query da ERROR de columna -> la tabla real no coincide con
--  add_entrega_premios.sql (ver bug #2 del diagnostico).


-- ------------------------------------------------------------
-- BLOQUE 4 — VERIFICAR PASO 5 (entrega por el admin)
-- ------------------------------------------------------------
-- Misma tecnica que el bloque 2: temp table para ver el resultado en la grilla.
-- admin_entregar_premio(p_premio_id uuid) -> boolean, security definer, y su
-- guard 'auth.uid() not in admins' NO se dispara con auth.uid() NULL en el
-- editor (NULL not in (...) = NULL, no true), asi que corre el camino feliz.
drop table if exists qa_entrega;
create temp table qa_entrega (intento text, resultado text);
do $$
declare v_premio uuid; v_bool boolean;
begin
  select id into v_premio
  from public.premios_ganados
  where customer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    and canjeado = false
  limit 1;

  if v_premio is null then
    insert into qa_entrega values ('sin premio pendiente (fallo bloque 2 o RLS)', null);
    return;
  end if;

  begin
    v_bool := public.admin_entregar_premio(v_premio);
    insert into qa_entrega values ('primera (esperado true)', v_bool::text);
  exception when others then
    insert into qa_entrega values ('primera -> EXCEPTION', SQLERRM);
  end;

  begin
    v_bool := public.admin_entregar_premio(v_premio);
    insert into qa_entrega values ('segunda / doble captura (esperado false)', v_bool::text);
  exception when others then
    insert into qa_entrega values ('segunda -> EXCEPTION', SQLERRM);
  end;
end $$;
select * from qa_entrega;
--  ESPERADO (comprobado 2026-09-07): primera=true, segunda=false.
--  Si 'admin_entregar_premio' no existe -> add_entrega_premios.sql no se corrio.


-- ------------------------------------------------------------
-- BLOQUE 5 — VERIFICAR PASO 6 (estado final del socio)
-- ------------------------------------------------------------
select c.estrellas_actuales, c.ciclos_completados, c.visit_count,
       p.canjeado, p.fecha_canjeado
from public.customers c
join public.premios_ganados p on p.customer_id = c.id
where c.id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
--  ESPERADO: estrellas=0, ciclos=1, visit_count=5, canjeado=true, fecha_canjeado con timestamp


-- ------------------------------------------------------------
-- BLOQUE 6 — LIMPIEZA
-- OJO: premios_ganados.customer_id -> customers.id NO tiene ON DELETE
-- CASCADE (comprobado en QA 2026-09-07). Hay que borrar el premio a mano
-- ANTES de borrar el socio; recien ahi el delete de auth.users cascadea
-- a public.customers. El resto de tablas con customer_id quedaron en 0
-- para el socio de prueba, asi que no necesitan limpieza extra.
-- ------------------------------------------------------------
delete from public.premios_ganados where customer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
delete from auth.users             where id          = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

select
  (select count(*) from auth.users             where id          = 'dddddddd-dddd-dddd-dddd-dddddddddddd') as users_restantes,
  (select count(*) from public.customers        where id          = 'dddddddd-dddd-dddd-dddd-dddddddddddd') as customers_restantes,
  (select count(*) from public.premios_ganados  where customer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') as premios_restantes;
--  ESPERADO: 0, 0 y 0
