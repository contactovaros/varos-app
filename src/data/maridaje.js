// Motor de reglas del Sommelier — determinístico, sin IA generativa.
//
// No inventa vinos: solo elige entre lo que existe hoy en `menu_items`
// (categorías VINOS & ESPUMANTES, NUESTRO BAR y MOCKTAILS (SIN ALCOHOL),
// filtrado a visible_carta=true y available=true — ver Sommelier.jsx, mismo
// patrón de fetch que Carta2.jsx). Este archivo solo describe las reglas;
// quien llama pasa la lista real de productos y acá se cruza contra ella.
//
// Principios de maridaje codificados (ver briefing del dueño, 2026-09-17):
// - Equilibrio de peso: plato liviano → vino liviano, plato potente → vino con cuerpo.
// - Acidez: plato ácido (cítricos, ceviche) pide vino con acidez propia.
// - Dulce/umami: salsas de soya u otras muy umami chocan con taninos altos;
//   el dulce del plato pide un vino más dulce que el plato, no al revés.
// - Grasa contra taninos: carnes grasas → taninos altos las equilibran.
//
// La carta real es mayoritariamente tinta (de 20 vinos, solo 2 blancos y 1
// espumante). Para pescados blancos y ceviche no hay abundancia de blanco — el
// motor lo dice en vez de fingir que sí, y cuando corresponde ofrece una
// alternativa real de otra categoría (espumante, cerveza, un destilado, café)
// en vez de forzar un tinto que no acompaña al plato.
//
// Revisión 2026-09-25: texto libre sin tildes y con límites de palabra,
// pescados y mariscos sueltos, vinos que nunca salían (Kalfu Molu, Vértice,
// Ramirana), elección determinística entre vinos del mismo varietal, nota de
// escasez que siempre describe el vino que de verdad se eligió, y
// alternativas del bar con respaldo por tipo (no solo por marca).

// --- Normalización de texto ------------------------------------------------
//
// Todo lo que se compara (texto del cliente, nombres de vinos, nombres de
// platos) pasa por acá: minúsculas, sin tildes ni diéresis (NFD + quitar las
// marcas combinantes) y signos convertidos en espacio. Ojo: la Ñ también se
// vuelve N ("boloñesa" → "bolonesa", "limeño" → "limeno"), así que las
// palabras clave de este archivo se escriben SIN tildes y con n.
export function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- Detección de varietal a partir del nombre real del producto ---------
//
// Se evalúa sobre el nombre ya normalizado. El orden importa: primero los
// vinos cuyo nombre no dice la cepa, después los blends (antes que las cepas
// sueltas, si no "Ramirana (syrah-cab sauv-carmenere)" caía como Carmenere a
// secas y competía de igual a igual con los Carmenere varietales).

// Vinos reales de la carta cuyo nombre NO trae el varietal. Solo se agregan
// acá cuando la cepa se puede deducir con certeza razonable; nunca para
// "completar" la carta con vinos que no existen.
const VINOS_SIN_VARIETAL_EN_NOMBRE = [
  // Vértice (Viña Ventisquero, viñedo de Apalta): blend tinto de Carmenere y
  // Syrah de cuerpo alto. Certeza razonable — es el vino ícono de la viña en
  // Apalta y así se comercializa.
  { re: /\bvertice\b/, tag: 'blend_tinto_cuerpo' },
  // Kalfu Molu (línea Kalfu de Viña Ventisquero, valle de Leyda). DUDA: la
  // línea Molu existe en Pinot Noir, Sauvignon Blanc y Chardonnay, y el
  // nombre en la carta no dice cuál es. El dueño lo cuenta entre los tintos,
  // lo que apunta al Pinot Noir, pero sin la etiqueta a la vista no hay
  // certeza. Queda como tinto genérico (no se recomienda como blanco ni como
  // tinto de cuerpo). Si se confirma que es el Pinot Noir, cambiar el tag a
  // 'pinot_noir' — calzaría justo con salmón y pastas, que hoy no tienen Pinot.
  { re: /\bkalfu\b/, tag: 'tinto_generico' },
]

// Cepas tintas "de cuerpo" para detectar blends: si el nombre menciona dos o
// más, es un blend (salvo Cabernet Franc y Garnacha/Carignan, que tienen tag
// propio y se evalúan antes).
const CEPAS_TINTAS_BLEND = [
  /cabernet\s*sauvignon|\bcab\s*sauv\b/,
  /\bcarmenere\b/,
  /\bsyrah\b|\bshiraz\b/,
  /\bmerlot\b/,
  /\bmalbec\b/,
]

const PATRONES_VARIETAL = [
  { tag: 'sauvignon_blanc', re: /sauvignon\s*blanc/ },
  { tag: 'chardonnay', re: /chardon+ay/ },
  { tag: 'moscato_espumante', re: /moscat/ },
  { tag: 'pinot_noir', re: /pinot\s*noir/ },
  { tag: 'cabernet_franc_blend', re: /cabernet\s*franc/ },
  { tag: 'garnacha_carignan', re: /garnacha|carignan|carinena/ },
  { tag: 'cabernet_sauvignon', re: /cabernet\s*sauvignon|\bcab\s*sauv\b|\bcabernet\b/ },
  { tag: 'carmenere', re: /\bcarmenere\b/ },
  { tag: 'shiraz', re: /\bshiraz\b|\bsyrah\b/ },
  { tag: 'espumante_neutro', re: /espumante|\bbrut\b|champagne|\bcava\b|prosecco/ },
  // Blancos que se agreguen a futuro sin tag propio (Riesling, Viognier, etc.).
  { tag: 'blanco_generico', re: /\bblanco\b|riesling|viognier|gewurz|semillon|torrontes|\brose\b|rosado/ },
  // Tintos sin cepa reconocible (copa de la casa, Casillero Dark Black/Red,
  // y cepas que no tienen regla propia todavía: Merlot, Malbec, País...).
  { tag: 'tinto_generico', re: /tinto|reserva\b|dark\s*black|\bred\b|merlot|malbec|\bpais\b|cinsault/ },
]

