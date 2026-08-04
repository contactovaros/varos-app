-- =========================================================
-- FIX: el botón "Guardar" del premio por 5 estrellas no
-- funcionaba porque config_recompensa_estrellas tiene RLS
-- activado pero nunca tuvo una política que permitiera
-- escribir (ni siquiera a los admins). Pega esto en
-- Supabase → SQL Editor → Run.
-- =========================================================
alter table public.config_recompensa_estrellas enable row level security;

create policy "todos ven el premio de estrellas" on public.config_recompensa_estrellas
  for select using (true);

create policy "admins editan el premio de estrellas" on public.config_recompensa_estrellas
  for update using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));
