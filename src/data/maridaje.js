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
// La carta real es mayoritariamente tinta (18 de 20 vinos son Cabernet
// Sauvignon, Carmenere, Shiraz, Garnacha/Carignan o blends de esos). Para
// pescados blancos y ceviche no hay abundancia de blanco — el motor lo dice
// en vez de fingir que sí, y cuando corresponde ofrece una alternativa real
// de otra categoría (espumante, cerveza, un destilado) en vez de forzar un
// tinto que no acompaña al plato.

// --- Detección de varietal a partir del nombre real del producto ---------

const PATRONES_VARIETAL = [
  { tag: 'sauvignon_blanc', re: /sauvignon\s*blanc/i },
  { tag: 'chardonnay', re: /chardon+ay/i },
  { tag: 'moscato_espumante', re: /moscato/i },
  { tag: 'cabernet_franc_blend', re: /cabernet\s*franc/i },
  { tag: 'cabernet_sauvignon', re: /cabernet\s*sauvignon/i },
  { tag: 'carmenere', re: /carmenere/i },
  { tag: 'shiraz', re: /shiraz/i },
  { tag: 'garnacha_carignan', re: /garnacha|carignan/i },
  { tag: 'espumante_neutro', re: /espumante/i },
  { tag: 'tinto_generico', re: /tinto|reserva\b|dark\s*black|red\b/i },
]

export function detectarVarietal(nombre) {
  const n = String(nombre || '')
  for (const { tag, re } of PATRONES_VARIETAL) {
    if (re.test(n)) return tag
  }
  return null
}

// --- Perfiles de plato -----------------------------------------------------
// Cada perfil tiene palabras clave para detectarlo en texto libre, una
// explicación corta del porqué (para mostrarle al cliente, no solo al
// motor), y un orden de preferencia de varietales dentro de VINOS &
// ESPUMANTES. `altBar` es un empate por si el vino ideal no existe en la
// carta: una regex contra nombres de NUESTRO BAR / MOCKTAILS y el motivo.

