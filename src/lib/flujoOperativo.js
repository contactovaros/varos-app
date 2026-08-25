// =============================================================================
// FLUJO OPERATIVO — capa animada que se dibuja ENCIMA del plano
//
// Regla de oro de este módulo: no mueve, no agrega y no borra un solo objeto
// del plano. Lee el mismo array de items que dibuja planoTerraza.js y DERIVA de
// él dónde se para cada persona y por dónde camina. Si mañana el admin corre la
// congeladora en /admin/plano, la cajera y la cola se recalculan solas: acá no
// hay ni una coordenada de persona escrita a mano.
//
// Igual que planoTerraza.js: todo en METROS y todo devuelve strings de SVG.
// La animación es SMIL (animateMotion / animateTransform), no un bucle de JS —
// así la corre el navegador y React no re-renderiza 60 veces por segundo.
//
// La circulación no se dibuja "a ojo": se arma una malla de 25 cm con los
// muebles como obstáculos y se busca camino con A*. Por eso nadie atraviesa un
// mesón ni pasa por encima de una mesa, sea cual sea la distribución guardada.
// =============================================================================

import { RECINTO, LIMITES, SPECS, halfExtents, P } from './planoTerraza.js'

const G = 0.25        // lado de celda de la malla de circulación
const HOLGURA = 0.30  // medio ancho de una persona: la separa del mobiliario
const VEL = 0.95      // m/s caminando — paso de servicio, ni paseo ni corrida

const F_ROT = "'Space Grotesk', sans-serif"
const F_NUM = "'JetBrains Mono', monospace"

// Paleta de la capa, tomada del design system de Varo's: el cliente es
// diamond, la producción es ember, la caja es gold, la barra es bronze.
export const C = {
  cocina:   '#FFF8F1',
  barra:    '#B5732A',
  caja:     '#E3B341',
  cliente:  '#6FD4D9',
  cliente2: '#4FB3B8',
  piel:     '#C9A184',
  piel2:    '#A87C5C',
  prod:     '#FF7A1A',
  humo:     '#FFF8F1'
}

// --------------------------------------------------------------- malla y A*

function bboxDe(it) {
  const { hw, hh } = halfExtents(it.w, it.h, it.rot)
  return { x0: it.x - hw, x1: it.x + hw, y0: it.y - hh, y1: it.y + hh }
}

const iCel = (m, cx, cy) => cy * m.cols + cx
const dentroMalla = (m, cx, cy) => cx >= 0 && cy >= 0 && cx < m.cols && cy < m.rows

export function crearMalla(items) {
  const cols = Math.ceil(RECINTO.W / G)
  const rows = Math.ceil(RECINTO.H / G)
  const m = { cols, rows, libre: new Uint8Array(cols * rows) }
  // Las puertas viven dentro del muro: no son obstáculo, son por donde se pasa.
  const obst = items.filter((i) => SPECS[i.type] && SPECS[i.type].kind !== 'puerta')
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = (cx + 0.5) * G
      const y = (cy + 0.5) * G
      let ok =
        x > LIMITES.x0 + HOLGURA && x < LIMITES.x1 - HOLGURA &&
        y > LIMITES.y0 + HOLGURA && y < LIMITES.y1 - HOLGURA
      if (ok) {
        for (let k = 0; k < obst.length; k++) {
          const it = obst[k]
          if (SPECS[it.type].kind === 'mesa') {
            // la mesa se toma como disco: el radio ya incluye las 5 sillas
            const r = it.w / 2 + HOLGURA
            const dx = x - it.x
            const dy = y - it.y
            if (dx * dx + dy * dy < r * r) { ok = false; break }
          } else {
            const b = bboxDe(it)
            if (x > b.x0 - HOLGURA && x < b.x1 + HOLGURA &&
                y > b.y0 - HOLGURA && y < b.y1 + HOLGURA) { ok = false; break }
          }
        }
      }
      m.libre[iCel(m, cx, cy)] = ok ? 1 : 0
    }
  }
  return m
}

export function libreEn(m, x, y) {
  const cx = Math.floor(x / G)
  const cy = Math.floor(y / G)
  return dentroMalla(m, cx, cy) && m.libre[iCel(m, cx, cy)] === 1
}

// El punto libre más cercano a p, buscando en anillos crecientes. Con esto una
// posición calculada (la cajera, un puesto de barra) nunca queda adentro de un
// mueble, sea cual sea el layout guardado.
export function puntoLibreCerca(m, p, maxR) {
  if (libreEn(m, p.x, p.y)) return { x: p.x, y: p.y }
  const pasos = Math.ceil((maxR || 4) / G)
  const cx0 = Math.floor(p.x / G)
  const cy0 = Math.floor(p.y / G)
  for (let r = 1; r <= pasos; r++) {
    let mejor = null
    let mejorD = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const cx = cx0 + dx
        const cy = cy0 + dy
        if (!dentroMalla(m, cx, cy) || m.libre[iCel(m, cx, cy)] !== 1) continue
        const q = { x: (cx + 0.5) * G, y: (cy + 0.5) * G }
        const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)
        if (d < mejorD) { mejorD = d; mejor = q }
      }
    }
    if (mejor) return mejor
  }
  return { x: p.x, y: p.y }
}

function nuevoMonticulo() { return { c: [], p: [] } }

