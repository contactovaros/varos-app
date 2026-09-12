-- =========================================================
-- SOLO LECTURA. No modifica nada. Correr en Supabase → SQL Editor → Run
-- y pegar el resultado de vuelta.
--
-- Por qué: dos intentos de "revoke execute ... from anon" sobre
-- crear_garzon/desactivar_garzon corrieron sin error ("Success") pero
-- probando con curl (solo anon key, sin sesión) la RPC sigue creando
-- filas reales en garzones. Antes de proponer un tercer revoke a
-- ciegas, necesitamos ver qué hay REALMENTE en el catálogo:
--
--  1) ¿hay más de un objeto función con ese nombre (overload con otra
--     firma) que el revoke anterior no tocó porque apuntaba a la firma
--     equivocada?
--  2) ¿quién es el owner de la función? (relevante: en Supabase alojado
--     el rol `postgres` que usa el SQL Editor NO es superusuario real;
--     `supabase_admin` sí lo es. Si el default privilege que le dio
--     EXECUTE a `anon` en cada función nueva del schema public quedó
--     con otro grantor, un REVOKE corrido como `postgres` puede no
--     alcanzar esa entrada aunque el owner sea postgres.)
--  3) ¿el ACL de la función tiene una entrada para `anon` todavía, y con
--     qué grantor?
--  4) ¿existe un default privilege a nivel de schema que reinstale el
--     EXECUTE a `anon` cada vez que se hace DROP+CREATE (no CREATE OR
--     REPLACE) de una función en public?
-- =========================================================

-- 1) y 2) y 3): ACL real de cada función, overload por overload, con
-- dueño y grantor de cada permiso. Si acá aparece más de una fila con
-- `args` distinto para el mismo proname, hay un overload duplicado.
-- Si aparece una fila con grantee = anon y privilege_type = EXECUTE
-- para crear_garzon o desactivar_garzon, ahí está el agujero vivo.
select
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner,
  a.grantee::regrole as grantee,
  a.privilege_type,
  a.grantor::regrole as grantor,
  a.is_grantable
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('crear_garzon', 'desactivar_garzon', 'validar_codigo_garzon')
order by p.proname, args, grantee;

-- Vista equivalente pero más legible (filtra a lo que el rol actual
-- puede ver vía information_schema; debería coincidir con lo de arriba
-- si el que corre esto es postgres/superusuario del proyecto):
select routine_name, grantee, privilege_type, is_grantable
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in ('crear_garzon', 'desactivar_garzon', 'validar_codigo_garzon')
order by routine_name, grantee;

-- 4) Default privileges declarados sobre el schema public para objetos
-- tipo función ('f'). Si acá aparece una fila con grantee = anon (o
-- authenticated) y for_role distinto de "postgres", es la fuente del
-- auto-grant original, y explica por qué un DROP+CREATE futuro (no un
-- simple CREATE OR REPLACE) volvería a abrir el agujero.
select
  pg_get_userbyid(d.defaclrole) as for_role,
  n.nspname as schema,
  d.defaclobjtype,
  b.grantee::regrole as grantee,
  b.privilege_type
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) b
where d.defaclobjtype = 'f'
order by for_role, grantee;

-- Extra: filas de prueba que hayan quedado en garzones de las pruebas
-- con curl, para borrarlas a mano una vez identificadas (no las borro
-- acá para no adivinar cuáles son "de prueba").
select id, nombre, codigo, activo, created_at
from public.garzones
order by created_at desc
limit 10;
