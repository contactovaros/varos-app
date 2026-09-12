-- =========================================================
-- CIERRE DEFINITIVO del agujero de crear_garzon/desactivar_garzon.
-- Pega este archivo en Supabase → SQL Editor → Run.
--
-- Contexto: dos intentos de "revoke execute ... from anon" (el que trae
-- add_garzones.sql y el de fix_garzones_anon_execute.sql) corrieron sin
-- error, y sin embargo crear_garzon siguió siendo invocable con SOLO la
-- anon key (sin sesión), confirmado dos veces con curl real contra
-- producción.
--
-- Por qué el revoke por sí solo no alcanza a garantizar el cierre acá:
-- en un proyecto Supabase alojado, el rol `postgres` que usa el SQL
-- Editor NO es superusuario real de Postgres (el superusuario real es
-- `supabase_admin`, que administra el proyecto y nunca se expone al
-- cliente). Supabase deja configurado, a nivel de schema public, un
-- "alter default privileges" que le regala EXECUTE a `anon` y
-- `authenticated` en cada función nueva, automáticamente, con un
-- grantor que no necesariamente es `postgres`. Un REVOKE corrido como
-- `postgres` no siempre alcanza a sacar una entrada de ACL que quedó
-- con otro grantor — puede correr "Success" sin tocar esa entrada en
-- particular. (diagnose_garzones_grants.sql muestra el detalle exacto;
-- este archivo no depende de esperar ese resultado para cerrar el
-- agujero, ver abajo.)
--
-- Por eso el cierre real NO es (solo) un permiso de más: es que la
-- función misma verifique la sesión ANTES de hacer nada, con un chequeo
-- que no puede fallar en falso negativo. Este es el mismo patrón de bug
-- ya documentado en add_admin_add_star.sql (admin_add_star): en
-- plpgsql, `if auth.uid() not in (select ...)` con auth.uid() = NULL
-- (sin sesión) se evalúa como NULL, que en un `if` se trata como falso,
-- así que la excepción NUNCA se dispara y el resto de la función corre
-- igual. La condición correcta necesita un chequeo explícito de
-- "auth.uid() is null" primero, que sí es determinístico.
--
-- Esta migración hace las dos cosas:
--  1) agrega el chequeo explícito `auth.uid() is null` a crear_garzon y
--     desactivar_garzon (con CREATE OR REPLACE FUNCTION, que en
--     Postgres preserva el ACL existente de la función — no reabre el
--     agujero de grants al reemplazar el body).
--  2) re-emite los revoke/grant, por las dudas de que el problema haya
--     sido simplemente una firma o un estado intermedio raro.
--
-- Con (1) el agujero queda cerrado SIN depender de que (2) haya
-- funcionado: aunque `anon` conserve EXECUTE a nivel de Postgres, la
-- función va a rechazar cualquier llamada sin sesión con
-- "No autorizado" antes de tocar la tabla garzones.
--
-- validar_codigo_garzon NO se toca: esa debe seguir siendo pública,
-- la usa /mozo sin login.
-- =========================================================

create or replace function public.crear_garzon(p_nombre text)
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_garzon public.garzones;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  loop
    v_codigo := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.garzones where codigo = v_codigo);
  end loop;

  insert into public.garzones (nombre, codigo, activo)
  values (p_nombre, v_codigo, true)
  returning * into v_garzon;

  return v_garzon;
end;
$$;

create or replace function public.desactivar_garzon(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  update public.garzones set activo = p_activo where id = p_id;
end;
$$;

-- Re-emitir los permisos igual, por las dudas (no debería hacer falta
-- después del fix de arriba, pero no cuesta nada y deja el estado
-- explícito en vez de heredado):
revoke all on function public.crear_garzon(text) from public, anon, authenticated;
grant execute on function public.crear_garzon(text) to authenticated;

revoke all on function public.desactivar_garzon(uuid, boolean) from public, anon, authenticated;
grant execute on function public.desactivar_garzon(uuid, boolean) to authenticated;

-- No tocar validar_codigo_garzon: debe seguir así.
-- revoke all on function public.validar_codigo_garzon(text) from public;
-- grant execute on function public.validar_codigo_garzon(text) to anon, authenticated;

-- Limpieza: las dos filas de prueba creadas al confirmar el agujero
-- (ninguna es un garzón real).
delete from public.garzones where id in (
  '6e52f61f-9c0e-4412-9411-dd62b86a226c',
  '2c969e2c-aeb1-4471-a703-8e92576eb88d'
);
