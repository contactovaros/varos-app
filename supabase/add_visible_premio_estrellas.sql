-- Agrega el interruptor "Visible / No visible" del premio por 5 estrellas.
-- Pega esto en Supabase → SQL Editor → Run (después de fix_premio_estrellas_rls.sql).
alter table public.config_recompensa_estrellas
  add column if not exists visible boolean not null default true;
