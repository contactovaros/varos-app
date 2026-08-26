# Decisiones de arquitectura — varos-app

Más nueva arriba.

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
