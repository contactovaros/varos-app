-- =========================================================
-- CLUB VARO'S — ESQUEMA COMPLETO PARA SUPABASE (PostgreSQL)
-- Pega este archivo en Supabase → SQL Editor → Run
-- =========================================================

-- 1) PERFILES DE CLIENTE (extiende auth.users de Supabase Auth)
create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  member_number text unique not null default ('VR-' || lpad(floor(random()*99999)::text, 5, '0')),
  birthday date,
  avatar_url text,
  points int not null default 0,
  lifetime_points int not null default 0,
  tier text not null default 'Bronce', -- Bronce | Plata | Oro | Diamante
  streak_weeks int not null default 0,
  last_visit_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2) NIVELES (umbrales y beneficios, editable desde el panel admin)
create table if not exists public.tiers (
  name text primary key,
  min_points int not null,
  sort_order int not null,
  perks text[] not null default '{}',
  points_multiplier numeric not null default 1.0
);

insert into public.tiers (name, min_points, sort_order, perks, points_multiplier) values
  ('Bronce', 0, 1, array['Bienvenida con postre de cortesía'], 1.0),
  ('Plata', 800, 2, array['Reserva prioritaria', '1.2x puntos'], 1.2),
  ('Oro', 1800, 3, array['Copa de cortesía en cada visita', 'Reserva prioritaria sin espera', '1.5x puntos en semana'], 1.5),
  ('Diamante', 3500, 4, array['Mesa VIP', 'Regalo de cumpleaños premium', '2x puntos'], 2.0)
on conflict (name) do nothing;

-- 3) REGLA DE CONVERSIÓN DE PUNTOS (configurable, una sola fila)
create table if not exists public.points_rules (
  id int primary key default 1,
  clp_per_point int not null default 100 -- cada 100 CLP = 1 punto (equivale a $1.000 = 10 pts)
);
insert into public.points_rules (id, clp_per_point) values (1, 100) on conflict (id) do nothing;

-- 4) CATÁLOGO DE RECOMPENSAS (editable desde el panel admin)
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '🎁',
  cost_points int not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.rewards (name, icon, cost_points) values
  ('Bebida gratis', '🥤', 300),
  ('Postre', '🍰', 500),
  ('Entrada', '🥗', 800),
  ('20% de descuento', '🏷️', 1500),
  ('Menú gratuito', '🍽️', 2500),
  ('Cena para dos personas', '🥂', 5000)
on conflict do nothing;

-- 5) MENÚ DEL RESTAURANTE
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_clp int not null,
  category text not null default 'Platos principales',
  image_url text,
  available boolean not null default true
);

-- 6) PEDIDOS
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  status text not null default 'pendiente', -- pendiente | preparando | listo | entregado | cancelado
  total_clp int not null default 0,
  points_earned int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  quantity int not null default 1,
  unit_price_clp int not null
);

-- 7) HISTORIAL DE PUNTOS (auditoría: cada suma o resta queda registrada)
create table if not exists public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  points int not null, -- positivo = ganados, negativo = canjeados
  reason text not null, -- 'compra' | 'canje' | 'bono' | 'ajuste_admin'
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);

-- 8) CANJES DE RECOMPENSAS
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  reward_id uuid references public.rewards(id),
  points_spent int not null,
  status text not null default 'pendiente', -- pendiente | canjeado | expirado
  qr_code text not null default (gen_random_uuid()::text),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

-- 9) INSIGNIAS Y GAMIFICACIÓN
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '🏅',
  description text
);

create table if not exists public.customer_badges (
  customer_id uuid references public.customers(id) on delete cascade,
  badge_id uuid references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (customer_id, badge_id)
);

insert into public.badges (name, icon, description) values
  ('Primera visita', '🏅', 'Realizó su primera compra en Varo''s'),
  ('Racha x3', '🔥', '3 semanas seguidas visitando el restaurante'),
  ('Explorador del menú', '🍽️', 'Probó 5 platos distintos'),
  ('Diamante', '💎', 'Alcanzó el nivel Diamante')
on conflict do nothing;

-- 10) PROMOCIONES (para notificaciones automáticas)
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz
);

-- =========================================================
-- FUNCIONES: acumular puntos y actualizar nivel automáticamente
-- =========================================================
create or replace function public.add_points(p_customer_id uuid, p_points int, p_reason text, p_order_id uuid default null)
returns void as $$
declare
  v_new_total int;
  v_new_tier text;