export function detectarVarietal(nombre) {
  const n = normalizarTexto(nombre)
  if (!n) return null
  for (const { tag, re } of VINOS_SIN_VARIETAL_EN_NOMBRE) {
    if (re.test(n)) return tag
  }
  // Blancos y espumantes primero: "Sauvignon Blanc" no debe contar como
  // Cabernet Sauvignon por la regla de "cabernet" de más abajo.
  if (/sauvignon\s*blanc|chardon+ay|moscat/.test(n)) {
    return PATRONES_VARIETAL.find((p) => p.re.test(n)).tag
  }
  if (!/cabernet\s*franc|garnacha|carignan/.test(n)) {
    const cepas = CEPAS_TINTAS_BLEND.filter((re) => re.test(n)).length
    if (cepas >= 2) return 'blend_tinto_cuerpo'
  }
  for (const { tag, re } of PATRONES_VARIETAL) {
    if (re.test(n)) return tag
  }
  return null
}

// Nombres para mostrarle al cliente en la nota de escasez.
const NOMBRE_VARIETAL = {
  sauvignon_blanc: 'Sauvignon Blanc',
  chardonnay: 'Chardonnay',
  moscato_espumante: 'espumante Moscato',
  espumante_neutro: 'espumante',
  blanco_generico: 'vino blanco',
  pinot_noir: 'Pinot Noir',
  cabernet_franc_blend: 'Cabernet Franc',
  garnacha_carignan: 'Garnacha/Carignan',
  cabernet_sauvignon: 'Cabernet Sauvignon',
  carmenere: 'Carmenere',
  shiraz: 'Syrah/Shiraz',
  blend_tinto_cuerpo: 'blend tinto de cuerpo',
  tinto_generico: 'tinto',
}

// --- Alternativas del bar: marca primero, tipo de respaldo --------------
//
// Cada `altBar` de un perfil es una lista de opciones que se prueban en
// orden. La primera suele ser la marca clásica (Corona, Kunstmann Miel,
// Baileys) y las siguientes son el respaldo por tipo, para que la
// alternativa no desaparezca si mañana cambia la marca en la carta. Todas se
// comparan contra el nombre ya normalizado (sin tildes, minúsculas).

const CATEGORIA_MOCKTAILS = 'MOCKTAILS (SIN ALCOHOL)'
// Tragos preparados que contienen la palabra "cerveza", "cafe", etc. pero no
// son lo que la regla busca.
const RE_COCTEL = /\b(sour|fizz|spritz|cocktail|mojito|colada|michelada|not|tonic)\b/

const ALT_CERVEZA_RUBIA = [
  { re: /\b(corona|cusquena)\b/, motivo: 'una cerveza liviana y bien fría también limpia el paladar entre bocado y bocado' },
  {
    re: /^cerveza\b/,
    excluye: /miel|torobayo|ambar|amber|bock|stout|porter|negra|maki|calafate|0 0|\bcero\b|sin alcohol/,
    motivo: 'una cerveza rubia bien fría también limpia el paladar entre bocado y bocado',
  },
]

const ALT_CAFE = {
  re: /\bcafe\b|espresso/,
  excluye: RE_COCTEL,
  motivo: 'un espresso corta el dulzor y cierra bien la comida',
}

const ALT_LICOR_DULCE = {
  re: /\b(baileys|amarula|frangelico|kahlua|licor de|crema de)\b/,
  excluye: RE_COCTEL,
  motivo: 'un licor dulce y cremoso acompaña el postre sin quedar por debajo en dulzor',
}

const ALT_RON_ANEJO = {
  re: /\banejo\b/,
  excluye: RE_COCTEL,
  motivo: 'un ron añejo, con sus notas de caramelo y vainilla, es una alternativa clásica para el postre',
}

// --- Perfiles de plato -----------------------------------------------------
// Cada perfil tiene palabras clave para detectarlo en texto libre, una
// explicación corta del porqué (para mostrarle al cliente, no solo al
// motor), y un orden de preferencia de varietales dentro de VINOS &
// ESPUMANTES. `altBar` es una lista de alternativas contra NUESTRO BAR /
// MOCKTAILS, por si el vino ideal no existe en la carta o el cliente
// prefiere otra cosa. `cuerpo` ('bajo' | 'medio' | 'alto') decide el
// desempate entre vinos del mismo varietal (ver `compararCandidatos`).
// `contextoEscasez` es contexto opcional que se antepone a la nota de
// escasez; la nota en sí se arma con el vino que efectivamente se eligió.
//
// Las palabras clave se evalúan sobre texto normalizado (sin tildes, en
// minúscula) y con límites de palabra (\b): así "pasta" no matchea
// "pastel", ni "dulce" matchea "agridulce".
//
// El ORDEN de la lista importa: gana el primer perfil que matchee, así que
// los perfiles más específicos van antes que los genéricos.

