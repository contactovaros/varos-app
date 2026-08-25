// =============================================================================
// PLANO DE ARQUITECTURA — recinto de 9,00 × 24,00 m
//
// Toda la geometría trabaja en METROS: el viewBox del SVG está en metros, así
// que no hay conversiones a píxeles en ningún lado (el zoom solo cambia el
// width/height del <svg>). Los grosores de línea y los cuerpos de texto también
// van en metros — por eso se ven valores como 0.03 o 0.17.
//
// Este módulo lo comparten el editor de admin (AdminPlano.jsx) y la vista
// pública de solo lectura (Plano.jsx). Devuelve strings de SVG en vez de JSX
// para que las dos pantallas dibujen exactamente lo mismo.
// =============================================================================

// El recinto ya NO es fijo: el admin cambia ancho y largo desde el editor.
// RECINTO, LIMITES, MUROS y VIEWBOX se MUTAN en su lugar (setRecinto) en vez de
// reasignarse, para que todo lo que ya los tiene importados —flujoOperativo.js
// y las tres pantallas— siga leyendo valores vivos sin recibir el recinto por
// parámetro en cada llamada. La llamada inicial a setRecinto está al final del
// archivo, después de que MUROS exista.
export const MEDIDAS = { min: 3, max: 60 }

export const RECINTO = { W: 9, H: 24, WALL: 0.15, COCINA_FIN: 6.9 }
export const LIMITES = { x0: 0, y0: 0, x1: 0, y1: 0 }
export const VIEWBOX = { x: -1.55, y: -1.35, w: 0, h: 0 }
export const PPM = 30 // píxeles por metro a zoom 1

const acotar = (v, min, max) => Math.min(Math.max(v, min), max)

function recalcularRecinto() {
  LIMITES.x0 = RECINTO.WALL
  LIMITES.y0 = RECINTO.WALL
  LIMITES.x1 = RECINTO.W - RECINTO.WALL
  LIMITES.y1 = RECINTO.H - RECINTO.WALL
  MUROS.norte.fijo = RECINTO.WALL / 2
  MUROS.sur.fijo = RECINTO.H - RECINTO.WALL / 2
  MUROS.oeste.fijo = RECINTO.WALL / 2
  MUROS.este.fijo = RECINTO.W - RECINTO.WALL / 2
  // margen fijo alrededor: cotas a la izquierda y arriba, rótulos de zona a la
  // derecha. Los mismos números que tenía el recinto original de 9 × 24.
  VIEWBOX.w = RECINTO.W + 3.15
  VIEWBOX.h = RECINTO.H + 2.4
}

// `corte` es la línea que separa cocina de salón. En 0 el plano no tiene zona
// de cocina: es un comedor entero, que es el caso normal de un salón nuevo.
export function setRecinto(cfg) {
  const c = cfg || {}
  const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const ancho = num(c.ancho)
  const largo = num(c.largo)
  if (ancho !== null) RECINTO.W = acotar(ancho, MEDIDAS.min, MEDIDAS.max)
  if (largo !== null) RECINTO.H = acotar(largo, MEDIDAS.min, MEDIDAS.max)
  const corte = num(c.corte)
  if (corte !== null) RECINTO.COCINA_FIN = corte < 0.5 ? 0 : acotar(corte, 1, RECINTO.H - 1)
  else if (RECINTO.COCINA_FIN > 0) RECINTO.COCINA_FIN = acotar(RECINTO.COCINA_FIN, 1, RECINTO.H - 1)
  recalcularRecinto()
  return recintoActual()
}

export function recintoActual() {
  return { ancho: RECINTO.W, largo: RECINTO.H, corte: RECINTO.COCINA_FIN }
}

// Un plano guardado antes de esta versión trae `datos` como array pelado; los
// nuevos guardan { items, corte } para no perder la línea de zonificación.
export function extraerConfig(datos) {
  if (datos && !Array.isArray(datos) && typeof datos === 'object') {
    return { items: Array.isArray(datos.items) ? datos.items : [], corte: datos.corte }
  }
  return { items: Array.isArray(datos) ? datos : [], corte: undefined }
}

export function empaquetar(items, corte) {
  return { items, corte }
}

// Paleta: valores literales del design system de Varo's (tailwind.config.js).
// El SVG no puede usar clases de Tailwind, así que van los hex a mano.
export const P = {
  paper: '#1B1410',      // fondo de la lámina
  ink: '#FFF8F1',        // muros y texto principal
  ink2: '#C9BCAF',
  ink3: '#9AA1A9',       // silver
  rule: '#3A2E26',
  accent: '#FF7A1A',     // ember — cotas, selección, acentos
  wood: '#7A5432',
  wood2: '#8E6540',
  woodLine: '#4E3320',
  steel: '#3E444A',
  steel2: '#31363B',
  steelLine: '#9AA1A9',
  glass: '#3C5A63',
  green: '#4E6B44',
  green2: '#3B5233',
  canopy: '#7A6544',
  canopyLine: '#B5732A', // bronze
  tile: '#241D19',
  tileLine: '#33291F'
}

const F_ROT = "'Space Grotesk', sans-serif"
const F_NUM = "'JetBrains Mono', monospace"