export const PERFILES = [
  {
    id: 'ceviche',
    etiqueta: 'Ceviche',
    keywords: /ceviche|leche de tigre|crudo/i,
    principio:
      'El limón del ceviche pide un vino con acidez propia — si el vino es menos ácido que el plato, sabe plano al lado.',
    ordenVinos: ['sauvignon_blanc', 'moscato_espumante', 'espumante_neutro'],
    notaEscasez: 'La carta es mayoritariamente tinta — este Sauvignon Blanc es lo más cercano a lo clásico con cítricos.',
    altBar: { re: /corona|cusque/i, motivo: 'una cerveza liviana y bien fría también limpia el paladar entre bocado y bocado' },
  },
  {
    id: 'pescado_blanco',
    etiqueta: 'Pescado blanco',
    keywords: /reineta frita|pescado (blanco|frito)|frito de pescado/i,
    principio: 'Pescado blanco y liviano pide un vino igual de liviano — un tinto con cuerpo lo tapa.',
    ordenVinos: ['sauvignon_blanc', 'moscato_espumante', 'espumante_neutro'],
    notaEscasez: 'La carta es mayoritariamente tinta: este es lo más liviano y fresco que tenemos hoy.',
  },
  {
    id: 'pasta_mariscos',
    etiqueta: 'Pasta con mariscos',
    // Va ANTES que `pescado_salsa`: "Spaguetti en tinta de calamar con salsa
    // de mariscos" contiene literalmente "salsa de mariscos" y con el orden
    // viejo caía en `pescado_salsa` en vez de acá, que es lo correcto para
    // una pasta (bug hermano del de "parrilla", mismo criterio de arreglo:
    // el perfil más específico para el plato real va antes en la lista).
    keywords: /spaguetti|spaghetti|fettuccine|pasta/i,
    principio: 'Pasta con mariscos o tinta de calamar: un blanco con cuerpo o un tinto muy liviano, nunca uno tánico que se pelee con el marisco.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'espumante_neutro'],
  },
  {
    id: 'pescado_salsa',
    etiqueta: 'Pescado en salsa / mariscos',
    keywords: /reineta.*(salsa|camarones|mariscos)|pescado.*salsa|salsa.*mariscos/i,
    principio:
      'La salsa le suma cuerpo y grasa al pescado — un blanco con un poco más de estructura (Chardonnay) lo acompaña mejor que uno muy austero.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'moscato_espumante'],
  },
  {
    id: 'mariscos_arroz',
    etiqueta: 'Arroz o sopa marinera',
    keywords: /marinera|arroz.*marisco|trio marino|fiesta del mar/i,
    principio: 'Plato de mar con cuerpo (arroz, caldo) — un blanco con algo de volumen o un espumante seco lo sostienen sin taparlo.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'espumante_neutro', 'moscato_espumante'],
  },
  {
    id: 'carne_roja_parrilla',
    etiqueta: 'Carne roja a la parrilla',
    // OJO: la palabra genérica "parrilla" sola NO va acá — antes estaba, y
    // como este perfil se evalúa antes que `pulpo_parrilla`, "Pulpo a la
    // parrilla" caía en Cabernet Sauvignon en vez del Carmenere/Garnacha que
    // le corresponde (bug real, encontrado en vivo el 2026-09-17). Este
    // perfil solo matchea por los cortes de carne reales.
    keywords: /tomahawk|bife de chorizo|entrecot|asado de tira|lomo a la orden|lomo grille|parrillada|carne roja/i,
    principio: 'La grasa de una carne roja a la parrilla necesita taninos altos que la corten — ahí un Cabernet Sauvignon o un blend potente rinde mejor.',
    ordenVinos: ['cabernet_sauvignon', 'tinto_generico', 'shiraz', 'carmenere'],
  },
  {
    id: 'guiso_lomo_pobre',
    etiqueta: 'Lomo a lo pobre / guisos de carne',
    keywords: /lomo a lo pobre|guiso|estofado/i,
    principio: 'Carne con huevo y papas fritas: sigue siendo un plato de carne con grasa, pide un tinto con cuerpo pero no necesariamente el más tánico.',
    ordenVinos: ['carmenere', 'cabernet_sauvignon', 'tinto_generico'],
  },
  {
    id: 'lomo_saltado',
    etiqueta: 'Lomo saltado',
    keywords: /lomo saltado|salteado|wok/i,
    principio:
      'Lleva salsa de soya — el umami choca con taninos muy marcados y los vuelve metálicos. Mejor un tinto afrutado y de tanino más suave que un Cabernet estructurado.',
    ordenVinos: ['carmenere', 'garnacha_carignan', 'tinto_generico'],
  },
  {
    id: 'pulpo_parrilla',
    etiqueta: 'Pulpo a la parrilla',
    keywords: /pulpo a la parrilla|pulpo.*bbq/i,
    principio: 'El ahumado de la parrilla y el dulzor de la salsa BBQ piden un tinto frutal de cuerpo medio, sin exceso de tanino.',
    ordenVinos: ['carmenere', 'garnacha_carignan', 'tinto_generico'],
    altBar: { re: /kunstmann miel/i, motivo: 'una cerveza con un toque de miel también hace buen match con el dulzor de la BBQ' },
  },
  {
    id: 'picante',
    etiqueta: 'Picantes (guata, mariscos, pulpo)',
    keywords: /picante/i,
    principio:
      'El picante amplifica el alcohol y el tanino — conviene un tinto de tanino bajo y algo de fruta dulce, o directamente algo con un poco de dulzor que enfríe.',
    ordenVinos: ['garnacha_carignan', 'carmenere', 'moscato_espumante'],
  },
  {
    id: 'cerdo',
    etiqueta: 'Cerdo asado',
    keywords: /cerdo|costillar/i,
    principio: 'El cerdo es más suave que la carne de vacuno — un tinto de cuerpo medio acompaña sin aplastarlo.',
    ordenVinos: ['carmenere', 'garnacha_carignan', 'cabernet_franc_blend', 'tinto_generico'],
  },
  {
    id: 'ave_salsa',
    etiqueta: 'Ave en salsa',
    keywords: /suprema de ave|pollo|ave a la plancha|champignones/i,
    principio: 'Pollo en salsa cremosa o de hongos: un blanco con cuerpo (Chardonnay) o un tinto liviano funcionan mejor que uno muy potente.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'carmenere'],
  },
  {
    id: 'postre_chocolate',
    etiqueta: 'Postre',
    // Ampliado (2026-09-17): la carta real de POSTRES & TENTACIONES tiene
    // varios que no contienen ninguna de las palabras originales
    // (chocolate/postre/torta/helado/dulce) — tiramisú, panacotta, suspiro
    // limeño, mousse de maracuyá, leche asada, fondue con nutella — y antes
    // cayían al perfil genérico en vez de a la regla de vino dulce/espumante.
    keywords:
      /chocolate|postre|torta|helado|dulce|tiramis[uú]|panacotta|panna\s*cotta|suspiro|mousse|leche asada|fondue|nutella|cheesecake|volc[aá]n|tentaci[oó]n/i,
    principio: 'Regla de oro con postres: el vino tiene que ser más dulce que el plato, si no, el vino se siente amargo al lado.',
    ordenVinos: ['moscato_espumante', 'espumante_neutro'],
    altBar: { re: /baileys|havana añejo/i, motivo: 'un licor dulce (Baileys o un ron añejo) es una alternativa clásica para acompañar chocolate' },
  },
  {
    id: 'quesos',
    etiqueta: 'Tabla de quesos',
    keywords: /queso/i,
    principio: 'Con quesos suaves o de cabra, un blanco con acidez limpia mejor que un tinto; con quesos más curados, un tinto de cuerpo medio funciona.',
    ordenVinos: ['sauvignon_blanc', 'carmenere', 'tinto_generico'],
  },
]