export const PERFILES = [
  {
    id: 'sin_alcohol',
    etiqueta: 'Sin alcohol',
    // No hay vino que recomendar: `sinVino` le avisa a la pantalla que no
    // muestre "no hay vino de este estilo" — la recomendación va por el bar.
    keywords: /\bsin alcohol\b|\bno (tomo|bebo)\b|\babstemi[oa]\b|\bembarazada\b|\bmanejando\b|\bvoy a manejar\b/,
    sinVino: true,
    cuerpo: 'bajo',
    principio: 'Sin alcohol también se marida: algo ácido y fresco limpia el paladar igual que lo haría un blanco.',
    ordenVinos: [],
    altBar: [
      { categoria: CATEGORIA_MOCKTAILS, re: /limonada|not jito|mojito/, motivo: 'fresco y ácido, acompaña casi cualquier plato de la carta sin alcohol' },
      { categoria: CATEGORIA_MOCKTAILS, motivo: 'de nuestra carta de mocktails, sin alcohol' },
      { re: /^cerveza\b.*(\b0 0\b|\bcero\b)/, motivo: 'una cerveza 0,0 si prefieres algo con amargor' },
    ],
  },
  {
    id: 'ceviche',
    etiqueta: 'Ceviche',
    // "crudo" suelto se sacó a propósito (2026-09-25): en Chile "crudo" es
    // también el crudo de carne de vacuno y aparece en "jamón crudo" — ninguno
    // de los dos es pescado crudo con cítrico. Solo cuenta "pescado crudo".
    keywords: /\bceviche\b|\bleche de tigre\b|\btiradito\b|\bacevichad[oa]\b|\bsushi\b|\bsashimi\b|\bpescado crudo\b|\btartar de (atun|salmon|pescado)\b/,
    cuerpo: 'bajo',
    principio:
      'El limón del ceviche pide un vino con acidez propia — si el vino es menos ácido que el plato, sabe plano al lado.',
    ordenVinos: ['sauvignon_blanc', 'espumante_neutro', 'blanco_generico', 'moscato_espumante'],
    contextoEscasez: 'La carta es mayoritariamente tinta.',
    altBar: ALT_CERVEZA_RUBIA,
  },
  {
    id: 'pasta_mariscos',
    etiqueta: 'Pasta con mariscos',
    // Va ANTES que `pescado_salsa`: "Spaguetti en tinta de calamar con salsa
    // de mariscos" contiene literalmente "salsa de mariscos" y con el orden
    // viejo caía en `pescado_salsa` en vez de acá, que es lo correcto para
    // una pasta (bug hermano del de "parrilla", mismo criterio de arreglo:
    // el perfil más específico para el plato real va antes en la lista).
    // Desde 2026-09-25 exige además algo de mar en el nombre: antes "pasta"
    // sola bastaba, y una boloñesa o un fettuccine con lomo terminaban con
    // Chardonnay. La pasta sin mar va a `pasta_roja` / `lomo_saltado`.
    keywords:
      /\b(spaguetti|spaghetti|espagueti|fettuccine|fetuccini|pasta|tallarines|tallarin|linguine|ravioles)\b.*\b(marisco|mariscos|camaron|camarones|calamar|calamares|tinta|pulpo|machas|almejas|choritos|salmon|albacora|atun|pescado|frutos del mar)\b|\b(marisco|mariscos|camarones)\b.*\b(pasta|tallarines|spaguetti|spaghetti|fettuccine)\b/,
    cuerpo: 'medio',
    principio:
      'Pasta con mariscos o tinta de calamar: un blanco con cuerpo o un espumante; de los tintos, solo uno muy liviano tipo Pinot Noir, nunca uno tánico que se pelee con el marisco.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'espumante_neutro', 'blanco_generico', 'pinot_noir'],
  },
  {
    id: 'pescado_salsa',
    etiqueta: 'Pescado en salsa / mariscos',
    keywords:
      /\b(reineta|pescado|corvina|merluza|congrio|lenguado|salmon|albacora)\b.*\b(salsa|camarones|mariscos|a lo macho|crema)\b|\bsalsa de (mariscos|camarones)\b/,
    cuerpo: 'medio',
    principio:
      'La salsa le suma cuerpo y grasa al pescado — un blanco con un poco más de estructura (Chardonnay) lo acompaña mejor que uno muy austero.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'blanco_generico', 'espumante_neutro', 'moscato_espumante'],
  },
  {
    id: 'mariscos_arroz',
    etiqueta: 'Arroz o sopa marinera',
    keywords: /\bmarinera\b|\barroz\b.*\bmariscos?\b|\btrio marino\b|\bfiesta del mar\b|\bpaila marina\b|\bcaldillo\b|\bchupe\b|\bpaella\b|\bsopa de mariscos\b/,
    cuerpo: 'medio',
    principio: 'Plato de mar con cuerpo (arroz, caldo) — un blanco con algo de volumen o un espumante seco lo sostienen sin taparlo.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'espumante_neutro', 'blanco_generico', 'moscato_espumante'],
  },
  {
    id: 'pulpo_parrilla',
    etiqueta: 'Pulpo a la parrilla',
    // Va antes que `mariscos` (que atrapa "pulpo" suelto) y antes que
    // `carne_roja_parrilla`; ver el OJO de ese perfil.
    keywords: /\bpulpo (a la )?(parrilla|brasa|grill|grille)\b|\bpulpo\b.*\bbbq\b/,
    cuerpo: 'medio',
    principio: 'El ahumado de la parrilla y el dulzor de la salsa BBQ piden un tinto frutal de cuerpo medio, sin exceso de tanino.',
    ordenVinos: ['carmenere', 'garnacha_carignan', 'pinot_noir', 'tinto_generico'],
    altBar: [
      { re: /\bkunstmann miel\b/, motivo: 'una cerveza con un toque de miel también hace buen match con el dulzor de la BBQ' },
      {
        re: /^cerveza\b.*\b(miel|ambar|amber|torobayo|bock)\b/,
        motivo: 'una cerveza ámbar o de miel también hace buen match con el dulzor de la BBQ',
      },
    ],
  },
  {
    id: 'picante',
    etiqueta: 'Picantes (guata, mariscos, pulpo)',
    // Antes que `mariscos`: "picante de mariscos" es un picante.
    keywords: /\bpicante\b/,
    cuerpo: 'bajo',
    principio:
      'El picante amplifica el alcohol y el tanino — conviene un tinto de tanino bajo y algo de fruta dulce, o directamente algo con un poco de dulzor que enfríe.',
    ordenVinos: ['garnacha_carignan', 'carmenere', 'moscato_espumante'],
    altBar: ALT_CERVEZA_RUBIA,
  },
  {
    id: 'pescado_graso',
    etiqueta: 'Salmón, atún o pescado graso',
    keywords: /\b(salmon|atun|albacora|pez espada|jurel|caballa)\b/,
    cuerpo: 'medio',
    principio:
      'Un pescado con más grasa y sabor aguanta algo de cuerpo: el clásico es un Pinot Noir, y si no, un blanco con estructura como el Chardonnay.',
    ordenVinos: ['pinot_noir', 'chardonnay', 'sauvignon_blanc', 'blanco_generico', 'espumante_neutro'],
  },
  {
    id: 'pescado_blanco',
    etiqueta: 'Pescado blanco',
    keywords: /\b(pescado|pescados|reineta|corvina|merluza|congrio|lenguado|tilapia|pejerrey|cojinova|vidriola|palometa|bacalao)\b/,
    cuerpo: 'bajo',
    principio: 'Pescado blanco y liviano pide un vino igual de liviano — un tinto con cuerpo lo tapa.',
    ordenVinos: ['sauvignon_blanc', 'chardonnay', 'espumante_neutro', 'blanco_generico', 'moscato_espumante'],
    contextoEscasez: 'La carta es mayoritariamente tinta.',
    altBar: [
      { re: /^copa de espumante\b/, motivo: 'una copa de espumante también acompaña bien un pescado liviano' },
      ...ALT_CERVEZA_RUBIA,
    ],
  },
  {
    id: 'mariscos',
    etiqueta: 'Mariscos',
    // Va antes que `lomo_saltado`: "camarones salteados" es un plato de
    // mariscos, no un salteado de carne con soya.
    keywords:
      /\b(marisco|mariscos|camaron|camarones|langostino|langostinos|machas?|ostiones?|ostras?|choritos?|choros|almejas?|locos?|jaiba|centolla|erizos?|calamar|calamares|pulpo|frutos del mar)\b/,
    cuerpo: 'bajo',
    principio: 'Los mariscos son delicados y salinos: piden un blanco fresco o un espumante, que acompañan sin tapar el sabor a mar.',
    ordenVinos: ['sauvignon_blanc', 'espumante_neutro', 'chardonnay', 'blanco_generico', 'moscato_espumante'],
    contextoEscasez: 'La carta es mayoritariamente tinta.',
    altBar: ALT_CERVEZA_RUBIA,
  },
  {
    id: 'carne_roja_parrilla',
    etiqueta: 'Carne roja a la parrilla',
    // OJO: la palabra genérica "parrilla" sola NO va acá — antes estaba, y
    // como este perfil se evalúa antes que `pulpo_parrilla`, "Pulpo a la
    // parrilla" caía en Cabernet Sauvignon en vez del Carmenere/Garnacha que
    // le corresponde (bug real, encontrado en vivo el 2026-09-17). Este
    // perfil solo matchea por los cortes de carne reales.
    keywords:
      /\b(tomahawk|bife de chorizo|entrecot|asado de tira|lomo a la orden|lomo grille|lomo vetado|parrillada|carne roja|flat iron|steak|picana|punta de ganso|cordero|filete de vacuno)\b/,
    cuerpo: 'alto',
    principio: 'La grasa de una carne roja a la parrilla necesita taninos altos que la corten — ahí un Cabernet Sauvignon o un blend potente rinde mejor.',
    ordenVinos: ['cabernet_sauvignon', 'blend_tinto_cuerpo', 'shiraz', 'tinto_generico', 'carmenere'],
  },
  {
    id: 'guiso_lomo_pobre',
    etiqueta: 'Lomo a lo pobre / guisos de carne',
    keywords: /\blomo a lo pobre\b|\bguiso\b|\bestofado\b|\bcarne a la olla\b|\bplateada\b|\bmechada\b/,
    cuerpo: 'alto',
    principio: 'Carne con huevo y papas fritas: sigue siendo un plato de carne con grasa, pide un tinto con cuerpo pero no necesariamente el más tánico.',
    ordenVinos: ['carmenere', 'blend_tinto_cuerpo', 'cabernet_sauvignon', 'tinto_generico'],
  },
  {
    id: 'lomo_saltado',
    etiqueta: 'Lomo saltado',
    // Antes matcheaba "salteado" y "wok" sueltos, y "camarones salteados" o
    // "vegetales salteados" terminaban con Carmenere. Ahora solo el saltado
    // de carne (el umami de la soya es lo que define la regla acá).
    keywords: /\blomo saltado\b|\bsaltado de (carne|lomo|vacuno|res)\b|\b(carne|lomo|vacuno|res) salteado\b|\bwok de (carne|lomo|vacuno|res)\b/,
    cuerpo: 'medio',
    principio:
      'Lleva salsa de soya — el umami choca con taninos muy marcados y los vuelve metálicos. Mejor un tinto afrutado y de tanino más suave que un Cabernet estructurado.',
    ordenVinos: ['carmenere', 'garnacha_carignan', 'pinot_noir', 'tinto_generico'],
  },
  {
    id: 'pasta_crema',
    etiqueta: 'Pasta con salsa de crema o queso',
    // Va ANTES que `pasta_roja` (2026-09-25): sin esto un alfredo o una
    // carbonara caían en la regla del tomate y salían con tinto. Exige una
    // pasta en el nombre, salvo alfredo/carbonara que ya lo son, para que un
    // "pollo a la crema" siga yendo a `ave_salsa`.
    keywords:
      /\b(spaguetti|spaghetti|espagueti|fettuccine|fetuccini|pasta|pastas|tallarines|tallarin|linguine|ravioles|noquis|gnocchi)\b.*\b(crema|cremosa|cremoso|cuatro quesos|salsa blanca|queso|quesos|hongos|champinones)\b|\balfredo\b|\bcarbonara\b/,
    cuerpo: 'medio',
    principio:
      'La crema y el queso piden un blanco con cuerpo que acompañe su textura (un Chardonnay); la acidez de un espumante también corta bien la grasa.',
    ordenVinos: ['chardonnay', 'espumante_neutro', 'sauvignon_blanc', 'blanco_generico', 'pinot_noir'],
  },
  {
    id: 'pasta_roja',
    etiqueta: 'Pasta con salsa de carne o tomate',
    // Nuevo (2026-09-25): antes toda pasta caía en `pasta_mariscos` →
    // Chardonnay, incluida la boloñesa. Va después de `lomo_saltado` para que
    // "fettuccine con lomo saltado" siga la regla de la soya.
    keywords:
      /\bbolonesa\b|\bragu\b|\blasana\b|\bpomodoro\b|\bputanesca\b|\bnapolitana\b|\b(spaguetti|spaghetti|espagueti|fettuccine|fetuccini|pasta|pastas|tallarines|tallarin|linguine|ravioles|noquis|gnocchi)\b/,
    cuerpo: 'medio',
    principio:
      'La salsa de tomate es ácida y la carne le da grasa: pide un tinto de cuerpo medio con buena acidez — el clásico es un Pinot Noir; un Cabernet muy tánico se siente áspero con el tomate.',
    ordenVinos: ['pinot_noir', 'carmenere', 'garnacha_carignan', 'tinto_generico'],
  },
  {
    id: 'cerdo',
    etiqueta: 'Cerdo asado',
    keywords: /\bcerdo\b|\bcostillar\b|\bchancho\b|\bpernil\b/,
    cuerpo: 'medio',
    principio: 'El cerdo es más suave que la carne de vacuno — un tinto de cuerpo medio acompaña sin aplastarlo.',
    ordenVinos: ['carmenere', 'pinot_noir', 'garnacha_carignan', 'cabernet_franc_blend', 'tinto_generico'],
  },
  {
    id: 'ave_salsa',
    etiqueta: 'Ave en salsa',
    keywords: /\bsuprema\b|\bpollo\b|\bave a la plancha\b|\bpavo\b|\bchampignones\b/,
    cuerpo: 'medio',
    principio: 'Pollo en salsa cremosa o de hongos: un blanco con cuerpo (Chardonnay) o un tinto liviano funcionan mejor que uno muy potente.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'blanco_generico', 'pinot_noir', 'carmenere'],
  },
  // --- Postres ---------------------------------------------------------
  // Divididos en cuatro (2026-09-25) porque la alternativa y el motivo
  // cambian según el postre: antes todos decían "para acompañar chocolate",
  // aunque fuera una panacotta de frutilla. Ampliado (2026-09-17): la carta
  // real de POSTRES & TENTACIONES tiene varios que no contienen ninguna de
  // las palabras originales (chocolate/postre/torta/helado/dulce) —
  // tiramisú, panacotta, suspiro limeño, mousse de maracuyá, leche asada,
  // fondue con nutella — y antes caían al perfil genérico en vez de a la
  // regla de vino dulce/espumante. Si no hay Moscato ni espumante, la
  // alternativa del bar siempre ofrece algo real (licor, ron o café).
  {
    id: 'postre_muy_dulce',
    etiqueta: 'Postre muy dulce',
    keywords: /\bsuspiro\b|\bmanjar\b|\bdulce de leche\b|\btres leches\b|\balfajor(es)?\b/,
    cuerpo: 'bajo',
    // Honestidad: la regla dice "vino más dulce que el plato", y ningún vino
    // de la carta es más dulce que un suspiro limeño. No se afirma la regla
    // como cumplida; se ofrece el café como contraste.
    principio:
      'Es de los postres más dulces que hay (manjar y merengue): ningún vino de la carta lo supera en dulzor, así que el Moscato acompaña pero no cumple del todo la regla de oro. Para contraste, un espresso corta el dulzor mejor que cualquier vino.',
    ordenVinos: ['moscato_espumante', 'espumante_neutro'],
    altBar: [
      { ...ALT_CAFE, motivo: 'un espresso corta el dulzor del manjar — acá funciona mejor que cualquier vino' },
      ALT_LICOR_DULCE,
    ],
  },
  {
    id: 'postre_cafe',
    etiqueta: 'Postre con café',
    keywords: /\btiramisu\b|\bmoka\b|\bmocha\b|\bcafe\b/,
    cuerpo: 'bajo',
    principio: 'Regla de oro con postres: el vino tiene que ser más dulce que el plato, si no, el vino se siente amargo al lado.',
    ordenVinos: ['moscato_espumante', 'espumante_neutro'],
    altBar: [
      { ...ALT_CAFE, motivo: 'el café del postre se repite en la taza: un espresso lo acompaña natural' },
      { re: /\bbaileys\b/, excluye: RE_COCTEL, motivo: 'un licor de crema como el Baileys va de la mano con el café y el cacao' },
      ALT_LICOR_DULCE,
    ],
  },
  {
    id: 'postre_chocolate',
    etiqueta: 'Postre de chocolate',
    keywords: /\bchocolate\b|\bbrownie\b|\bvolcan\b|\bnutella\b|\bfondue\b|\bcacao\b|\btentacion\b/,
    cuerpo: 'bajo',
    principio: 'Regla de oro con postres: el vino tiene que ser más dulce que el plato, si no, el vino se siente amargo al lado.',
    ordenVinos: ['moscato_espumante', 'espumante_neutro'],
    altBar: [
      { re: /\b(baileys|havana anejo)\b/, excluye: RE_COCTEL, motivo: 'un licor dulce (Baileys o un ron añejo) es una alternativa clásica para acompañar chocolate' },
      { ...ALT_LICOR_DULCE, motivo: 'un licor dulce es una alternativa clásica para acompañar chocolate' },
      { ...ALT_RON_ANEJO, motivo: 'un ron añejo es una alternativa clásica para acompañar chocolate' },
      { ...ALT_CAFE, motivo: 'un espresso acompaña bien el chocolate si prefieres algo sin dulzor extra' },
    ],
  },
  {
    id: 'postre_frutal',
    etiqueta: 'Postre',
    keywords:
      /\bpostres?\b|\btorta\b|\bhelados?\b|\bdulce\b|\bpanacotta\b|\bpanna cotta\b|\bmousse\b|\bleche asada\b|\bflan\b|\bcheesecake\b|\bkuchen\b|\bfrutillas? con crema\b/,
    cuerpo: 'bajo',
    principio: 'Regla de oro con postres: el vino tiene que ser más dulce que el plato, si no, el vino se siente amargo al lado.',
    ordenVinos: ['moscato_espumante', 'espumante_neutro'],
    altBar: [
      { ...ALT_CAFE, motivo: 'un espresso cierra bien un postre frutal o cremoso' },
      { re: /\bte de\b|\bte\b.*\b(hierba|cedron|canela|hoja)\b/, excluye: RE_COCTEL, motivo: 'una infusión de hierbas acompaña un postre frutal o cremoso sin taparlo' },
      ALT_LICOR_DULCE,
    ],
  },
  {
    id: 'quesos',
    etiqueta: 'Tabla de quesos',
    keywords: /\bquesos?\b/,
    cuerpo: 'medio',
    principio: 'Con quesos suaves o de cabra, un blanco con acidez limpia mejor que un tinto; con quesos más curados, un tinto de cuerpo medio funciona.',
    ordenVinos: ['sauvignon_blanc', 'carmenere', 'tinto_generico', 'blend_tinto_cuerpo'],
  },
]