// `sillas` es el número de sillas que el objeto dibuja a su alrededor (el admin
// lo cambia por objeto). `fogones` hace lo mismo con las bocas de una cocina.
// Las medidas w × h son el mueble en sí; las sillas se dibujan por fuera y se
// tienen en cuenta al encerrar el objeto dentro del recinto (ver clampItem).
export const SPECS = {
  mesa:        { label: 'MESA',              w: 2.2,  h: 2.2,  kind: 'mesa',   req: 'mesa', sillas: 5 },
  mesaRedonda: { label: 'MESA REDONDA',      w: 1.1,  h: 1.1,  kind: 'mesaR',  req: 'mesa', sillas: 4 },
  mesaCuadrada:{ label: 'MESA CUADRADA',     w: 0.8,  h: 0.8,  kind: 'mesaC',  req: 'mesa', sillas: 4 },
  mesaRect:    { label: 'MESA 1,60 × 0,80',  w: 1.6,  h: 0.8,  kind: 'mesaC',  req: 'mesa', sillas: 6 },
  mesaLarga:   { label: 'MESA LARGA',        w: 2.4,  h: 0.9,  kind: 'mesaC',  req: 'mesa', sillas: 8 },
  silla:       { label: 'SILLA',             w: 0.45, h: 0.45, kind: 'silla',  req: 'silla', out: true },
  barra:       { label: 'BARRA',             w: 3,    h: 0.6,  kind: 'barra',  req: 'barra', sillas: 4 },
  bar:         { label: 'BAR',               w: 2.6,  h: 1.2,  kind: 'bar',    req: 'barra' },
  visi:        { label: 'VISI COOLER',       w: 0.9,  h: 0.75, kind: 'visi',   req: 'visi'   },
  congeladora: { label: 'CONGELADORA',       w: 1.3,  h: 0.75, kind: 'cong',   req: 'cong'   },
  horno:       { label: 'HORNO',             w: 0.8,  h: 0.75, kind: 'horno',  req: 'horno'  },
  hornoDoble:  { label: 'HORNO DOBLE',       w: 0.9,  h: 0.95, kind: 'horno',  req: 'horno'  },
  // Una sola familia de cocinas: cambia el número de fogones y la medida.
  cocina:      { label: 'COCINA 2 FOGONES',  w: 0.9,  h: 0.6,  kind: 'cocina', req: 'cocina', fogones: 2 },
  cocina1:     { label: 'COCINA 1 FOGÓN',    w: 0.5,  h: 0.6,  kind: 'cocina', req: 'cocina', fogones: 1 },
  cocina2:     { label: 'COCINA 2 FOGONES',  w: 0.9,  h: 0.6,  kind: 'cocina', req: 'cocina', fogones: 2 },
  cocina3:     { label: 'COCINA 3 FOGONES',  w: 1.2,  h: 0.6,  kind: 'cocina', req: 'cocina', fogones: 3 },
  cocina4:     { label: 'COCINA 4 FOGONES',  w: 0.9,  h: 0.8,  kind: 'cocina', req: 'cocina', fogones: 4 },
  cocina5:     { label: 'COCINA 5 FOGONES',  w: 1.2,  h: 0.8,  kind: 'cocina', req: 'cocina', fogones: 5 },
  cocina6:     { label: 'COCINA 6 FOGONES',  w: 1.2,  h: 0.8,  kind: 'cocina', req: 'cocina', fogones: 6 },
  meson:       { label: 'MESÓN',             w: 2,    h: 0.7,  kind: 'meson',  req: 'meson'  },
  meson300:    { label: 'MESÓN 3,00 × 0,50', w: 3,    h: 0.5,  kind: 'meson',  req: 'm300'   },
  meson180:    { label: 'MESÓN 1,80 × 0,40', w: 1.8,  h: 0.4,  kind: 'meson',  req: 'm180'   },
  mesatrabajo: { label: 'MESA 1,50 × 0,70',  w: 1.5,  h: 0.7,  kind: 'meson',  req: 'mtrab'  },
  repisa:      { label: 'REPISA 1,00 × 0,50',w: 1,    h: 0.5,  kind: 'repisa', req: 'repisa' },
  lavaplatos:  { label: 'LAVAPLATOS 0,50',   w: 0.5,  h: 0.5,  kind: 'lava',   req: 'lava', out: true },
  despacho:    { label: 'BARRA DE DESPACHO', w: 3.6,  h: 0.6,  kind: 'desp',   req: 'desp'   },
  maceta:      { label: 'MACETA',            w: 0.6,  h: 0.6,  kind: 'planta', req: 'maceta', out: true },
  // Los accesos viven EN el muro: no se posicionan por x/y libre sino por
  // (muro, corrimiento a lo largo de ese muro). Ver ajustarPuerta().
  puertaDoble:  { label: 'ACCESO PRINCIPAL',   w: 1.8, h: RECINTO.WALL, kind: 'puerta', req: 'puerta' },
  puertaSimple: { label: 'ACCESO DE SERVICIO', w: 0.9, h: RECINTO.WALL, kind: 'puerta', req: 'puerta' }
}

// Cada muro, con la coordenada fija de su eje central y hacia dónde queda el
// interior del recinto. `giro` orienta el dibujo de la puerta: el eje X local
// corre a lo largo del muro y el eje Y local apunta hacia adentro.
export const MUROS = {
  norte: { eje: 'h', fijo: RECINTO.WALL / 2,             giro: 0,   nombre: 'Muro norte (fondo)' },
  sur:   { eje: 'h', fijo: RECINTO.H - RECINTO.WALL / 2, giro: 180, nombre: 'Muro sur (frente)' },
  oeste: { eje: 'v', fijo: RECINTO.WALL / 2,             giro: 270, nombre: 'Muro oeste (izq.)' },
  este:  { eje: 'v', fijo: RECINTO.W - RECINTO.WALL / 2, giro: 90,  nombre: 'Muro este (der.)' }
}

// El programa pedido por el cliente. La pantalla compara contra esto en vivo.
export const REQUERIDOS = [
  { req: 'mesa',   name: 'Mesa redonda c/ quitasol', n: 10 },
  { req: 'silla',  name: 'Sillas (5 por mesa)',      n: 50, derivado: true },
  { req: 'visi',   name: 'Visi Cooler',              n: 2 },
  { req: 'cong',   name: 'Congeladora',              n: 1 },
  { req: 'horno',  name: 'Horno',                    n: 1 },
  { req: 'cocina', name: 'Cocina 2 fogones',         n: 1 },
  { req: 'm300',   name: 'Mesón 3,00 × 0,50',        n: 3 },
  { req: 'm180',   name: 'Mesón 1,80 × 0,40',        n: 1 },
  { req: 'repisa', name: 'Repisa 1,00 × 0,50',       n: 3 },
  { req: 'mtrab',  name: 'Mesa 1,50 × 0,70',         n: 1 }
]

export const COMPLEMENTARIOS = [
  { req: 'puerta', name: 'Accesos (puertas)' },
  { req: 'lava',   name: 'Lavaplatos 0,50' },
  { req: 'desp',   name: 'Barra de despacho' },
  { req: 'barra',  name: 'Barras y bar' },
  { req: 'meson',  name: 'Mesones libres' },
  { req: 'maceta', name: 'Maceta / vegetación' }
]

export const PALETA_AGREGAR = [
  { cat: 'Mesas', list: [
    ['mesa', 'Mesa + quitasol', 'Ø2,20 · 5 sillas'],
    ['mesaRedonda', 'Mesa redonda', 'Ø1,10 · 4 sillas'],
    ['mesaCuadrada', 'Mesa cuadrada', '0,80 × 0,80 · 4'],
    ['mesaRect', 'Mesa rectangular', '1,60 × 0,80 · 6'],
    ['mesaLarga', 'Mesa larga', '2,40 × 0,90 · 8'],
    ['silla', 'Silla suelta', '0,45 × 0,45']
  ] },
  { cat: 'Bar y barras', list: [
    ['barra', 'Barra recta', '3,00 × 0,60'],
    ['bar', 'Bar (isla)', '2,60 × 1,20'],
    ['despacho', 'Barra despacho', '3,60 × 0,60']
  ] },
  { cat: 'Cocción', list: [
    ['cocina1', 'Cocina 1 fogón', '0,50 × 0,60'],
    ['cocina2', 'Cocina 2 fogones', '0,90 × 0,60'],
    ['cocina3', 'Cocina 3 fogones', '1,20 × 0,60'],
    ['cocina4', 'Cocina 4 fogones', '0,90 × 0,80'],
    ['cocina5', 'Cocina 5 fogones', '1,20 × 0,80'],
    ['cocina6', 'Cocina 6 fogones', '1,20 × 0,80'],
    ['horno', 'Horno', '0,80 × 0,75'],
    ['hornoDoble', 'Horno doble', '0,90 × 0,95']
  ] },
  { cat: 'Frío', list: [['visi', 'Visi Cooler', '0,90 × 0,75'], ['congeladora', 'Congeladora', '1,30 × 0,75']] },
  { cat: 'Mesones y trabajo', list: [
    ['meson', 'Mesón libre', '2,00 × 0,70'],
    ['meson300', 'Mesón 3,00', '3,00 × 0,50'],
    ['meson180', 'Mesón 1,80', '1,80 × 0,40'],
    ['mesatrabajo', 'Mesa de trabajo', '1,50 × 0,70'],
    ['lavaplatos', 'Lavaplatos', '0,50 × 0,50']
  ] },
  { cat: 'Almacenamiento y verde', list: [['repisa', 'Repisa', '1,00 × 0,50'], ['maceta', 'Vegetación', 'Ø0,60']] },
  { cat: 'Accesos', list: [['puertaDoble', 'Puerta doble', '1,80 m'], ['puertaSimple', 'Puerta simple', '0,90 m']] }
]

// Todo lo que se puede rodear de sillas. El resto ignora el campo.
export const CON_SILLAS = ['mesa', 'mesaR', 'mesaC', 'barra']

