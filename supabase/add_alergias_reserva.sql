-- =========================================================
-- ALERGIAS / INTOLERANCIAS EN LA RESERVA
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================
alter table public.reservas add column if not exists alergias text;