export const PERFIL_GENERICO = {
  id: 'general',
  etiqueta: 'Algo versátil',
  cuerpo: 'medio',
  principio: 'Sin un plato específico, vamos a lo seguro: un tinto de cuerpo medio que acompaña casi cualquier cosa de la carta sin imponerse.',
  ordenVinos: ['carmenere', 'tinto_generico', 'cabernet_sauvignon'],
}

// Detecta el primer perfil cuyo patrón matchee el texto libre del cliente.
// El texto se normaliza (sin tildes, minúsculas) antes de comparar, así que
// "trío marino", "trio marino" y "TRÍO MARINO" dan lo mismo.
export function detectarPerfil(texto) {
  const t = normalizarTexto(texto)
  if (!t) return null
  for (const perfil of PERFILES) {
    if (perfil.keywords.test(t)) return perfil
  }
  return null
}

// --- Elección determinística entre vinos del mismo varietal --------------
//
// Cuando hay varios vinos del mismo tag (hoy: seis Cabernet Sauvignon, cuatro
// Carmenere) antes ganaba el que viniera primero en la respuesta de
// Supabase — arbitrario y cambiante. Criterio decidido (2026-09-25):
//   1. Botella antes que copa. La recomendación describe un vino con nombre
//      y cepa; la copa de la casa no dice qué cepa es, y solo debería salir
//      si no hay ninguna botella del estilo. (Un comensal solo que quiere
//      copa se lo pide al garzón; el motor no puede saber cuántos son.)
//   2. Gama según el `cuerpo` del perfil: para platos potentes ('alto') se
//      prefiere Gran Reserva (más estructura y madera); para platos de
//      cuerpo medio, Reserva; para platos livianos ('bajo'), la gama más
//      simple, con menos madera que tape el plato.
//   3. Precio ascendente entre equivalentes (lo más accesible primero; sin
//      precio, al final).
//   4. Nombre alfabético, para que el resultado nunca dependa del orden en
//      que llegan las filas.
const RE_COPA = /^copa\b/