function meter(h, celda, prio) {
  h.c.push(celda)
  h.p.push(prio)
  let i = h.c.length - 1
  while (i > 0) {
    const pa = (i - 1) >> 1
    if (h.p[pa] <= h.p[i]) break
    const tc = h.c[pa]; h.c[pa] = h.c[i]; h.c[i] = tc
    const tp = h.p[pa]; h.p[pa] = h.p[i]; h.p[i] = tp
    i = pa
  }
}

function sacar(h) {
  const top = h.c[0]
  const c = h.c.pop()
  const p = h.p.pop()
  if (h.c.length) {
    h.c[0] = c
    h.p[0] = p
    for (let i = 0; ;) {
      const l = 2 * i + 1
      const r = l + 1
      let s = i
      if (l < h.p.length && h.p[l] < h.p[s]) s = l
      if (r < h.p.length && h.p[r] < h.p[s]) s = r
      if (s === i) break
      const tc = h.c[s]; h.c[s] = h.c[i]; h.c[i] = tc
      const tp = h.p[s]; h.p[s] = h.p[i]; h.p[i] = tp
      i = s
    }
  }
  return top
}

const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

function aEstrella(m, a, b) {
  const pa = puntoLibreCerca(m, a)
  const pb = puntoLibreCerca(m, b)
  const ini = iCel(m, Math.floor(pa.x / G), Math.floor(pa.y / G))
  const fin = iCel(m, Math.floor(pb.x / G), Math.floor(pb.y / G))
  if (ini === fin) return [a, b]
  const n = m.cols * m.rows
  const g = new Float32Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const cerrado = new Uint8Array(n)
  const fx = fin % m.cols
  const fy = (fin / m.cols) | 0
  const heur = (i) => {
    const dx = Math.abs((i % m.cols) - fx)
    const dy = Math.abs(((i / m.cols) | 0) - fy)
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)
  }
  const h = nuevoMonticulo()
  g[ini] = 0
  meter(h, ini, heur(ini))
  let hallado = false
  while (h.c.length) {
    const cur = sacar(h)
    if (cerrado[cur]) continue
    cerrado[cur] = 1
    if (cur === fin) { hallado = true; break }
    const cx = cur % m.cols
    const cy = (cur / m.cols) | 0
    for (let k = 0; k < 8; k++) {
      const nx = cx + D8[k][0]
      const ny = cy + D8[k][1]
      if (!dentroMalla(m, nx, ny)) continue
      const ni = iCel(m, nx, ny)
      if (m.libre[ni] !== 1 || cerrado[ni]) continue
      // en diagonal no se corta por una esquina ocupada
      if (D8[k][0] && D8[k][1]) {
        if (m.libre[iCel(m, cx + D8[k][0], cy)] !== 1) continue
        if (m.libre[iCel(m, cx, cy + D8[k][1])] !== 1) continue
      }
      const ng = g[cur] + (D8[k][0] && D8[k][1] ? Math.SQRT2 : 1)
      if (ng < g[ni]) { g[ni] = ng; prev[ni] = cur; meter(h, ni, ng + heur(ni)) }
    }
  }
  if (!hallado) return [a, b]
  const pts = []
  for (let i = fin; i !== -1; i = prev[i]) {
    pts.push({ x: ((i % m.cols) + 0.5) * G, y: (((i / m.cols) | 0) + 0.5) * G })
    if (i === ini) break
  }
  pts.reverse()
  return pts
}

// Visibilidad entre dos puntos. Los primeros y últimos centímetros se perdonan:
// el punto exacto de llegada suele ser una silla o el borde de un mesón, o sea
// una celda "ocupada" a la que igual hay que poder llegar.
function visible(m, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.ceil(d / (G * 0.6))
  for (let i = 1; i < n; i++) {
    const t = i / n
    const s = t * d
    if (s < 0.55 || d - s < 0.55) continue
    if (!libreEn(m, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false
  }
  return true
}

function suavizar(m, pts) {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && !visible(m, pts[i], pts[j])) j--
    out.push(pts[j])
    i = j
  }
  return out
}

// Camino caminable de a → b, con los extremos exactos respetados.
export function ruta(m, a, b) {
  const pts = aEstrella(m, a, b)
  pts[0] = { x: a.x, y: a.y }
  pts[pts.length - 1] = { x: b.x, y: b.y }
  return suavizar(m, pts)
}

// Encadena tramos sin repetir el punto de unión.
function unir(tramos) {
  const out = []
  tramos.forEach((t) => {
    t.forEach((p, i) => {
      const u = out[out.length - 1]
      if (i === 0 && u && Math.hypot(u.x - p.x, u.y - p.y) < 0.02) return
      out.push(p)
    })
  })
  return out
}

// Índice del punto de `pts` más cercano a p: sirve para clavar una parada.
function marcar(pts, p) {
  let mejor = 0
  let d0 = Infinity
  pts.forEach((q, i) => {
    const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)
    if (d < d0) { d0 = d; mejor = i }
  })
  return mejor
}

// ------------------------------------------------------------------ puestos

const porTipo = (items, t) => items.filter((i) => i.type === t)
const porKind = (items, k) => items.filter((i) => SPECS[i.type] && SPECS[i.type].kind === k)

const angHacia = (desde, hacia) =>
  (Math.atan2(hacia.y - desde.y, hacia.x - desde.x) * 180) / Math.PI