export function sillasDe(it) {
  const s = SPECS[it.type]
  if (!s) return 0
  if (s.kind === 'silla') return 1
  if (!CON_SILLAS.includes(s.kind)) return 0
  const n = it.sillas === undefined || it.sillas === null ? s.sillas : it.sillas
  return Math.max(0, Math.min(24, Math.round(Number(n) || 0)))
}

export function fogonesDe(it) {
  const s = SPECS[it.type]
  if (!s || s.kind !== 'cocina') return 0
  const n = it.fogones === undefined || it.fogones === null ? s.fogones : it.fogones
  return Math.max(1, Math.min(6, Math.round(Number(n) || 1)))
}

let contador = 1
export function nuevoId() { return 'e' + (contador++) + '_' + Math.random().toString(36).slice(2, 6) }

function mk(type, x, y, rot, label) {
  const s = SPECS[type]
  const it = { id: nuevoId(), type, x, y, w: s.w, h: s.h, rot: rot || 0, label: label || s.label }
  if (s.sillas !== undefined) it.sillas = s.sillas
  if (s.fogones !== undefined) it.fogones = s.fogones
  return it
}

// Una puerta se define por el muro donde vive y su corrimiento a lo largo de
// ese muro; x/y/rot se derivan de eso en ajustarPuerta().
export function mkPuerta(type, muro, corrimiento, opciones) {
  const s = SPECS[type]
  const o = opciones || {}
  return ajustarPuerta({
    id: nuevoId(),
    type,
    muro,
    corrimiento,
    x: 0,
    y: 0,
    w: o.w || s.w,
    h: RECINTO.WALL,
    rot: 0,
    hojas: o.hojas || (type === 'puertaDoble' ? 2 : 1),
    mano: o.mano || 1,
    label: o.label || s.label
  })
}

// Distribución inicial: cocina al fondo, clientes hacia el acceso.
// Circuito de cocina: almacenamiento → preparación → cocción → despacho.
export function layoutInicial() {
  const it = []
  // frío y almacenamiento contra el muro posterior
  it.push(mk('visi', 0.75, 0.55, 0, 'VISI COOLER 1'))
  it.push(mk('visi', 1.75, 0.55, 0, 'VISI COOLER 2'))
  it.push(mk('congeladora', 2.95, 0.55, 0))
  it.push(mk('repisa', 5.1, 0.42, 0, 'REPISA 1'))
  it.push(mk('repisa', 6.2, 0.42, 0, 'REPISA 2'))
  it.push(mk('repisa', 7.3, 0.42, 0, 'REPISA 3'))
  // preparación
  it.push(mk('meson300', 0.4, 2.9, 90))
  it.push(mk('meson300', 8.6, 2.9, 90))
  it.push(mk('mesatrabajo', 4.5, 2.35, 0))
  // cocción y emplatado
  it.push(mk('meson300', 2.2, 5.6, 0))
  it.push(mk('lavaplatos', 4.1, 5.6, 0))
  it.push(mk('horno', 5.35, 5.55, 0))
  it.push(mk('cocina', 6.5, 5.6, 0))
  it.push(mk('meson180', 8.65, 5.4, 90))
  // despacho
  it.push(mk('despacho', 4.5, 6.5, 0))
  // clientes: 10 mesas en dos hileras, pasillo central de 1,80 m
  const cols = [2.45, 6.55]
  const rows = [8.85, 12, 15.15, 18.3, 21.45]
  let n = 0
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 5; r++) {
      n++
      it.push(mk('mesa', cols[c], rows[r], 0, 'MESA ' + String(n).padStart(2, '0')))
    }
  }
  // vegetación discreta
  it.push(mk('maceta', 0.6, 7.55, 0))
  it.push(mk('maceta', 8.4, 7.55, 0))
  it.push(mk('maceta', 0.6, 23.1, 0))
  it.push(mk('maceta', 8.4, 23.1, 0))
  // accesos: el principal en el frente, el de servicio junto a la zona de frío
  it.push(mkPuerta('puertaDoble', 'sur', 4.5))
  it.push(mkPuerta('puertaSimple', 'norte', 4.1))
  return it
}

// Un comedor nuevo arranca vacío: sólo el acceso, para dibujarlo desde cero.
export function layoutVacio() {
  return [mkPuerta('puertaDoble', 'sur', RECINTO.W / 2)]
}

// ---------------------------------------------------------------- geometría
const rad = (d) => (d * Math.PI) / 180
export const fmt = (v) => Number(v).toFixed(2).replace('.', ',')
export const snap = (v, g) => Math.round(v / g) * g

export function halfExtents(w, h, rot) {
  const c = Math.abs(Math.cos(rad(rot)))
  const s = Math.abs(Math.sin(rad(rot)))
  return { hw: (w * c + h * s) / 2, hh: (w * s + h * c) / 2 }
}

// Ningún objeto puede salir del rectángulo, ni siquiera girado: se compara la
// caja envolvente ya rotada contra la cara interior de los muros.
// Una puerta no se clampea contra el interior: vive dentro del espesor del
// muro. Se limita el corrimiento para que el vano no se coma las esquinas.
export function ajustarPuerta(p) {
  const m = MUROS[p.muro] || MUROS.sur
  const largoMuro = m.eje === 'h' ? RECINTO.W : RECINTO.H
  p.w = Math.min(Math.max(0.6, p.w), largoMuro - 2 * RECINTO.WALL - 0.3)
  p.h = RECINTO.WALL
  const min = RECINTO.WALL + p.w / 2 + 0.05
  const max = largoMuro - RECINTO.WALL - p.w / 2 - 0.05
  p.corrimiento = Math.min(Math.max(p.corrimiento, min), max)
  if (m.eje === 'h') { p.x = p.corrimiento; p.y = m.fijo } else { p.x = m.fijo; p.y = p.corrimiento }
  p.rot = m.giro
  return p
}

// Al arrastrar, la puerta se pega al muro más cercano y se desliza por él.
export function pegarPuertaA(p, punto) {
  const d = {
    norte: Math.abs(punto.y - MUROS.norte.fijo),
    sur: Math.abs(punto.y - MUROS.sur.fijo),
    oeste: Math.abs(punto.x - MUROS.oeste.fijo),
    este: Math.abs(punto.x - MUROS.este.fijo)
  }
  const muro = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b))
  p.muro = muro
  p.corrimiento = MUROS[muro].eje === 'h' ? punto.x : punto.y
  return ajustarPuerta(p)
}

// Las sillas de una mesa nueva se dibujan POR FUERA del mueble (a diferencia de
// la mesa con quitasol, donde w es el conjunto entero). Para que no queden
// metidas dentro del muro, el encierro usa la caja del mueble más esa banda.
export const BANDA_SILLA = 0.52
const KINDS_BANDA = ['mesaR', 'mesaC', 'barra']

export function bandaDe(it) {
  const s = SPECS[it.type]
  if (!s || !KINDS_BANDA.includes(s.kind)) return 0
  return sillasDe(it) > 0 ? BANDA_SILLA : 0
}

export function clampItem(it) {
  if (SPECS[it.type] && SPECS[it.type].kind === 'puerta') return ajustarPuerta(it)
  const roomW = LIMITES.x1 - LIMITES.x0
  const roomH = LIMITES.y1 - LIMITES.y0
  const banda = bandaDe(it)
  let { hw, hh } = halfExtents(it.w + 2 * banda, it.h + 2 * banda, it.rot)
  if (hw * 2 > roomW || hh * 2 > roomH) {
    const k = Math.min(roomW / (hw * 2), roomH / (hh * 2))
    it.w = Math.max(0.25, it.w * k)
    it.h = Math.max(0.25, it.h * k)
    const he = halfExtents(it.w + 2 * banda, it.h + 2 * banda, it.rot)
    hw = he.hw
    hh = he.hh
  }
  it.x = Math.min(Math.max(it.x, LIMITES.x0 + hw), LIMITES.x1 - hw)
  it.y = Math.min(Math.max(it.y, LIMITES.y0 + hh), LIMITES.y1 - hh)
  return it
}

