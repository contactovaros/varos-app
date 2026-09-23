import { useCallback, useEffect, useState } from 'react'
import TRADUCCIONES from '../data/carta_traducciones.json'

// Idiomas de la carta pública (/carta2). Aparte de i18n/reservas.js a propósito:
// la reserva solo está en ES/EN porque el personal confirma por WhatsApp en esos
// idiomas; la carta es de solo lectura, así que puede ofrecer más.
export const IDIOMAS_CARTA = ['es', 'en', 'pt', 'it', 'zh']

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
  },
  it: {
    error_carga: 'Impossibile caricare il menu:',
    vacia: 'Non ci sono ancora piatti nel menu.',
    pedidos: 'Ordini e Prenotazioni al',
    sommelier: 'Sommelier',
    nuevo: 'NUOVO'
  },
  zh: {
    error_carga: '无法加载菜单：',
    vacia: '菜单中暂无菜品。',
    pedidos: '订餐与预订电话',
    sommelier: '侍酒师',
    nuevo: '新'
  }
}

// Claves = categorías reales de menu_items, normalizadas (mayúscula, sin tildes).
const CATEGORIAS = {
  'MENU DEL DIA': { en: 'Menu of the Day', pt: 'Menu do Dia', it: 'Menù del Giorno', zh: '今日套餐' },
  'NUESTRO BAR': { en: 'Our Bar', pt: 'Nosso Bar', it: 'Il Nostro Bar', zh: '我们的酒吧' },
  APERITIVOS: { en: 'Cocktails & Aperitifs', pt: 'Aperitivos e Drinks', it: 'Aperitivi e Cocktail', zh: '开胃酒与鸡尾酒' },
  'ENTRADAS FRIAS Y CALIENTES': { en: 'Cold & Hot Starters', pt: 'Entradas Frias e Quentes', it: 'Antipasti Freddi e Caldi', zh: '冷热前菜' },
  'PLATOS PRINCIPALES': { en: 'Main Courses', pt: 'Pratos Principais', it: 'Piatti Principali', zh: '主菜' },
  NINOS: { en: 'Kids', pt: 'Infantil', it: 'Bambini', zh: '儿童餐' },
  GUARNICIONES: { en: 'Side Dishes', pt: 'Acompanhamentos', it: 'Contorni', zh: '配菜' },
  'POSTRES & TENTACIONES': { en: 'Desserts & Temptations', pt: 'Sobremesas e Tentações', it: 'Dolci e Tentazioni', zh: '甜点' },
  'MOCKTAILS (SIN ALCOHOL)': { en: 'Mocktails (Alcohol-Free)', pt: 'Mocktails (Sem Álcool)', it: 'Mocktail (Analcolici)', zh: '无酒精特饮' },
  'VINOS & ESPUMANTES': { en: 'Wines & Sparkling', pt: 'Vinhos e Espumantes', it: 'Vini e Spumanti', zh: '葡萄酒与起泡酒' }
}

// Etiquetas de curso en la descripción del Menú del Día ("Entrada: ...").
const CURSOS = {
  entrada: { en: 'Starter', pt: 'Entrada', it: 'Antipasto', zh: '前菜' },
  entradas: { en: 'Starters', pt: 'Entradas', it: 'Antipasti', zh: '前菜' },
  'plato principal': { en: 'Main course', pt: 'Prato principal', it: 'Piatto principale', zh: '主菜' },
  principal: { en: 'Main course', pt: 'Prato principal', it: 'Piatto principale', zh: '主菜' },
  postre: { en: 'Dessert', pt: 'Sobremesa', it: 'Dolce', zh: '甜点' },
  postres: { en: 'Desserts', pt: 'Sobremesas', it: 'Dolci', zh: '甜点' }
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
