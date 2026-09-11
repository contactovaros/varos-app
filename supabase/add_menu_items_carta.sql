-- =========================================================
-- CARTA PÚBLICA + ORDEN MANUAL EN menu_items (reemplazo POS, módulo Productos)
-- Pega este archivo en Supabase → SQL Editor → Run
--
-- Por qué: el nuevo panel de gestión (varos-app/DECISIONES.md,
-- "Reusar menu_items para el primer módulo del reemplazo del POS (Productos)
-- · 2026-09-11") reusa public.menu_items como catálogo en vez de crear una
-- tabla `productos` nueva. Para eso necesita distinguir "aparece en la carta
-- pública de varos.cl" de `available` (que hoy significa disponibilidad de
-- cocina/venta, no visibilidad de carta), y necesita un orden manual dentro
-- de cada categoría en vez de depender del orden de inserción.
--
-- 100% aditivo: no toca filas existentes, no toca el CRUD viejo de /admin
-- que ya lee menu_items, no toca ninguna otra tabla ni policy de RLS.
-- =========================================================

alter table public.menu_items
  add column if not exists visible_carta boolean not null default false;

alter table public.menu_items
  add column if not exists orden integer;

-- Nota: las policies existentes de menu_items
--   "todos ven el menu"    for select using (true)
--   "admins editan el menu" for all using/with check (auth.uid() in admins)
-- son a nivel de FILA, no de columna: cubren visible_carta y orden sin
-- ningún cambio. No se necesita (ni se agrega) policy nueva.