export function rotar(p, deg) {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export function contar(items, req) {
  // Las sillas no son sólo objetos sueltos: cada mesa o barra aporta las suyas.
  if (req === 'silla') return items.reduce((n, i) => n + sillasDe(i), 0)
  return items.filter((i) => SPECS[i.type] && SPECS[i.type].req === req).length
}

// Inventario en vivo de lo que hay puesto, agrupado por tipo. Es lo que ve el
// admin ahora que el plano ya no responde a un programa fijo.
export function inventario(items) {
  const filas = []
  const porTipo = {}
  items.forEach((i) => {
    if (!SPECS[i.type]) return
    if (!porTipo[i.type]) { porTipo[i.type] = { type: i.type, name: SPECS[i.type].label, n: 0 }; filas.push(porTipo[i.type]) }
    porTipo[i.type].n++
  })
  return filas.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}

export function buscarHueco(items, type) {
  const s = SPECS[type]
  const enCocina = ['visi', 'congeladora', 'horno', 'hornoDoble', 'cocina', 'cocina1', 'cocina2', 'cocina3',
    'cocina4', 'cocina5', 'cocina6', 'meson', 'meson300', 'meson180', 'mesatrabajo', 'repisa', 'lavaplatos'].includes(type)
  const cocina = RECINTO.COCINA_FIN > 0
  const base = enCocina && cocina
    ? { x: RECINTO.W / 2, y: RECINTO.COCINA_FIN / 2 }
    : { x: RECINTO.W / 2, y: cocina ? (RECINTO.COCINA_FIN + RECINTO.H) / 2 : RECINTO.H / 2 }
  for (let k = 0; k < 160; k++) {
    const a = k * 0.9
    const r = 0.35 * Math.sqrt(k) * 1.3
    const t = { x: base.x + r * Math.cos(a), y: base.y + r * Math.sin(a), w: s.w, h: s.h, rot: 0 }
    clampItem(t)
    const he = halfExtents(t.w, t.h, 0)
    const choca = items.some((o) => {
      const ho = halfExtents(o.w, o.h, o.rot)
      return Math.abs(o.x - t.x) < (ho.hw + he.hw) * 0.92 && Math.abs(o.y - t.y) < (ho.hh + he.hh) * 0.92
    })
    if (!choca) return { x: t.x, y: t.y }
  }
  return base
}

export function crearItem(items, type) {
  if (SPECS[type].kind === 'puerta') {
    const puertas = items.filter((i) => SPECS[i.type].kind === 'puerta')
    const ancho = SPECS[type].w
    // se busca un tramo libre recorriendo los muros en orden
    for (const muro of ['sur', 'este', 'oeste', 'norte']) {
      const largo = MUROS[muro].eje === 'h' ? RECINTO.W : RECINTO.H
      for (let c = RECINTO.WALL + ancho / 2 + 0.05; c <= largo - RECINTO.WALL - ancho / 2; c += 0.4) {
        const choca = puertas.some((q) => q.muro === muro && Math.abs(q.corrimiento - c) < (q.w + ancho) / 2 + 0.2)
        if (!choca) return mkPuerta(type, muro, c)
      }
    }
    return mkPuerta(type, 'sur', RECINTO.W / 2)
  }
  const p = buscarHueco(items, type)
  const it = mk(type, p.x, p.y, 0)
  // Las mesas se numeran corridas entre todos los tipos de mesa, que es como
  // las nombra el salón: MESA 01, MESA 02… sin importar si es redonda o larga.
  if (SPECS[type].req === 'mesa') {
    const n = items.filter((i) => SPECS[i.type] && SPECS[i.type].req === 'mesa').length + 1
    it.label = 'MESA ' + String(n).padStart(2, '0')
  }
  if (type === 'silla') it.label = 'SILLA'
  if (type === 'visi') it.label = 'VISI COOLER ' + (items.filter((i) => i.type === 'visi').length + 1)
  if (type === 'repisa') it.label = 'REPISA ' + (items.filter((i) => i.type === 'repisa').length + 1)
  return clampItem(it)
}

// ---------------------------------------------------------------- dibujo
export function svgDefs() {
  return `
  <defs>
    <pattern id="pDeck" width="0.17" height="2.4" patternUnits="userSpaceOnUse">
      <rect width="0.17" height="2.4" fill="${P.wood}"/>
      <rect x="0" y="0" width="0.17" height="1.2" fill="${P.wood2}" opacity=".38"/>
      <line x1="0" y1="0" x2="0" y2="2.4" stroke="${P.woodLine}" stroke-width="0.012" opacity=".75"/>
      <line x1="0" y1="1.2" x2="0.17" y2="1.2" stroke="${P.woodLine}" stroke-width="0.012" opacity=".5"/>
    </pattern>
    <pattern id="pTile" width="0.6" height="0.6" patternUnits="userSpaceOnUse">
      <rect width="0.6" height="0.6" fill="${P.tile}"/>
      <path d="M0 0 H0.6 M0 0 V0.6" stroke="${P.tileLine}" stroke-width="0.012"/>
    </pattern>
    <pattern id="pGrid" width="1" height="1" patternUnits="userSpaceOnUse">
      <path d="M0 0 H1 M0 0 V1" stroke="${P.accent}" stroke-width="0.008" opacity=".35"/>
    </pattern>
    <filter id="fSh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0.035" dy="0.06" stdDeviation="0.045" flood-color="rgba(0,0,0,.55)"/>
    </filter>
    <linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.steel}"/><stop offset="1" stop-color="${P.steel2}"/>
    </linearGradient>
    <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.wood2}"/><stop offset="1" stop-color="${P.wood}"/>
    </linearGradient>
  </defs>`
}

function cota(x1, y1, x2, y2, text) {
  const t = 0.16
  const vertical = x1 === x2
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const label = vertical
    ? `<text x="${mx}" y="${my}" transform="rotate(-90 ${mx} ${my})" text-anchor="middle" dy="-0.14"
         font-size="0.3" font-family="${F_NUM}" fill="${P.accent}">${text}</text>`
    : `<text x="${mx}" y="${my - 0.16}" text-anchor="middle"
         font-size="0.3" font-family="${F_NUM}" fill="${P.accent}">${text}</text>`
  return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.accent}" stroke-width="0.022"/>
    <path d="M${x1 - t} ${y1 + t} L${x1 + t} ${y1 - t} M${x2 - t} ${y2 + t} L${x2 + t} ${y2 - t}"
      stroke="${P.accent}" stroke-width="0.022"/>
    ${label}</g>`
}

export function svgShell(show, puertas, items) {
  const { W, H, WALL } = RECINTO
  // El corte cocina/salón puede no existir: entonces el recinto es un comedor
  // entero, sin línea de zonificación ni piso de cocina.
  const COCINA_FIN = RECINTO.COCINA_FIN > 0 ? Math.min(RECINTO.COCINA_FIN, LIMITES.y1) : 0
  const hayCocina = COCINA_FIN > LIMITES.y0
  const vanos = puertas || []
  const lista = items || []
  let s = ''

  // pisos
  if (hayCocina) {
    s += `<rect x="${LIMITES.x0}" y="${LIMITES.y0}" width="${LIMITES.x1 - LIMITES.x0}" height="${COCINA_FIN - LIMITES.y0}" fill="url(#pTile)"/>`
  }
  const y0Deck = hayCocina ? COCINA_FIN : LIMITES.y0
  s += `<rect x="${LIMITES.x0}" y="${y0Deck}" width="${LIMITES.x1 - LIMITES.x0}" height="${LIMITES.y1 - y0Deck}" fill="url(#pDeck)"/>`
  if (show.grid) {
    s += `<rect x="${LIMITES.x0}" y="${LIMITES.y0}" width="${LIMITES.x1 - LIMITES.x0}" height="${LIMITES.y1 - LIMITES.y0}" fill="url(#pGrid)"/>`
  }

  // línea de zonificación
  if (hayCocina) {
    s += `<line x1="${LIMITES.x0}" y1="${COCINA_FIN}" x2="${LIMITES.x1}" y2="${COCINA_FIN}"
          stroke="${P.accent}" stroke-width="0.035" stroke-dasharray="0.28 0.18" opacity=".8"/>`
  }

  // muros (poché) con los vanos recortados
  s += `<path fill-rule="evenodd" fill="${P.ink}" d="
      M0 0 H${W} V${H} H0 Z
      M${LIMITES.x0} ${LIMITES.y0} H${LIMITES.x1} V${LIMITES.y1} H${LIMITES.x0} Z"/>`
  // Vanos: se borra el poché del muro donde va cada puerta. Las hojas y el
  // arco de barrido se dibujan junto al objeto puerta, no acá, para que
  // acompañen a la puerta cuando el admin la mueve.
  vanos.forEach((v) => {
    const m = MUROS[v.muro] || MUROS.sur
    if (m.eje === 'h') {
      s += `<rect x="${v.x - v.w / 2}" y="${m.fijo - WALL / 2 - 0.01}" width="${v.w}" height="${WALL + 0.02}" fill="${P.paper}"/>`
    } else {
      s += `<rect x="${m.fijo - WALL / 2 - 0.01}" y="${v.y - v.w / 2}" width="${WALL + 0.02}" height="${v.w}" fill="${P.paper}"/>`
    }
  })

  // cotas exteriores — se calculan del recinto, que ahora es editable
  if (show.dims) {
    s += cota(0, -0.8, W, -0.8, fmt(W))
    s += cota(-0.95, 0, -0.95, H, fmt(H))
    if (hayCocina) {
      s += cota(-0.35, 0, -0.35, COCINA_FIN, fmt(COCINA_FIN))
      s += cota(-0.35, COCINA_FIN, -0.35, H, fmt(H - COCINA_FIN))
    }
    s += `<text x="${W / 2}" y="-0.32" text-anchor="middle" font-size="0.24" font-family="${F_ROT}"
          letter-spacing="0.05" fill="${P.ink3}">SUPERFICIE TOTAL ${fmt(W * H)} m²</text>`
  }

  // zonas rotuladas en el margen derecho
  const zona = (y0, y1, txt, sub) => {
    const x = W + 0.55
    const my = (y0 + y1) / 2
    return `<g>
      <path d="M${x - 0.18} ${y0} H${x} V${y1} H${x - 0.18}" fill="none" stroke="${P.rule}" stroke-width="0.03"/>
      <text x="${x + 0.32}" y="${my}" transform="rotate(-90 ${x + 0.32} ${my})" text-anchor="middle"
        font-size="0.28" font-weight="600" font-family="${F_ROT}" letter-spacing="0.02" fill="${P.ink2}">${txt}</text>
      <text x="${x + 0.62}" y="${my}" transform="rotate(-90 ${x + 0.62} ${my})" text-anchor="middle"
        font-size="0.19" font-family="${F_ROT}" fill="${P.ink3}">${sub}</text>
    </g>`
  }
  const nMesas = lista.filter((i) => SPECS[i.type] && SPECS[i.type].req === 'mesa').length
  const nSillas = contar(lista, 'silla')
  const resumen = lista.length ? `${nMesas} mesas · ${nSillas} sillas` : ''
  if (hayCocina) {
    s += zona(0, COCINA_FIN, 'COCINA / PRODUCCIÓN', 'almacenamiento → preparación → cocción → despacho')
    s += zona(COCINA_FIN, H, 'ÁREA DE MESAS / CLIENTES', resumen)
  } else {
    s += zona(0, H, 'COMEDOR', resumen)
  }

  return s
}

