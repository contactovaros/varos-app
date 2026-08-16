-- =========================================================
-- Agrega el rótulo "Terraza / Piscina" del salón como zona editable
-- (antes estaba fijo en el código; ahora se puede cambiar o vaciar
-- desde la tarjeta "Nombres de zona" en /admin/mesas)
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

insert into public.zonas (id, room, texto, x, y, angulo, tam, orden) values
  ('s_terraza', 'salon', '↓ Terraza / Piscina', 500, 1534, 0, 18, 6)
on conflict (id) do nothing;
