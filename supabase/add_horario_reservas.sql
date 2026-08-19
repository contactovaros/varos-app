-- =========================================================
-- HORARIO DE ATENCIÓN Y RESTRICCIÓN A SOLO ALMUERZO
-- Por defecto /reservas solo deja pedir horario de almuerzo
-- (12:30-16:30, martes a domingo). El administrador puede
-- habilitar también la reserva online en horario de cena
-- desde /admin/reservas.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================
create table if not exists public.configuracion_reservas (
  id smallint primary key default 1,
  cena_habilitada boolean not null default false,
  constraint configuracion_reservas_singleton check (id = 1)
);

alter table public.configuracion_reservas enable row level security;

-- Cualquiera puede leerla (la necesita /reservas, que es público)
create policy "todos ven la configuracion" on public.configuracion_reservas for select using (true);

create policy "admins editan la configuracion" on public.configuracion_reservas for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

insert into public.configuracion_reservas (id, cena_habilitada) values (1, false)
on conflict (id) do nothing;