export const PERFIL_GENERICO = {
  id: 'general',
  etiqueta: 'Algo versátil',
  principio: 'Sin un plato específico, vamos a lo seguro: un tinto de cuerpo medio que acompaña casi cualquier cosa de la carta sin imponerse.',
  ordenVinos: ['carmenere', 'tinto_generico', 'cabernet_sauvignon'],
}

// Detecta el primer perfil cuyo patrón matchee el texto libre del cliente.
export function detectarPerfil(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  for (const perfil of PERFILES) {
    if (perfil.keywords.test(t)) return perfil
  }
  return null
}

// Arma la recomendación final cruzando el perfil contra los productos reales
// ya cargados desde Supabase (separados por categoría por quien llama).
// Devuelve null si no hay ningún vino disponible para ningún varietal del
// perfil (carta vacía / todo agotado) — quien llama debe manejar ese caso.
export function armarRecomendacion(perfil, vinosDisponibles, bebidasBar = []) {
  const vinosConVarietal = vinosDisponibles
    .map((v) => ({ ...v, _varietal: detectarVarietal(v.name) }))
    .filter((v) => v._varietal)

  let vinoElegido = null
  let varietalElegido = null
  for (const tag of perfil.ordenVinos) {
    const match = vinosConVarietal.find((v) => v._varietal === tag)
    if (match) {
      vinoElegido = match
      varietalElegido = tag
      break
    }
  }

  // Es "escasez" (mostrar la nota de honestidad) si lo que encontramos no es
  // la primera opción de la lista de preferencia del perfil.
  const esEscasez = varietalElegido && varietalElegido !== perfil.ordenVinos[0]

  let alternativaBar = null
  if (perfil.altBar) {
    alternativaBar = bebidasBar.find((b) => perfil.altBar.re.test(b.name)) || null
  }

  return {
    perfil,
    vino: vinoElegido,
    esEscasez,
    notaEscasez: esEscasez ? perfil.notaEscasez : null,
    alternativaBar: alternativaBar ? { item: alternativaBar, motivo: perfil.altBar.motivo } : null,
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

const VARIETALES_LIVIANOS = new Set(['sauvignon_blanc', 'chardonnay', 'moscato_espumante', 'espumante_neutro'])

function afinidad(perfil, tag) {
  const i = perfil.ordenVinos.indexOf(tag)
  return i < 0 ? 0 : 1 - i / perfil.ordenVinos.length
}

function ajusteDe(perfil, vino) {
  const a = afinidad(perfil, vino._varietal)
  return a >= 0.6 ? 'bien' : a >= 0.3 ? 'justo' : 'mal'
}

// "liviano" = blancos y espumantes; "tinto" = el resto. Se decide por la
// primera opción del perfil del plato.
function estiloDelPlato(perfil) {
  return VARIETALES_LIVIANOS.has(perfil.ordenVinos[0]) ? 'liviano' : 'tinto'
}

// Empate → gana el primero de la lista (mismo criterio que armarRecomendacion,
// que usa find()), para que un plato solo dé siempre el mismo vino.
function mejorVinoPara(platos, vinosConVarietal) {
  let mejor = null
  let mejorPuntaje = 0
  for (const v of vinosConVarietal) {
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
  const vinos = vinosDisponibles
    .map((v) => ({ ...v, _varietal: detectarVarietal(v.name) }))
    .filter((v) => v._varietal)

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
// emojis ni signos, sin dobles espacios, en mayúscula. Así "🌶️PICANTE DE
// PULPO CON ARROZ" matchea igual que si el admin le sacara el emoji mañana.
export function normalizarNombrePlato(nombre) {
  return String(nombre || '')
    .toUpperCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Categorías reales de `menu_items` que a propósito NO participan del
// maridaje: NIÑOS (nadie pide vino para el menú de niños) y GUARNICIONES
// (son acompañamientos, no un plato para maridar por sí solo).
export const CATEGORIAS_SIN_MARIDAJE = ['NIÑOS', 'GUARNICIONES']

const MAPEO_PLATOS = {
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
  'PANACOTTA CON SALSA DE FRUTILLA': 'postre_chocolate',
  'SUSPIRO LIMEÑO': 'postre_chocolate',
  'TENTACION X 4 UNIDADES': 'postre_chocolate',
  TIRAMISÚ: 'postre_chocolate',
  'VOLCÁN DE CHOCOLATE CON HELADO': 'postre_chocolate',
  'BROWNIE CON HELADO': 'postre_chocolate',
  'CHEESECAKE CON SALSA DE FRUTILLA MANGO O MARACUYA': 'postre_chocolate',
  'COPA DE HELADO': 'postre_chocolate',
  'COPA DE HELADO 1 SABOR ACAI': 'postre_chocolate',
  'FONDUE DE FRUTILLAS CON NUTELLA': 'postre_chocolate',
  'LECHE ASADA': 'postre_chocolate',
  'MOUSSE DE MARACUYA EN SALSA DE MARACUYA': 'postre_chocolate',
}

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
