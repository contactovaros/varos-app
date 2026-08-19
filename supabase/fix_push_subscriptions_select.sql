-- Arregla el error 403 "new row violates row-level security policy" al activar
-- las notificaciones push desde /club.
--
-- Causa: el cliente hace un upsert con onConflict:'endpoint', que en Postgres es
-- INSERT ... ON CONFLICT DO UPDATE. Para resolver el conflicto, Postgres tiene que
-- LEER la fila existente, y las políticas de SELECT se aplican en ese camino.
-- La tabla se creó sin ninguna política de select, así que el upsert fallaba
-- aunque el with_check del insert (auth.uid() = customer_id) sí se cumplía.
--
-- Pegar en Supabase → SQL Editor → Run.

create policy "clientes ven su propia suscripcion push"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = customer_id);