// Silla vista en planta: asiento + respaldo. En su marco local el respaldo
// apunta hacia -Y, o sea "hacia afuera" de la mesa que tiene delante.
function sillaCuerpo() {
  return `<rect x="-0.21" y="-0.19" width="0.42" height="0.38" rx="0.09" fill="${P.paper}" stroke="${P.canopyLine}" stroke-width="0.032"/>
    <rect x="-0.21" y="-0.29" width="0.42" height="0.11" rx="0.05" fill="${P.canopyLine}" stroke="${P.canopyLine}" stroke-width="0.028"/>`
}

function silla(a, r) {
  return `<g transform="rotate(${a}) translate(0,${-r})">${sillaCuerpo()}</g>`
}

function sillaEn(x, y, rot) {
  return `<g transform="translate(${x.toFixed(3)},${y.toFixed(3)}) rotate(${rot})">${sillaCuerpo()}</g>`
}

function taburete(x, y) {
  return `<g transform="translate(${x.toFixed(3)},${y.toFixed(3)})">
    <circle r="0.2" fill="${P.paper}" stroke="${P.canopyLine}" stroke-width="0.032"/>
    <circle r="0.075" fill="none" stroke="${P.canopyLine}" stroke-width="0.024" opacity=".7"/>
  </g>`
}

// Reparto de n sillas alrededor de una mesa rectangular: si es (casi) cuadrada
// se reparten por los cuatro lados; si es alargada, van a los lados largos y
// recién a partir de seis se ocupan las cabeceras.
function repartoRect(w, h, n) {
  const d = 0.3 // separación entre el borde de la mesa y el centro de la silla
  const cuadrada = Math.abs(w - h) < 0.16
  let arriba, abajo, izq, der
  if (cuadrada) {
    const base = Math.floor(n / 4)
    const resto = n % 4
    const lados = [base, base, base, base]
    for (let i = 0; i < resto; i++) lados[i]++
    ;[arriba, der, abajo, izq] = lados
  } else if (w >= h) {
    const cab = n >= 6 ? 2 : 0
    const resto = n - cab
    arriba = Math.ceil(resto / 2); abajo = Math.floor(resto / 2)
    izq = cab ? 1 : 0; der = cab ? 1 : 0
  } else {
    const cab = n >= 6 ? 2 : 0
    const resto = n - cab
    izq = Math.ceil(resto / 2); der = Math.floor(resto / 2)
    arriba = cab ? 1 : 0; abajo = cab ? 1 : 0
  }
  const out = []
  const enLinea = (k, largo) => {
    const p = []
    for (let i = 0; i < k; i++) p.push(-largo / 2 + (largo * (i + 0.5)) / k)
    return p
  }
  enLinea(arriba, w).forEach((x) => out.push({ x, y: -h / 2 - d, rot: 0 }))
  enLinea(abajo, w).forEach((x) => out.push({ x, y: h / 2 + d, rot: 180 }))
  enLinea(izq, h).forEach((y) => out.push({ x: -w / 2 - d, y, rot: 270 }))
  enLinea(der, h).forEach((y) => out.push({ x: w / 2 + d, y, rot: 90 }))
  return out
}

