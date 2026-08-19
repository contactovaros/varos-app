-- Suscripciones a notificaciones push (Web Push API) del Club Varo's.
-- Pegar en el SQL Editor de Supabase y ejecutar.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Cada cliente puede crear/renovar su propia suscripción (una fila por endpoint
-- del navegador). No hay policy de select pública a propósito: la función
-- serverless que envía los push usa la service role key y bypassea RLS,
-- igual que el resto de las funciones admin de este proyecto.
create policy "clientes crean su propia suscripcion push"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = customer_id);

create policy "clientes actualizan su propia suscripcion push"
  on public.push_subscriptions for update
  to authenticated
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

create policy "clientes borran su propia suscripcion push"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = customer_id);