function gamaDe(nombre) {
  const n = normalizarTexto(nombre)
  if (/\bgran reserva\b/.test(n)) return 2
  if (/\breserva\b/.test(n)) return 1
  return 0
}

function distanciaDeGama(cuerpo, gama) {
  if (cuerpo === 'alto') return 2 - gama
  if (cuerpo === 'bajo') return gama
  return Math.abs(gama - 1)
}

function precioDe(item) {
  const p = Number(item?.price_clp)
  return Number.isFinite(p) && p > 0 ? p : Infinity
}

function compararCandidatos(cuerpo) {
  return (a, b) => {
    const copaA = RE_COPA.test(normalizarTexto(a.name)) ? 1 : 0
    const copaB = RE_COPA.test(normalizarTexto(b.name)) ? 1 : 0
    if (copaA !== copaB) return copaA - copaB
    const gA = distanciaDeGama(cuerpo, gamaDe(a.name))
    const gB = distanciaDeGama(cuerpo, gamaDe(b.name))
    if (gA !== gB) return gA - gB
    const pA = precioDe(a)
    const pB = precioDe(b)
    if (pA !== pB) return pA < pB ? -1 : 1
    return String(a.name || '').localeCompare(String(b.name || ''), 'es')
  }
}

function vinosConTag(vinosDisponibles) {
  return (vinosDisponibles || [])
    .map((v) => ({ ...v, _varietal: detectarVarietal(v.name) }))
    .filter((v) => v._varietal)
}

