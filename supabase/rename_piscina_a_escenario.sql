-- =========================================================
-- CORRECCIÓN: el objeto "Piscina" de la Terraza en realidad es un
-- ESCENARIO (la estructura de madera semi-ovalada que se ve en las fotos
-- del recinto). Se renombra y se elimina el rótulo de zona duplicado
-- ("PISCINA" flotando aparte) que quedó de un diseño anterior — el
-- objeto ya trae su propio texto encima.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.mesas_terraza drop constraint if exists mesas_terraza_tipo_check;
alter table public.mesas_terraza add constraint mesas_terraza_tipo_check
  check (tipo in ('round', 'rect', 'escenario', 'decor'));

update public.mesas_terraza set tipo = 'escenario', etiqueta = 'Escenario' where id = 'tz7';

delete from public.zonas where id = 'tz_piscina';
