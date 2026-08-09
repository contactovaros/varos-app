-- Alertas por cercanía: mensajes distintos según en qué coordenada esté el
-- cliente (ej. dos puntos de publicidad en la calle + el local), con día y
-- horario en que cada alerta debe estar activa.
-- IMPORTANTE: esto NO es una notificación push del teléfono (eso requiere una
-- app nativa). Es un aviso que aparece DENTRO de la app cuando el cliente la
-- tiene abierta y su GPS lo ubica cerca de una de las coordenadas.
-- Pega esto en Supabase → SQL Editor → Run.

create table if not exists public.location_alerts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensaje text not null,
  lat double precision not null,
  lng double precision not null,
  radio_metros int not null default 150,
  dias_semana int[], -- 0=domingo … 6=sábado. NULL o vacío = todos los días
  hora_inicio time,  -- NULL = sin límite de hora de inicio
  hora_fin time,     -- NULL = sin límite de hora de fin
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.location_alerts enable row level security;

create policy "clientes ven alertas activas" on public.location_alerts
  for select using (activo = true);

create policy "admins administran alertas" on public.location_alerts for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Las 3 coordenadas que diste, ya cargadas — edita el título y el mensaje
-- de cada una desde el panel admin cuando quieras.
insert into public.location_alerts (titulo, mensaje, lat, lng, radio_metros) values
  ('Publicidad zona 1', 'Escribe aquí el mensaje que verán los clientes cerca de este punto.', -18.489485, -70.285883, 150),
  ('Publicidad zona 2', 'Escribe aquí el mensaje que verán los clientes cerca de este punto.', -18.492925, -70.278385, 150),
  ('¡Estás cerca de Varo''s!', '¡Ven a visitarnos! Te esperamos con toda la buena onda 🍽️', -18.500399, -70.254830, 200);
