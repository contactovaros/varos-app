-- =========================================================
-- DEVOLVER MESA R1 (COMEDOR EXTERIOR) A UNA POSICIÓN VISIBLE
-- Quedó arrastrada a y=-199 (fuera del plano por completo, invisible en
-- pantalla). No hay historial de posiciones guardado, así que esto no es
-- la posición exacta de antes — la deja dentro del Comedor Lateral (misma x
-- que ya tenía) para que se pueda ver y arrastrar a mano al lugar exacto.
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

update public.mesas set y = 220 where id = 'r1';
