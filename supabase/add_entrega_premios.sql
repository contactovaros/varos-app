-- Entrega de los premios de 5 estrellas.
--
-- Contexto: `premios_ganados` ya existía en la base y ya la escriben los dos
-- RPC que suman estrellas (`register_visit` desde el QR del local y
-- `admin_add_star` desde el panel). Ya trae `canjeado` y `fecha_canjeado`:
-- el registro de entrega estaba pensado desde el principio.
--
-- Lo que faltaba: la tabla NO tenía migración en el repo (vivía solo en
-- Postgres, mismo caso que `register_visit`), nadie podía LEERLA desde la app,
-- y no había forma de marcar un premio como entregado.
--
-- Pegar en Supabase → SQL Editor → Run.

-- 1) Rescate de la definición, para que el repo deje de mentir sobre el esquema.
create table if not exists public.premios_ganados (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  producto text,
  fecha_ganado timestamp not null default now(),
  canjeado boolean not null default false,
  fecha_canjeado timestamp
);

-- 2) Permisos de lectura.
alter table public.premios_ganados enable row level security;

-- El socio ve sus propios premios: es lo que sostiene el ticket en su tarjeta.
-- Hasta ahora el aviso de "completaste tus 5 estrellas" solo existía en el
-- instante del escaneo y desaparecía para siempre al cerrar esa pantalla.
drop policy if exists "socio ve sus premios" on public.premios_ganados;
create policy "socio ve sus premios"
  on public.premios_ganados for select
  to authenticated
  using (auth.uid() = customer_id);

drop policy if exists "admins ven todos los premios" on public.premios_ganados;
create policy "admins ven todos los premios"
  on public.premios_ganados for select
  to authenticated
  using (auth.uid() in (select user_id from public.admins));

-- 3) Marcar la entrega.
--
-- Va por RPC y no por policy de update para que la fecha la ponga el servidor
-- y para que un premio no se pueda "desentregar" desde el cliente. Devuelve
-- false si ya estaba entregado, así el panel puede avisar en vez de fingir
-- que hizo algo — es el caso de alguien que muestra dos veces la captura de
-- su ticket.
create or replace function public.admin_entregar_premio(p_premio_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  update public.premios_ganados
    set canjeado = true,
        fecha_canjeado = now()
    where id = p_premio_id
      and canjeado = false;

  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

revoke all on function public.admin_entregar_premio(uuid) from public;
grant execute on function public.admin_entregar_premio(uuid) to authenticated;
