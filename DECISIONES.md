# Decisiones de arquitectura — varos-app

Más nueva arriba.

---

## Carta e idioma en el flujo de reserva · 2026-08-29 · varos-app

**ESTADO: implementado (solo frontend) el 2026-08-29.** Carta = Opción 1: bloque fijo del Menú del Día escrito a mano + botón "Ver la carta" → `https://www.varos.cl/carta` (pestaña nueva), en los pasos `filtros` y `ok`. Sin réplica, sin tabla, sin función de Netlify, sin scraper. Idioma = Opción 2: `src/i18n/reservas.js` (objeto plano ES/EN + `traducir()` + hook `useIdioma()`), `src/components/SelectorIdioma.jsx` en la esquina superior izquierda de los tres estados del flujo, persistencia `localStorage` (`varos_idioma`) + `?lang=`. Todos los textos de cliente de `Reservas.jsx` pasan por `t(...)`. Los pasos 2, 3, 5 y 6 del plan quedan sin hacer; si algún día se quiere la carta dentro de la app, se retoma desde ahí.

**Contexto** — Pedido del usuario: (1) mostrar el menú del restaurante dentro de `/reservas`, tomándolo de `www.varos.cl/carta`, con opción de que el admin suba una foto donde falte y publique/oculte ítems, y que "cambie solo" cuando cambie la web; (2) un selector de idioma (ES/EN/PT/IT) arriba a la izquierda.

Terreno medido:
- `varos.cl/carta` es un sitio estático bajo `/carta/` que **genera el sistema de gestión PHP interno** (`/gestion/`). HTML renderizado en el servidor, **sin API JSON**. Se puede leer scrapeando: clases estables `.menu-item.filter-N` (categoría), `.menu-content a` (nombre), `.menu-content span` (precio), `.menu-ingredients` (descripción), `img.menu-img` (foto en `varos.cl/gestion/...`). ~150 ítems, 10 categorías. "Menú del Día" es un bloque aparte ($15.900, mar–dom).
- El navegador del cliente **no puede** pedir `varos.cl` (CORS) → cualquier sync pasa por una función de Netlify. Ya hay funciones programadas (`aviso-diario`, `export const config = { schedule }`), service key de Supabase y `ANTHROPIC_API_KEY` disponibles ahí, y aviso al admin por WhatsApp (`lib/whatsapp.mjs`).
- Tabla `menu_items` + CRUD en `/admin` ya existen, pero son del flujo de pedidos dormido (solo-admin). La carta pública es otra cosa.
- `/reservas` es pública, render propio, máquina de pasos `filtros | plano | ok`, ya tiene portón `publicado`. No hay i18n en ninguna parte de la app.
- `varos-negocio` marcó: el turista de Arica es peruano/boliviano (habla español); **no hay colonia italiana**; el admin confirma las reservas **a mano por WhatsApp**, así que ofrecer un idioma que el personal no sostiene en la conversación crea una expectativa falsa. Y el riesgo de replicar precios es asimétrico: precio viejo = problema en la mesa.

**Opciones — Carta**
1. **Solo enlace** — botón "Ver la carta" → `varos.cl/carta` en pestaña nueva + bloque de texto fijo del Menú del Día escrito a mano. Cero infra, siempre al día. Pierde: fotos propias, experiencia dentro de la app, y el "cambia solo" (los platos del día se linkean, no se muestran).
2. **Réplica SIN precios, auto-sync con degradado** (elegida) — función Netlify diaria (+ botón "actualizar ahora" en el admin) baja el HTML de `varos.cl/carta`, parsea, `upsert` en `carta_items` por `slug` (hash del nombre normalizado). Guarda nombre/categoría/descripción/foto_origen; el admin agrega `foto_admin`, `mostrar` y `traduccion_en`. El re-scrape **nunca pisa** los campos del admin. **Los precios NO se replican** — cada ítem linkea a `varos.cl/carta` para precio. Si el scrape trae 0 ítems o falla → conserva el snapshot anterior + WhatsApp al admin, nunca pantalla vacía. Menú del Día: estructura + precio fijos escritos a mano, los platos del día linkean.
3. **Réplica completa con precios y traducción automática de ítems** — lo que se pediría al pie de la letra. Suma el riesgo de precio viejo en mesa (el que `varos-negocio` marcó como el más caro) y traducir ~150 descripciones con Claude en cada cambio. Descartada.

