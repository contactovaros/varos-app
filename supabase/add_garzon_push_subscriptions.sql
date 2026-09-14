-- =========================================================
-- AVISOS PUSH PARA GARZONES ("tu plato está listo")
-- Pega este archivo en Supabase → SQL Editor → Run
--
-- Por qué: cuando cocina marca una comanda "Listo" en el KDS, hoy esa
-- info se queda en la pantalla de cocina — el garzón tiene que ir a
-- mirar. Esto le manda una notificación push real al celular.
--
-- Mismo patrón que push_subscriptions (Club Varo's), pero atado a un
-- garzon_id en vez de a auth.uid(): los garzones entran con un código
-- de 6 dígitos, no tienen sesión de Supabase Auth. Por eso el guardado
-- va siempre por la RPC de abajo (security definer), nunca por upsert
-- directo del cliente — ver fix_guardar_suscripcion_push.sql para el
-- incidente que ya pasó una vez con ese patrón.
--
-- Sin policy de select/insert pública: el endpoint+claves son
-- sensibles (cualquiera que los tenga puede mandarle notificaciones a
-- ese celular). Todo el acceso real (leer para enviar) lo hace la
-- función de Netlify con la service role key, no un cliente.
-- =========================================================

create table if not exists public.garzon_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  garzon_id uuid not null references public.garzones(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.garzon_push_subscriptions enable row level security;

create index if not exists garzon_push_subscriptions_garzon_idx on public.garzon_push_subscriptions (garzon_id);

-- =========================================================
-- RPC: guardar_suscripcion_push_garzon — la llama /mozo después de que
-- el garzón ya validó su código (ver validar_codigo_garzon). Reasigna
-- el endpoint al garzón actual si ese mismo celular ya estaba
-- suscripto a nombre de otro garzón (un endpoint es del aparato, no de
-- la persona).
-- =========================================================
create or replace function public.guardar_suscripcion_push_garzon(
  p_garzon_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.garzones where id = p_garzon_id and activo = true) then
    raise exception 'Garzón inválido o inactivo';
  end if;

  insert into public.garzon_push_subscriptions (garzon_id, endpoint, p256dh, auth)
  values (p_garzon_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set garzon_id = excluded.garzon_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

revoke all on function public.guardar_suscripcion_push_garzon(uuid, text, text, text) from public;
grant execute on function public.guardar_suscripcion_push_garzon(uuid, text, text, text) to anon, authenticated;
