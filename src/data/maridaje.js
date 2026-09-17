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
    keywords: /tomahawk|bife de chorizo|entrecot|asado de tira|lomo a la orden|lomo grille|parrillada|carne roja|parrilla/i,
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
    id: 'pasta_mariscos',
    etiqueta: 'Pasta con mariscos',
    keywords: /spaguetti|spaghetti|fettuccine|pasta/i,
    principio: 'Pasta con mariscos o tinta de calamar: un blanco con cuerpo o un tinto muy liviano, nunca uno tánico que se pelee con el marisco.',
    ordenVinos: ['chardonnay', 'sauvignon_blanc', 'espumante_neutro'],
  },
  {
    id: 'postre_chocolate',
    etiqueta: 'Postre de chocolate',
    keywords: /chocolate|postre|torta|helado|dulce/i,
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

// Chips rápidos: preparaciones reales de PLATOS PRINCIPALES / ENTRADAS de la
// carta actual, no inventadas — cubren los perfiles de arriba.
export const CHIPS_SUGERIDOS = [
  'Ceviche',
  'Carne a la parrilla',
  'Pulpo a la parrilla',
  'Reineta frita',
  'Pescado en salsa de mariscos',
  'Lomo saltado',
  'Picante de mariscos',
  'Costillar de cerdo',
  'Ave en salsa',
  'Postre de chocolate',
]
