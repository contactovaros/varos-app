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

export const RECINTO = { W: 9, H: 24, WALL: 0.15, COCINA_FIN: 6.9 }

export const LIMITES = {
  x0: RECINTO.WALL,
  y0: RECINTO.WALL,
  x1: RECINTO.W - RECINTO.WALL,
  y1: RECINTO.H - RECINTO.WALL
}

export const VIEWBOX = { x: -1.55, y: -1.35, w: 12.15, h: 26.4 }
export const PPM = 30 // píxeles por metro a zoom 1

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

export const SPECS = {
  mesa:        { label: 'MESA',              w: 2.2,  h: 2.2,  kind: 'mesa',   req: 'mesa'   },
  visi:        { label: 'VISI COOLER',       w: 0.9,  h: 0.75, kind: 'visi',   req: 'visi'   },
  congeladora: { label: 'CONGELADORA',       w: 1.3,  h: 0.75, kind: 'cong',   req: 'cong'   },
  horno:       { label: 'HORNO',             w: 0.8,  h: 0.75, kind: 'horno',  req: 'horno'  },
  cocina:      { label: 'COCINA 2 FOGONES',  w: 0.9,  h: 0.6,  kind: 'cocina', req: 'cocina' },
  meson300:    { label: 'MESÓN 3,00 × 0,50', w: 3,    h: 0.5,  kind: 'meson',  req: 'm300'   },
  meson180:    { label: 'MESÓN 1,80 × 0,40', w: 1.8,  h: 0.4,  kind: 'meson',  req: 'm180'   },
  mesatrabajo: { label: 'MESA 1,50 × 0,70',  w: 1.5,  h: 0.7,  kind: 'meson',  req: 'mtrab'  },
  repisa:      { label: 'REPISA 1,00 × 0,50',w: 1,    h: 0.5,  kind: 'repisa', req: 'repisa' },
  lavaplatos:  { label: 'LAVAPLATOS 0,50',   w: 0.5,  h: 0.5,  kind: 'lava',   req: 'lava', out: true },
  despacho:    { label: 'BARRA DE DESPACHO', w: 3.6,  h: 0.6,  kind: 'desp',   req: 'desp'   },
  maceta:      { label: 'MACETA',            w: 0.6,  h: 0.6,  kind: 'planta', req: 'maceta', out: true }
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
  { req: 'lava',   name: 'Lavaplatos 0,50' },
  { req: 'desp',   name: 'Barra de despacho' },
  { req: 'maceta', name: 'Maceta / vegetación' }
]

export const PALETA_AGREGAR = [
  { cat: 'Zona de clientes', list: [['mesa', 'Mesa + quitasol', 'Ø2,20 · 5 sillas'], ['maceta', 'Vegetación', 'Ø0,60']] },
  { cat: 'Frío', list: [['visi', 'Visi Cooler', '0,90 × 0,75'], ['congeladora', 'Congeladora', '1,30 × 0,75']] },
  { cat: 'Cocción', list: [['horno', 'Horno', '0,80 × 0,75'], ['cocina', 'Cocina 2 fogones', '0,90 × 0,60']] },
  { cat: 'Mesones y trabajo', list: [['meson300', 'Mesón 3,00', '3,00 × 0,50'], ['meson180', 'Mesón 1,80', '1,80 × 0,40'], ['mesatrabajo', 'Mesa de trabajo', '1,50 × 0,70'], ['lavaplatos', 'Lavaplatos', '0,50 × 0,50']] },
  { cat: 'Almacenamiento y despacho', list: [['repisa', 'Repisa', '1,00 × 0,50'], ['despacho', 'Barra despacho', '3,60 × 0,60']] }
]

let contador = 1
export function nuevoId() { return 'e' + (contador++) + '_' + Math.random().toString(36).slice(2, 6) }

