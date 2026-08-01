# Varo's — App web (PWA) con Club Varo's

App de Varo's: menú, pedidos y el sistema de fidelización **Club Varo's** (puntos, niveles, recompensas, panel admin), construida como **PWA** (se instala en el celular desde el navegador, sin pasar por App Store ni Google Play).

## 1. Qué incluye

- `src/pages/Menu.jsx` — menú del restaurante y carrito
- `src/pages/Cart.jsx` — confirmar pedido → suma puntos automáticamente
- `src/pages/Club.jsx` — Club Varo's: tarjeta de socio, QR, nivel, canje de recompensas
- `src/pages/Admin.jsx` — panel administrativo (ranking, recompensas, inactivos, exportar CSV)
- `src/pages/Profile.jsx` / `Login.jsx` — perfil y acceso sin contraseña (enlace mágico por email)
- `supabase/schema.sql` — toda la base de datos: clientes, niveles, puntos, canjes, pedidos, promociones

## 2. Crear tu backend gratis en Supabase (15 minutos)

Supabase te da una base de datos real + login de usuarios, sin necesidad de programar un servidor.

1. Ve a **supabase.com** → crea una cuenta gratis → "New project".
2. Cuando el proyecto esté listo, ve a **SQL Editor** (menú lateral).
3. Abre el archivo `supabase/schema.sql` de esta carpeta, copia todo su contenido y pégalo en el SQL Editor. Presiona **Run**.
   - Esto crea automáticamente: clientes, niveles (Bronce/Plata/Oro/Diamante), reglas de puntos, catálogo de recompensas (con los valores que definiste: 300/500/800/1.500/2.500/5.000 pts), menú, pedidos, historial de puntos, canjes, insignias y promociones.
4. Ve a **Project Settings → API**. Copia:
   - **Project URL**
   - **anon public key**
5. En esta carpeta, duplica el archivo `.env.example`, renómbralo a `.env`, y pega ahí esos dos valores.

## 3. Activar el login por email

1. En Supabase, ve a **Authentication → Providers** y confirma que **Email** esté activo (viene activo por defecto).
2. En **Authentication → URL Configuration**, agrega la URL donde publiques tu app (ej. `https://club.varos.cl`) en "Redirect URLs".
3. Cuando un cliente entra por primera vez con su email, Supabase crea su usuario — pero además necesitas crear su fila en la tabla `customers` (nombre, etc). Lo más simple: crea un **Trigger** en Supabase que, cada vez que se registra un usuario nuevo, inserte automáticamente una fila en `customers`. Te dejo el SQL listo, pégalo también en el SQL Editor:

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.customers (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 4. Crear tu usuario administrador

El final de `supabase/schema.sql` ya incluye la tabla `admins`, las reglas de seguridad para que el administrador vea y edite todo (clientes, pedidos, menú, recompensas, promociones), y el trigger que crea automáticamente la ficha de cada cliente nuevo.

Para convertirte en administrador, solo falta agregarte a la tabla `admins`:

```sql
-- reemplaza TU-USER-ID por tu ID (lo encuentras en Authentication → Users)
insert into public.admins (user_id) values ('TU-USER-ID')
on conflict do nothing;
```

Una vez ejecutado eso, al volver a entrar a la app te va a aparecer un tab nuevo **"Admin"** en el menú inferior. Desde ahí puedes:
- **Agregar, editar precio, ocultar o eliminar platos del menú** — sin tocar Supabase
- **Crear y activar/desactivar promociones**
- Ajustar la regla de puntos y el costo de las recompensas
- Ver el ranking de clientes, clientes inactivos y el historial de canjes
- Exportar estadísticas en CSV

## 5. Correr la app en tu computador

Necesitas tener **Node.js** instalado (nodejs.org, versión 18 o más reciente).

```bash
npm install
npm run dev
```

Abre el link que aparece en la terminal (normalmente `http://localhost:5173`).

## 6. Publicar la app (para que funcione como PWA real)

La forma más simple y gratuita es **Vercel** o **Netlify**:

1. Sube esta carpeta a un repositorio de GitHub.
2. Entra a vercel.com (o netlify.com), conecta tu cuenta de GitHub, elige el repo.
3. En "Environment Variables" agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (los mismos del paso 2).
4. Deploy. Te dará una URL pública — ábrela desde el celular y el navegador ofrecerá "Agregar a pantalla de inicio": ahí la app queda instalada como una app normal, con ícono propio.

## 7. Cargar el menú real de Varo's

Ve a la tabla `menu_items` en Supabase (Table Editor) y agrega tus platos reales (nombre, descripción, precio, categoría). La app los muestra automáticamente — mientras tanto usa platos de ejemplo para que puedas probar el flujo completo.

## 8. Iconos de la app

Agrega tus propios `icon-192.png` y `icon-512.png` dentro de `public/icons/` (con el logo de Varo's) para que la app se vea con tu marca al instalarse en el celular.

## 9. Notificaciones automáticas (cumpleaños, inactividad, promociones)

El diseño ya contempla estos casos (tablas `promotions`, campo `birthday`, `last_visit_at`). Para que se envíen de verdad como notificaciones push, el siguiente paso es conectar un servicio como **OneSignal** o **Supabase Edge Functions + un cron diario** que revise:
- Cumpleaños de hoy → enviar mensaje.
- `last_visit_at` > 30 días → enviar promo de reactivación.
- Cliente a menos de X puntos de una recompensa → enviar aviso.

Puedo ayudarte a construir esa función cuando quieras avanzar a ese paso.

## 10. Check-in por QR del local (nuevo)

Ahora existe una segunda forma de sumar puntos: además del QR personal de cada cliente (que muestra el garzón para cobrar), Varo's puede tener **un único QR fijo** pegado en las mesas o en la entrada. Cuando un cliente lo escanea con la cámara de su celular:

1. Entra con su email (o inicia sesión si ya es socio)
2. Su visita queda registrada automáticamente — suma +1 a su contador de visitas y +20 puntos de bono

**Para activarlo en tu base de datos**, ejecuta esto en el SQL Editor de Supabase (ya viene incluido al final de `supabase/schema.sql` si estás partiendo desde cero):

```sql
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
```

**Para imprimir el QR**, ve al Panel Admin dentro de la app → sección "QR de bienvenida del local". Ahí puedes ver el código y editar la URL — una vez que publiques la app (paso 6), reemplaza la URL de ejemplo por tu dominio real (ej. `https://club.varos.cl/checkin`) antes de imprimirlo definitivamente.

$1.000 CLP = 10 puntos · 300 pts = Bebida gratis · 500 pts = Postre · 800 pts = Entrada · 1.500 pts = 20% descuento · 2.500 pts = Menú gratuito · 5.000 pts = Cena para dos.
Niveles: 🥉 Bronce (0 pts) · 🥈 Plata (800 pts) · 🥇 Oro (1.800 pts) · 💎 Diamante (3.500 pts). Todo editable desde Supabase o el Panel Admin.
