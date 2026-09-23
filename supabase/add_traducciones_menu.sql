-- Traducciones automáticas de la carta pública (/carta2).
--
-- `traducciones` guarda, por plato, el nombre y la descripción en en/pt/it/zh
-- más `fuente` (huella del nombre+descripción en español con que se tradujo,
-- para saber si el plato cambió y hay que volver a traducirlo). Para el Menú
-- del Día además `platos`: traducción de cada plato de su descripción diaria.
-- Aditiva: sin la columna la carta cae al archivo estático y al español.
-- Reversible: alter table public.menu_items drop column traducciones;
--
-- RLS: no cambia. El select público y el update de admins ya cubren columnas
-- nuevas; la función de Netlify escribe con la service role.

alter table public.menu_items
  add column if not exists traducciones jsonb;
