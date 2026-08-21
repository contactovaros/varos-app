-- =========================================================
-- PLANOS DE ARQUITECTURA EDITABLES
--
-- Guarda el layout del plano (posición, medida y giro de cada objeto) como un
-- JSON, con un interruptor de publicación: mientras `publicado` es false el
-- plano solo lo ve el admin; al publicarlo queda visible en /plano/<id> para
-- cualquiera, sin necesidad de iniciar sesión.
--
-- pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

create table if not exists public.planos (
  id text primary key,                       -- ej: 'terraza-centenario'
  nombre text not null,
  ancho numeric not null default 9,          -- metros
  largo numeric not null default 24,         -- metros
  datos jsonb not null default '[]'::jsonb,  -- array de objetos del plano
  publicado boolean not null default false,
  actualizado_en timestamptz not null default now()
);

alter table public.planos enable row level security;

-- Lectura: el público solo ve los planos publicados. Los admins ven todos,
-- publicados o no (por eso el `or` — sin esa rama, guardar un plano en
-- borrador y volver a leerlo desde el editor devolvería vacío).
drop policy if exists "planos publicados son publicos" on public.planos;
create policy "planos publicados son publicos" on public.planos
  for select using (
    publicado = true
    or auth.uid() in (select user_id from public.admins)
  );

-- Escritura: solo admins.
drop policy if exists "admins editan planos" on public.planos;
create policy "admins editan planos" on public.planos
  for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Fila inicial en borrador. El layout arranca vacío a propósito: la primera vez
-- que el admin entre a /admin/plano se le carga la distribución por defecto que
-- vive en el código (planoTerraza.js) y queda guardada al tocar "Guardar".
insert into public.planos (id, nombre, ancho, largo, datos, publicado)
values ('terraza-centenario', 'Terraza Parque Centenario', 9, 24, '[]'::jsonb, false)
on conflict (id) do nothing;

-- Marca de tiempo automática en cada guardado.
create or replace function public.tocar_plano()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

drop trigger if exists trg_tocar_plano on public.planos;
create trigger trg_tocar_plano before update on public.planos
  for each row execute function public.tocar_plano();