// Dónde se para alguien para trabajar en un mueble: del lado corto que esté
// libre, corrido `corr` metros a lo largo del mueble.
function puesto(it, m, corr) {
  const { hw, hh } = halfExtents(it.w, it.h, it.rot)
  const alargadoEnX = hw >= hh
  const off = (alargadoEnX ? hh : hw) + 0.44
  const desl = corr || 0
  const cands = alargadoEnX
    ? [{ x: it.x + desl, y: it.y + off }, { x: it.x + desl, y: it.y - off }]
    : [{ x: it.x + off, y: it.y + desl }, { x: it.x - off, y: it.y + desl }]
  let p = cands.find((q) => libreEn(m, q.x, q.y))
  if (!p) p = puntoLibreCerca(m, cands[0])
  return { x: p.x, y: p.y, rot: angHacia(p, it) }
}

// Las sillas de una mesa, en el mismo orden en que las dibuja planoTerraza.
// El número lo decide la mesa: el admin puede ponerle de 0 a 24.
function sillasDe(mesa) {
  const rc = (mesa.w / 2) * 0.82
  const n = Math.max(1, Math.min(24, Math.round(mesa.sillas === undefined ? 5 : mesa.sillas)))
  const out = []
  for (let i = 0; i < n; i++) {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180
    out.push({
      x: mesa.x + rc * Math.cos(a),
      y: mesa.y + rc * Math.sin(a),
      rot: (a * 180) / Math.PI + 180
    })
  }
  return out
}

export function construirEstaciones(items, m) {
  const mesas = porKind(items, 'mesa')
  const mesones = porTipo(items, 'meson300')
  const horno = porTipo(items, 'horno')[0]
  const fogones = porTipo(items, 'cocina')[0]
  const sushiMueble = porTipo(items, 'mesatrabajo')[0] || mesones[mesones.length - 1]
  const cong = porTipo(items, 'congeladora')[0]
  const m180 = porTipo(items, 'meson180')[0]
  const desp = porKind(items, 'desp')[0]
  const visis = porTipo(items, 'visi')
  const puertas = porKind(items, 'puerta')
  const avisos = []

  // ACCESO: el principal es la puerta doble; si no hay, la del muro sur.
  const pAcc = puertas.find((p) => p.type === 'puertaDoble') ||
    puertas.find((p) => p.muro === 'sur') || puertas[0]
  const haciaDentro = pAcc
    ? ({ norte: [0, 1], sur: [0, -1], oeste: [1, 0], este: [-1, 0] }[pAcc.muro] || [0, -1])
    : [0, -1]
  const entrada = pAcc
    ? puntoLibreCerca(m, { x: pAcc.x + haciaDentro[0] * 0.8, y: pAcc.y + haciaDentro[1] * 0.8 })
    : puntoLibreCerca(m, { x: RECINTO.W / 2, y: RECINTO.H - 0.9 })
  const afuera = pAcc
    ? { x: pAcc.x - haciaDentro[0] * 0.9, y: pAcc.y - haciaDentro[1] * 0.9 }
    : { x: entrada.x, y: entrada.y + 1.4 }

  // CAJA: exactamente entre la congeladora y el mesón de 1,80, como se pidió.
  // Si alguno de los dos no está en el layout, cae junto a la barra de
  // despacho, que es el otro punto donde el cliente encara al local.
  let caja
  if (cong && m180) caja = puntoLibreCerca(m, { x: (cong.x + m180.x) / 2, y: (cong.y + m180.y) / 2 })
  else if (desp) caja = puesto(desp, m, -1.1)
  else caja = puntoLibreCerca(m, { x: RECINTO.W / 2, y: RECINTO.COCINA_FIN - 1 })
  caja = { x: caja.x, y: caja.y, rot: angHacia(caja, entrada) }

  // Una caja adentro de la zona de producción es un problema de circulación
  // real, no un error del dibujo: se avisa en pantalla en vez de taparlo.
  if (caja.y < RECINTO.COCINA_FIN) {
    avisos.push(
      'La caja queda dentro de la zona de producción. En este layout la congeladora y el mesón de 1,80 están en extremos opuestos del recinto, así que el punto “entre las dos” cae en plena cocina y la cola de clientes entra al área de trabajo. Se dibuja tal cual está, para que el cruce se vea. Acercando los dos muebles en /admin/plano, la caja y la cola se recalculan solas.'
    )
  }

  // COLA: hacia el lado por donde llega el cliente.
  const dirCola = (() => {
    const dx = entrada.x - caja.x
    const dy = entrada.y - caja.y
    const n = Math.hypot(dx, dy) || 1
    return { x: dx / n, y: dy / n }
  })()
  const cola = [0.95, 1.75, 2.55].map((d) =>
    puntoLibreCerca(m, { x: caja.x + dirCola.x * d, y: caja.y + dirCola.y * d })
  )

  // BARRA DE COCTELERÍA: 4 bartenders repartidos 2 + 1 + 1 entre los mesones
  // de 3,00 m, nunca los cuatro amontonados en el mismo.
  const reparto = [[-0.85, 0.85], [0], [0]]
  const ranuras = []
  mesones.forEach((mm, i) => (reparto[i] || [0]).forEach((c) => ranuras.push({ mueble: mm, corr: c })))
  let extra = 0
  while (ranuras.length < 4 && mesones.length) {
    const mm = mesones[extra % mesones.length]
    ranuras.push({ mueble: mm, corr: (extra % 2 ? -1 : 1) * (0.5 + 0.55 * Math.floor(extra / 2)) })
    extra++
  }
  const barra = ranuras.slice(0, 4).map((r) => puesto(r.mueble, m, r.corr))
  if (mesones.length && mesones.length < 3) {
    avisos.push('El layout tiene ' + mesones.length + ' mesón de 3,00 m en vez de 3: los cuatro bartenders se repartieron en los que hay.')
  }

  // PASE / ENTREGA: los dos lados de la barra de despacho. Cocina y barra
  // dejan el pedido de un lado, el cliente lo retira del otro. Eso es lo que
  // mantiene al cliente fuera de la zona de trabajo.
  let pase
  let entrega
  if (desp) {
    const { hh } = halfExtents(desp.w, desp.h, desp.rot)
    const arriba = puntoLibreCerca(m, { x: desp.x, y: desp.y - hh - 0.5 })
    const abajo = puntoLibreCerca(m, { x: desp.x, y: desp.y + hh + 0.5 })
    const clienteAbajo = Math.abs(abajo.y - entrada.y) < Math.abs(arriba.y - entrada.y)
    entrega = clienteAbajo ? abajo : arriba
    pase = clienteAbajo ? arriba : abajo
  } else {
    entrega = puntoLibreCerca(m, { x: RECINTO.W / 2, y: RECINTO.COCINA_FIN + 0.6 })
    pase = puntoLibreCerca(m, { x: RECINTO.W / 2, y: RECINTO.COCINA_FIN - 0.6 })
  }
  entrega = { x: entrega.x, y: entrega.y, rot: angHacia(entrega, pase) }
  pase = { x: pase.x, y: pase.y, rot: angHacia(pase, entrega) }

  // COCINA: un cocinero en los fogones, otro entre el horno y el sushi.
  const pFogones = fogones ? puesto(fogones, m, 0) : puntoLibreCerca(m, { x: 4.5, y: 4.6 })
  const pHorno = horno ? puesto(horno, m, 0) : puntoLibreCerca(m, { x: 5.4, y: 4.6 })
  const pSushi = sushiMueble ? puesto(sushiMueble, m, 0.55) : puntoLibreCerca(m, { x: 4.5, y: 3.1 })

  // De dónde saca insumos la barra: el Visi Cooler más cercano al bartender
  // que hace ese viaje.
  const refBar = barra[1] || barra[0] || pFogones
  const insumo = visis.length
    ? puesto(visis.reduce((a, b) => (
      Math.hypot(a.x - refBar.x, a.y - refBar.y) <= Math.hypot(b.x - refBar.x, b.y - refBar.y) ? a : b
    )), m, 0)
    : puntoLibreCerca(m, { x: 1.3, y: 1.5 })

  return {
    entrada, afuera, caja, cola, barra, pase, entrega,
    fogones: pFogones, horno: pHorno, sushi: pSushi, insumo,
    mesas, muebles: { fogones, horno, sushi: sushiMueble, desp, cong, m180 },
    avisos
  }
}

