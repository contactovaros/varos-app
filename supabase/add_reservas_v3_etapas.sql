-- =========================================================
-- ETAPAS 4 y 5 DEL SISTEMA DE RESERVAS
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- ---------------------------------------------------------
-- 1) CÓDIGO DE RESERVA LEGIBLE (ej. VRS-1048) + SECTOR
-- ---------------------------------------------------------
create sequence if not exists public.reservas_codigo_seq start 1000;

alter table public.reservas add column if not exists codigo text;
alter table public.reservas alter column codigo set default ('VRS-' || nextval('public.reservas_codigo_seq')::text);
update public.reservas set codigo = 'VRS-' || nextval('public.reservas_codigo_seq') where codigo is null;
alter table public.reservas add constraint reservas_codigo_unique unique (codigo);

-- Sector (comedor | salon | terraza) — antes solo vivía implícito en mesa_id
alter table public.reservas add column if not exists sala text;

-- ---------------------------------------------------------
-- 2) MÁS ESTADOS: se mantiene el español ya usado en la app
-- (pendiente/confirmada/cancelada) y se agregan los que faltan.
-- completada = "completed", no_asistio = "no_show".
-- ---------------------------------------------------------
alter table public.reservas drop constraint if exists reservas_estado_check;
alter table public.reservas add constraint reservas_estado_check
  check (estado in ('pendiente', 'confirmada', 'cancelada', 'completada', 'no_asistio'));

-- ---------------------------------------------------------
-- 3) ARQUITECTURA PREPARADA PARA WHATSAPP (sin integración real
-- todavía — falta elegir proveedor/API). Solo deja el campo listo.
-- ---------------------------------------------------------
alter table public.reservas add column if not exists whatsapp_enviado boolean not null default false;

-- ---------------------------------------------------------
-- 4) BLOQUEO TEMPORAL DE MESA (hold de 5 min mientras el cliente
-- completa sus datos). No requiere borrado activo: un hold vencido
-- (expira_at < now()) simplemente deja de contar como ocupado, y un
-- cron lo limpia cada 5 min para no acumular filas viejas.
-- ---------------------------------------------------------
create table if not exists public.mesa_holds (
  id uuid primary key default gen_random_uuid(),
  mesa_id text not null,
  fecha date not null,
  hora time not null,
  expira_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.mesa_holds enable row level security;

-- El flujo de reservas es público (sin login), así que cualquiera puede
-- crear/liberar holds — el propio vencimiento de 5 min limita el impacto.
create policy "cualquiera gestiona holds" on public.mesa_holds for all using (true) with check (true);

create extension if not exists pg_cron;

create or replace function public.limpiar_holds_vencidos()
returns void as $$
begin
  delete from public.mesa_holds where expira_at < now();
end;
$$ language plpgsql security definer;

select cron.unschedule('limpiar-holds-vencidos') where exists (
  select 1 from cron.job where jobname = 'limpiar-holds-vencidos'
);
select cron.schedule('limpiar-holds-vencidos', '*/5 * * * *', $$select public.limpiar_holds_vencidos()$$);