**Opciones — Idioma**
1. **Nada** — el cliente usa el traductor del navegador.
2. **ES + EN, solo en `/reservas`** (elegida) — objeto plano de ~50 strings en `src/i18n/reservas.js`, sin librería. Selector arriba a la izquierda, persiste en `localStorage` + `?lang=`. El resto de la app (Club, admin) queda en español.
3. **ES/EN/PT/IT en toda la app** con `react-i18next`. Enorme, permanente, nadie lo pidió para Club/admin. PT/IT sin sustento de negocio. Descartada.

**Decisión** — Carta: **Opción 2**. Idioma: **Opción 2** (ES + EN).
La Opción 2 de carta se aparta de lo que aconsejó `varos-negocio` ("solo enlace") en un punto —el usuario quiere la carta dentro de la app— pero adopta su punto de seguridad central: **no se replica ningún precio**. Idioma sigue a `varos-negocio` al pie: EN es el único segundo idioma que el personal puede sostener por WhatsApp.

**Qué perdemos** — Una segunda copia de la carta (un caché). El parser depende del HTML que hoy emite `/gestion/`; si cambian ese template, el parser se rompe — mitigado con snapshot + alerta por WhatsApp, nunca pantalla vacía, pero es deuda de mantenimiento permanente a cambio de que el menú se actualice solo. El cliente que quería PT/IT no los tiene. Mantener las cadenas EN a mano cuando cambian textos del flujo. El cliente que navega en EN y después entra al Club lo ve en español.

**Plan**
1. **Confirmar los dos puntos pendientes con el usuario** (abajo). _Se verifica_: respuesta explícita.
2. Migración `supabase/add_carta.sql`: tabla `carta_items` (`slug` pk, `nombre`, `categoria`, `descripcion`, `foto_origen`, `foto_admin`, `traduccion_en` jsonb, `mostrar` bool, `visto_en_sync` timestamptz) + `carta_config` (singleton: `mostrar_fotos` bool, `ultima_sync`, `sync_ok` bool). RLS: `select` público, `all` para admins. _Se verifica_: `select` vacío no rompe `/reservas`. _Reversible_: `drop table`. **Paso manual del usuario en el SQL Editor.**
3. Función `netlify/functions/sync-carta.mjs`: `schedule` diario + invocable por el admin (con `adminAuth.mjs`). Baja el HTML, parsea con `node-html-parser` (dep nueva, chica), `upsert` por slug preservando `foto_admin`/`mostrar`/`traduccion_en`, marca `visto_en_sync`, traduce al EN con el helper Claude (`lib/claude.mjs`) solo los ítems nuevos o cambiados. Si falla o trae 0 → no toca la tabla, `sync_ok=false`, `enviarWhatsapp` al admin. _Se verifica_: `netlify functions:invoke sync-carta` en local, revisar filas y traducciones. _Reversible_: borrar el archivo + el `schedule`.
4. `src/i18n/reservas.js` + hook `useIdioma()` (localStorage + `?lang`), `<SelectorIdioma>` arriba a la izquierda en `Reservas.jsx`. Migrar las cadenas visibles del flujo a `t('clave')`. _Se verifica_: cambiar idioma cambia los textos de los 3 pasos; recargar mantiene el idioma. _Reversible_: quitar el selector, las claves caen al ES por default.
5. Carta en la app: sección colapsable por categoría dentro de `/reservas` (entrada desde el paso `filtros` y desde `ok`), `foto_admin ?? foto_origen` si `mostrar_fotos`, nombre + descripción en el idioma activo, "Ver precio en varos.cl" por ítem, bloque fijo del Menú del Día arriba. _Se verifica_: `npm run dev`, ver la carta pública sin login. _Reversible_: quitar la sección, el flujo queda como hoy.
6. Admin: sección "Carta" en `/admin` — lista de ítems sincronizados, por ítem subir foto / toggle `mostrar` / editar traducción EN; botón "Actualizar carta ahora"; aviso de última sync y si falló. _Se verifica_: subir una foto, recargar `/reservas`. _Reversible_: quitar la sección.
7. `npm run build` → commit → `git push origin main` (si devuelve 403 o se cuelga, pasarle el comando al usuario, ver el incidente del deploy en la memoria). Correr `add_carta.sql`. Configurar el `schedule`. _Se verifica_: buscar el texto nuevo dentro del bundle publicado (`curl ... | grep`), no por el nombre del archivo.