// ------------------------------------------------------ recorridos y tiempos

// Convierte una polilínea + una lista de paradas en lo que necesita
// <animateMotion>: el path, y los pares keyPoints/keyTimes que hacen que la
// persona avance a velocidad constante y SE DETENGA donde tiene que trabajar.
function recorrido(pts, paradas, vel) {
  const v = vel || VEL
  const largos = [0]
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    largos.push(total)
  }
  if (total < 0.01) total = 0.01
  const frac = largos.map((l) => l / total)

  const mapa = new Map()
  ;(paradas || []).forEach((p) => {
    const i = Math.min(Math.max(p.i, 0), pts.length - 1)
    mapa.set(i, (mapa.get(i) || 0) + p.t)
  })
  const eventos = [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, t]) => ({ f: frac[i], espera: t }))

  const kp = ['0']
  const kt = [0]
  let t = 0
  let fAnt = 0
  eventos.forEach((e) => {
    if (e.f < fAnt) return
    const dCam = (e.f - fAnt) * total
    if (dCam > 0.001) { t += dCam / v; kp.push(e.f.toFixed(5)); kt.push(t) }
    t += e.espera
    kp.push(e.f.toFixed(5))
    kt.push(t)
    fAnt = e.f
  })
  const dFin = (1 - fAnt) * total
  t += dFin > 0.001 ? dFin / v : 0.01
  kp.push('1')
  kt.push(t)

  const dur = Math.max(t, 0.5)
  const d = 'M' + pts.map((p) => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' L')
  return {
    d,
    dur,
    keyPoints: kp.join(';'),
    keyTimes: kt.map((x) => (x / dur).toFixed(5)).join(';')
  }
}

function mover(r, begin, escala) {
  const dur = (r.dur / escala).toFixed(2)
  return `<animateMotion dur="${dur}s" repeatCount="indefinite" calcMode="linear" rotate="auto"
      begin="${(begin / escala).toFixed(2)}s" keyPoints="${r.keyPoints}" keyTimes="${r.keyTimes}"
      path="${r.d}"/>`
}

// ------------------------------------------------------------------ dibujo

// Degradados y sombras propios de esta capa. Van aparte de los de
// planoTerraza.js para no tocar el archivo del plano.
function defsFlujo() {
  return `<defs>
    <radialGradient id="foSombra">
      <stop offset="0.35" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="foLuz">
      <stop offset="0" stop-color="#FFC98A" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#FFC98A" stop-opacity="0"/>
    </radialGradient>
  </defs>`
}

