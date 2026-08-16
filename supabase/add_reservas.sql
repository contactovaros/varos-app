-- =========================================================
-- RESERVAS DE MESA — pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  mesa_id text not null,
  mesa_label text not null,
  nombre text not null,
  telefono text not null,
  fecha date not null,
  hora time not null,
  estado text not null default 'pendiente', -- pendiente | confirmada | cancelada
  created_at timestamptz not null default now()
);

-- Evita que dos personas reserven la misma mesa en la misma fecha/hora
create unique index if not exists reservas_mesa_fecha_hora_activa
  on public.reservas (mesa_id, fecha, hora)
  where estado <> 'cancelada';

alter table public.reservas enable row level security;

-- Cualquier visitante del sitio (sin login) puede crear una reserva
create policy "cualquiera puede reservar" on public.reservas
  for insert with check (true);

-- Solo el administrador puede ver / gestionar el listado de reservas
create policy "admins ven las reservas" on public.reservas
  for select using (auth.uid() in (select user_id from public.admins));
create policy "admins actualizan reservas" on public.reservas
  for update using (auth.uid() in (select user_id from public.admins));

-- =========================================================
-- AVISO POR CORREO AL ADMINISTRADOR — se envía automáticamente
-- cada vez que se crea una reserva, usando Resend (resend.com).
-- =========================================================
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- IMPORTANTE — ejecuta esta línea UNA sola vez, reemplazando el texto
-- por tu API key real (la sacas gratis en https://resend.com/api-keys):
-- select vault.create_secret('re_XXXXXXXXXXXXXXXX', 'resend_api_key');

create or replace function public.notificar_reserva()
returns trigger as $$
declare
  v_api_key text;
begin
  select decrypted_secret into v_api_key
    from vault.decrypted_secrets where name = 'resend_api_key';

  -- Si todavía no se configuró la API key, la reserva se guarda igual
  -- (el admin puede revisarlas en Supabase), solo no llega el correo.
  if v_api_key is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Reservas Varo''s <onboarding@resend.dev>',
      'to', array['contacto@varos.cl'],
      'subject', 'Nueva reserva — ' || new.nombre || ' (' || to_char(new.fecha, 'DD/MM/YYYY') || ' ' || to_char(new.hora, 'HH24:MI') || ')',
      'html',
        '<h2>Nueva reserva en Varo''s</h2>' ||
        '<p><b>Mesa:</b> ' || new.mesa_label || '</p>' ||
        '<p><b>Nombre:</b> ' || new.nombre || '</p>' ||
        '<p><b>Teléfono:</b> ' || new.telefono || '</p>' ||
        '<p><b>Fecha:</b> ' || to_char(new.fecha, 'DD/MM/YYYY') || '</p>' ||
        '<p><b>Hora:</b> ' || to_char(new.hora, 'HH24:MI') || '</p>'
    )
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_reserva_created on public.reservas;
create trigger on_reserva_created
  after insert on public.reservas
  for each row execute procedure public.notificar_reserva();
