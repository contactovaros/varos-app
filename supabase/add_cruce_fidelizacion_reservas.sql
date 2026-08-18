-- =========================================================
-- ACTIVA EL CRUCE RESERVA ↔ SOCIO DEL CLUB DE FIDELIZACIÓN
-- Los socios se autentican con Google (sin teléfono guardado en
-- public.customers), así que el cruce se hace por CORREO: el que la
-- persona escribió al reservar vs. el de su cuenta Google (auth.users,
-- normalmente invisible para el cliente — esta función se lo expone
-- SOLO a administradores, comparando en minúsculas y sin espacios).
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create or replace function public.admin_buscar_socio_por_correos(p_correos text[])
returns table(email text, customer_id uuid, full_name text, estrellas_actuales int, member_number text)
as $$
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  return query
    select u.email::text, c.id, c.full_name, c.estrellas_actuales, c.member_number
    from auth.users u
    join public.customers c on c.id = u.id
    where lower(trim(u.email)) in (
      select lower(trim(x)) from unnest(p_correos) as x
    );
end;
$$ language plpgsql security definer;

grant execute on function public.admin_buscar_socio_por_correos(text[]) to authenticated;