// Ropa civil variada: los clientes no van uniformados, y eso es la mitad de lo
// que hace que una escena cenital se lea como gente y no como iconos.
const ROPA = ['#8C3A32', '#2F4A73', '#46583C', '#6E4A2C', '#3B3A48', '#7C5A2A', '#2C5A57', '#5C2F4C']
const PELO = ['#221812', '#3A2A1E', '#120E0B', '#4A3524', '#2A1C14']

// Persona en planta, mirando hacia +X. Sombra proyectada, volumen en los
// hombros, pelo y manos: la convención sigue siendo cenital, pero con cuerpo.
// El personal lleva uniforme oscuro con una banda del color de su área, así la
// escena se ve real y el rol se sigue leyendo de un vistazo.
function persona(o) {
  const piel = o.piel || C.piel
  const dur = o.brazo || 1.1
  const amp = o.amp || 26
  const ropa = o.cuerpo
  const pelo = o.pelo || PELO[0]
  const brazo = (cy, signo, desfase) => `
    <g transform="translate(0.03,${cy})">
      <g>
        <animateTransform attributeName="transform" type="rotate"
          values="${(-amp * signo).toFixed(1)};${(amp * signo).toFixed(1)};${(-amp * signo).toFixed(1)}"
          dur="${dur}s" begin="${desfase}s" repeatCount="indefinite"
          calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>
        <rect x="-0.02" y="-0.05" width="0.29" height="0.1" rx="0.05" fill="${ropa}"/>
        <rect x="-0.02" y="-0.05" width="0.29" height="0.042" rx="0.021" fill="#FFFFFF" opacity=".09"/>
        <circle cx="0.29" cy="0" r="0.058" fill="${piel}"/>
      </g>
    </g>`
  return `<g>
    <ellipse cx="0.07" cy="0.08" rx="0.34" ry="0.33" fill="url(#foSombra)"/>
    ${brazo(-0.20, 1, 0)}
    ${brazo(0.20, -1, (dur / 2).toFixed(2))}
    <ellipse rx="0.195" ry="0.265" fill="${ropa}"/>
    <ellipse cx="-0.05" cy="-0.055" rx="0.145" ry="0.20" fill="#FFFFFF" opacity=".085"/>
    ${o.banda ? `<rect x="-0.075" y="-0.245" width="0.085" height="0.49" rx="0.03" fill="${o.banda}" opacity=".9"/>` : ''}
    <ellipse rx="0.195" ry="0.265" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="0.02"/>
    <circle cx="0.055" cy="0" r="0.142" fill="${piel}"/>
    ${o.gorro
      ? `<circle cx="0.055" cy="0" r="0.152" fill="#F2ECE3"/><circle cx="0.055" cy="0" r="0.152" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="0.016"/>`
      : `<path d="M0.055 -0.142 A0.142 0.142 0 0 0 0.055 0.142 Z" fill="${pelo}"/>`}
    <circle cx="0.055" cy="0" r="0.142" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="0.016"/>
    ${o.lleva ? `<g transform="translate(0.34,0) scale(0.85)">${o.lleva}</g>` : ''}
  </g>`
}

// Uniforme oscuro para todo el personal (como se ve en una cocina de verdad) y
// banda de color por área. Los clientes van de civil, con ropa variada.
const ROLES = {
  cocinero: { cuerpo: '#EFE8DE', gorro: true, banda: null, amp: 34, brazo: 0.72 },
  bartender: { cuerpo: '#2A2622', banda: C.barra, piel: C.piel2, amp: 32, brazo: 0.8 },
  caja: { cuerpo: '#2A2622', banda: C.caja, amp: 18, brazo: 1.5, pelo: PELO[1] },
  cliente: { cuerpo: C.cliente, amp: 15, brazo: 1.6 },
  cliente2: { cuerpo: C.cliente2, piel: C.piel2, amp: 15, brazo: 1.8 }
}

// Un cliente cualquiera: ropa y pelo distintos según su número, para que no
// haya dos iguales al lado.
function civil(n, extra) {
  return {
    cuerpo: ROPA[n % ROPA.length],
    pelo: PELO[(n * 3) % PELO.length],
    piel: n % 3 === 0 ? C.piel2 : C.piel,
    amp: 14,
    brazo: 1.5 + (n % 5) * 0.35,
    ...(extra || {})
  }
}

// Persona quieta en un puesto de trabajo.
function fijo(p, rol, extra) {
  return `<g transform="translate(${p.x.toFixed(3)},${p.y.toFixed(3)}) rotate(${(p.rot || 0).toFixed(1)})">
    ${persona(rol)}${extra || ''}</g>`
}

// Persona recorriendo un camino.
function movil(r, rol, begin, esc) {
  return `<g>${mover(r, begin, esc)}<g>${persona(rol)}</g></g>`
}

