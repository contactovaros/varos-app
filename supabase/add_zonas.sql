-- =========================================================
-- NOMBRES DE ZONA EDITABLES (Comedor Exterior / Comedor Principal)
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.zonas (
  id text primary key,
  room text not null,       -- 'comedor' | 'salon' (coincide con las pestañas de /admin/mesas)
  texto text not null,
  x numeric not null,
  y numeric not null,
  angulo numeric not null default 0,  -- rotación en grados (ej. el letrero de la barra va girado)
  tam numeric not null default 26,    -- tamaño de letra
  orden int not null default 0
);

alter table public.zonas enable row level security;

create policy "todos ven las zonas" on public.zonas for select using (true);

create policy "admins editan zonas" on public.zonas for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Nombres actuales, tal cual estaban escritos en el plano
insert into public.zonas (id, room, texto, x, y, angulo, tam, orden) values
  ('c_lateral',        'comedor', 'COMEDOR LATERAL',    20,  40,  0,  30, 1),
  ('c_principal',       'comedor', 'COMEDOR PRINCIPAL',  344, 600, 0,  34, 2),
  ('s_vestibulo',       'salon',   '01 · VESTÍBULO',      20,  40,  0,  26, 1),
  ('s_principal',       'salon',   '02 · SALÓN PRINCIPAL',20, 290, 0,  26, 2),
  ('s_barra_zona',      'salon',   '03 · BARRA',          20, 940, 0,  26, 3),
  ('s_lounge',          'salon',   '04 · LOUNGE',         20, 1140, 0, 26, 4),
  ('s_barra_letrero',   'salon',   'BARRA',               965, 1000, 90, 22, 5)
on conflict (id) do nothing;
