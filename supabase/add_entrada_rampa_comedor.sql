-- =========================================================
-- ENTRADA Y RAMPA DE ACCESO EN EL COMEDOR EXTERIOR
-- Estaban en el layout original (artifact "Layout del Comedor") pero no se
-- migraron cuando esta sala pasó a ser una tabla real. Mismo patrón que el
-- parlante/jardinera: objetos tipo 'decor' en la tabla mesas.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- Posición de referencia (pared inferior, la de acceso desde la calle) —
-- arrástralas en /admin/mesas hasta la ubicación real de cada una.
insert into public.mesas (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden, estilo) values
  ('t_entrada', 'decor', 'Entrada', 650, 1700, 100, 100, 0, 0, 18, 'entrada'),
  ('t_rampa', 'decor', 'Rampa', 820, 1660, 150, 80, 0, 0, 19, 'rampa')
on conflict (id) do nothing;