// Busca en el bar la primera opción de la lista que tenga un producto real.
// Dentro de una misma opción, el más accesible (y por nombre si empatan).
function buscarEnBar(opciones, bebidasBar) {
  const lista = Array.isArray(opciones) ? opciones : opciones ? [opciones] : []
  for (const op of lista) {
    const candidatos = (bebidasBar || []).filter((b) => {
      if (op.categoria && b.category !== op.categoria) return false
      const n = normalizarTexto(b.name)
      if (op.re && !op.re.test(n)) return false
      if (op.excluye && op.excluye.test(n)) return false
      return true
    })
    if (candidatos.length) {
      candidatos.sort((a, b) => {
        const pA = precioDe(a)
        const pB = precioDe(b)
        if (pA !== pB) return pA < pB ? -1 : 1
        return String(a.name || '').localeCompare(String(b.name || ''), 'es')
      })
      return { item: candidatos[0], motivo: op.motivo }
    }
  }
  return null
}

// Opción sin alcohol para cualquier perfil (campo adicional del resultado;
// la pantalla puede mostrarlo o no). Solo productos reales del bar.
function opcionesSinAlcohol(perfil) {
  if (perfil.id.startsWith('postre')) {
    // El mocktail con café primero: el espresso solo ya suele venir como
    // `alternativaBar` del postre y no tiene gracia repetir "otro café".
    return [
      { categoria: CATEGORIA_MOCKTAILS, re: /espresso/, motivo: 'sin alcohol, con el amargor del café para equilibrar el dulce' },
      { ...ALT_CAFE, motivo: 'sin alcohol, un espresso cierra bien el postre' },
    ]
  }
  if (estiloDelPlato(perfil) === 'liviano') {
    return [
      { categoria: CATEGORIA_MOCKTAILS, re: /limonada|not jito|mojito/, motivo: 'sin alcohol: algo ácido y fresco, como pediría un blanco' },
      { categoria: CATEGORIA_MOCKTAILS, motivo: 'de nuestra carta de mocktails, sin alcohol' },
    ]
  }
  return [
    { categoria: CATEGORIA_MOCKTAILS, re: /ginger|not chelada/, motivo: 'sin alcohol: algo con cuerpo y especiado para acompañar la carne' },
    { re: /^cerveza\b.*(\b0 0\b|\bcero\b)/, motivo: 'sin alcohol: una cerveza 0,0' },
    { categoria: CATEGORIA_MOCKTAILS, motivo: 'de nuestra carta de mocktails, sin alcohol' },
  ]
}

// Arma la recomendación final cruzando el perfil contra los productos reales
// ya cargados desde Supabase (separados por categoría por quien llama).
// `vino` queda null si no hay ningún vino disponible para ningún varietal del
// perfil (carta vacía / todo agotado / perfil `sinVino`) — quien llama debe
// manejar ese caso; `alternativaBar` intenta cubrirlo con algo real del bar.
export function armarRecomendacion(perfil, vinosDisponibles, bebidasBar = []) {
  const candidatos = vinosConTag(vinosDisponibles)
  const comparar = compararCandidatos(perfil.cuerpo || 'medio')

  let vinoElegido = null
  let varietalElegido = null
  for (const tag of perfil.ordenVinos || []) {
    const delTag = candidatos.filter((v) => v._varietal === tag).sort(comparar)
    if (delTag.length) {
      vinoElegido = delTag[0]
      varietalElegido = tag
      break
    }
  }

  // Es "escasez" (mostrar la nota de honestidad) si lo que encontramos no es
  // la primera opción de la lista de preferencia del perfil. La nota nombra
  // lo que falta y lo que se eligió de verdad — nunca un vino que no está
  // (antes la del ceviche decía "este Sauvignon Blanc" aunque se hubiera
  // elegido un espumante).
  const ideal = perfil.ordenVinos?.[0]
  const esEscasez = Boolean(varietalElegido && varietalElegido !== ideal)
  let notaEscasez = null
  if (esEscasez) {
    const faltante = NOMBRE_VARIETAL[ideal] || 'vino ideal'
    const elegido = NOMBRE_VARIETAL[varietalElegido]
    notaEscasez = [
      perfil.contextoEscasez,
      `Un ${faltante} sería lo ideal, pero hoy no hay en la carta; ${elegido ? `este ${elegido}` : 'este'} es lo más cercano disponible.`,
    ]
      .filter(Boolean)
      .join(' ')
  }

  const alternativaBar = buscarEnBar(perfil.altBar, bebidasBar)
  // Sin repetir el producto de `alternativaBar` (con el tiramisú las dos
  // listas empiezan por el café).
  const alternativaSinAlcohol = perfil.sinVino
    ? null
    : buscarEnBar(
        opcionesSinAlcohol(perfil),
        (bebidasBar || []).filter((b) => b.id !== alternativaBar?.item.id)
      )

  return {
    perfil,
    vino: vinoElegido,
    esEscasez,
    notaEscasez,
    alternativaBar,
    alternativaSinAlcohol,
  }
}

