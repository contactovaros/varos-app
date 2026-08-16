-- =========================================================
-- MESAS EDITABLES DEL COMEDOR — pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.mesas (
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

alter table public.mesas enable row level security;

-- Cualquiera (clientes reservando) puede ver el plano de mesas
create policy "todos ven las mesas" on public.mesas for select using (true);

-- Solo los administradores pueden mover/editar/agregar/eliminar mesas
create policy "admins editan mesas" on public.mesas for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Datos iniciales: el layout actual (13 mesas redondas + 2 rectangulares)
insert into public.mesas (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden) values
  ('t1',  'round', 'Mesa 1',  560,  1480, 120, null, 0, 8, 1),
  ('t2',  'round', 'Mesa 2',  819,  1480, 120, null, 0, 8, 2),
  ('t3',  'round', 'Mesa 3',  1078, 1480, 120, null, 0, 8, 3),
  ('t4',  'round', 'Mesa 4',  690,  1280, 120, null, 0, 8, 4),
  ('t5',  'round', 'Mesa 5',  950,  1280, 120, null, 0, 8, 5),
  ('t6',  'round', 'Mesa 6',  560,  1080, 120, null, 0, 8, 6),
  ('t7',  'round', 'Mesa 7',  819,  1080, 120, null, 0, 8, 7),
  ('t8',  'round', 'Mesa 8',  1078, 1080, 120, null, 0, 8, 8),
  ('t9',  'round', 'Mesa 9',  690,  880,  120, null, 0, 8, 9),
  ('t10', 'round', 'Mesa 10', 950,  880,  120, null, 0, 8, 10),
  ('t11', 'round', 'Mesa 11', 560,  680,  120, null, 0, 8, 11),
  ('t12', 'round', 'Mesa 12', 819,  680,  120, null, 0, 8, 12),
  ('t13', 'round', 'Mesa 13', 1078, 680,  120, null, 0, 8, 13),
  ('r1',  'rect',  'Mesa R1', 162,  275,  90,  250,  0, 6, 14),
  ('r2',  'rect',  'Mesa R2', 379,  1545, 90,  250,  0, 6, 15)
on conflict (id) do nothing;