function cuerpo(it) {
  const s = SPECS[it.type]
  const w = it.w
  const h = it.h
  const x = -w / 2
  const y = -h / 2
  const caja = (fill, extra) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${extra || ''} fill="${fill}" stroke="${P.steelLine}" stroke-width="0.028"/>`

  switch (s.kind) {
    case 'mesa': {
      const R = w / 2
      const rt = Math.min(0.55, R * 0.5)
      const rc = R * 0.82
      const n = sillasDe(it)
      let g = ''
      for (let i = 0; i < n; i++) g += silla(-90 + (i * 360) / n, rc)
      g += `<circle r="${rt}" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.03"/>`
      g += `<circle r="${rt * 0.62}" fill="none" stroke="${P.woodLine}" stroke-width="0.018" opacity=".55"/>`
      let pts = ''
      let ribs = ''
      for (let i = 0; i < 8; i++) {
        const a = rad(i * 45 - 22.5)
        const px = (R * Math.cos(a)).toFixed(3)
        const py = (R * Math.sin(a)).toFixed(3)
        pts += `${px},${py} `
        ribs += `<line x1="0" y1="0" x2="${px}" y2="${py}" stroke="${P.canopyLine}" stroke-width="0.022"/>`
      }
      g += `<g>
              <polygon points="${pts.trim()}" fill="${P.canopy}" fill-opacity="0.22"
                stroke="${P.canopyLine}" stroke-width="0.04" stroke-dasharray="0.18 0.11"/>
              <g opacity="0.5">${ribs}</g>
              <circle r="0.075" fill="${P.canopyLine}"/>
            </g>`
      return g
    }
    case 'mesaR': {
      // Mesa redonda sin quitasol: w es el diámetro real del tablero.
      const R = Math.min(w, h) / 2
      const n = sillasDe(it)
      let g = ''
      for (let i = 0; i < n; i++) g += silla(-90 + (i * 360) / n, R + 0.3)
      g += `<circle r="${R.toFixed(3)}" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.03"/>`
      g += `<circle r="${(R * 0.6).toFixed(3)}" fill="none" stroke="${P.woodLine}" stroke-width="0.018" opacity=".55"/>`
      return g
    }
    case 'mesaC': {
      // Mesa cuadrada o rectangular: el tablero es w × h y las sillas van fuera.
      let g = ''
      repartoRect(w, h, sillasDe(it)).forEach((p) => { g += sillaEn(p.x, p.y, p.rot) })
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.05" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.03"/>`
      g += `<rect x="${x + 0.09}" y="${y + 0.09}" width="${w - 0.18}" height="${h - 0.18}" rx="0.03" fill="none" stroke="${P.woodLine}" stroke-width="0.018" opacity=".5"/>`
      return g
    }
    case 'silla':
      return `<g transform="scale(${(Math.min(w, h) / 0.45).toFixed(3)})">${sillaCuerpo()}</g>`
    case 'barra': {
      // Barra recta: tablero de madera con canto de acero y taburetes al frente.
      const n = sillasDe(it)
      let g = ''
      for (let i = 0; i < n; i++) {
        g += taburete(-w / 2 + (w * (i + 0.5)) / n, h / 2 + 0.34)
      }
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.03"/>`
      g += `<rect x="${x}" y="${y + h - h * 0.26}" width="${w}" height="${h * 0.26}" fill="url(#gSteel)" stroke="${P.steelLine}" stroke-width="0.022" opacity=".9"/>`
      g += `<line x1="${x + 0.06}" y1="${y + h * 0.36}" x2="${x + w - 0.06}" y2="${y + h * 0.36}" stroke="${P.woodLine}" stroke-width="0.02" opacity=".7"/>`
      return g
    }
    case 'bar': {
      // Bar isla: mostrador, botellería al fondo y pileta de servicio.
      const fondo = h * 0.34
      let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.06" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.032"/>`
      g += `<rect x="${x}" y="${y}" width="${w}" height="${fondo}" fill="url(#gSteel)" stroke="${P.steelLine}" stroke-width="0.024"/>`
      const botellas = Math.max(3, Math.floor(w / 0.28))
      for (let i = 0; i < botellas; i++) {
        const bx = x + (w * (i + 0.5)) / botellas
        g += `<circle cx="${bx.toFixed(3)}" cy="${(y + fondo * 0.5).toFixed(3)}" r="0.055" fill="${P.glass}" stroke="${P.steelLine}" stroke-width="0.016"/>`
      }
      g += `<rect x="${x + w * 0.06}" y="${y + fondo + 0.08}" width="${(w * 0.22).toFixed(3)}" height="${(h - fondo - 0.18).toFixed(3)}" rx="0.04"
              fill="${P.steel2}" stroke="${P.steelLine}" stroke-width="0.022"/>`
      g += `<line x1="${x + 0.06}" y1="${y + h - 0.07}" x2="${x + w - 0.06}" y2="${y + h - 0.07}" stroke="${P.woodLine}" stroke-width="0.022" opacity=".7"/>`
      return g
    }
    case 'visi': {
      const p = 0.06
      return caja('url(#gSteel)') +
        `<rect x="${x + p}" y="${y + p}" width="${(w - 2 * p) / 2 - 0.02}" height="${h - 2 * p}" fill="${P.glass}" opacity=".85" stroke="${P.steelLine}" stroke-width="0.02"/>
         <rect x="${x + w / 2 + 0.02}" y="${y + p}" width="${(w - 2 * p) / 2 - 0.02}" height="${h - 2 * p}" fill="${P.glass}" opacity=".85" stroke="${P.steelLine}" stroke-width="0.02"/>
         <line x1="${x + w / 2}" y1="${y + p}" x2="${x + w / 2}" y2="${y + h - p}" stroke="${P.steelLine}" stroke-width="0.03"/>`
    }
    case 'cong':
      return caja('url(#gSteel)') +
        `<rect x="${x + 0.07}" y="${y + 0.07}" width="${w - 0.14}" height="${h - 0.14}" fill="none" stroke="${P.steelLine}" stroke-width="0.022"/>
         <line x1="${x + 0.07}" y1="${y + 0.2}" x2="${x + w - 0.07}" y2="${y + 0.2}" stroke="${P.steelLine}" stroke-width="0.02" opacity=".7"/>
         <line x1="${x + w / 2}" y1="${y + 0.2}" x2="${x + w / 2}" y2="${y + h - 0.07}" stroke="${P.steelLine}" stroke-width="0.022" opacity=".7"/>`
    case 'horno':
      return caja('url(#gSteel)') +
        `<rect x="${x + 0.08}" y="${y + 0.16}" width="${w - 0.16}" height="${h - 0.26}" rx="0.03" fill="${P.steel2}" stroke="${P.steelLine}" stroke-width="0.022"/>
         <rect x="${x + 0.16}" y="${y + 0.26}" width="${w - 0.32}" height="${h - 0.48}" rx="0.02" fill="#000" opacity=".35"/>
         <circle cx="${x + 0.16}" cy="${y + 0.09}" r="0.045" fill="${P.steelLine}"/>
         <circle cx="${x + w - 0.16}" cy="${y + 0.09}" r="0.045" fill="${P.steelLine}"/>`
    case 'cocina': {
      // Una sola cocina para 1..6 fogones: hasta 3 van en una fila, de 4 en
      // adelante se parten en dos filas (5 queda 3 + 2).
      const n = fogonesDe(it)
      const filas = n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)]
      const anchoUtil = w * 0.88
      const altoUtil = h * 0.74
      const maxCol = Math.max(...filas)
      const paso = Math.min(anchoUtil / maxCol, altoUtil / filas.length)
      const r1 = paso * 0.4
      let g = caja('url(#gSteel)')
      filas.forEach((cant, fi) => {
        const cy = (-(filas.length - 1) / 2 + fi) * (altoUtil / filas.length) - h * 0.04
        for (let i = 0; i < cant; i++) {
          const cx = (-(cant - 1) / 2 + i) * (anchoUtil / maxCol)
          g += `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r1.toFixed(3)}" fill="none" stroke="${P.steelLine}" stroke-width="0.032"/>
                <circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(r1 * 0.48).toFixed(3)}" fill="none" stroke="${P.steelLine}" stroke-width="0.026"/>`
        }
      })
      // perillas al frente, una por fogón
      for (let i = 0; i < n; i++) {
        const kx = (-(n - 1) / 2 + i) * Math.min(0.13, (w * 0.8) / Math.max(n, 1))
        g += `<circle cx="${kx.toFixed(3)}" cy="${(y + h - 0.07).toFixed(3)}" r="0.036" fill="${P.steelLine}"/>`
      }
      return g
    }
    case 'meson':
      return caja('url(#gSteel)') +
        `<rect x="${x + 0.05}" y="${y + 0.05}" width="${w - 0.1}" height="${h - 0.1}" fill="none" stroke="${P.steelLine}" stroke-width="0.018" opacity=".65"/>`
    case 'repisa':
      return caja(P.steel2, 'opacity="0.95"') +
        `<line x1="${x + 0.05}" y1="${y + h * 0.34}" x2="${x + w - 0.05}" y2="${y + h * 0.34}" stroke="${P.steelLine}" stroke-width="0.02" stroke-dasharray="0.1 0.07"/>
         <line x1="${x + 0.05}" y1="${y + h * 0.68}" x2="${x + w - 0.05}" y2="${y + h * 0.68}" stroke="${P.steelLine}" stroke-width="0.02" stroke-dasharray="0.1 0.07"/>`
    case 'lava':
      return caja('url(#gSteel)') +
        `<rect x="${x + 0.07}" y="${y + 0.1}" width="${w - 0.14}" height="${h - 0.19}" rx="0.05" fill="${P.steel2}" stroke="${P.steelLine}" stroke-width="0.022"/>
         <circle cx="0" cy="${y + h * 0.55}" r="0.045" fill="none" stroke="${P.steelLine}" stroke-width="0.022"/>
         <path d="M-0.09 ${y + 0.07} q0.09 -0.09 0.18 0" fill="none" stroke="${P.steelLine}" stroke-width="0.03"/>`
    case 'desp':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gWood)" stroke="${P.woodLine}" stroke-width="0.03"/>
              <rect x="${x}" y="${y}" width="${w}" height="${h * 0.28}" fill="url(#gSteel)" stroke="${P.steelLine}" stroke-width="0.025"/>
              <line x1="${x + 0.06}" y1="${y + h - 0.07}" x2="${x + w - 0.06}" y2="${y + h - 0.07}" stroke="${P.woodLine}" stroke-width="0.02" opacity=".7"/>`
    case 'puerta': {
      // Marco local: X corre a lo largo del muro, +Y apunta hacia adentro.
      const hojas = it.hojas === 2 ? 2 : 1
      const L = hojas === 2 ? w / 2 : w        // largo de cada hoja
      const mano = it.mano === -1 ? -1 : 1
      let g = `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${P.paper}"/>`
      // jambas
      g += `<path d="M${-w / 2} ${-h / 2} V${h / 2} M${w / 2} ${-h / 2} V${h / 2}"
              stroke="${P.ink}" stroke-width="0.03"/>`
      const hoja = (xg, dir) => {
        // hoja abatida hacia adentro desde la jamba xg, y su barrido punteado
        const tip = { x: xg, y: L }
        const cierre = { x: xg + dir * L, y: 0 }
        const sweep = dir > 0 ? 0 : 1
        return `<path d="M${xg} 0 L${tip.x} ${tip.y}" stroke="${P.ink}" stroke-width="0.05" fill="none"/>
                <path d="M${tip.x} ${tip.y} A${L} ${L} 0 0 ${sweep} ${cierre.x} ${cierre.y}"
                  stroke="${P.ink}" stroke-width="0.03" fill="none" stroke-dasharray="0.14 0.1" opacity=".65"/>`
      }
      if (hojas === 2) { g += hoja(-w / 2, 1); g += hoja(w / 2, -1) }
      else { g += hoja((-w / 2) * mano, mano) }
      return g
    }
    case 'planta': {
      const R = Math.min(w, h) / 2
      let hojas = ''
      for (let i = 0; i < 7; i++) {
        const a = rad(i * 51.4)
        const rr = R * 0.55
        hojas += `<circle cx="${(rr * Math.cos(a)).toFixed(3)}" cy="${(rr * Math.sin(a)).toFixed(3)}" r="${(R * 0.42).toFixed(3)}" fill="${P.green}" opacity=".9"/>`
      }
      return `<circle r="${R}" fill="${P.wood2}" stroke="${P.woodLine}" stroke-width="0.028"/>${hojas}<circle r="${R * 0.38}" fill="${P.green2}"/>`
    }
    default:
      return ''
  }
}