**Cómo se vuelve atrás** — Todo aditivo: tabla nueva, función nueva, archivo i18n nuevo, secciones nuevas. Quitar el botón "Ver la carta" y el `<SelectorIdioma>` de `Reservas.jsx` deja el flujo idéntico a hoy. La función programada se apaga borrando el `schedule`. No se toca `menu_items`, ni el flujo de reserva, ni nada de fidelización.

**Pendiente / a confirmar con el usuario**
- **¿Carta dentro de la app (Opción 2) o solo un enlace a varos.cl/carta (Opción 1)?** `varos-negocio` recomienda el enlace: el dueño no mantiene cosas al día a mano, y una réplica —aun sin precios— es una pieza más que se puede desincronizar o romper. La Opción 2 vale la pena solo si el usuario quiere de verdad la experiencia visual adentro del flujo. Si duda, arrancar con Opción 1 (una tarde de trabajo) y ver si hace falta más.
- **¿Traducir los nombres de los platos al inglés, o solo las descripciones y las categorías?** Recomendación: solo descripciones y categorías. "Causa Limeña", "Pisco Sour", "Ceviche" son términos que el turista ya reconoce y que traducidos quedan raros.
- Fotos de `varos.cl`: se **hotlinkean** (`<img src="https://www.varos.cl/gestion/...">`), no se copian a Supabase Storage. Más simple; si `varos.cl` cae, esa foto no carga pero la carta sigue. Cambiar solo si el usuario lo pide.
- Costo de traducción con Claude: ~150 ítems la primera vez, después solo los cambios. Estimado < US$1/mes. Usa la `ANTHROPIC_API_KEY` que ya está en Netlify.
- Adyacente, no parte de este pedido: `varos-negocio` recordó que los fines de semana el salón (`mesas_salon`) tiene matrimonios y que sigue sin confirmarse si el comedor abre al público esos días. Si se toca la lógica de disponibilidad por día, resolver eso primero.

---

## Tarjeta de fidelización como producto vendible · 2026-08-29 · varos-app → proyecto nuevo

**ESTADO: EN PAUSA / "en el tintero" hasta nuevo aviso del usuario (2026-08-29).** No se empezó nada de código. La conversación exploró alcance, opciones (piloto vs. SaaS self-service), y precio. El usuario decidió congelarlo. No retomar sin que lo pida explícitamente.

**Contexto** — Hoy la fidelización de Varo's está incrustada en varos-app: tabla `customers` (solo login con Google), RPC `register_visit` (suma estrella, premio a las 5, reinicia), `TarjetaFidelidad.jsx`, `CheckIn.jsx` (QR), y medio panel de admin. Números reales: 7 socios (varios del propio equipo), el camino del premio nunca se completó de punta a punta ni una vez, marcha blanca. Clientes externos confirmados: cero. Prospectos sin firmar: algunos. El taller no es un monorepo — no hay paquete compartido ni build común. Migraciones de Supabase se pegan a mano.

