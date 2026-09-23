import { useCallback, useEffect, useState } from 'react'
import TRADUCCIONES from '../data/carta_traducciones.json'

// Idiomas de la carta pública (/carta2). Aparte de i18n/reservas.js a propósito:
// la reserva solo está en ES/EN porque el personal confirma por WhatsApp en esos
// idiomas; la carta es de solo lectura, así que puede ofrecer más.
export const IDIOMAS_CARTA = ['es', 'en', 'pt']

const CLAVE_LS = 'varos_idioma_carta'

const UI = {
  es: {
    error_carga: 'No se pudo cargar la carta:',
    vacia: 'Todavía no hay platos publicados en la carta.',
    pedidos: 'Pedidos y Reservas al',
    sommelier: 'Sommelier',
    nuevo: 'NUEVO'
  },
  en: {
    error_carga: 'The menu could not be loaded:',
    vacia: 'There are no dishes on the menu yet.',
    pedidos: 'Orders and Reservations at',
    sommelier: 'Sommelier',
    nuevo: 'NEW'
  },
  pt: {
    error_carga: 'Não foi possível carregar o cardápio:',
    vacia: 'Ainda não há pratos publicados no cardápio.',
    pedidos: 'Pedidos e Reservas pelo',
    sommelier: 'Sommelier',
    nuevo: 'NOVO'
  }
}

// Claves = categorías reales de menu_items, normalizadas (mayúscula, sin tildes).
const CATEGORIAS = {
  'MENU DEL DIA': { en: 'Menu of the Day', pt: 'Menu do Dia' },
  'NUESTRO BAR': { en: 'Our Bar', pt: 'Nosso Bar' },
  APERITIVOS: { en: 'Cocktails & Aperitifs', pt: 'Aperitivos e Drinks' },
  'ENTRADAS FRIAS Y CALIENTES': { en: 'Cold & Hot Starters', pt: 'Entradas Frias e Quentes' },
  'PLATOS PRINCIPALES': { en: 'Main Courses', pt: 'Pratos Principais' },
  NINOS: { en: 'Kids', pt: 'Infantil' },
  GUARNICIONES: { en: 'Side Dishes', pt: 'Acompanhamentos' },
  'POSTRES & TENTACIONES': { en: 'Desserts & Temptations', pt: 'Sobremesas e Tentações' },
  'MOCKTAILS (SIN ALCOHOL)': { en: 'Mocktails (Alcohol-Free)', pt: 'Mocktails (Sem Álcool)' },
  'VINOS & ESPUMANTES': { en: 'Wines & Sparkling', pt: 'Vinhos e Espumantes' }
}

// Etiquetas de curso en la descripción del Menú del Día ("Entrada: ...").
const CURSOS = {
  entrada: { en: 'Starter', pt: 'Entrada' },
  entradas: { en: 'Starters', pt: 'Entradas' },
  'plato principal': { en: 'Main course', pt: 'Prato principal' },
  principal: { en: 'Main course', pt: 'Prato principal' },
  postre: { en: 'Dessert', pt: 'Sobremesa' },
  postres: { en: 'Desserts', pt: 'Sobremesas' }
}

function sinTildes(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function normalizarCategoria(s) {
  return sinTildes(s).toUpperCase().trim()
}

function idiomaInicial() {
  try {
    const desdeUrl = new URLSearchParams(window.location.search).get('lang')
    if (IDIOMAS_CARTA.includes(desdeUrl)) return desdeUrl
    const desdeLS = window.localStorage.getItem(CLAVE_LS)
    if (IDIOMAS_CARTA.includes(desdeLS)) return desdeLS
  } catch {
    /* storage bloqueado: español */
  }
  return 'es'
}

export function useIdiomaCarta() {
  const [idioma, setIdiomaState] = useState(idiomaInicial)

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_LS, idioma)
    } catch {
      /* no crítico */
    }
    document.documentElement.lang = idioma
  }, [idioma])

  const setIdioma = useCallback((v) => setIdiomaState(IDIOMAS_CARTA.includes(v) ? v : 'es'), [])
  const t = useCallback((clave) => (UI[idioma] ?? UI.es)[clave] ?? UI.es[clave] ?? clave, [idioma])

  // Todo cae al español si falta la traducción (plato nuevo aún sin traducir).
  const categoria = useCallback(
    (nombre) => (idioma === 'es' ? nombre : CATEGORIAS[normalizarCategoria(nombre)]?.[idioma] ?? nombre),
    [idioma]
  )
  const plato = useCallback(
    (item) => {
      if (idioma === 'es') return { nombre: item.name, descripcion: item.description }
      const tr = TRADUCCIONES[item.name]?.[idioma]
      return {
        nombre: tr?.n || item.name,
        // Sin "d" (p. ej. Menú del Día, que cambia a diario) queda la original y
        // DescripcionPlato traduce etiquetas y platos línea por línea.
        descripcion: tr?.d || item.description
      }
    },
    [idioma]
  )
  const etiquetaCurso = useCallback(
    (texto) => (idioma === 'es' ? texto : CURSOS[sinTildes(texto).toLowerCase().trim()]?.[idioma] ?? texto),
    [idioma]
  )
  const nombrePlatoSuelto = useCallback(
    (texto) => {
      if (idioma === 'es') return texto
      const prefijo = texto.match(/^[*\s-]*/)[0]
      const limpio = texto.slice(prefijo.length).trim()
      const n = TRADUCCIONES[limpio]?.[idioma]?.n
      return n ? prefijo + n : texto
    },
    [idioma]
  )

  return { idioma, setIdioma, t, categoria, plato, etiquetaCurso, nombrePlatoSuelto }
}
