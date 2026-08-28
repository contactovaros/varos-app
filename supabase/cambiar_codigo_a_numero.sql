-- =========================================================
-- El código de reserva deja de ser "VRS-1030" y pasa a ser solo el
-- número ("1030"). En la app se muestra como "Reserva N° 1030" — el
-- texto "Reserva N°" es de la interfaz, en la base se guarda el número
-- pelado.
--
-- Pegá este archivo en Supabase → SQL Editor → Run.
-- =========================================================

-- 1) Sacar el prefijo VRS- de las reservas que ya existen.
update public.reservas
set codigo = replace(codigo, 'VRS-', '')
where codigo like 'VRS-%';

-- 2) El valor por defecto de la columna (para inserts que no pasen por la RPC).
alter table public.reservas
  alter column codigo set default nextval('public.reservas_codigo_seq')::text;

-- 3) La RPC que el formulario público llama ANTES del insert
--    (ver fix_codigo_reserva_rls.sql para por qué se pide el código antes).
create or replace function public.siguiente_codigo_reserva()
returns text as $$
  select nextval('public.reservas_codigo_seq')::text;
$$ language sql security definer;

grant execute on function public.siguiente_codigo_reserva() to anon, authenticated;