// Vapor sobre un fogón o el horno: volutas que suben y se desvanecen.
function vapor(x, y, begin, esc) {
  const dur = (2.6 / esc).toFixed(2)
  let g = ''
  for (let i = 0; i < 3; i++) {
    const b = ((begin + i * 0.9) / esc).toFixed(2)
    g += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.09" fill="${C.humo}" opacity="0">
      <animate attributeName="cy" values="${y.toFixed(2)};${(y - 0.8).toFixed(2)}" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
      <animate attributeName="r" values="0.05;0.2" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.3;0" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
    </circle>`
  }
  return g
}

const GLIFOS = {
  comanda: `<g><rect x="-0.1" y="-0.13" width="0.2" height="0.26" rx="0.02" fill="#FFF8F1" stroke="rgba(0,0,0,.4)" stroke-width="0.015"/>
    <path d="M-0.06 -0.07 H0.06 M-0.06 -0.01 H0.06 M-0.06 0.05 H0.03" stroke="#8A817A" stroke-width="0.022"/></g>`,
  plato: `<g><circle r="0.155" fill="#FFF8F1" stroke="rgba(0,0,0,.4)" stroke-width="0.018"/>
    <circle r="0.085" fill="#C25508" opacity=".8"/></g>`,
  vaso: `<g><path d="M-0.085 -0.11 H0.085 L0.055 0.12 H-0.055 Z" fill="#6FD4D9" opacity=".85" stroke="rgba(0,0,0,.35)" stroke-width="0.016"/>
    <circle cx="0.075" cy="-0.1" r="0.045" fill="#E3B341"/></g>`,
  sarten: `<g><circle r="0.14" fill="#2A2622" stroke="rgba(0,0,0,.45)" stroke-width="0.016"/>
    <circle r="0.09" fill="#8C5A2E" opacity=".8"/><rect x="0.12" y="-0.028" width="0.2" height="0.056" rx="0.028" fill="#1A1714"/></g>`,
  bandeja: `<g><rect x="-0.17" y="-0.12" width="0.34" height="0.24" rx="0.04" fill="#F2ECE3" stroke="rgba(0,0,0,.4)" stroke-width="0.016"/>
    <circle cx="-0.06" cy="0" r="0.06" fill="#C9814A"/><path d="M0.07 -0.07 H0.13 L0.11 0.06 H0.09 Z" fill="#8FD3D8"/></g>`,
  sushi: `<g><rect x="-0.14" y="-0.09" width="0.28" height="0.18" rx="0.03" fill="#1F2B22" stroke="rgba(0,0,0,.4)" stroke-width="0.015"/>
    <circle cx="-0.07" cy="0" r="0.05" fill="#F2E9DE"/><circle cx="0.07" cy="0" r="0.05" fill="#F2E9DE"/>
    <circle cx="-0.07" cy="0" r="0.022" fill="#C25508"/><circle cx="0.07" cy="0" r="0.022" fill="#C25508"/></g>`
}

// Un pedido viajando entre estaciones.
function pedido(glifo, pts, esc, begin) {
  const r = recorrido(pts, [], 1.5)
  const dur = (r.dur / esc).toFixed(2)
  const b = (begin / esc).toFixed(2)
  return `<g opacity="0">
    <animateMotion dur="${dur}s" repeatCount="indefinite" calcMode="linear" rotate="0"
      begin="${b}s" keyPoints="${r.keyPoints}" keyTimes="${r.keyTimes}" path="${r.d}"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
    ${glifo}
  </g>`
}

// Línea de flujo con guiones que marchan hacia el destino.
function lineaFlujo(pts, color, esc, ancho) {
  const d = 'M' + pts.map((p) => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' L')
  const w = (ancho || 0.11).toFixed(3)
  return `<g pointer-events="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity=".14"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"
      opacity=".8" stroke-dasharray="0.34 0.46">
      <animate attributeName="stroke-dashoffset" from="0.8" to="0" dur="${(1.1 / esc).toFixed(2)}s" repeatCount="indefinite"/>
    </path>
  </g>`
}

function hito(n, p, color) {
  return `<g pointer-events="none" transform="translate(${p.x.toFixed(3)},${p.y.toFixed(3)})">
    <circle r="0.30" fill="${P.paper}" stroke="${color}" stroke-width="0.05"/>
    <text y="0.115" text-anchor="middle" font-size="0.32" font-weight="700" font-family="${F_NUM}" fill="${color}">${n}</text>
  </g>`
}

function rotulo(p, txt, color, dy) {
  return `<text x="${p.x.toFixed(3)}" y="${(p.y + (dy === undefined ? 0.62 : dy)).toFixed(3)}"
    pointer-events="none" text-anchor="middle" font-size="0.21" font-weight="600" font-family="${F_ROT}"
    letter-spacing="0.012" fill="${color}" paint-order="stroke" stroke="${P.paper}" stroke-width="0.085">${txt}</text>`
}

// ------------------------------------------------------------------ escena

export function construirFlujo(items) {
  const malla = crearMalla(items)
  const est = construirEstaciones(items, malla)
  return { malla, est, avisos: est.avisos }
}

export function svgFlujo(flujo, opts) {
  const o = opts || {}
  const esc = o.velocidad || 1
  const m = flujo.malla
  const e = flujo.est
  const R = (a, b) => ruta(m, a, b)
  let s = defsFlujo()

  // ---------------- ambiente: pozos de luz cálida sobre el deck y las mesas.
  // Es luz, no mobiliario: no agrega ni mueve nada del plano.
  if (o.ambiente !== false) {
    e.mesas.forEach((mesa) => {
      s += `<circle cx="${mesa.x.toFixed(2)}" cy="${mesa.y.toFixed(2)}" r="${(mesa.w * 0.95).toFixed(2)}" fill="url(#foLuz)"/>`
    })
    for (let y = RECINTO.COCINA_FIN + 1.6; y < RECINTO.H - 1; y += 3.4) {
      s += `<circle cx="${LIMITES.x0.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5" fill="url(#foLuz)"/>`
      s += `<circle cx="${LIMITES.x1.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5" fill="url(#foLuz)"/>`
    }
  }

  // ---------------- servicio puesto en las mesas: platos, copas y una vela
  if (o.mesaServida !== false) {
    e.mesas.forEach((mesa) => {
      const rp = (mesa.w / 2) * 0.44
      for (let i = 0; i < 5; i++) {
        const a = ((-90 + i * 72) * Math.PI) / 180
        const px = mesa.x + rp * Math.cos(a)
        const py = mesa.y + rp * Math.sin(a)
        s += `<circle cx="${px.toFixed(3)}" cy="${py.toFixed(3)}" r="0.115" fill="#F4EFE8" stroke="rgba(0,0,0,.35)" stroke-width="0.014"/>
          <circle cx="${px.toFixed(3)}" cy="${py.toFixed(3)}" r="0.055" fill="#C9814A" opacity=".55"/>
          <circle cx="${(px + 0.16 * Math.cos(a + 1)).toFixed(3)}" cy="${(py + 0.16 * Math.sin(a + 1)).toFixed(3)}" r="0.048" fill="#8FD3D8" opacity=".8"/>`
      }
      s += `<circle cx="${mesa.x.toFixed(2)}" cy="${mesa.y.toFixed(2)}" r="0.075" fill="#FFD9A0">
        <animate attributeName="opacity" values="0.75;1;0.8;1;0.75" dur="${(2.4 / esc).toFixed(2)}s" repeatCount="indefinite"/>
      </circle>`
    })
  }

  // ---------------- líneas de flujo, por debajo de la gente
  if (o.lineas) {
    const primeraSilla = e.mesas.length ? sillasDe(e.mesas[0])[0] : e.entrega
    const cliente = unir([
      R(e.entrada, e.cola[2]), R(e.cola[2], e.caja),
      R(e.caja, e.entrega), R(e.entrega, primeraSilla)
    ])
    const prod = unir([
      R(e.caja, e.pase), R(e.pase, e.fogones), R(e.fogones, e.horno),
      R(e.horno, e.sushi), R(e.sushi, e.pase)
    ])
    const flujoBarra = unir([
      R(e.caja, e.barra[0]), R(e.barra[0], e.insumo),
      R(e.insumo, e.barra[0]), R(e.barra[0], e.pase)
    ])
    s += lineaFlujo(prod, C.prod, esc, 0.09)
    s += lineaFlujo(flujoBarra, C.barra, esc, 0.09)
    s += lineaFlujo(cliente, C.cliente, esc, 0.12)
  }

  // ---------------- caja: la cajera y su registradora
  s += fijo(e.caja, ROLES.caja, `<g>
    <rect x="0.30" y="-0.16" width="0.26" height="0.32" rx="0.04" fill="#31363B" stroke="#9AA1A9" stroke-width="0.02"/>
    <rect x="0.34" y="-0.11" width="0.18" height="0.11" rx="0.02" fill="${C.caja}">
      <animate attributeName="opacity" values="0.25;0.9;0.25" dur="${(1.8 / esc).toFixed(2)}s" repeatCount="indefinite"/>
    </rect></g>`)

  // ---------------- cocina: 2 cocineros con ciclos distintos, nunca sincronizados
  // A: fogones → pase → fogones.  B: horno → sushi → pase → horno.
  const ptsA = unir([R(e.fogones, e.pase), R(e.pase, e.fogones)])
  const rA = recorrido(ptsA, [
    { i: 0, t: 8.5 },
    { i: marcar(ptsA, e.pase), t: 1.8 }
  ], VEL)
  const ptsB = unir([R(e.horno, e.sushi), R(e.sushi, e.pase), R(e.pase, e.horno)])
  const rB = recorrido(ptsB, [
    { i: 0, t: 5.5 },
    { i: marcar(ptsB, e.sushi), t: 7.5 },
    { i: marcar(ptsB, e.pase), t: 1.6 }
  ], VEL)
  s += movil(rA, { ...ROLES.cocinero, lleva: GLIFOS.sarten }, 0, esc)
  s += movil(rB, { ...ROLES.cocinero, lleva: GLIFOS.plato }, -4.2, esc)

  // vapor en los dos fogones y en el horno, calculado del mueble real
  if (e.muebles.fogones) {
    const f = e.muebles.fogones
    const enX = f.rot % 180 === 0
    const dx = enX ? f.w * 0.22 : 0
    const dy = enX ? 0 : f.w * 0.22
    s += vapor(f.x - dx, f.y - dy, 0, esc)
    s += vapor(f.x + dx, f.y + dy, 1.3, esc)
  }
  if (e.muebles.horno) s += vapor(e.muebles.horno.x, e.muebles.horno.y - 0.1, 2.1, esc)

  // ---------------- barra: 4 bartenders, ciclos desfasados
  const ciclos = [
    { destino: e.pase, trabajo: 7.5, entrega: 1.8, begin: 0 },
    { destino: e.insumo, trabajo: 9, entrega: 2.2, begin: -5 },
    { destino: null },
    { destino: e.pase, trabajo: 8.5, entrega: 1.6, begin: -9 }
  ]
  e.barra.forEach((b, i) => {
    const c = ciclos[i] || ciclos[2]
    if (!c.destino) {
      // el que no se mueve del mesón: coctelera, servir, decorar
      s += fijo(b, ROLES.bartender, `<g transform="translate(0.34,0)">
        <g><animateTransform attributeName="transform" type="translate"
             values="0,-0.06;0,0.06;0,-0.06" dur="${(0.42 / esc).toFixed(2)}s" repeatCount="indefinite"/>
          <rect x="-0.045" y="-0.09" width="0.09" height="0.18" rx="0.035" fill="#9AA1A9"/>
        </g></g>`)
      return
    }
    const pts = unir([R(b, c.destino), R(c.destino, b)])
    const r = recorrido(pts, [
      { i: 0, t: c.trabajo },
      { i: marcar(pts, c.destino), t: c.entrega }
    ], VEL)
    s += movil(r, { ...ROLES.bartender, lleva: c.destino === e.pase ? GLIFOS.vaso : null }, c.begin, esc)
  })

  // ---------------- clientes en tránsito: el recorrido completo, escalonado
  const nViajeros = e.mesas.length ? Math.min(4, e.mesas.length) : 1
  const viajeros = []
  let durMax = 0
  for (let k = 0; k < nViajeros; k++) {
    const mesa = e.mesas.length ? e.mesas[(k * 3 + 1) % e.mesas.length] : null
    const silla = mesa ? sillasDe(mesa)[(k * 2) % 5] : e.entrega
    const pts = unir([
      R(e.afuera, e.entrada),
      R(e.entrada, e.cola[2]), R(e.cola[2], e.cola[1]), R(e.cola[1], e.cola[0]),
      R(e.cola[0], e.caja),
      R(e.caja, e.entrega),
      R(e.entrega, silla),
      R(silla, e.entrada),
      R(e.entrada, e.afuera)
    ])
    const r = recorrido(pts, [
      { i: marcar(pts, e.cola[2]), t: 3 },
      { i: marcar(pts, e.cola[1]), t: 3 },
      { i: marcar(pts, e.cola[0]), t: 3 },
      { i: marcar(pts, e.caja), t: 6 },
      { i: marcar(pts, e.entrega), t: 5 },
      { i: marcar(pts, silla), t: 26 }
    ], VEL * (0.92 + k * 0.05))
    viajeros.push(r)
    durMax = Math.max(durMax, r.dur)
  }
  viajeros.forEach((r, k) => {
    s += movil(r, civil(k * 3 + 2, { lleva: GLIFOS.bandeja }), -(k * durMax) / nViajeros, esc)
  })

  // ---------------- clientes ya sentados: el salón no está vacío
  e.mesas.forEach((mesa, i) => {
    if (i % 2 === 1) return
    const sillas = sillasDe(mesa)
    const cuantos = 2 + (i % 3 === 0 ? 1 : 0)
    for (let j = 0; j < cuantos; j++) {
      const p = sillas[(j * 2 + i) % 5]
      s += `<g transform="translate(${p.x.toFixed(3)},${p.y.toFixed(3)}) rotate(${p.rot.toFixed(1)})">
        ${persona(civil(i * 5 + j, { amp: 10, brazo: 2.6 + ((i + j) % 4) * 0.4 }))}</g>`
    }
  })

  // ---------------- pedidos viajando entre estaciones
  s += pedido(GLIFOS.comanda, R(e.caja, e.pase), esc, 0)
  s += pedido(GLIFOS.comanda, R(e.caja, e.barra[0]), esc, 2.4)
  s += pedido(GLIFOS.plato, R(e.fogones, e.pase), esc, 5.5)
  s += pedido(GLIFOS.sushi, R(e.sushi, e.pase), esc, 8.5)
  s += pedido(GLIFOS.vaso, unir([R(e.barra[0], e.pase), R(e.pase, e.entrega)]), esc, 11)
  s += pedido(GLIFOS.plato, R(e.pase, e.entrega), esc, 14)

  // ---------------- hitos numerados del recorrido del cliente
  if (o.hitos !== false) {
    s += hito(1, e.entrada, C.cliente)
    s += hito(2, e.cola[1], C.cliente)
    s += hito(3, e.caja, C.caja)
    s += hito(4, e.pase, C.prod)
    s += hito(5, e.entrega, C.cliente)
    const dest = e.mesas[1] || e.mesas[0]
    if (dest) s += hito(6, { x: dest.x, y: dest.y }, C.cliente)
  }

  // ---------------- rótulos de las estaciones
  if (o.rotulos !== false) {
    s += rotulo(e.caja, 'CAJA / PUNTO DE VENTA', C.caja)
    s += rotulo(e.pase, 'PASE — DESPACHO', C.prod, -0.52)
    s += rotulo(e.entrega, 'ENTREGA AL CLIENTE', C.cliente)
    s += rotulo(e.fogones, 'FOGONES', C.cocina, -0.46)
    s += rotulo(e.horno, 'HORNO', C.cocina, -0.46)
    s += rotulo(e.sushi, 'SUSHI', C.cocina, -0.46)
    e.barra.forEach((b, i) => { if (i === 0 || i === 3) s += rotulo(b, 'COCTELERÍA', C.barra, 0.58) })
  }

  return s
}

// Los seis pasos del recorrido, para la leyenda de la pantalla.
export const PASOS = [
  ['1', 'Llega', 'Entra por el acceso principal.'],
  ['2', 'Hace cola', 'Espera en fila, sin bloquear el pasillo.'],
  ['3', 'Compra', 'La cajera toma el pedido, cobra y le da el número.'],
  ['4', 'Producción', 'La comanda entra a cocina y a coctelería al mismo tiempo.'],
  ['5', 'Retira', 'El pedido cruza el pase y se entrega del lado del cliente.'],
  ['6', 'Consume', 'Se sienta en el área de mesas.']
]
