-- =========================================================
-- JARDINERA MOVIBLE EN EL COMEDOR EXTERIOR
-- Mismo patrón que add_parlante_comedor.sql: se reusa la tabla `mesas` con
-- tipo 'decor' (capacidad 0, no reservable) para heredar el drag/resize/
-- eliminar que ya tienen las mesas, en /admin/mesas pestaña "Comedor Exterior".
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- Posición de referencia (esquina del plano) — arrástrala en /admin/mesas
-- hasta la ubicación real de la jardinera.
insert into public.mesas (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden, estilo) values
  ('t_jardinera', 'decor', 'Jardinera', 60, 60, 70, 45, 0, 0, 17, 'jardinera')
on conflict (id) do nothing;
