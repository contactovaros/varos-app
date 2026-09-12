-- =========================================================
-- URGENTE: cierra un agujero real encontrado al probar add_garzones.sql
-- recién corrida (2026-09-12).
--
-- Qué pasó: "revoke all on function ... from public" (lo que trae la
-- migración anterior) solo saca el permiso implícito del pseudo-rol
-- PUBLIC. Supabase, al crear un proyecto nuevo, deja configurado un
-- "alter default privileges" que le da EXECUTE a los roles `anon` y
-- `authenticated` en CADA función nueva del schema public, de forma
-- automática y aparte de PUBLIC — así que ese revoke no alcanzó.
--
-- Se probó en vivo contra producción (llamando crear_garzon con la sola
-- anon key, sin ninguna sesión) y funcionó: se creó un garzón real
-- ("intento sin permiso") con un código válido, sin ningún permiso.
-- Este archivo revoca el acceso de `anon` explícitamente (que es el rol
-- que faltaba cerrar) y borra esa fila de prueba.
-- =========================================================

revoke execute on function public.crear_garzon(text) from anon;
revoke execute on function public.desactivar_garzon(uuid, boolean) from anon;

delete from public.garzones where id = '6e52f61f-9c0e-4412-9411-dd62b86a226c';
