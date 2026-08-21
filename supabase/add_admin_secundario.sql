-- =========================================================
-- DAR ACCESO DE ADMIN A UNA CUENTA DE GOOGLE
--
-- varos-app no usa contraseñas: el ingreso es siempre con Google (Supabase
-- Auth). Ser admin no es una cuenta aparte — es estar en la tabla
-- `public.admins`. Por eso el procedimiento es:
--
--   1. La persona entra una vez a la app con su cuenta de Google
--      (https://varosclub.netlify.app) para que se cree su fila en auth.users.
--   2. Reemplaza el correo de abajo por el suyo y corre este archivo.
--   3. Cierra sesión y vuelve a entrar: ya ve el panel de admin.
--
-- OJO: este repositorio está en GitHub. No dejes correos personales ni claves
-- escritos en los archivos versionados — cambia el valor, corre la consulta y
-- vuelve a dejar el marcador.
--
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

insert into public.admins (user_id)
select id
from auth.users
where lower(email) = lower('CORREO@ejemplo.com')   -- ← cambia esto
on conflict (user_id) do nothing;

-- Verificar quién quedó como admin (debería listar al menos una fila):
select u.email, a.user_id
from public.admins a
join auth.users u on u.id = a.user_id;