export function svgItem(it) {
  return `<g class="pl-item" data-id="${it.id}" filter="url(#fSh)"
            transform="translate(${it.x},${it.y}) rotate(${it.rot})">${cuerpo(it)}</g>`
}

const CHW = 0.56 // ancho medio de carácter respecto al cuerpo tipográfico

function ajustarNombre(name, largo) {
  let lines = [name]
  let fs = Math.min(0.17, (largo * 0.92) / (name.length * CHW))
  if (fs < 0.128 && name.indexOf(' ') > -1) {
    const words = name.split(' ')
    let best = null
    const mid = name.length / 2
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ')
      const b = words.slice(i).join(' ')
      const d = Math.abs(a.length - mid)
      if (!best || d < best.d) best = { a, b, d }
    }
    const longest = Math.max(best.a.length, best.b.length)
    const fs2 = Math.min(0.17, (largo * 0.92) / (longest * CHW))
    if (fs2 > fs) { lines = [best.a, best.b]; fs = fs2 }
  }
  return { lines, fs }
}

export function svgLabel(it, show) {
  if (!show.labels) return ''
  const s = SPECS[it.type]
  const name = it.label
  // Una silla suelta no lleva rótulo: serían decenas de textos repetidos.
  if (s.kind === 'silla') return ''
  const nS = sillasDe(it)
  const medida = `${fmt(it.w)} × ${fmt(it.h)}`
  const sub = s.kind === 'mesa'
    ? `Ø${fmt(Math.min(1.1, it.w * 0.5))} · ${nS} SILLAS`
    : s.kind === 'mesaR'
      ? `Ø${fmt(Math.min(it.w, it.h))} · ${nS} SILLAS`
      : s.kind === 'mesaC'
        ? `${medida} · ${nS} SILLAS`
        : s.kind === 'barra'
          ? `${medida} · ${nS} TABURETES`
          : s.kind === 'cocina'
            ? `${medida} · ${fogonesDe(it)} FOGONES`
            : medida

  // El acceso rotula hacia el interior del recinto, siempre horizontal.
  if (s.kind === 'puerta') {
    const m = MUROS[it.muro] || MUROS.sur
    const dentro = { norte: [0, 1], sur: [0, -1], oeste: [1, 0], este: [-1, 0] }[it.muro] || [0, -1]
    const L = (it.hojas === 2 ? it.w / 2 : it.w) + 0.42
    const lx = it.x + dentro[0] * L
    const ly = it.y + dentro[1] * L
    const detalle = `${fmt(it.w)} m · ${it.hojas === 2 ? 'doble hoja' : 'una hoja'}`
    return `<g pointer-events="none">
      <text x="${lx}" y="${ly}" text-anchor="middle" font-size="0.24" font-weight="600" font-family="${F_ROT}"
        letter-spacing="0.014" fill="${P.accent}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.075">${name}</text>
      <text x="${lx}" y="${ly + 0.26}" text-anchor="middle" font-size="0.19" font-family="${F_NUM}"
        fill="${P.ink3}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.065">${detalle}</text>
    </g>`
  }

  // Las mesas y las barras llevan el rótulo siempre horizontal, debajo del
  // conjunto — el mueble más su banda de sillas, así no pisa a nadie.
  if (['mesa', 'mesaR', 'mesaC'].includes(s.kind)) {
    const y = it.y + Math.max(it.w, it.h) / 2 + bandaDe(it) + 0.32
    return `<g pointer-events="none">
      <text x="${it.x}" y="${y}" text-anchor="middle" font-size="0.24" font-weight="600" font-family="${F_ROT}"
        fill="${P.ink}" letter-spacing="0.012" paint-order="stroke" stroke="${P.paper}" stroke-width="0.075">${name}</text>
      <text x="${it.x}" y="${y + 0.26}" text-anchor="middle" font-size="0.175" font-family="${F_NUM}"
        fill="${P.ink3}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.065">${sub}</text>
    </g>`
  }

  const largo = Math.max(it.w, it.h)
  const corto = Math.min(it.w, it.h)
  const along = it.w >= it.h ? 0 : 90
  const fit = ajustarNombre(name, largo)
  let lines = fit.lines
  let fs = fit.fs
  const afuera = !!s.out || fs < 0.118 || corto < fs * 1.9
  if (afuera) { lines = [name]; fs = 0.145 }

  const conSub = !afuera && corto >= (lines.length + 1) * 1.24 * fs
  const total = lines.length + (conSub ? 1 : 0)
  const oy = afuera ? corto / 2 + fs * 1.15 : 0

  // el texto nunca queda cabeza abajo
  const world = (((it.rot + along) % 360) + 360) % 360
  const flip = world >= 90 && world < 270
  const sign = flip ? -1 : 1

  let t = ''
  lines.forEach((ln, i) => {
    const y = (-(total - 1) / 2 + i) * 1.24 * fs + fs * 0.36
    t += `<text y="${(sign * y).toFixed(3)}" text-anchor="middle" font-size="${fs.toFixed(3)}" font-family="${F_ROT}"
        font-weight="600" fill="${P.ink}" letter-spacing="${(fs * 0.045).toFixed(3)}" paint-order="stroke"
        stroke="${P.paper}" stroke-width="${(fs * 0.4).toFixed(3)}">${ln}</text>`
  })
  if (conSub) {
    const y = (-(total - 1) / 2 + lines.length) * 1.24 * fs + fs * 0.36
    t += `<text y="${(sign * y).toFixed(3)}" text-anchor="middle" font-size="${(fs * 0.76).toFixed(3)}"
        font-family="${F_NUM}" fill="${P.ink3}" paint-order="stroke" stroke="${P.paper}"
        stroke-width="${(fs * 0.32).toFixed(3)}">${sub}</text>`
  }
  return `<g pointer-events="none" transform="translate(${it.x},${it.y}) rotate(${it.rot}) translate(0,${oy}) rotate(${along}) rotate(${flip ? 180 : 0})">${t}</g>`
}