**Opciones**
1. **Mínima / piloto** — Sacar el módulo a un repo nuevo (su Supabase, su Netlify), marca de Varo's movida a config. Primer comercio real montado a mano. Sin cobro automático ni alta self-service. Decidir SaaS vs. kit después. — costo: trabajo manual por cliente; riesgo: bajo; reversible: sí.
2. **SaaS multi-tenant ya** — una base, `negocio_id` + RLS por comercio, subdominios, alta self-service, pasarela de pago, super-admin. — costo: alto y permanente; riesgo: alto (RLS mal = fuga de datos entre comercios; se construye para escala inexistente); reversible: no.
3. **Kit / plantilla por cliente** — repo plantilla + script de setup, cada comercio su Supabase + Netlify. — costo: N copias que divergen, cada fix se portea (deuda tipo KitchenLab); riesgo: medio; reversible: parcial.

**Decisión** — Opción 1. Con cero clientes confirmados, el SaaS es el error caro clásico del taller (ya pasó con "app nativa para 7 socios"). Extraer el módulo, conseguir un comercio que lo use en serio, y que ese dueño defina el producto antes de comprometer infra de cobro y multi-tenancy.

**Qué perdemos** — Con 3–4 clientes habrá 3–4 deploys que actualizar a mano y se va a querer la Opción 2. Migrar de instancias separadas a una base multi-tenant es trabajo real (unificar datos, `negocio_id`, RLS, migrar socios). Se acepta esa migración futura a cambio de no construir para clientes que quizás no aparezcan.

**Plan**
1. Inventario de qué es "fidelización" en varos-app y qué está atado a Varo's (marca, OAuth Google, proyecto Supabase). _Se verifica_: lista de archivos + tablas + RPCs, revisada con `varos-fidelizacion`.
2. Repo nuevo copiando solo esa tajada. _Se verifica_: `npm run build` limpio; tarjeta y check-in andan contra un Supabase de prueba.
3. Marca a config: tabla `config_negocio` (nombre, logo, colores, nombre del premio, visitas-para-premio) en vez de tokens hardcodeados. _Se verifica_: cambiar la fila cambia la tarjeta sin tocar código.
4. Identidad del socio: Google OAuth obliga a un proyecto Google Cloud por comercio — pasar a magic-link por email o código por teléfono. _Se decide_ con `varos-supabase`.
5. Alta manual del primer prospecto: Supabase project + Netlify site + fila de config, cada paso en un checklist escrito. _Se verifica_: el dueño hace un check-in real y llega al premio.
6. Con ese cliente usándolo: decisión nueva — SaaS (Opción 2) o kit (Opción 3).

**Cómo se vuelve atrás** — Repo nuevo, no toca varos-app. Si no prospera, se archiva la carpeta.

**Pendiente / a confirmar con el usuario**
- Nombre del producto/repo.
- ¿El primer piloto es pago o gratis a cambio de feedback?
- Identidad del socio: magic-link por email (gratis) vs. código por SMS/WhatsApp (cuesta por mensaje).
- ¿Mecánica configurable por comercio (X visitas = premio Y) o fija "5 visitas = premio"?
- ¿Cómo se cobra a los comercios — una vez, mensual?

---

## Fuente de reseñas: pedir acceso a la API antes de construir nada · 2026-08-26 · varos-app

**Contexto** — En `/admin/resenas` el corpus de `resenas_google` se llena pegando a mano lo que el dueño copia del Perfil de Empresa, porque Places API (la que ya usa la ficha pública) solo da 5 reseñas fijas. La tabla ya anticipa un origen `'places'` a futuro (comentario en `supabase/add_resenas_google.sql`). La API que trae el historial completo es **Google Business Profile API** (`mybusiness.googleapis.com/v4`, activa en 2026, `reviews.list`/`reviews.reply`). Investigado ahora: el acceso no es automático — hay que pedirlo por formulario, cada proyecto nuevo arranca con **cupo cero**, y el motivo de rechazo más común es justo el perfil de Varo's: negocios de **una sola sucursal gestionando su propia ficha** (no una agencia con clientes), con reportes de 70% de solicitudes con demoras de 3+ meses o rechazo directo. Además exige que quien pida el acceso sea el **dueño verificado** de la ficha, no un mánager — si se manda desde una cuenta de mánager, rebota.

