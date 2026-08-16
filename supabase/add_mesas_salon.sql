-- =========================================================
-- MESAS EDITABLES DEL SALÓN DE EVENTOS — pega este archivo en Supabase → SQL Editor → Run
-- Es la misma estructura que add_mesas.sql (comedor), pero en una tabla aparte
-- para no mezclar las mesas del salón de eventos con las reservas del comedor.
-- =========================================================

create table if not exists public.mesas_salon (
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

alter table public.mesas_salon enable row level security;

-- Cualquiera puede ver el plano del salón
create policy "todos ven las mesas del salon" on public.mesas_salon for select using (true);

-- Solo los administradores pueden mover/editar/agregar/eliminar mesas
create policy "admins editan mesas del salon" on public.mesas_salon for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Datos iniciales: layout reconstruido del video (salón de 10 x 15 m, 9 mesas redondas de 4 puestos)
insert into public.mesas_salon (id, tipo, etiqueta, x, y, ancho, alto, angulo, capacidad, orden) values
  ('sm1', 'round', 'Mesa 1', 250, 380, 120, null, 0, 4, 1),
  ('sm2', 'round', 'Mesa 2', 500, 380, 120, null, 0, 4, 2),
  ('sm3', 'round', 'Mesa 3', 750, 380, 120, null, 0, 4, 3),
  ('sm4', 'round', 'Mesa 4', 250, 580, 120, null, 0, 4, 4),
  ('sm5', 'round', 'Mesa 5', 500, 580, 120, null, 0, 4, 5),
  ('sm6', 'round', 'Mesa 6', 750, 580, 120, null, 0, 4, 6),
  ('sm7', 'round', 'Mesa 7', 250, 780, 120, null, 0, 4, 7),
  ('sm8', 'round', 'Mesa 8', 500, 780, 120, null, 0, 4, 8),
  ('sm9', 'round', 'Mesa 9', 750, 780, 120, null, 0, 4, 9)
on conflict (id) do nothing;
