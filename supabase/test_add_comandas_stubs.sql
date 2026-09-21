-- =========================================================
-- SOLO PARA UN POSTGRES DESECHABLE (PGlite, Docker, local). NUNCA en Supabase.
--
-- Arma lo mínimo que add_comandas.sql necesita para poder probarse fuera de
-- Supabase: esquema `auth` con auth.users y auth.uid(), roles anon /
-- authenticated, y los "default privileges" que Supabase da a esos roles
-- (para que el test compruebe que los revoke de la migración funcionan de
-- verdad y no solo porque faltaba el permiso). Después carga las migraciones
-- REALES de las que depende add_comandas.sql: add_garzones.sql,
-- add_pos_cobros.sql y add_registrar_cobro_garzon.sql.
--
-- Orden de ejecución:
--   1. test_add_comandas_stubs.sql
--   2. add_garzones.sql, add_pos_cobros.sql, add_registrar_cobro_garzon.sql
--      (los carga el runner; en psql: \i cada uno)
--   3. add_comandas.sql   (correrlo DOS veces: idempotencia)
--   4. test_add_comandas.sql
-- =========================================================

set varos.es_test = 'si';

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

-- Igual que la de Supabase: lee el sub del JWT que PostgREST deja en la sesión.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Lo que Supabase hace por defecto en el schema public: todo a anon/authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Mínimos de schema.sql (las migraciones reales solo referencian estas columnas).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null
);
