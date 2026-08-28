-- =========================================================
-- Interruptor de "reservas online publicadas / en pausa".
--
-- Mientras `publicado` sea false, la página pública /reservas muestra
-- una pantalla "muy pronto" + botón de WhatsApp en vez del formulario.
-- El admin lo prende desde /admin/reservas cuando el dueño da el OK.
--
-- Arranca en false a propósito: el link puede quedar visible en varos.cl
-- sin que nadie pueda reservar todavía.
--
-- Pegá este archivo en Supabase → SQL Editor → Run.
-- =========================================================

alter table public.configuracion_reservas
  add column if not exists publicado boolean not null default false;