begin
  update public.customers
    set points = points + p_points,
        lifetime_points = case when p_points > 0 then lifetime_points + p_points else lifetime_points end,
        last_visit_at = case when p_reason = 'compra' then now() else last_visit_at end
    where id = p_customer_id
    returning points into v_new_total;

  insert into public.points_transactions (customer_id, points, reason, order_id)
    values (p_customer_id, p_points, p_reason, p_order_id);

  select name into v_new_tier from public.tiers
    where min_points <= v_new_total
    order by min_points desc limit 1;

  update public.customers set tier = v_new_tier where id = p_customer_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- ROW LEVEL SECURITY: cada cliente ve solo sus propios datos
-- =========================================================
alter table public.customers enable row level security;
alter table public.points_transactions enable row level security;
alter table public.redemptions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_badges enable row level security;

create policy "cliente ve su propio perfil" on public.customers
  for select using (auth.uid() = id);
create policy "cliente edita su propio perfil" on public.customers
  for update using (auth.uid() = id);

create policy "cliente ve sus puntos" on public.points_transactions
  for select using (auth.uid() = customer_id);

create policy "cliente ve sus canjes" on public.redemptions
  for select using (auth.uid() = customer_id);
create policy "cliente crea sus canjes" on public.redemptions
  for insert with check (auth.uid() = customer_id);

create policy "cliente ve sus pedidos" on public.orders
  for select using (auth.uid() = customer_id);
create policy "cliente crea sus pedidos" on public.orders
  for insert with check (auth.uid() = customer_id);

create policy "cliente ve items de sus pedidos" on public.order_items
  for select using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create policy "cliente ve sus insignias" on public.customer_badges
  for select using (auth.uid() = customer_id);

-- Nota: para el PANEL ADMIN (ver todos los clientes, editar recompensas, etc.),
-- crea un rol "admin" en Supabase (tabla admins con user_id) y agrega políticas
-- adicionales que permitan "for all using (auth.uid() in (select user_id from admins))".
-- El README incluye el detalle paso a paso.

-- =========================================================
-- ADMINISTRADORES — control total sobre clientes, pedidos,
-- menú, recompensas y promociones desde el Panel Admin
-- =========================================================
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Cualquier persona autenticada puede consultar SI es admin (para mostrar/ocultar el tab),
-- pero solo puede ver su propia fila, nunca la lista completa de administradores.
alter table public.admins enable row level security;
create policy "cada quien ve si es admin" on public.admins
  for select using (auth.uid() = user_id);

-- Los admins pueden ver y editar TODO en las tablas del club
create policy "admins ven todos los clientes" on public.customers
  for select using (auth.uid() in (select user_id from public.admins));
create policy "admins editan clientes" on public.customers
  for update using (auth.uid() in (select user_id from public.admins));

create policy "admins ven todos los canjes" on public.redemptions
  for select using (auth.uid() in (select user_id from public.admins));
create policy "admins ven todos los pedidos" on public.orders
  for select using (auth.uid() in (select user_id from public.admins));
create policy "admins ven historial de puntos" on public.points_transactions
  for select using (auth.uid() in (select user_id from public.admins));

-- Menú, recompensas, reglas de puntos y promociones: todos los clientes
-- pueden LEER (para ver el menú y el catálogo), solo los admins pueden EDITAR.
alter table public.menu_items enable row level security;
create policy "todos ven el menu" on public.menu_items for select using (true);
create policy "admins editan el menu" on public.menu_items for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

alter table public.rewards enable row level security;
create policy "todos ven las recompensas" on public.rewards for select using (true);
create policy "admins editan recompensas" on public.rewards for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

alter table public.points_rules enable row level security;
create policy "todos ven la regla de puntos" on public.points_rules for select using (true);
create policy "admins editan la regla de puntos" on public.points_rules for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

alter table public.promotions enable row level security;
create policy "todos ven promociones activas" on public.promotions for select using (true);
create policy "admins editan promociones" on public.promotions for all
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- Trigger: crea automáticamente la ficha de socio (customers) cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.customers (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- CHECK-IN POR QR DEL LOCAL — el cliente escanea el QR fijo
-- de Varo's, entra con su email, y su visita queda registrada
-- automáticamente (contador de visitas + bono de puntos).
-- =========================================================
alter table public.customers add column if not exists visit_count int not null default 0;

create or replace function public.register_visit(p_customer_id uuid)
returns void as $$
begin
  if auth.uid() <> p_customer_id then
    raise exception 'No autorizado';
  end if;

  update public.customers
    set visit_count = visit_count + 1,
        last_visit_at = now()
    where id = p_customer_id;

  perform public.add_points(p_customer_id, 20, 'visita');
end;
$$ language plpgsql security definer;
