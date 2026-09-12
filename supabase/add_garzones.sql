-- =========================================================
-- CANDADO PARA /mozo — REGISTRO DE GARZONES CON CÓDIGO (reemplazo POS,
-- varos-pos/DECISIONES.md sección "Reemplazo de Comandas")
-- Pega este archivo en Supabase → SQL Editor → Run
--
-- Por qué: /mozo (varos-app/src/pages/Mozo.jsx) está en producción como
-- link completamente abierto — cualquiera que lo tenga entra y manda
-- pedidos reales a cocina, sin ninguna traba. La solución elegida NO es
-- login con Google (el garzón no tiene por qué tener cuenta): es un
-- registro de garzones en /admin donde cada uno recibe un código corto
-- de 6 dígitos, y ese código es lo único que hace falta para entrar a
-- /mozo (se guarda en el celular del garzón después de la primera vez).
--
-- OJO CON RLS ACÁ (a diferencia de menu_items, que sí tiene
-- "todos ven el menu" público): el `codigo` es efectivamente una
-- contraseña. Esta tabla NO tiene policy de select pública ni ninguna
-- policy legible por anon/cliente — si la tuviera, cualquiera podría
-- leer todos los códigos directo por la API REST de Supabase
-- (GET /rest/v1/garzones) sin pasar por ninguna función. Todo el acceso
-- de /mozo pasa por la RPC validar_codigo_garzon, que devuelve nombre+id
-- pero nunca el código de vuelta.
-- =========================================================

create table if not exists public.garzones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,   -- 6 dígitos, ej. '042917' — tipeable a mano
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.garzones enable row level security;

-- Sin policy de select pública a propósito: el código es una contraseña.
-- Solo el admin gestiona garzones directo desde /admin/garzones (panel
-- aparte, no forma parte de esta migración).
drop policy if exists "admins gestionan garzones" on public.garzones;
create policy "admins gestionan garzones" on public.garzones for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- =========================================================
-- RPC 1: crear_garzon — solo admin. Genera el código de 6 dígitos,
-- reintentando si choca con uno ya existente, y devuelve la fila
-- completa (el admin necesita ver el código para pasárselo al garzón).
-- =========================================================
create or replace function public.crear_garzon(p_nombre text)
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_garzon public.garzones;
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  loop
    v_codigo := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.garzones where codigo = v_codigo);
  end loop;

  insert into public.garzones (nombre, codigo, activo)
  values (p_nombre, v_codigo, true)
  returning * into v_garzon;

  return v_garzon;
end;
$$;

revoke all on function public.crear_garzon(text) from public;
grant execute on function public.crear_garzon(text) to authenticated;

-- =========================================================
-- RPC 2: validar_codigo_garzon — la única de las tres que NO requiere
-- admin: la llama /mozo sin ningún login, con lo que el garzón escribió
-- en su celular. Corre security definer así puede leer `garzones` pese
-- a que la tabla no tiene policy de select para anon. Comparación
-- exacta (=), nunca like/concatenación, y no devuelve el código de
-- vuelta bajo ninguna circunstancia (ni en el resultado ni en error).
-- =========================================================
create or replace function public.validar_codigo_garzon(p_codigo text)
returns table(id uuid, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select g.id, g.nombre
    from public.garzones g
    where g.codigo = p_codigo
      and g.activo = true;
end;
$$;

revoke all on function public.validar_codigo_garzon(text) from public;
grant execute on function public.validar_codigo_garzon(text) to anon, authenticated;

-- =========================================================
-- RPC 3: desactivar_garzon — solo admin. Para dar de baja/reactivar un
-- garzón (p.ej. si dejó de trabajar en el local) sin borrar el registro
-- ni el historial de código.
-- =========================================================
create or replace function public.desactivar_garzon(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() not in (select user_id from public.admins) then
    raise exception 'No autorizado';
  end if;

  update public.garzones set activo = p_activo where id = p_id;
end;
$$;

revoke all on function public.desactivar_garzon(uuid, boolean) from public;
grant execute on function public.desactivar_garzon(uuid, boolean) to authenticated;
