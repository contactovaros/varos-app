-- =========================================================
-- RENOMBRAR SUB-ZONAS DEL COMEDOR EXTERIOR
-- "Comedor principal" ahora es el nombre del salón nuevo, así que las dos
-- sub-zonas de siempre pasan a llamarse "Exterior principal" / "Exterior lateral"
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

update public.mesas set zona = 'Exterior principal' where zona = 'Comedor principal';
update public.mesas set zona = 'Exterior lateral' where zona = 'Comedor lateral';
