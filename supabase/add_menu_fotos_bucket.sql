-- =========================================================
-- BUCKET DE STORAGE "menu-fotos" — fotos propias para Productos (reemplazo POS)
--
-- Por qué: hoy public.menu_items.image_url solo tiene URLs hotlinkeadas a
-- varos.cl/gestion/views/productos/images/... (de un scrape inicial del PHP
-- viejo). Para que el personal pueda agregar un plato NUEVO con foto propia
-- desde /admin/productos, sin depender de ese sitio, necesitamos un lugar
-- donde subir imágenes: este bucket.
--
-- Es PÚBLICO (no privado como "comprobantes" en varos-gestion) porque estas
-- fotos van a la carta pública: cualquiera tiene que poder verlas sin signed
-- URLs. No hay dato sensible en una foto de plato.
--
-- Mismo patrón de admins que el resto del repo: auth.uid() in
-- (select user_id from public.admins). Solo admins pueden subir/editar/borrar;
-- cualquiera puede ver.
--
-- Este es el PRIMER bucket de Storage en varos-app (no había ninguno antes en
-- supabase/schema.sql ni en las demás migraciones), así que no hay policies
-- previas de otro bucket sobre storage.objects con las que pueda chocar.
--
-- create policy no tiene "if not exists": si volvés a correr este archivo con
-- las policies ya creadas, va a tirar 42710. Por eso el drop policy if exists
-- antes de cada create.
--
-- Pegar en Supabase → SQL Editor → Run
-- =========================================================

-- 1) El bucket. on conflict (id) do nothing lo hace seguro de re-correr.
insert into storage.buckets (id, name, public)
values ('menu-fotos', 'menu-fotos', true)
on conflict (id) do nothing;

-- Por si el bucket ya existía como privado de un intento anterior, asegurar
-- que quede público (si no, las fotos no se van a poder ver desde la carta).
update storage.buckets set public = true where id = 'menu-fotos';

-- 2) Policies sobre storage.objects, acotadas a este bucket.

-- Lectura pública: cualquiera puede ver/descargar las fotos del menú.
drop policy if exists "cualquiera ve fotos del menu" on storage.objects;
create policy "cualquiera ve fotos del menu" on storage.objects
  for select using (bucket_id = 'menu-fotos');

-- Solo admins pueden subir fotos nuevas.
drop policy if exists "admins suben fotos del menu" on storage.objects;
create policy "admins suben fotos del menu" on storage.objects
  for insert with check (
    bucket_id = 'menu-fotos'
    and auth.uid() in (select user_id from public.admins)
  );

-- Solo admins pueden reemplazar/actualizar una foto existente (ej. re-subir
-- con el mismo nombre de archivo).
drop policy if exists "admins actualizan fotos del menu" on storage.objects;
create policy "admins actualizan fotos del menu" on storage.objects
  for update using (
    bucket_id = 'menu-fotos'
    and auth.uid() in (select user_id from public.admins)
  ) with check (
    bucket_id = 'menu-fotos'
    and auth.uid() in (select user_id from public.admins)
  );

-- Solo admins pueden borrar fotos (ej. al eliminar un plato o cambiarle la foto).
drop policy if exists "admins borran fotos del menu" on storage.objects;
create policy "admins borran fotos del menu" on storage.objects
  for delete using (
    bucket_id = 'menu-fotos'
    and auth.uid() in (select user_id from public.admins)
  );
