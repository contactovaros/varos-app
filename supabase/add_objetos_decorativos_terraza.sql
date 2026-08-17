-- =========================================================
-- OBJETOS DECORATIVOS DE LA TERRAZA (piscina, carrito) COMO FILAS EDITABLES
-- Reusa la tabla mesas_terraza en vez de crear una tabla nueva: así heredan
-- gratis el drag/resize/rotar/eliminar que ya existe para las mesas.
-- capacidad = 0 en estos objetos → no dibujan sillas y quedan fuera de las
-- reservas (Reservas.jsx los excluye por tipo, ver esReservable()).
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.mesas_terraza drop constraint if exists mesas_terraza_tipo_check;
alter table public.mesas_terraza add constraint mesas_terraza_tipo_check
  check (tipo in ('round', 'rect', 'piscina', 'decor'));

alter table public.mesas_terraza add column if not exists estilo text;

-- Las 4 mesas bistro bajo sombrilla ahora se dibujan con forma de quitasol
update public.mesas_terraza set estilo = 'sombrilla' where id in ('tz1', 'tz2', 'tz3', 'tz4');

-- Piscina: mitad recta + mitad ovalada (ancho = largo total, alto = diámetro
-- del extremo redondeado). Antes estaba fija en el fondo del SVG; ahora se
-- mueve/agranda/elimina como cualquier mesa.
insert into public.mesas_terraza (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden) values
  ('tz7', 'piscina', 'Piscina', 950, 1740, 260, 220, 0, 0, 7),
  ('tz8', 'decor', 'Carrito', 780, 1460, 60, 46, 0, 0, 8)
on conflict (id) do nothing;
