-- =========================================================
-- ORIGEN DE LA RESERVA — de dónde entró cada reserva.
--
--   'cliente' → la hizo el propio cliente en la página pública /reservas
--   'admin'   → la cargó el equipo a mano desde /admin/reservas
--               (las que llegan por WhatsApp o por teléfono)
--
-- Pegá este archivo en Supabase → SQL Editor → Run.
-- =========================================================

alter table public.reservas
  add column if not exists origen text not null default 'cliente';

-- =========================================================
-- RLS — NO se agrega ninguna policy nueva. Las que ya existen
-- (definidas en add_reservas.sql) alcanzan para la carga manual:
--
--   * INSERT:  "cualquiera puede reservar"  → for insert with check (true)
--              Es totalmente permisiva, así que también cubre al admin
--              logueado creando la reserva a mano.
--   * UPDATE:  "admins actualizan reservas" → ya existe.
--   * SELECT:  "admins ven las reservas"    → ya existe.
--
-- El front NO encadena .select() sobre el insert de `reservas` (pide el
-- código con la RPC siguiente_codigo_reserva() ANTES y lo manda explícito),
-- así que no se toca el camino que ya rompió producción con el error
-- 42501 "new row violates row-level security policy".
--
-- El trigger on_reserva_created / notificar_reserva() (aviso por correo a
-- contacto@varos.cl) también se dispara con las reservas cargadas a mano.
-- Es el comportamiento esperado: el local igual quiere el registro.
-- =========================================================
