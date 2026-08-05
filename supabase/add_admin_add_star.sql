-- Permite al admin sumar una estrella manualmente a un cliente desde el panel.
-- Usa la misma lógica que register_visit (si llega a 5, otorga el premio y
-- resetea a 0), pero sin el límite de "una vez al día" porque es una
-- corrección/ajuste manual del admin, no un check-in real del cliente.
-- Pega esto en Supabase → SQL Editor → Run.

create or replace function public.admin_add_star(p_customer_id uuid)
returns json as $$
declare
  v_estrellas int;
  producto_premio text;
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  select producto into producto_premio from public.config_recompensa_estrellas where id = 1;

  update public.customers
    set estrellas_actuales = estrellas_actuales + 1,
        visit_count = visit_count + 1,
        last_visit_at = now()
    where id = p_customer_id
    returning estrellas_actuales into v_estrellas;

  if v_estrellas >= 5 then
    update public.customers
      set estrellas_actuales = 0,
          ciclos_completados = ciclos_completados + 1
      where id = p_customer_id;

    insert into public.premios_ganados (customer_id, producto)
    values (p_customer_id, producto_premio);

    return json_build_object('gano_premio', true, 'producto', producto_premio, 'estrellas', 0);
  end if;

  return json_build_object('gano_premio', false, 'estrellas', v_estrellas);
end;
$$ language plpgsql security definer;
