-- =========================================================
-- ARREGLA EL BUG QUE ROMPÍA TODAS LAS RESERVAS ("No pudimos registrar
-- tu reserva"): el insert encadenaba .select() para leer el código de
-- vuelta, pero el cliente anónimo no tiene permiso de SELECT sobre
-- `reservas` — eso hacía fallar el insert completo con RLS 42501.
--
-- Arreglo: el código ahora se pide ANTES del insert vía esta función
-- (RPC), y se manda explícito en la fila — ya no hace falta leer nada
-- de vuelta. Por eso también se saca la restricción unique: una reserva
-- combinada inserta 2 filas que ahora comparten el mismo código.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

alter table public.reservas drop constraint if exists reservas_codigo_unique;

create or replace function public.siguiente_codigo_reserva()
returns text as $$
  select 'VRS-' || nextval('public.reservas_codigo_seq')::text;
$$ language sql security definer;

-- El formulario de reservas es público (sin login), así que el rol anon
-- necesita permiso explícito para ejecutar esta función.
grant execute on function public.siguiente_codigo_reserva() to anon, authenticated;
