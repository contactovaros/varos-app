-- Permite que las "Promociones" (ya existentes en el panel admin) se envíen
-- a UN cliente específico o a TODOS los clientes, y que el cliente las vea
-- de verdad en su Club Varo's (antes se guardaban pero nunca se mostraban).
-- Pega esto en Supabase → SQL Editor → Run.

alter table public.promotions add column if not exists target_customer_id uuid references public.customers(id) on delete cascade;

-- El cliente solo debe ver promociones dirigidas a "todos" (target_customer_id nulo)
-- o dirigidas específicamente a él, y que estén activas.
drop policy if exists "todos ven promociones activas" on public.promotions;
create policy "cliente ve sus promociones" on public.promotions
  for select using (
    active = true
    and (target_customer_id is null or target_customer_id = auth.uid())
  );

-- Los admins ya tienen "admins editan promociones" (for all), así que siguen
-- viendo y editando absolutamente todas, sin cambios.
