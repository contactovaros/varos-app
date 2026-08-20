-- register_visit — el check-in por QR del cliente. ES EL MOTOR DEL CLUB.
--
-- Esta es la versión que está VIVA en producción, rescatada de la base el
-- 2026-08-19 (`select prosrc from pg_proc where proname = 'register_visit'`).
-- Estaba solo en la base y no en el repo: `schema.sql` guardaba una versión
-- vieja que devolvía void, no tocaba las estrellas y repartía puntos. Volver a
-- correr aquel archivo habría reemplazado esta función sin avisar y el QR
-- habría dejado de dar estrellas en silencio. Ese es el motivo de este archivo.
--
-- Diferencias con la versión vieja de schema.sql:
--   · suma estrellas_actuales, no solo visit_count
--   · al llegar a 5: entrega el premio, reinicia a 0 y suma un ciclo
--   · candado de una vez por día (ya_registrado_hoy)
--   · devuelve json en vez de void — CheckIn.jsx lee estrellas y gano_premio
--   · ya NO reparte puntos: el programa de puntos quedó sin uso frente al de
--     estrellas (ver add_admin_add_star.sql, que aplica la misma lógica desde
--     el panel admin, sin el candado diario)
--
-- Pegar en Supabase → SQL Editor → Run solo si hiciera falta restaurarla.

create or replace function public.register_visit(p_customer_id uuid)
returns json as $$
declare
  v_estrellas int;
  v_last_visit timestamp;
  producto_premio text;
  v_premio_id uuid;
begin
  if auth.uid() <> p_customer_id then
    raise exception 'No autorizado';
  end if;

  select last_visit_at into v_last_visit from public.customers where id = p_customer_id;

  if v_last_visit is not null and v_last_visit::date = now()::date then
    return json_build_object('ya_registrado_hoy', true, 'gano_premio', false);
  end if;

  select producto into producto_premio from public.config_recompensa_estrellas where id = 1;

  update public.customers
    set visit_count = visit_count + 1,
        last_visit_at = now(),
        estrellas_actuales = estrellas_actuales + 1
    where id = p_customer_id
    returning estrellas_actuales into v_estrellas;

  if v_estrellas >= 5 then
    update public.customers
      set estrellas_actuales = 0,
          ciclos_completados = ciclos_completados + 1
      where id = p_customer_id;

    insert into public.premios_ganados (customer_id, producto)
    values (p_customer_id, producto_premio)
    returning id into v_premio_id;

    return json_build_object('gano_premio', true, 'producto', producto_premio, 'premio_id', v_premio_id, 'estrellas', 0);
  end if;

  return json_build_object('gano_premio', false, 'estrellas', v_estrellas);
end;
$$ language plpgsql security definer;