// --- Recomendación para la mesa entera --------------------------------
//
// El cliente no compra una botella por plato: compra una para la mesa. Acá se
// puntúa cada vino real contra TODOS los platos de la comanda a la vez, con la
// misma lista de preferencia (ordenVinos) que ya usa la recomendación por
// plato — así un plato solo da el mismo vino que armarRecomendacion().
//
// afinidad: 1 = primera opción del perfil, baja con cada puesto, 0 = no está.
// ajuste "bien" >= 0.6, "justo" >= 0.3, si no "mal".

const VARIETALES_LIVIANOS = new Set([
  'sauvignon_blanc',
  'chardonnay',
  'moscato_espumante',
  'espumante_neutro',
  'blanco_generico',
])

function afinidad(perfil, tag) {
  const orden = perfil.ordenVinos || []
  const i = orden.indexOf(tag)
  return i < 0 ? 0 : 1 - i / orden.length
}

function ajusteDe(perfil, vino) {
  const a = afinidad(perfil, vino._varietal)
  return a >= 0.6 ? 'bien' : a >= 0.3 ? 'justo' : 'mal'
}

// "liviano" = blancos y espumantes; "tinto" = el resto. Se decide por la
// primera opción del perfil del plato.
function estiloDelPlato(perfil) {
  return VARIETALES_LIVIANOS.has(perfil.ordenVinos?.[0]) ? 'liviano' : 'tinto'
}

// Empate de puntaje → gana el primero según `compararCandidatos` con el
// cuerpo del plato con más cantidad (el mismo criterio que usa
// armarRecomendacion), para que un plato solo dé siempre el mismo vino.
function mejorVinoPara(platos, vinosConVarietal) {
  const principal = platos.reduce((m, p) => (!m || p.qty > m.qty ? p : m), null)
  const ordenados = [...vinosConVarietal].sort(compararCandidatos(principal?.perfil?.cuerpo || 'medio'))
  let mejor = null
  let mejorPuntaje = 0
  for (const v of ordenados) {
    const puntaje = platos.reduce((s, p) => s + p.qty * afinidad(p.perfil, v._varietal), 0)
    if (puntaje > mejorPuntaje) {
      mejor = v
      mejorPuntaje = puntaje
    }
  }
  return mejor
}

// platos: [{ nombre, perfil, qty }] (solo comida con perfil de maridaje).
// Devuelve:
//   modo 'una'             → una botella acompaña bien a todos los platos
//   modo 'una_con_reparos' → una botella sirve, pero con algún plato queda justo
//   modo 'dos'             → hay platos livianos y de cuerpo a la vez: conviene
//                            una botella de cada estilo (`unaSola` es la opción
//                            si la mesa quiere una sola, con sus reparos)
// o null si no hay platos o no hay ningún vino aplicable.
export function armarRecomendacionGrupal(platos, vinosDisponibles) {
  if (!platos?.length) return null
  const vinos = vinosConTag(vinosDisponibles)

  const global = mejorVinoPara(platos, vinos)
  if (!global) return null

  const detalle = (vino, lista) => lista.map((p) => ({ nombre: p.nombre, ajuste: ajusteDe(p.perfil, vino) }))
  const detalleGlobal = detalle(global, platos)
  const todosBien = detalleGlobal.every((d) => d.ajuste === 'bien')

  const livianos = platos.filter((p) => estiloDelPlato(p.perfil) === 'liviano')
  const tintos = platos.filter((p) => estiloDelPlato(p.perfil) === 'tinto')

  if (livianos.length && tintos.length && !todosBien) {
    const vLiviano = mejorVinoPara(livianos, vinos)
    const vTinto = mejorVinoPara(tintos, vinos)
    if (vLiviano && vTinto && vLiviano.id !== vTinto.id) {
      return {
        modo: 'dos',
        botellas: [
          { vino: vLiviano, estilo: 'liviano', detalle: detalle(vLiviano, livianos) },
          { vino: vTinto, estilo: 'tinto', detalle: detalle(vTinto, tintos) },
        ],
        unaSola: { vino: global, detalle: detalleGlobal },
      }
    }
  }

  return {
    modo: todosBien ? 'una' : 'una_con_reparos',
    botellas: [{ vino: global, estilo: null, detalle: detalleGlobal }],
    unaSola: null,
  }
}

// --- Mapeo explícito plato real → perfil ------------------------------
//
// Los chips de /sommelier ya no son una lista de 10 ejemplos: salen de la
// carta real completa (ver Sommelier.jsx), y cada plato real necesita un
// perfil confiable, no una adivinanza de regex sobre su nombre completo
// (que trae emojis, gramaje, mayúsculas variables, etc.). Este mapeo cubre
// los ~52 platos de ENTRADAS FRIAS Y CALIENTES, PLATOS PRINCIPALES y
// POSTRES & TENTACIONES confirmados contra `menu_items` el 2026-09-17
// (visible_carta=true, available=true). NIÑOS y GUARNICIONES quedan afuera
// a propósito (ver CATEGORIAS_SIN_MARIDAJE más abajo) — no tiene sentido
// ofrecer vino para un menú de niños ni para un acompañamiento suelto.
//
// La clave es el nombre normalizado (ver `normalizarNombrePlato`): sin
// emojis ni signos, sin tildes, sin dobles espacios, en mayúscula. Así
// "🌶️PICANTE DE PULPO CON ARROZ" matchea igual que si el admin le sacara el
// emoji mañana, y "A ELECCIÓN" / "A ELECCION" o "LIMEÑA" / "LIMENA" dan la
// misma clave (antes una tilde de más o de menos dejaba el plato sin perfil).
export function normalizarNombrePlato(nombre) {
  return normalizarTexto(nombre).toUpperCase()
}

// Categorías reales de `menu_items` que a propósito NO participan del
// maridaje: NIÑOS (nadie pide vino para el menú de niños) y GUARNICIONES
// (son acompañamientos, no un plato para maridar por sí solo).
export const CATEGORIAS_SIN_MARIDAJE = ['NIÑOS', 'GUARNICIONES']