**Opciones**
1. **No hacer nada / seguir pegando a mano** — costo: el dueño sigue copiando reseñas cada tanto (minutos, ya funciona); riesgo: bajo; reversible: N/A.
2. **Pedir el acceso primero, sin escribir código todavía** (elegida) — costo: solo el trámite (formulario) + esperar, sin apostar horas de desarrollo; riesgo: bajo, no se compromete nada; reversible: si Google rechaza, seguimos exactamente donde estamos hoy.
3. **Construir la integración OAuth ahora** (tabla de tokens, función de callback, sync programado) apostando a que se apruebe — costo: alto, y nada de eso se puede probar de punta a punta mientras el cupo siga en cero; riesgo: alto — con el patrón de rechazo a locales de una sola sucursal, buena chance de terminar manteniendo código muerto; descartada.

**Decisión** — Opción 2. El paso que sigue es un trámite, no una migración.

**Qué perdemos** — nada por ahora: el pegado manual sigue siendo la única fuente mientras se espera. Si Google aprueba, ahí se abre una decisión de arquitectura nueva (token storage, dedup por `review.name` en vez de la huella actual) — se toma en ese momento, con el cupo real confirmado, no antes.

**Plan**
1. Confirmar que la cuenta de Google que administra la ficha de Varo's tiene rol **Propietario**, no Mánager (se verifica entrando a business.google.com con esa cuenta).
2. Completar el formulario de acceso (support.google.com/business/workflow/16726127) desde esa cuenta, siendo explícito en que es autogestión de una ficha propia, no gestión de clientes — es el motivo de rechazo más frecuente. _Se verifica_: email de confirmación de Google.
3. Mientras se espera: no tocar código de producción, `/admin/resenas` sigue igual. _Se verifica_: nada cambia en la pantalla.
4. Si llega la aprobación: nueva sesión de arquitecto para diseñar la integración con el cupo ya confirmado.

**Cómo se vuelve atrás** — no hay nada que deshacer, no se escribió código de producción. Si Google rechaza, se sigue con el pegado manual indefinidamente — es la situación de hoy, ya funciona.

**Pendiente / a confirmar con el usuario**
- ¿El usuario es el dueño verificado de la ficha de Varo's en Google Business Profile, o solo mánager? Es el requisito duro del paso 1.
- ¿Está dispuesto a esperar entre días y varios meses sin garantía de aprobación? Si la urgencia es alta, la Opción 1 sigue siendo la más confiable.

---

## Recinto, zonas y materiales editables en los 3 comedores · 2026-08-26 · varos-app

**Contexto** — `/admin/mesas` ya permite mover/rotar/redimensionar cada **mesa** (`onPointerDownResize` en [AdminMesas.jsx](src/pages/AdminMesas.jsx:583)), pero todo lo demás de cada sala está fijo en código:
- El **recinto** (paredes, forma en L del Comedor Exterior, ancho/largo) son constantes (`COMEDOR_PATH`, `SALON_W/H`, `TERRAZA_W/H`) y paths SVG hardcodeados en `ComedorBackground`/`SalonBackground`/`TerrazaBackground`.
- Las **líneas de separación de zona** (las punteadas de Salón/Terraza) están escritas a mano en JSX. Comedor Exterior no tiene ninguna. La tabla `zonas` solo guarda texto (x, y, ángulo) — no geometría de línea.
- Los **colores** de piso (patrones `slDeck`/`slPulido`/`slPiedra`/`slPasto` en `planoSalas.jsx`), mesas y sillas (`MesaShape`, fills inline en `AdminMesas.jsx`) son hex fijos por componente.

Confirmado con el usuario: esto se aplica a las **3 salas que ya existen** (Comedor Exterior, Comedor Principal, Terraza) — crear una sala nueva desde la UI sigue siendo tarea de código, como hoy. Las líneas de zona son **solo visuales**, no limitan el arrastre de mesas.

