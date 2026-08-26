-- =========================================================
-- RECINTO, RECORTES Y COLORES DE CADA SALA -> BASE DE DATOS
-- Hoy el tamaño del recinto (ancho/largo en cm), el recorte en L del Comedor
-- Exterior, los colores de piso/mesa/silla, y las líneas punteadas que
-- separan zonas dentro de un plano están todos escritos a mano en JSX
-- (AdminMesas.jsx: ROOMS, SalonBackground, TerrazaBackground). Cualquier
-- ajuste de medidas o de paleta exige tocar código y redeployar.
--
-- Esta migración agrega esos datos a `salas` y `zonas` para que /admin/mesas
-- los lea de la base. Ver DECISIONES.md, sección "Recinto, zonas y
-- materiales editables en los 3 comedores · 2026-08-26".
--
-- Todas las columnas nuevas son nullable: si el frontend todavía no las lee,
-- no rompe nada. El backfill de abajo replica exactamente los valores que
-- hoy están hardcodeados, así que no cambia nada visualmente hasta que
-- alguien los edite desde el admin.
--
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- ---------------------------------------------------------
-- salas: dimensiones del recinto, recorte opcional en L, colores
-- ---------------------------------------------------------
alter table public.salas add column if not exists ancho numeric;      -- ancho interior en cm
alter table public.salas add column if not exists largo numeric;      -- largo/profundidad interior en cm

-- Recorte rectangular opcional dentro del recinto (hoy solo el Comedor
-- Exterior, que tiene forma en L). Si los 4 quedan null, el recinto es un
-- rectángulo simple de ancho x largo.
alter table public.salas add column if not exists hueco_x0 numeric;
alter table public.salas add column if not exists hueco_y0 numeric;
alter table public.salas add column if not exists hueco_x1 numeric;
alter table public.salas add column if not exists hueco_y1 numeric;

alter table public.salas add column if not exists color_piso text;   -- hex
alter table public.salas add column if not exists color_mesa text;   -- hex
alter table public.salas add column if not exists color_silla text;  -- hex

-- Backfill: valores tal cual estaban hardcodeados en AdminMesas.jsx / planoSalas.jsx
update public.salas set
  ancho = 1314, largo = 1700,
  hueco_x0 = 324, hueco_y0 = 0, hueco_x1 = 1314, hueco_y1 = 550,
  color_piso = '#7A5432', color_mesa = '#3a2c24', color_silla = '#221A16'
where id = 'comedor';

update public.salas set
  ancho = 1000, largo = 1500,
  hueco_x0 = null, hueco_y0 = null, hueco_x1 = null, hueco_y1 = null,
  color_piso = '#2A211C', color_mesa = '#3a2c24', color_silla = '#221A16'
where id = 'salon';

-- Nota: la terraza tiene hoy 3 materiales de piso distintos (deck/piedra/
-- pasto, ver TerrazaBackground). Un solo color acá es una simplificación
-- deliberada, ya aceptada en la decisión — no la resolvemos de otra forma.
update public.salas set
  ancho = 1200, largo = 2000,
  hueco_x0 = null, hueco_y0 = null, hueco_x1 = null, hueco_y1 = null,
  color_piso = '#7A5432', color_mesa = '#3a2c24', color_silla = '#221A16'
where id = 'terraza';

-- ---------------------------------------------------------
-- zonas: líneas punteadas opcionales (además del texto que ya existía)
-- ---------------------------------------------------------
-- Si x2/y2 están seteados, la fila se dibuja como línea punteada de (x,y) a
-- (x2,y2) en vez de (o además de) texto.
alter table public.zonas add column if not exists x2 numeric;
alter table public.zonas add column if not exists y2 numeric;

-- Migra las líneas que hoy están hardcodeadas en JSX en SalonBackground /
-- TerrazaBackground (AdminMesas.jsx). `texto` es NOT NULL en esta tabla, así
-- que van con '' porque son solo línea, no llevan etiqueta.
insert into public.zonas (id, room, texto, x, y, x2, y2, angulo, tam, orden) values
  ('s_linea1', 'salon', '', 0, 250, 1000, 250, 0, 26, 90),
  ('s_linea2', 'salon', '', 0, 900, 1000, 900, 0, 26, 91),
  ('s_linea3', 'salon', '', 0, 1100, 1000, 1100, 0, 26, 92),
  ('tz_linea1', 'terraza', '', 0, 650, 1200, 650, 0, 26, 90),
  ('tz_linea2', 'terraza', '', 0, 1350, 1200, 1350, 0, 26, 91)
on conflict (id) do nothing;
