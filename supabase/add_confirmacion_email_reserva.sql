-- =========================================================
-- CORREO DE CONFIRMACIÓN AL CLIENTE AL RESERVAR MESA
-- Reutiliza la misma cuenta de Resend y el mismo secreto guardado en
-- Supabase Vault ("resend_api_key") que ya usa el recordatorio de reservas.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.reservas add column if not exists email text;

-- Función que arma y envía el correo. Se llama UNA sola vez desde el
-- frontend después de guardar la reserva (no con un trigger de INSERT,
-- porque una reserva combinada inserta 2 filas y mandaría el correo doble).
create or replace function public.confirmar_reserva_cliente(
  p_nombre text,
  p_email text,
  p_fecha date,
  p_hora time,
  p_personas int,
  p_mesa_label text
)
returns void as $$
declare
  v_api_key text;
begin
  if p_email is null or p_email = '' then
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
      'to', array[p_email],
      'subject', 'Tu mesa en Varo''s está reservada — ' || to_char(p_fecha, 'DD/MM/YYYY') || ' a las ' || to_char(p_hora, 'HH24:MI'),
      'html',
        '<h2>¡Tu mesa está reservada!</h2>' ||
        '<p>Hola ' || p_nombre || ', confirmamos tu reserva en Varo''s:</p>' ||
        '<p><b>Mesa:</b> ' || p_mesa_label || '</p>' ||
        '<p><b>Fecha:</b> ' || to_char(p_fecha, 'DD/MM/YYYY') || '</p>' ||
        '<p><b>Hora:</b> ' || to_char(p_hora, 'HH24:MI') || '</p>' ||
        '<p><b>Personas:</b> ' || p_personas || '</p>' ||
        '<p>Te esperamos. Si necesitas cambiar algo, escríbenos por WhatsApp.</p>'
    )
  );
end;
$$ language plpgsql security definer;

-- El formulario de reservas es público (sin login), así que el rol anon
-- necesita permiso explícito para ejecutar esta función.
grant execute on function public.confirmar_reserva_cliente(text, text, date, time, int, text) to anon, authenticated;