**Opciones**
1. **No hacer nada** — seguir tocando código cada vez (como se hizo para agregar Terraza) — costo: una sesión de desarrollo por cada ajuste de tamaño/zona/color; riesgo: bajo; reversible: N/A.
2. **Generalizar las 3 salas a config editable en base** (elegida) — costo: mediano, ver plan; riesgo: medio (toca geometría que también usa `/reservas`, la reserva pública en vivo); reversible: sí, es aditivo.
3. **Motor único freeform** (fusionar con `/admin/plano`, comedores 100% auto-servicio) — costo: alto, re-arquitectura del sistema de reservas; riesgo: alto en producción real; descartada por escala (marcha blanca, 3 salas) y porque el usuario no la pidió.

**Decisión** — Opción 2. Tres ejes, todos guardados por sala:
- **Geometría**: `salas` gana `ancho`, `largo` (cm) y, solo para `comedor` (forma en L), `hueco_x0/y0/x1/y1`. El recinto y `limite`/`huecos` de `ROOMS` se calculan desde ahí en vez de las constantes.
- **Zonas-línea**: `zonas` gana `x2`, `y2` nullable — si están seteados, la fila se dibuja como línea punteada en vez de texto. Las líneas hoy hardcodeadas de Salón/Terraza se migran a filas reales.
- **Materiales**: `salas` gana `color_piso`, `color_mesa`, `color_silla`. Los 4 patrones de piso pasan a generarse por sala con ese color en vez de `defs` estáticos; `MesaShape` y el `<rect>` de silla en `AdminMesas.jsx` leen esos colores con el hex actual como default.

**Qué perdemos** — el recinto en L del Comedor Exterior deja de ser un path prolijo escrito a mano y pasa a un rectángulo + 1 hueco genérico (reusa el mismo modelo que ya usa `limitarASala`); un poco más de indirección a cambio de que sea editable. El panel de edición crece (3 secciones nuevas además de "Nombres de zona").

**Plan**
1. Migración `supabase/add_config_salas.sql`: columnas nuevas en `salas` y `zonas`, **con los valores actuales como default** (ej. `ancho=1314, largo=1700, hueco_x0=324...` para comedor) para que no cambie nada visualmente al correrla. _Se verifica_: `select * from salas` trae los 3 valores iguales a las constantes de hoy. _Reversible_: `alter table ... drop column`.
2. `AdminMesas.jsx`: reemplazar las constantes por lectura de `salas[room]` (ya se hace fetch de `salas`), recalculando `config.limite/huecos/viewBox` y el `d=` del `Recinto`. _Se verifica_: captura de pantalla antes/después de las 3 salas, deben verse igual. _Reversible_: volver a las constantes si algo se rompe.
3. Migrar las líneas hardcodeadas de Salón/Terraza a filas de `zonas` (insert con `x2/y2`); reemplazar el `<g><line.../></g>` fijo por un `.map()` sobre `zonas` filtrando por las que tienen `x2/y2`. _Se verifica_: Salón/Terraza se ven igual; Comedor Exterior sigue sin líneas hasta que se agregue una.
4. Panel de edición: 3 inputs de ancho/largo (y hueco si `room==='comedor'`) + botón "+ Línea de zona" (arrastra dos extremos, igual mecanismo que ya existe para mesas) + 3 color pickers (piso/mesa/silla), todo con el mismo patrón `onBlur` → `persist` que ya usa "Nombres de zona". _Se verifica_: cambiar cada control y ver el plano reaccionar en vivo.
5. Confirmar que `/reservas` (vista pública, mismos `Background`) sigue andando igual — usa las mismas columnas nuevas, con los mismos defaults no debería cambiar nada.

**Cómo se vuelve atrás** — todo es aditivo (columnas/filas nuevas). Si algo falla, se deja de leer la columna nueva y el componente vuelve a la constante hardcodeada; no hay pérdida de datos de reservas ni de mesas.

**Pendiente / a confirmar con el usuario**
- Rango de tamaño razonable para el recinto (¿hay un máximo real del terreno, o es libre?).
- Si "cambiar el color de la cerámica" implica también poder cambiar el **patrón** (tablón de madera vs. baldosa vs. pasto), no solo el tono — asumido por ahora que es solo el tono, patrón se mantiene fijo por sala.