function mk(type, x, y, rot, label) {
  const s = SPECS[type]
  return { id: nuevoId(), type, x, y, w: s.w, h: s.h, rot: rot || 0, label: label || s.label }
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
  return it
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
export function clampItem(it) {
  const roomW = LIMITES.x1 - LIMITES.x0
  const roomH = LIMITES.y1 - LIMITES.y0
  let { hw, hh } = halfExtents(it.w, it.h, it.rot)
  if (hw * 2 > roomW || hh * 2 > roomH) {
    const k = Math.min(roomW / (hw * 2), roomH / (hh * 2))
    it.w *= k
    it.h *= k
    const he = halfExtents(it.w, it.h, it.rot)
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
  if (req === 'silla') return items.filter((i) => SPECS[i.type].req === 'mesa').length * 5
  return items.filter((i) => SPECS[i.type].req === req).length
}

export function buscarHueco(items, type) {
  const s = SPECS[type]
  const enCocina = ['visi', 'congeladora', 'horno', 'cocina', 'meson300', 'meson180', 'mesatrabajo', 'repisa', 'lavaplatos'].includes(type)
  const base = enCocina ? { x: 4.5, y: 3.6 } : { x: 4.5, y: 15 }
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
  const p = buscarHueco(items, type)
  const it = mk(type, p.x, p.y, 0)
  if (type === 'mesa') it.label = 'MESA ' + String(items.filter((i) => i.type === 'mesa').length + 1).padStart(2, '0')
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

export function svgShell(show) {
  const { W, H, WALL, COCINA_FIN } = RECINTO
  const puertaPpal = { x0: 3.6, x1: 5.4 }
  const puertaServ = { x0: 3.65, x1: 4.55 }
  let s = ''

  // pisos
  s += `<rect x="${LIMITES.x0}" y="${LIMITES.y0}" width="${LIMITES.x1 - LIMITES.x0}" height="${COCINA_FIN - LIMITES.y0}" fill="url(#pTile)"/>`
  s += `<rect x="${LIMITES.x0}" y="${COCINA_FIN}" width="${LIMITES.x1 - LIMITES.x0}" height="${LIMITES.y1 - COCINA_FIN}" fill="url(#pDeck)"/>`
  if (show.grid) {
    s += `<rect x="${LIMITES.x0}" y="${LIMITES.y0}" width="${LIMITES.x1 - LIMITES.x0}" height="${LIMITES.y1 - LIMITES.y0}" fill="url(#pGrid)"/>`
  }

  // línea de zonificación
  s += `<line x1="${LIMITES.x0}" y1="${COCINA_FIN}" x2="${LIMITES.x1}" y2="${COCINA_FIN}"
          stroke="${P.accent}" stroke-width="0.035" stroke-dasharray="0.28 0.18" opacity=".8"/>`

  // muros (poché) con los vanos recortados
  s += `<path fill-rule="evenodd" fill="${P.ink}" d="
      M0 0 H${W} V${H} H0 Z
      M${LIMITES.x0} ${LIMITES.y0} H${LIMITES.x1} V${LIMITES.y1} H${LIMITES.x0} Z"/>`
  s += `<rect x="${puertaPpal.x0}" y="${H - WALL - 0.01}" width="${puertaPpal.x1 - puertaPpal.x0}" height="${WALL + 0.02}" fill="${P.paper}"/>`
  s += `<rect x="${puertaServ.x0}" y="-0.01" width="${puertaServ.x1 - puertaServ.x0}" height="${WALL + 0.02}" fill="${P.paper}"/>`

  // puerta principal de doble hoja, abriendo hacia adentro
  const yD = H - WALL
  s += `<g stroke="${P.ink}" fill="none" stroke-width="0.035">
      <path d="M${puertaPpal.x0} ${yD} L${puertaPpal.x0} ${yD - 0.9}"/>
      <path d="M${puertaPpal.x0} ${yD - 0.9} A0.9 0.9 0 0 1 ${puertaPpal.x0 + 0.9} ${yD}" stroke-dasharray="0.14 0.1" opacity=".6"/>
      <path d="M${puertaPpal.x1} ${yD} L${puertaPpal.x1} ${yD - 0.9}"/>
      <path d="M${puertaPpal.x1} ${yD - 0.9} A0.9 0.9 0 0 0 ${puertaPpal.x1 - 0.9} ${yD}" stroke-dasharray="0.14 0.1" opacity=".6"/>
    </g>`
  s += `<g stroke="${P.ink}" fill="none" stroke-width="0.035">
      <path d="M${puertaServ.x0} ${WALL} L${puertaServ.x0} ${WALL + 0.9}"/>
      <path d="M${puertaServ.x0} ${WALL + 0.9} A0.9 0.9 0 0 0 ${puertaServ.x0 + 0.9} ${WALL}" stroke-dasharray="0.14 0.1" opacity=".6"/>
    </g>`

  // rótulos de acceso
  s += `<text x="4.5" y="${H - 1.28}" text-anchor="middle" font-size="0.26" font-weight="600" font-family="${F_ROT}"
        letter-spacing="0.014" fill="${P.accent}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.07">ACCESO PRINCIPAL</text>`
  s += `<text x="4.5" y="${H - 1}" text-anchor="middle" font-size="0.2" font-family="${F_NUM}" fill="${P.ink3}"
        paint-order="stroke" stroke="${P.paper}" stroke-width="0.06">1,80 m · doble hoja</text>`
  s += `<text x="${(puertaServ.x0 + puertaServ.x1) / 2}" y="${WALL + 1.2}" text-anchor="middle" font-size="0.19"
        font-family="${F_ROT}" fill="${P.ink3}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.06">ACCESO DE SERVICIO 0,90</text>`

  // cotas exteriores
  if (show.dims) {
    s += cota(0, -0.8, W, -0.8, '9,00')
    s += cota(-0.95, 0, -0.95, H, '24,00')
    s += cota(-0.35, 0, -0.35, COCINA_FIN, '6,90')
    s += cota(-0.35, COCINA_FIN, -0.35, H, '17,10')
    s += `<text x="${W / 2}" y="-0.32" text-anchor="middle" font-size="0.24" font-family="${F_ROT}"
          letter-spacing="0.05" fill="${P.ink3}">SUPERFICIE TOTAL 216,00 m²</text>`
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
  s += zona(0, COCINA_FIN, 'COCINA / PRODUCCIÓN', 'almacenamiento → preparación → cocción → despacho')
  s += zona(COCINA_FIN, H, 'ÁREA DE MESAS / CLIENTES', '10 mesas · 50 sillas · pasillo central 1,80 m')

  return s
}

function silla(a, r) {
  return `<g transform="rotate(${a}) translate(0,${-r})">
    <rect x="-0.21" y="-0.19" width="0.42" height="0.38" rx="0.09" fill="${P.paper}" stroke="${P.canopyLine}" stroke-width="0.032"/>
    <rect x="-0.21" y="-0.29" width="0.42" height="0.11" rx="0.05" fill="${P.canopyLine}" stroke="${P.canopyLine}" stroke-width="0.028"/>
  </g>`
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
      let g = ''
      for (let i = 0; i < 5; i++) g += silla(-90 + i * 72, rc)
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
      const r1 = Math.min(h, w) * 0.28
      return caja('url(#gSteel)') +
        `<circle cx="${-w * 0.22}" cy="0" r="${r1}" fill="none" stroke="${P.steelLine}" stroke-width="0.032"/>
         <circle cx="${-w * 0.22}" cy="0" r="${r1 * 0.5}" fill="none" stroke="${P.steelLine}" stroke-width="0.026"/>
         <circle cx="${w * 0.22}" cy="0" r="${r1}" fill="none" stroke="${P.steelLine}" stroke-width="0.032"/>
         <circle cx="${w * 0.22}" cy="0" r="${r1 * 0.5}" fill="none" stroke="${P.steelLine}" stroke-width="0.026"/>
         <circle cx="0" cy="${y + 0.09}" r="0.042" fill="${P.steelLine}"/>`
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
  const sub = it.type === 'mesa'
    ? `Ø${fmt(Math.min(1.1, it.w * 0.5))} · 5 SILLAS`
    : `${fmt(it.w)} × ${fmt(it.h)}`

  // Las mesas llevan el rótulo siempre horizontal, debajo del conjunto.
  if (s.kind === 'mesa') {
    const y = it.y + it.w / 2 + 0.32
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
  return `<g transform="translate(${it.x},${it.y}) rotate(${it.rot})">
    <rect x="${-hx}" y="${-hy}" width="${it.w}" height="${it.h}" fill="none" stroke="${P.accent}" stroke-width="0.035" stroke-dasharray="0.16 0.12"/>
    <line x1="0" y1="${-hy}" x2="0" y2="${-hy - 0.55}" stroke="${P.accent}" stroke-width="0.03"/>
    <circle class="pl-handle" data-handle="rot" cx="0" cy="${-hy - 0.55}" r="0.16" fill="${P.accent}" stroke="${P.paper}" stroke-width="0.04"/>
    ${handles}
  </g>`
}

// Un layout guardado puede venir de una versión anterior: se saneia siempre
// antes de dibujarlo, para que un dato raro en la base no rompa la pantalla.
export function sanear(datos) {
  if (!Array.isArray(datos) || datos.length === 0) return layoutInicial()
  const limpio = datos
    .filter((d) => d && SPECS[d.type])
    .map((d) => clampItem({
      id: d.id || nuevoId(),
      type: d.type,
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      w: Math.max(0.25, Number(d.w) || SPECS[d.type].w),
      h: Math.max(0.25, Number(d.h) || SPECS[d.type].h),
      rot: Number(d.rot) || 0,
      label: String(d.label || SPECS[d.type].label)
    }))
  return limpio.length ? limpio : layoutInicial()
}
