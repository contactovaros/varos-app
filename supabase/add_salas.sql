-- =========================================================
-- SALAS ACTIVAS/INACTIVAS PARA RESERVA ONLINE
-- Permite al admin apagar un comedor completo (ej. si el Comedor Principal
-- está tomado por un evento privado) sin tener que borrar sus mesas.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.salas (
  id text primary key,       -- coincide con las claves usadas en el código: 'comedor' | 'salon'
  nombre text not null,
  activo boolean not null default true
);

alter table public.salas enable row level security;

-- Cualquiera puede ver qué salas están activas (lo necesita /reservas, que es público)
create policy "todos ven las salas" on public.salas for select using (true);

create policy "admins editan salas" on public.salas for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

insert into public.salas (id, nombre, activo) values
  ('comedor', 'Comedor Exterior', true),
  ('salon', 'Comedor Principal', true)
on conflict (id) do nothing;
