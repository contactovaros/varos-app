-- Permite al panel admin eliminar un cliente y TODOS sus datos relacionados
-- (visitas, estrellas, canjes, pedidos, insignias, premios ganados).
-- Acción irreversible: no hay respaldo automático de lo que borre esta función.
-- Pega esto en Supabase → SQL Editor → Run.

create or replace function public.admin_delete_customer(p_customer_id uuid)
returns void as $$
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  -- points_transactions puede referenciar orders sin cascada, así que se limpia primero
  delete from public.points_transactions where customer_id = p_customer_id;
  delete from public.order_items where order_id in (select id from public.orders where customer_id = p_customer_id);
  delete from public.orders where customer_id = p_customer_id;
  delete from public.premios_ganados where customer_id = p_customer_id;

  -- Borrar el usuario de auth.users hace cascada automática sobre public.customers,
  -- public.redemptions y public.customer_badges (todas tienen "on delete cascade").
  delete from auth.users where id = p_customer_id;
end;
$$ language plpgsql security definer;
