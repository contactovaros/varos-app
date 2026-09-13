-- =========================================================
-- MESAS DEL POS (numeración real por sector para /mozo)
-- Pega este archivo en Supabase → SQL Editor → Run
--
-- Por qué: /mozo (varos-app/src/pages/Mozo.jsx) traía una lista de mesas
-- INVENTADA (Bar 1-3, Carpa 4-9, ...) que no coincide con la numeración
-- real del restaurante — en las comandas reales el número se REPITE por
-- sector (ej. "1 - Bar" y "1 - Carpa" son mesas distintas). Decisión del
-- usuario (2026-09-13): en vez de que Claude adivine o cargue la
-- numeración real a mano, esta tabla queda editable desde /admin y el
-- propio equipo del restaurante carga sus mesas reales, sector por sector.
--
-- Sin datos sensibles acá (a diferencia de `garzones`, que sí necesita
-- ocultar el código): cualquiera puede LEER la lista de mesas activas
-- (la necesita /mozo, que no tiene login), solo un admin puede
-- agregar/editar/borrar.
-- =========================================================

create table if not exists public.pos_mesas (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  numero text not null,       -- text, no int: permite "7B" o similar si algún día hace falta
  orden int,                  -- orden dentro del sector; null = al final, por numero
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pos_mesas enable row level security;

drop policy if exists "cualquiera lee mesas del pos" on public.pos_mesas;
create policy "cualquiera lee mesas del pos" on public.pos_mesas
  for select using (true);

drop policy if exists "admins agregan mesas del pos" on public.pos_mesas;
create policy "admins agregan mesas del pos" on public.pos_mesas
  for insert with check (auth.uid() in (select user_id from public.admins));

drop policy if exists "admins actualizan mesas del pos" on public.pos_mesas;
create policy "admins actualizan mesas del pos" on public.pos_mesas
  for update using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

drop policy if exists "admins borran mesas del pos" on public.pos_mesas;
create policy "admins borran mesas del pos" on public.pos_mesas
  for delete using (auth.uid() in (select user_id from public.admins));

create index if not exists pos_mesas_sector_idx on public.pos_mesas (sector, orden, numero);