// Las claves se escriben como aparecen en la carta (con o sin tildes da
// igual): se normalizan al cargar el módulo, más abajo.
const MAPEO_PLATOS_CRUDO = {
  // -- ENTRADAS FRIAS Y CALIENTES --
  'TIRADITO DE SALMON AHUMADO': 'ceviche',
  'CAUSA PULPO AL OLIVO': 'pescado_salsa',
  'CAUSA LIMEÑA ACEVICHADA': 'ceviche',
  'CAUSA LIMEÑA CON POLLO': 'ave_salsa',
  'CAUSA LIMEÑA DE CAMARONES EN SALSA GOLF': 'pescado_salsa',
  'CEVICHE MIXTO': 'ceviche',
  'CEVICHE TRADICIONAL': 'ceviche',
  'ENSALADA CESAR AL ESTILO VARO S': 'ave_salsa',
  'PALTA REINA CORONADA CON POLLO Y MAYONESA EN MIX DE HOJAS VERDES': 'ave_salsa',
  'PULPO A LA OLIVA': 'pescado_salsa',
  'TIRADITO NIKKEI': 'ceviche',
  'TRILOGIA DE CAUSA LIMEÑA': 'pescado_salsa',

  // -- PLATOS PRINCIPALES --
  'LOMO SALTADO CON RISSOTTO A LA HUANCAINA': 'lomo_saltado',
  'PARRILLADA 1 LOMO 1 TRUTO 1 PRIETA 2 LONGANIZA 2 GUARNICION': 'carne_roja_parrilla',
  'PULPO A LA PARRILLA EN SALSA BBQ CON PAPAS DORADAS': 'pulpo_parrilla',
  'REINETA EN SALSA DE CAMARONES CON ACOMPAÑAMIENTO A ELECCION': 'pescado_salsa',
  'REINETA EN SALSA DE MARISCOS ACOMPAÑAMIENTO A ELECCION': 'pescado_salsa',
  'REINETA FRITA CON ENSALADA SURTIDA DEL VALLE': 'pescado_blanco',
  'SPAGUETTI EN TINTA DE CALAMAR CON SALSA DE MARISCOS': 'pasta_mariscos',
  'SUPREMA DE AVE A LA PLANCHA EN SALSA HUANCAINA ACOMPAÑADO DE ARROZ AL OLIVO': 'ave_salsa',
  'SUPREMA DE AVE CON SALSA DE CHAMPIGNONES ARROZ A LAS FINAS HIERBAS': 'ave_salsa',
  'LOMO GRILLE 200 GRAMOS A LA ORDEN': 'carne_roja_parrilla',
  'LOMO A LO POBRE 200 GRMS': 'guiso_lomo_pobre',
  'FETTUCCINE A LA HUANCAINA CON LOMO SALTADO': 'lomo_saltado',
  'CEVICHE TRADICIONAL CON CHICHARRON DE PESCADO Y LECHE DE TIGRE': 'ceviche',
  'CEVICHE MIXTO DEL PACIFICO CON CHICHARRON DE PESCADO Y LECHE DE TIGRE': 'ceviche',
  'BIFE DE CHORIZO 350 GMOS 2 GUARNICIONES A ELECCIÓN': 'carne_roja_parrilla',
  'ARROZ A LA MARINERA': 'mariscos_arroz',
  'FLAT IRON STEAK 350 GMS GUARNICION A ELECCIÓN': 'carne_roja_parrilla',
  'ENTRECOT DE VACUNO GRILLE CON CHIMICHURRI 500 GRAMOS GUARNICION A ELECCION': 'carne_roja_parrilla',
  'ASADO DE TIRA AL VINO TINTO CON GUARNICION A LA ORDEN 500GM': 'carne_roja_parrilla',
  'TOMAHAWK 800 GRMS CON CHIMICHURRI Y 2 ACOMPAÑAMIENTOS A ELECCION': 'carne_roja_parrilla',
  'TRIO MARINO': 'mariscos_arroz',
  'SOPA MARINERA': 'mariscos_arroz',
  'COSTILLAR DE CERDO ASADO GUARNICION A ELECCION': 'cerdo',
  'PICANTE DE PULPO CON ARROZ': 'picante',
  'PICANTE DE MARISCOS CON ARROZ': 'picante',
  'PICANTE DE GUATA Y PATA CON ARROZ BLANCO': 'picante',
  'FIESTA DEL MAR': 'mariscos_arroz',
  'LOMO SALTADO CLASICO': 'lomo_saltado',

  // -- POSTRES & TENTACIONES --
  'PANACOTTA CON SALSA DE FRUTILLA': 'postre_frutal',
  // El más dulce de la carta: ver la nota honesta de `postre_muy_dulce`.
  'SUSPIRO LIMEÑO': 'postre_muy_dulce',
  'TENTACION X 4 UNIDADES': 'postre_chocolate',
  TIRAMISÚ: 'postre_cafe',
  'VOLCÁN DE CHOCOLATE CON HELADO': 'postre_chocolate',
  'BROWNIE CON HELADO': 'postre_chocolate',
  'CHEESECAKE CON SALSA DE FRUTILLA MANGO O MARACUYA': 'postre_frutal',
  'COPA DE HELADO': 'postre_frutal',
  'COPA DE HELADO 1 SABOR ACAI': 'postre_frutal',
  'FONDUE DE FRUTILLAS CON NUTELLA': 'postre_chocolate',
  'LECHE ASADA': 'postre_frutal',
  'MOUSSE DE MARACUYA EN SALSA DE MARACUYA': 'postre_frutal',
}

const MAPEO_PLATOS = Object.fromEntries(
  Object.entries(MAPEO_PLATOS_CRUDO).map(([nombre, id]) => [normalizarNombrePlato(nombre), id])
)

// Resuelve el perfil de un plato REAL de la carta (objeto de `menu_items`,
// con `name` y `category`). Prioridad: 1) categorías excluidas → null,
// 2) mapeo explícito por nombre normalizado, 3) fallback a `detectarPerfil`
// por regex sobre el nombre (cubre productos nuevos que todavía no se
// agregaron al mapeo de arriba, sin dejarlos sin recomendación).
export function perfilDePlato(item) {
  if (!item?.name) return null
  if (CATEGORIAS_SIN_MARIDAJE.includes(item.category)) return null
  const clave = normalizarNombrePlato(item.name)
  const idMapeado = MAPEO_PLATOS[clave]
  if (idMapeado) {
    return PERFILES.find((p) => p.id === idMapeado) || null
  }
  return detectarPerfil(item.name)
}
