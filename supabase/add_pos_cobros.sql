-- =========================================================
-- COBROS DE CAJA (fase 1 del POS nuevo) — libro de caja permanente
-- Pega este archivo en Supabase → SQL Editor → Run
--
-- Por qué: los pedidos del piloto de Comandas viven solo en el KV de
-- varos-kds (pedidos_nuevos, TTL 6h) — se pierden solos, no hay forma
-- de saber después "cuánto se cobró hoy". Esta tabla es el registro
-- permanente de lo que se cobró: no procesa ningún pago (no hay boleta
-- SII, se emite a mano; la tarjeta se cobra en el POS bancario físico
-- de caja, aparte) — solo REGISTRA el resultado.
--
-- Ver varos-pos/DECISIONES.md, "Caja fase 1: cobrar y cerrar mesa".
--
-- Es plata: mismo criterio que `garzones` — sin policy de select
-- pública, solo admins.
-- =========================================================

create table if not exists public.pos_cobros (
  id uuid primary key default gen_random_uuid(),
  mesa text not null,
  sector text not null,
  garzon text not null default '',
  items jsonb not null,        -- snapshot de lo cobrado (nombre, cant, comentario), no una referencia viva
  total numeric not null check (total >= 0),
  medio_pago text not null check (medio_pago in ('efectivo', 'tarjeta', 'transferencia')),
  cobrado_por text not null,   -- nombre del admin que cerró la mesa en Caja
  created_at timestamptz not null default now()
);

alter table public.pos_cobros enable row level security;

drop policy if exists "admins ven cobros" on public.pos_cobros;
create policy "admins ven cobros" on public.pos_cobros
  for select using (auth.uid() in (select user_id from public.admins));

drop policy if exists "admins registran cobros" on public.pos_cobros;
create policy "admins registran cobros" on public.pos_cobros
  for insert with check (auth.uid() in (select user_id from public.admins));

create index if not exists pos_cobros_fecha_idx on public.pos_cobros (created_at desc);