export function svgSeleccion(it) {
  if (!it) return ''
  // El giro de una puerta lo define el muro, así que no lleva manija de giro:
  // se mueve arrastrándola de muro en muro y se ensancha por las esquinas.
  const esPuerta = SPECS[it.type] && SPECS[it.type].kind === 'puerta'
  const hx = it.w / 2
  const hy = it.h / 2
  const hs = 0.2
  const esquinas = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  let handles = ''
  esquinas.forEach((c, i) => {
    handles += `<rect class="pl-handle" data-handle="rz" data-c="${i}"
      x="${c[0] * hx - hs / 2}" y="${c[1] * hy - hs / 2}" width="${hs}" height="${hs}"
      fill="${P.paper}" stroke="${P.accent}" stroke-width="0.035"/>`
  })
  const alto = esPuerta ? Math.max(it.h, 0.34) : it.h
  return `<g transform="translate(${it.x},${it.y}) rotate(${it.rot})">
    <rect x="${-hx}" y="${-alto / 2}" width="${it.w}" height="${alto}" fill="none" stroke="${P.accent}" stroke-width="0.035" stroke-dasharray="0.16 0.12"/>
    ${esPuerta ? '' : `<line x1="0" y1="${-hy}" x2="0" y2="${-hy - 0.55}" stroke="${P.accent}" stroke-width="0.03"/>
    <circle class="pl-handle" data-handle="rot" cx="0" cy="${-hy - 0.55}" r="0.16" fill="${P.accent}" stroke="${P.paper}" stroke-width="0.04"/>`}
    ${handles}
  </g>`
}

// Un layout guardado puede venir de una versión anterior: se saneia siempre
// antes de dibujarlo, para que un dato raro en la base no rompa la pantalla.
export function sanear(datos, fallback) {
  const porDefecto = () => (typeof fallback === 'function' ? fallback() : (fallback || layoutInicial()))
  if (!Array.isArray(datos) || datos.length === 0) return porDefecto()
  const limpio = datos
    .filter((d) => d && SPECS[d.type])
    .map((d) => clampItem(SPECS[d.type].kind === 'puerta' ? {
      id: d.id || nuevoId(),
      type: d.type,
      muro: MUROS[d.muro] ? d.muro : 'sur',
      corrimiento: Number(d.corrimiento) || 4.5,
      x: 0, y: 0, rot: 0,
      w: Math.max(0.6, Number(d.w) || SPECS[d.type].w),
      h: RECINTO.WALL,
      hojas: d.hojas === 2 ? 2 : 1,
      mano: d.mano === -1 ? -1 : 1,
      label: String(d.label || SPECS[d.type].label)
    } : {
      id: d.id || nuevoId(),
      type: d.type,
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      w: Math.max(0.25, Number(d.w) || SPECS[d.type].w),
      h: Math.max(0.25, Number(d.h) || SPECS[d.type].h),
      rot: Number(d.rot) || 0,
      label: String(d.label || SPECS[d.type].label),
      // sillas y fogones son propios del objeto: si el dato guardado no los
      // trae (layout viejo), se toma el valor de fábrica del tipo.
      ...(SPECS[d.type].sillas !== undefined || CON_SILLAS.includes(SPECS[d.type].kind)
        ? { sillas: sillasDe({ type: d.type, sillas: d.sillas }) } : {}),
      ...(SPECS[d.type].kind === 'cocina' ? { fogones: fogonesDe({ type: d.type, fogones: d.fogones }) } : {})
    }))
  if (!limpio.length) return porDefecto()
  // Un layout guardado antes de que las puertas fueran objetos no las trae:
  // se le reponen los accesos por defecto para que el plano no quede sin
  // entrada. La UI impide borrar el último acceso, así que esto solo se
  // dispara con datos viejos, nunca porque el admin los haya eliminado.
  if (!limpio.some((d) => SPECS[d.type].kind === 'puerta')) {
    limpio.push(mkPuerta('puertaDoble', 'sur', RECINTO.W / 2))
  }
  return limpio
}

// Primer cálculo del recinto. Va al final del archivo a propósito: setRecinto
// toca MUROS, que se declara más arriba pero como const — llamarlo antes daría
// error de inicialización.
setRecinto({ ancho: 9, largo: 24, corte: 6.9 })
