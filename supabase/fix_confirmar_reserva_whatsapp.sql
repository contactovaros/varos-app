-- =========================================================
-- CONFIRMAR RESERVA DESDE ADMIN — YA NO ENVÍA CORREO
-- Reemplaza la versión anterior de admin_confirmar_reserva (que mandaba un
-- correo por Resend) por una que solo actualiza el estado. El aviso al
-- cliente ahora lo manda el propio administrador por WhatsApp, con el botón
-- "Confirmar por WhatsApp" del panel (abre wa.me con el mensaje ya escrito).
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create or replace function public.admin_confirmar_reserva(p_reserva_id uuid)
returns void as $$
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  update public.reservas set estado = 'confirmada' where id = p_reserva_id;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_confirmar_reserva(uuid) to authenticated;
