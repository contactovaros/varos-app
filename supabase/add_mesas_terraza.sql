-- =========================================================
-- TERCERA SALA RESERVABLE: TERRAZA (jardín/piscina detrás del Comedor Principal)
-- Misma estructura que add_mesas.sql / add_mesas_salon.sql, en tabla aparte.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.mesas_terraza (
  id text primary key,
  tipo text not null check (tipo in ('round', 'rect')),
  etiqueta text not null,
  x numeric not null,
  y numeric not null,
  ancho numeric not null,      -- round: diámetro; rect: ancho
  alto numeric,                -- solo rect: largo de la mesa
  angulo numeric not null default 0,  -- solo rect: rotación en grados
  capacidad int not null default 4,   -- cantidad de sillas
  orden int not null default 0
);

alter table public.mesas_terraza enable row level security;

create policy "todos ven las mesas de la terraza" on public.mesas_terraza for select using (true);

create policy "admins editan mesas de la terraza" on public.mesas_terraza for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Datos iniciales: layout estimado a partir de fotos (sin medidas reales aún),
-- 4 mesas bistro redondas bajo sombrillas + 2 mesas altas tipo barril en la
-- zona de jardín/barra. Ajustar posiciones/medidas cuando haya medición real.
insert into public.mesas_terraza (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden) values
  ('tz1', 'round', 'Mesa 1', 200, 1550, 70, null, 0, 2, 1),
  ('tz2', 'round', 'Mesa 2', 380, 1550, 70, null, 0, 2, 2),
  ('tz3', 'round', 'Mesa 3', 200, 1750, 70, null, 0, 2, 3),
  ('tz4', 'round', 'Mesa 4', 380, 1750, 70, null, 0, 2, 4),
  ('tz5', 'round', 'Mesa 5', 580, 1600, 65, null, 0, 3, 5),
  ('tz6', 'round', 'Mesa 6', 580, 1850, 65, null, 0, 3, 6)
on conflict (id) do nothing;

insert into public.salas (id, nombre, activo) values
  ('terraza', 'Terraza', true)
on conflict (id) do nothing;

insert into public.zonas (id, room, texto, x, y, angulo, tam, orden) values
  ('tz_cubierta', 'terraza', 'TERRAZA CUBIERTA',   20,  40,   0, 26, 1),
  ('tz_pista',    'terraza', 'PISTA',              20,  700,  0, 30, 2),
  ('tz_jardin',   'terraza', 'JARDÍN / BARRA',     20,  1400, 0, 26, 3),
  ('tz_piscina',  'terraza', 'PISCINA',            930, 1780, 0, 22, 4)
on conflict (id) do nothing;
