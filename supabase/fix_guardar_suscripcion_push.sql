-- Guarda la suscripción push vía RPC en vez de un upsert directo desde el cliente.
--
-- Por qué: el cliente hacía upsert con onConflict:'endpoint'. Si ese endpoint ya
-- existía en la tabla a nombre de OTRO customer_id (por ejemplo, el mismo
-- navegador se había suscrito antes con otra cuenta), Postgres resuelve el
-- conflicto como UPDATE sobre esa fila ajena, y la policy de update
-- (auth.uid() = customer_id) la rechaza → "new row violates row-level security
-- policy". Un endpoint pertenece a un navegador, no a una cuenta, así que lo
-- correcto es reasignarlo al usuario que está activando ahora.
--
-- Pegar en Supabase → SQL Editor → Run.

create or replace function public.guardar_suscripcion_push(
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
  if auth.uid() is null then
    raise exception 'No hay sesión activa';
  end if;

  insert into public.push_subscriptions (customer_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set customer_id = auth.uid(),
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

revoke all on function public.guardar_suscripcion_push(text, text, text) from public;
grant execute on function public.guardar_suscripcion_push(text, text, text) to authenticated;
