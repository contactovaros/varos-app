-- =========================================================
-- PARLANTE MOVIBLE EN EL COMEDOR EXTERIOR
-- Mismo patron que add_objetos_decorativos_terraza.sql: se reusa la tabla
-- `mesas` con tipo 'decor' (capacidad 0, no reservable) para heredar el
-- drag/resize/eliminar que ya tienen las mesas, ahora tambien en /admin/mesas
-- pestaña "Comedor Exterior".
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.mesas drop constraint if exists mesas_tipo_check;
alter table public.mesas add constraint mesas_tipo_check
  check (tipo in ('round', 'rect', 'decor'));

alter table public.mesas add column if not exists estilo text;

-- Posición de referencia (esquina del plano) — arrástralo en /admin/mesas
-- hasta la ubicación real del parlante.
insert into public.mesas (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden, estilo) values
  ('t_parlante', 'decor', 'Parlante', 1250, 60, 50, 50, 0, 0, 16, 'parlante')
on conflict (id) do nothing;
