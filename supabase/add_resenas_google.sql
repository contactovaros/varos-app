-- =========================================================
-- CONSULTOR DE RESEÑAS DE GOOGLE (/admin/resenas)
--
-- Problema que resuelve: las reseñas del Perfil de Empresa de Google viven
-- fuera de la app y no hay forma de mirarlas en conjunto. El admin las lee de
-- a una en el celular y no puede responder preguntas del tipo "qué es lo que
-- más reclaman" o "cambió algo desde que ajustamos el menú".
--
-- Cómo entran: el admin copia el texto tal cual desde el Perfil de Empresa,
-- lo pega en /admin/resenas, el front lo parsea y lo guarda acá. Después una
-- función serverless con IA lee este corpus y responde preguntas sobre él.
-- Es un depósito de trabajo, no una fuente pública: nada de esto se le muestra
-- al cliente, así que la tabla es enteramente de administración.
--
-- Pegar en Supabase → SQL Editor → Run.
-- =========================================================

create table if not exists public.resenas_google (
  id uuid primary key default gen_random_uuid(),
  autor text,
  rating smallint not null check (rating between 1 and 5),

  -- Google no publica la fecha exacta: muestra "hace 2 meses". Guardamos los
  -- dos valores. `fecha_texto` es la verdad literal de lo que se pegó (sirve
  -- para auditar el parseo y para que la IA cite sin inventar precisión).
  -- `fecha_aprox` es la estimación que calcula el importador, y queda null
  -- cuando el texto no alcanza para estimar nada.
  fecha_texto text,
  fecha_aprox date,

  -- Puede ser null: existen reseñas de solo estrellas, sin cuerpo. Son las
  -- que más pesan en el promedio y las que menos explican, así que se guardan
  -- igual en vez de descartarlas al importar.
  texto text,

  -- La respuesta del dueño, si Google la muestra en el pegado. Null cuando la
  -- reseña quedó sin responder — que es justamente una de las cosas que el
  -- consultor tiene que poder señalar.
  respuesta_local text,

  -- De dónde salió la fila. Hoy siempre 'pegado'; queda previsto 'places'
  -- para cuando se conecte la API de Google Places. A propósito SIN check
  -- constraint: agregar un origen nuevo no debería exigir una migración ni
  -- romper una importación a mitad de camino.
  origen text not null default 'pegado',

  -- Clave de deduplicación. El admin va a repegar el mismo bloque muchas
  -- veces (Google no deja exportar, se copia todo de nuevo cada vez), así que
  -- la reimportación tiene que ser idempotente. La huella la calcula el front
  -- (src/lib/resenas.js) con autor + rating + el arranque del cuerpo, todo
  -- normalizado. No entra ni la posición en el pegado (el orden cambia entre
  -- capturas) ni `fecha_texto`: "hace 2 meses" se convierte en "hace 3 meses"
  -- solo, y una huella con la fecha adentro haría entrar de nuevo la misma
  -- reseña en cada importación posterior.
  huella text not null unique,

  created_at timestamptz not null default now()
);

alter table public.resenas_google enable row level security;

-- ---------------------------------------------------------
-- Permisos: solo administradores, en las cuatro operaciones.
--
-- Misma convención que el resto del proyecto (location_alerts, salas, mesas,
-- zonas): una sola policy `for all` con la pertenencia a `admins` inline. No
-- hay función helper is_admin() en esta base y no se inventa una acá para no
-- dejar dos formas distintas de decir lo mismo.
--
-- `to authenticated` deja a anon afuera antes de evaluar nada. Un visitante
-- de /reservas no tiene por qué ni rozar esta tabla.
--
-- `drop policy if exists` primero porque `create policy` no soporta
-- `if not exists`: si la policy ya estuviera, tira 42710 y aborta el resto
-- del script sin crear los índices de abajo.
-- ---------------------------------------------------------
drop policy if exists "admins administran resenas de google" on public.resenas_google;
create policy "admins administran resenas de google"
  on public.resenas_google for all
  to authenticated
  using (auth.uid() in (select user_id from public.admins))
  with check (auth.uid() in (select user_id from public.admins));

-- ---------------------------------------------------------
-- Por qué esta policy alcanza para el upsert del front.
--
-- El importador hace:
--   .upsert(filas, { onConflict: 'huella', ignoreDuplicates: true })
-- que en Postgres es INSERT ... ON CONFLICT (huella) DO NOTHING.
--
-- En este proyecto ya nos mordieron tres veces los caminos de lectura
-- implícitos de RLS (el .select() encadenado a un insert en `reservas`, y el
-- upsert de `push_subscriptions`), así que queda escrito qué hace falta acá:
--
--   * INSERT   → se evalúa el with_check. Cubierto.
--   * ON CONFLICT DO NOTHING → no ejecuta update, pero cualquier variante que
--     el día de mañana pase a DO UPDATE (ignoreDuplicates: false) necesita
--     policy de UPDATE **y** de SELECT, porque para resolver el conflicto
--     Postgres tiene que leer la fila existente. Cubierto.
--   * .select() encadenado al upsert (para mostrar cuántas entraron) →
--     el RETURNING se evalúa contra la policy de SELECT. Cubierto.
--
-- El `for all` cubre las cuatro operaciones justamente para que ninguno de
-- esos caminos falle con 42501. Si en algún momento se parte en policies por
-- comando, hay que mantener SELECT sí o sí o el importador deja de funcionar
-- aunque el insert se vea perfecto.
--
-- La tercera trampa (clave única que pertenece a otro usuario) no aplica: las
-- reseñas no tienen dueño, todos los admins comparten el mismo corpus, así
-- que un conflicto de `huella` nunca cae sobre una fila ajena.
--
-- La función serverless que responde las preguntas con IA lee con la service
-- role key y bypassea RLS, igual que el resto de las funciones del proyecto.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- Índices.
--
-- El unique de `huella` ya crea su índice solo, y es el que usa el
-- ON CONFLICT del importador — sin él el upsert ni siquiera sería legal.
--
-- Los otros dos son para las consultas de tendencia del consultor: "cómo
-- venimos los últimos tres meses" ordena por fecha, "qué dicen las de 1 y 2
-- estrellas" filtra por rating. Con un corpus de unos cientos de filas
-- Postgres haría seq scan igual y no se notaría; se dejan porque el corpus
-- crece en cada pegado y porque cuestan nada en una tabla de este tamaño.
-- ---------------------------------------------------------
create index if not exists idx_resenas_google_fecha_aprox
  on public.resenas_google (fecha_aprox desc nulls last);

create index if not exists idx_resenas_google_rating
  on public.resenas_google (rating);
