-- =========================================================
-- BLOQUEO MANUAL DE MESAS (mantención, evento privado, mobiliario
-- retirado, etc.) — el admin apaga una mesa puntual desde /admin/mesas
-- y deja de aparecer como reservable en /reservas, con el motivo visible.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.mesas add column if not exists activa boolean not null default true;
alter table public.mesas add column if not exists bloqueo_motivo text;

alter table public.mesas_salon add column if not exists activa boolean not null default true;
alter table public.mesas_salon add column if not exists bloqueo_motivo text;

alter table public.mesas_terraza add column if not exists activa boolean not null default true;
alter table public.mesas_terraza add column if not exists bloqueo_motivo text;
