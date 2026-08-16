-- =========================================================
-- RESERVAS V2 — filtros por personas/zona + recordatorio automático
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- Cuántas personas pide la reserva (para filtrar mesas compatibles)
alter table public.reservas add column if not exists personas int not null default 2;

-- Marca si ya se envió el recordatorio de reconfirmación
alter table public.reservas add column if not exists recordatorio_enviado boolean not null default false;

-- Zona real del comedor de Varo's (no genérica) — se usa para el filtro de zona
alter table public.mesas add column if not exists zona text not null default 'Comedor principal';
update public.mesas set zona = 'Comedor lateral' where x < 324;
update public.mesas set zona = 'Comedor principal' where x >= 324;

-- =========================================================
-- RECORDATORIO AUTOMÁTICO — 3 horas antes de la reserva, por correo,
-- reutilizando la misma cuenta de Resend ya configurada.
-- =========================================================
create extension if not exists pg_cron;

create or replace function public.enviar_recordatorios_reserva()
returns void as $$
declare
  v_api_key text;
  r record;
begin
  select decrypted_secret into v_api_key
    from vault.decrypted_secrets where name = 'resend_api_key';
  if v_api_key is null then
    return;
  end if;

  for r in
    select * from public.reservas
    where estado <> 'cancelada'
      and recordatorio_enviado = false
      and (fecha + hora) between now() and now() + interval '3 hours'
  loop
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Varo''s <onboarding@resend.dev>',
        'to', array['contacto@varos.cl'],
        'subject', 'Recordatorio — reserva de ' || r.nombre || ' hoy a las ' || to_char(r.hora, 'HH24:MI'),
        'html',
          '<h2>Recordatorio de reserva</h2>' ||
          '<p><b>Mesa:</b> ' || r.mesa_label || '</p>' ||
          '<p><b>Nombre:</b> ' || r.nombre || '</p>' ||
          '<p><b>Teléfono:</b> ' || r.telefono || '</p>' ||
          '<p><b>Personas:</b> ' || r.personas || '</p>' ||
          '<p><b>Hora:</b> ' || to_char(r.hora, 'HH24:MI') || '</p>' ||
          '<p>Contacta al cliente para reconfirmar.</p>'
      )
    );

    update public.reservas set recordatorio_enviado = true where id = r.id;
  end loop;
end;
$$ language plpgsql security definer;

select cron.schedule(
  'recordatorios-reserva-cada-10-min',
  '*/10 * * * *',
  $$select public.enviar_recordatorios_reserva()$$
);
