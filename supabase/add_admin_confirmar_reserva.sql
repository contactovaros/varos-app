-- =========================================================
-- CONFIRMAR RESERVA DESDE ADMIN + CORREO AL CLIENTE
-- El admin confirma una reserva (desde /admin/reservas, /admin/mesa-trabajo
-- o el panel lateral de /admin/mesas) y el cliente recibe un correo avisando
-- que el restaurante confirmó su mesa. Reutiliza la misma cuenta de Resend
-- y el secreto ya guardado en Supabase Vault ("resend_api_key").
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create or replace function public.admin_confirmar_reserva(p_reserva_id uuid)
returns void as $$
declare
  r record;
  v_api_key text;
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  update public.reservas set estado = 'confirmada' where id = p_reserva_id;

  select * into r from public.reservas where id = p_reserva_id;

  if r.email is null or r.email = '' then
    return;
  end if;

  select decrypted_secret into v_api_key
    from vault.decrypted_secrets where name = 'resend_api_key';
  if v_api_key is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Varo''s <onboarding@resend.dev>',
      'to', array[r.email],
      'subject', 'Tu reserva en Varo''s fue confirmada — ' || to_char(r.fecha, 'DD/MM/YYYY') || ' a las ' || to_char(r.hora, 'HH24:MI'),
      'html',
        '<h2>¡Tu reserva fue confirmada!</h2>' ||
        '<p>Hola ' || r.nombre || ', el restaurante confirmó tu reserva en Varo''s:</p>' ||
        '<p><b>Mesa:</b> ' || r.mesa_label || '</p>' ||
        '<p><b>Fecha:</b> ' || to_char(r.fecha, 'DD/MM/YYYY') || '</p>' ||
        '<p><b>Hora:</b> ' || to_char(r.hora, 'HH24:MI') || '</p>' ||
        '<p><b>Personas:</b> ' || r.personas || '</p>' ||
        '<p><b>Código:</b> ' || coalesce(r.codigo, '') || '</p>' ||
        '<p>Te esperamos. Si necesitas cambiar algo, escríbenos por WhatsApp.</p>'
    )
  );
end;
$$ language plpgsql security definer;

-- Solo administradores logueados pueden llamar esta función (se valida
-- adentro con auth.uid()), pero el rol necesita el permiso de ejecución.
grant execute on function public.admin_confirmar_reserva(uuid) to authenticated;
