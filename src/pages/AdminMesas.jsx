import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import { chairPositions } from '../lib/mesasLayout'
import { CalendarioReservas, ListaReservasDia, todayISO } from '../components/PanelReservasDia.jsx'

// Tres salas editables desde la misma pantalla: el comedor (tabla `mesas`), el
// salón de eventos (tabla `mesas_salon`, reconstruido de un video, 10 x 15 m) y
// la terraza/jardín trasera (tabla `mesas_terraza`, estimada a partir de fotos).
// Van en tablas separadas para no mezclar las reservas entre salas,
// pero se editan las tres desde /admin/mesas con el selector de abajo.
import { PlanoDefs, Recinto, Piso, Cota, FranjaLabel, NotaPlano, PuertaDoble, C as PC } from '../lib/planoSalas.jsx'

// Geometría y materiales por defecto de cada sala — se usan mientras la
// migración `supabase/add_config_salas.sql` no esté corrida (columnas nuevas
// en `salas` todavía inexistentes) o mientras esa fila no traiga un campo
// puntual. Son los mismos valores que antes estaban fijos en JSX.
const ROOM_GEOMETRIA_DEFAULT = {
  comedor: {
    ancho: 1314,
    largo: 1700,
    hueco: { x0: 324, y0: 0, x1: 1314, y1: 550 },
    // margen que se agrega al viewBox para las cotas/etiquetas del margen
    margenDer: 396,
    margenAbajo: 310,
    colorPiso: '#7A5432',
    colorMesa: '#3a2c24',
    colorSilla: '#221A16'
  },
  salon: {
    ancho: 1000,
    largo: 1500,
    hueco: null,
    margenDer: 400,
    margenAbajo: 380,
    colorPiso: '#2A211C',
    colorMesa: '#3a2c24',
    colorSilla: '#221A16'
  },
  terraza: {
    ancho: 1200,
    largo: 2000,
    hueco: null,
    margenDer: 400,
    margenAbajo: 380,
    // La terraza tiene 3 materiales de piso (deck/piedra/pasto); `color_piso`
    // es un solo campo por sala, así que solo recolorea el deck base — piedra
    // y pasto se quedan con su tono fijo (ver PlanoDefs en planoSalas.jsx).
    colorPiso: '#7A5432',
    colorMesa: '#3a2c24',
    colorSilla: '#221A16'
  }
}

// Contorno interior libre del Comedor Exterior: rectángulo ancho x largo con
// el recorte en L cortado. Asume que el hueco toca el borde superior
// (hueco.y0 = 0) y el borde derecho (hueco.x1 = ancho) — la forma real de
// hoy — no es un recorte de esquina genérico.
function comedorPath(ancho, largo, hueco) {
  if (!hueco) return `M0,0 H${ancho} V${largo} H0 Z`
  return `M0,0 L${hueco.x0},0 L${hueco.x0},${hueco.y1} L${hueco.x1},${hueco.y1} L${hueco.x1},${largo} L0,${largo} Z`
}

// Combina la fila de `salas` (si ya tiene las columnas nuevas) con los
// valores por defecto, y deriva de ahí el recinto (`viewBox`/`limite`/
// `huecos`/`path`) y los 3 colores editables. `salaRow` puede venir
// incompleto (migración no corrida) o ser `null/undefined`.
export function getSalaGeometria(room, salaRow) {
  const def = ROOM_GEOMETRIA_DEFAULT[room]
  if (!def) return null
  const ancho = Number(salaRow?.ancho) || def.ancho
  const largo = Number(salaRow?.largo) || def.largo
  const hueco =
    room === 'comedor'
      ? salaRow?.hueco_x0 != null && salaRow?.hueco_y0 != null && salaRow?.hueco_x1 != null && salaRow?.hueco_y1 != null
        ? { x0: salaRow.hueco_x0, y0: salaRow.hueco_y0, x1: salaRow.hueco_x1, y1: salaRow.hueco_y1 }
        : def.hueco
      : null
  return {
    ancho,
    largo,
    hueco,
    limite: { x0: 0, y0: 0, x1: ancho, y1: largo },
    huecos: hueco ? [hueco] : [],
    viewBox: { x: -190, y: -170, w: ancho + def.margenDer, h: largo + def.margenAbajo },
    path: room === 'comedor' ? comedorPath(ancho, largo, hueco) : `M0,0 H${ancho} V${largo} H0 Z`,
    colorPiso: salaRow?.color_piso || def.colorPiso,
    colorMesa: salaRow?.color_mesa || def.colorMesa,
    colorSilla: salaRow?.color_silla || def.colorSilla
  }
}

export const ROOMS = {
  comedor: {
    label: 'Comedor Exterior',
    table: 'mesas',
    idPrefix: 't',
    // El arrastre se limita a la sala, no al viewBox: si no, una mesa se puede
    // dejar en el margen de las cotas, fuera del recinto. `huecos` saca el
    // recorte en L del Comedor Exterior. Estos valores son el fallback antes
    // de que se resuelva `getSalaGeometria(room, salas[room])` en el render.
    ...getSalaGeometria('comedor', null),
    nuevaMesa: { x: 690, y: 1080, ancho: 120, capacidad: 8 }
  },
  salon: {
    label: 'Comedor Principal',
    table: 'mesas_salon',
    idPrefix: 'sm',
    ...getSalaGeometria('salon', null),
    nuevaMesa: { x: 500, y: 750, ancho: 120, capacidad: 4 }
  },
  terraza: {
    label: 'Terraza',
    table: 'mesas_terraza',
    idPrefix: 'tz',
    ...getSalaGeometria('terraza', null),
    nuevaMesa: { x: 400, y: 1700, ancho: 70, capacidad: 2 }
  }
}

// Acota un punto al interior de la sala, empujándolo fuera de los recortes
// (el Comedor Exterior es una L, no un rectángulo).
export function limitarASala(config, x, y) {
  const l = config.limite
  if (!l) return { x, y }
  let nx = Math.min(l.x1, Math.max(l.x0, x))
  let ny = Math.min(l.y1, Math.max(l.y0, y))
  ;(config.huecos || []).forEach((h) => {
    if (nx > h.x0 && nx < h.x1 && ny > h.y0 && ny < h.y1) {
      // se sale por el borde más cercano del hueco
      const dIzq = nx - h.x0
      const dAbajo = h.y1 - ny
      if (dIzq <= dAbajo) nx = h.x0
      else ny = h.y1
    }
  })
  return { x: nx, y: ny }
}

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}

function toLocal(dx, dy, angleDeg) {
  const rad = (-angleDeg * Math.PI) / 180
  return {
    lx: dx * Math.cos(rad) - dy * Math.sin(rad),
    ly: dx * Math.sin(rad) + dy * Math.cos(rad)
  }
}

// Los nombres de zona (COMEDOR LATERAL, BARRA, etc.) vienen de la tabla
// `zonas` y se dibujan acá — la geometría fija (muros, columnas, barra, etc.)
// se queda hardcodeada porque eso no se pidió que fuera editable.
export function ZonaLabels({ zonas, fontSize = 26, fontFamily = "'Space Grotesk',Arial,sans-serif", fill = '#FFF8F1', opacity = 0.55 }) {
  return (
    <g fontFamily={fontFamily} fontWeight="700" fill={fill}>
      {zonas
        .filter((z) => z.x2 == null || z.y2 == null) // las filas con x2/y2 son líneas, no texto
        .map((z) => (
          <text
            key={z.id}
            x={z.x}
            y={z.y}
            fontSize={z.tam || fontSize}
            opacity={opacity}
            textAnchor={z.angulo ? 'middle' : undefined}
            transform={z.angulo ? `rotate(${z.angulo} ${z.x} ${z.y})` : undefined}
          >
            {z.texto}
          </text>
        ))}
    </g>
  )
}

// Líneas punteadas de separación de zona — solo visuales, no acotan el
// arrastre de mesas (ver `limitarASala`, que ni las lee). Cada fila de
// `zonas` con `x2`/`y2` seteados se dibuja como línea de (x,y) a (x2,y2) en
// vez de texto.
export function ZonaLineas({ zonas, color = PC.bronze, opacity = 0.4 }) {
  const lineas = zonas.filter((z) => z.x2 != null && z.y2 != null)
  if (!lineas.length) return null
  return (
    <g stroke={color} strokeWidth="2" strokeDasharray="2 14" opacity={opacity}>
      {lineas.map((z) => (
        <line key={z.id} x1={z.x} y1={z.y} x2={z.x2} y2={z.y2} />
      ))}
    </g>
  )
}

// `sala` es la geometría ya resuelta (`getSalaGeometria('comedor', ...)`) —
// opcional para que este componente siga funcionando si alguien lo usa sin
// pasarla (cae en los valores por defecto de hoy).
export function ComedorBackground({ zonas, sala }) {
  const g = sala || getSalaGeometria('comedor', null)
  const { ancho, largo, hueco, path, colorPiso } = g
  return (
    <>
      <PlanoDefs pisoDeck={colorPiso} />
      <Recinto d={path} piso="slDeck" />

      {/* cotas: el recorte en L se lee con la medida corta arriba */}
      {hueco ? (
        <>
          <Cota x1={0} y1={-70} x2={hueco.x0} y2={-70} />
          <Cota x1={0} y1={largo + 70} x2={ancho} y2={largo + 70} />
          <Cota x1={-90} y1={0} x2={-90} y2={largo} />
          <Cota x1={ancho + 70} y1={hueco.y1} x2={ancho + 70} y2={largo} />
          <FranjaLabel x={ancho + 70} y0={0} y1={hueco.y1} texto="ACCESO" sub="vereda" />
        </>
      ) : (
        <>
          <Cota x1={0} y1={-70} x2={ancho} y2={-70} />
          <Cota x1={-90} y1={0} x2={-90} y2={largo} />
        </>
      )}

      <ZonaLabels zonas={zonas} opacity={0.75} />
      <ZonaLineas zonas={zonas} />
      <NotaPlano x={0} y={-110} texto="COMEDOR EXTERIOR · deck de madera" />
    </>
  )
}

// Salón de 10 x 15 m reconstruido desde el video de recorrido (agosto 2026).
// Columnas, barra, cabina telefónica, etc. son solo referencia fija del espacio.
export function SalonBackground({ zonas, sala }) {
  const g = sala || getSalaGeometria('salon', null)
  const ROOM_W = g.ancho
  const ROOM_H = g.largo
  return (
    <>
      <PlanoDefs pisoPulido={g.colorPiso} />
      <Recinto d={g.path} piso="slPulido" />

      <Cota x1={0} y1={-70} x2={ROOM_W} y2={-70} />
      <Cota x1={-90} y1={0} x2={-90} y2={ROOM_H} />

      <FranjaLabel x={ROOM_W + 70} y0={0} y1={250} texto="RECEPCIÓN" />
      <FranjaLabel x={ROOM_W + 70} y0={250} y1={900} texto="SALÓN PRINCIPAL" sub="mesas de evento" />
      <FranjaLabel x={ROOM_W + 70} y0={900} y1={1100} texto="BARRA" />
      <FranjaLabel x={ROOM_W + 70} y0={1100} y1={ROOM_H} texto="LOUNGE" />

      <ZonaLineas zonas={zonas} />

      <ZonaLabels zonas={zonas.filter((z) => z.id !== 's_barra_letrero' && z.id !== 's_terraza' && z.texto)} />

      {/* acceso principal, doble hoja abriendo hacia adentro */}
      <PuertaDoble cx={500} y={0} ancho={300} dir={1} />

      {/* columnas doradas junto al acceso */}
      <circle cx="330" cy="60" r="16" fill={PC.gold} />
      <circle cx="670" cy="60" r="16" fill={PC.gold} />

      {/* cordones de acceso */}
      <g stroke={PC.gold} strokeWidth="2" opacity="0.6">
        <line x1="140" y1="120" x2="140" y2="200" />
        <line x1="860" y1="120" x2="860" y2="200" />
      </g>
      <circle cx="140" cy="120" r="8" fill={PC.wine} stroke={PC.gold} strokeWidth="1.5" />
      <circle cx="140" cy="200" r="8" fill={PC.wine} stroke={PC.gold} strokeWidth="1.5" />
      <circle cx="860" cy="120" r="8" fill={PC.wine} stroke={PC.gold} strokeWidth="1.5" />
      <circle cx="860" cy="200" r="8" fill={PC.wine} stroke={PC.gold} strokeWidth="1.5" />

      <g filter="url(#slSombra)">
        {/* panel de bienvenida, pared izquierda */}
        <rect x="0" y="140" width="16" height="70" fill="#221A16" stroke={PC.gold} strokeWidth="2" />

        {/* pared espejada, pared derecha del salón */}
        <rect x={ROOM_W - 16} y="420" width="16" height="260" fill="#221A16" stroke={PC.diamond} strokeWidth="2" />

        {/* marco dorado de fotos, pared derecha */}
        <rect x={ROOM_W - 16} y="330" width="16" height="50" fill="#221A16" stroke={PC.gold} strokeWidth="2.5" />

        {/* mueble/cava, pared izquierda */}
        <rect x="0" y="700" width="16" height="140" fill="#221A16" stroke={PC.silver} strokeWidth="1.5" />

        {/* barra, pared derecha */}
        <rect x={ROOM_W - 70} y="920" width="70" height="150" fill="#221A16" stroke={PC.gold} strokeWidth="2.5" />

        {/* cabina telefónica, pared izquierda del lounge */}
        <rect x="0" y="1160" width="90" height="90" fill={PC.wine} stroke={PC.gold} strokeWidth="3" />

        {/* banqueta lounge, pared derecha */}
        <rect x={ROOM_W - 60} y="1180" width="60" height="180" rx="14" fill={PC.wine} opacity="0.55" stroke={PC.gold} strokeWidth="2" />
      </g>

      {/* esferas colgantes sobre la pared espejada */}
      <circle cx={ROOM_W - 40} cy="450" r="10" fill={PC.gold} opacity="0.85" />
      <circle cx={ROOM_W - 40} cy="540" r="10" fill={PC.gold} opacity="0.85" />
      <circle cx={ROOM_W - 40} cy="630" r="10" fill={PC.gold} opacity="0.85" />

      {zonas
        .filter((z) => z.id === 's_barra_letrero' && z.texto)
        .map((z) => (
          <text
            key={z.id}
            x={z.x}
            y={z.y}
            textAnchor="middle"
            fontSize={z.tam || 22}
            fontWeight="700"
            fill={PC.gold}
            transform={`rotate(${z.angulo} ${z.x} ${z.y})`}
          >
            {z.texto}
          </text>
        ))}

      {/* puerta trasera hacia terraza / piscina */}
      <PuertaDoble cx={500} y={ROOM_H} ancho={200} dir={-1} color={PC.diamond} />
      {zonas
        .filter((z) => z.id === 's_terraza' && z.texto)
        .map((z) => (
          <text key={z.id} x={z.x} y={z.y} textAnchor="middle" fontSize={z.tam || 18} fill={PC.diamond} opacity="0.7">
            {z.texto}
          </text>
        ))}

      <NotaPlano x={0} y={-110} texto="COMEDOR PRINCIPAL · 10,00 × 15,00 m" />
    </>
  )
}

// Terraza/jardín trasera, estimada a partir de fotos del recinto (agosto 2026,
// sin medidas reales todavía). 3 zonas apiladas: caminata cubierta con carpas,
// pista central bajo un arco de truss, y jardín con barra/mesas de barril
// junto al escenario (objeto arrastrable, ver MesaShape).
export function TerrazaBackground({ zonas, sala }) {
  const g = sala || getSalaGeometria('terraza', null)
  const ROOM_W = g.ancho
  const ROOM_H = g.largo
  return (
    <>
      <PlanoDefs pisoDeck={g.colorPiso} />
      {/* El piso base es el deck de la caminata; las otras dos franjas se
          parchan encima porque el material del piso cambia de verdad. Estos
          dos parches (piedra/pasto) no son editables — `color_piso` es un
          solo campo por sala, ver nota en ROOM_GEOMETRIA_DEFAULT. */}
      <Recinto d={g.path} piso="slDeck" />
      <Piso x={0} y={650} w={ROOM_W} h={700} piso="slPiedra" />
      <Piso x={0} y={1350} w={ROOM_W} h={ROOM_H - 1350} piso="slPasto" />

      <Cota x1={0} y1={-70} x2={ROOM_W} y2={-70} />
      <Cota x1={-90} y1={0} x2={-90} y2={ROOM_H} />

      <FranjaLabel x={ROOM_W + 70} y0={0} y1={650} texto="CAMINATA CUBIERTA" sub="carpas pagoda" />
      <FranjaLabel x={ROOM_W + 70} y0={650} y1={1350} texto="PISTA" sub="pavimento · arco de truss" />
      <FranjaLabel x={ROOM_W + 70} y0={1350} y1={ROOM_H} texto="JARDÍN Y BARRA" sub="piscina cubierta" />

      <ZonaLineas zonas={zonas} opacity={0.45} />

      <ZonaLabels zonas={zonas} />

      {/* carpas tipo pagoda sobre la caminata cubierta */}
      <g fill={PC.muro} opacity="0.1">
        <path d="M0,0 L150,-40 L300,0 Z" />
        <path d="M300,0 L450,-40 L600,0 Z" />
      </g>
      <line x1="0" y1="0" x2="600" y2="0" stroke={PC.bronze} strokeWidth="4" opacity="0.5" />

      {/* arco de truss que marca el ingreso a la pista */}
      <g filter="url(#slSombra)">
        <line x1="0" y1="700" x2="0" y2="600" stroke={PC.silver} strokeWidth="6" />
        <line x1="0" y1="600" x2={ROOM_W} y2="600" stroke={PC.silver} strokeWidth="6" />
        <line x1={ROOM_W} y1="600" x2={ROOM_W} y2="700" stroke={PC.silver} strokeWidth="6" />
      </g>

      <NotaPlano x={0} y={-110} texto="TERRAZA · medidas estimadas de fotos, sin relevamiento" />
    </>
  )
}

// El escenario y el carrito ya no son formas fijas acá: son filas de
// mesas_terraza (tipo 'escenario' / 'decor', capacidad 0) que se arrastran,
// agrandan/achican (incl. alargar el escenario) y eliminan con el mismo
// mecanismo que las mesas.
function ovalPath(ancho, alto) {
  const r = alto / 2
  const straightEnd = ancho / 2 - r
  return `M${-ancho / 2},${-r} L${straightEnd},${-r} A${r},${r} 0 0 1 ${straightEnd},${r} L${-ancho / 2},${r} Z`
}

function SombrillaShape({ radio, isSel }) {
  const n = 8
  const wedges = []
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2
    const x0 = Math.cos(a0) * radio
    const y0 = Math.sin(a0) * radio
    const x1 = Math.cos(a1) * radio
    const y1 = Math.sin(a1) * radio
    wedges.push(
      <path
        key={i}
        d={`M0,0 L${x0},${y0} A${radio},${radio} 0 0 1 ${x1},${y1} Z`}
        fill={isSel ? '#FF7A1A' : i % 2 === 0 ? '#B5732A' : '#8a5a25'}
        stroke={isSel ? '#FFD9B3' : '#221A16'}
        strokeWidth="1.5"
      />
    )
  }
  return (
    <g>
      {wedges}
      <circle r={radio} fill="none" stroke={isSel ? '#FFD9B3' : '#221A16'} strokeWidth={isSel ? 5 : 2.5} />
      <circle r="6" fill="#221A16" stroke={isSel ? '#FFD9B3' : '#B5732A'} strokeWidth="2" />
    </g>
  )
}

function CarritoShape({ ancho, alto, isSel }) {
  return (
    <g opacity={isSel ? 1 : 0.8}>
      <rect
        x={-ancho / 2}
        y={-alto / 2}
        width={ancho}
        height={alto}
        rx="6"
        fill="#221A16"
        stroke={isSel ? '#FFD9B3' : '#FFF8F1'}
        strokeWidth={isSel ? 4 : 2}
      />
      <circle cx={-ancho / 2 + 14} cy={alto / 2} r="7" fill="#221A16" stroke={isSel ? '#FFD9B3' : '#FFF8F1'} strokeWidth="1.5" />
      <circle cx={ancho / 2 - 14} cy={alto / 2} r="7" fill="#221A16" stroke={isSel ? '#FFD9B3' : '#FFF8F1'} strokeWidth="1.5" />
    </g>
  )
}

// Ícono de parlante: gabinete + cono + ondas de sonido.
function ParlanteShape({ ancho, alto, isSel }) {
  const stroke = isSel ? '#FFD9B3' : '#E3B341'
  return (
    <g opacity={isSel ? 1 : 0.85}>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="8" fill="#221A16" stroke={stroke} strokeWidth={isSel ? 4 : 2} />
      <circle cx={-ancho / 6} cy="0" r={alto / 4} fill="none" stroke={stroke} strokeWidth="2" />
      <circle cx={-ancho / 6} cy="0" r={alto / 10} fill={stroke} />
      <path d={`M${ancho / 8},${-alto / 4} A${alto / 3},${alto / 3} 0 0 1 ${ancho / 8},${alto / 4}`} fill="none" stroke={stroke} strokeWidth="2" />
      <path d={`M${ancho / 3.2},${-alto / 3} A${alto / 2},${alto / 2} 0 0 1 ${ancho / 3.2},${alto / 3}`} fill="none" stroke={stroke} strokeWidth="2" opacity="0.6" />
    </g>
  )
}

// Jardinera de madera clara sobre ruedas — foto real: cajón de tablones
// claros, lengua de suegra (hojas altas y rectas) + mata araña (hojas finas
// que caen a los costados). Ícono tipo pictograma, no plano ortográfico
// estricto, igual que el parlante/carrito de al lado.
function JardineraShape({ ancho, alto, isSel }) {
  const stroke = isSel ? '#FFD9B3' : '#B5732A'
  const wood = isSel ? '#EAD9B8' : '#D9C6A2'
  return (
    <g opacity={isSel ? 1 : 0.9}>
      {/* mata araña: hojas finas colgando a los costados del cajón */}
      <g stroke="#5c9c4a" strokeWidth={Math.max(2, alto * 0.045)} strokeLinecap="round" fill="none" opacity="0.85">
        <path d={`M${-ancho * 0.34},${-alto * 0.4} q${-ancho * 0.2},${alto * 0.15} ${-ancho * 0.24},${alto * 0.45}`} />
        <path d={`M${-ancho * 0.3},${-alto * 0.42} q${-ancho * 0.1},${alto * 0.35} ${-ancho * 0.1},${alto * 0.6}`} />
        <path d={`M${ancho * 0.32},${-alto * 0.4} q${ancho * 0.22},${alto * 0.12} ${ancho * 0.28},${alto * 0.4}`} />
      </g>
      {/* lengua de suegra: hojas altas, rectas, algunas con curva leve */}
      <g stroke="#3f6b34" strokeWidth={Math.max(3, alto * 0.06)} strokeLinecap="round" fill="none">
        <path d={`M${-ancho * 0.2},${-alto * 0.46} q${-ancho * 0.03},${-alto * 0.5} ${ancho * 0.03},${-alto * 0.78}`} />
        <path d={`M${-ancho * 0.04},${-alto * 0.46} q${ancho * 0.02},${-alto * 0.65} ${-ancho * 0.02},${-alto * 1.0}`} />
        <path d={`M${ancho * 0.1},${-alto * 0.46} q${ancho * 0.05},${-alto * 0.55} ${ancho * 0.1},${-alto * 0.82}`} />
        <path d={`M${ancho * 0.22},${-alto * 0.46} q${ancho * 0.06},${-alto * 0.4} ${ancho * 0.16},${-alto * 0.62}`} />
      </g>
      {/* cajón de madera clara con líneas de tablones horizontales */}
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="5" fill={wood} stroke={stroke} strokeWidth={isSel ? 4 : 2.5} />
      <line x1={-ancho / 2 + 5} y1={-alto * 0.08} x2={ancho / 2 - 5} y2={-alto * 0.08} stroke={stroke} strokeWidth="1" opacity="0.45" />
      <line x1={-ancho / 2 + 5} y1={alto * 0.2} x2={ancho / 2 - 5} y2={alto * 0.2} stroke={stroke} strokeWidth="1" opacity="0.45" />
      {/* ruedas */}
      <circle cx={-ancho / 2 + 9} cy={alto / 2 - 5} r="5" fill="#221A16" stroke={stroke} strokeWidth="1.5" />
      <circle cx={ancho / 2 - 9} cy={alto / 2 - 5} r="5" fill="#221A16" stroke={stroke} strokeWidth="1.5" />
    </g>
  )
}

// Puerta de acceso: vano punteado en la pared + hoja + arco de giro, símbolo
// arquitectónico estándar. Estaba en el layout original y no se migró.
function EntradaShape({ ancho, isSel }) {
  const stroke = isSel ? '#FFD9B3' : '#E3B341'
  const w = ancho
  return (
    <g opacity={isSel ? 1 : 0.85}>
      <line x1={-w / 2} y1="0" x2={w / 2} y2="0" stroke={stroke} strokeWidth={isSel ? 3 : 2} strokeDasharray="6 4" opacity="0.6" />
      <line x1={-w / 2} y1="0" x2={-w / 2} y2={-w} stroke={stroke} strokeWidth={isSel ? 4 : 3} />
      <path d={`M${-w / 2},${-w} A${w},${w} 0 0 1 ${w / 2},0`} fill="none" stroke={stroke} strokeWidth="1.5" opacity="0.5" />
    </g>
  )
}

// Rampa de acceso para sillas de ruedas: rectángulo con rayas diagonales
// (pendiente) + pictograma simplificado. Estaba en el layout original y no
// se migró.
function RampaShape({ ancho, alto, isSel }) {
  const stroke = isSel ? '#FFD9B3' : '#7DD3E8'
  const r = Math.min(ancho, alto)
  return (
    <g opacity={isSel ? 1 : 0.85}>
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="4" fill="none" stroke={stroke} strokeWidth={isSel ? 4 : 2.5} />
      <g stroke={stroke} strokeWidth="2" opacity="0.5">
        {[-0.6, -0.3, 0, 0.3, 0.6].map((f, i) => (
          <line key={i} x1={-ancho / 2 + f * ancho} y1={alto / 2} x2={-ancho / 2 + f * ancho + alto} y2={-alto / 2} />
        ))}
      </g>
      <circle cx="0" cy={alto * 0.1} r={r * 0.22} fill="none" stroke={stroke} strokeWidth="2.5" />
      <circle cx={-r * 0.05} cy={-alto * 0.28} r={r * 0.12} fill={stroke} />
    </g>
  )
}

// Mesa elegante del Comedor Principal, inspirada en la foto real: mantel
// negro, borde dorado tipo plato base, y un marcador de centro de mesa
// (flor). Solo se usa ahí — el resto de las salas mantiene el círculo liso.
function MesaEleganteShape({ radio, isSel }) {
  const rim = isSel ? '#FFD9B3' : '#E3B341'
  return (
    <g>
      <circle r={radio} fill="#15100D" stroke={rim} strokeWidth={isSel ? 5 : 3} />
      <circle r={radio * 0.84} fill="none" stroke={rim} strokeWidth="1.5" opacity="0.5" />
      <circle r={radio * 0.16} fill="#E3B341" />
      {isSel && <circle r={radio + 4} fill="none" stroke="#FF7A1A" strokeWidth="2" opacity="0.6" />}
    </g>
  )
}

// `colorMesa` es el color genérico de las mesas redondas/rectangulares (por
// defecto el bronce oscuro de siempre) — NO se aplica a `MesaEleganteShape`
// (el negro + borde dorado del salón), que sigue siendo su propio estilo fijo.
export function MesaShape({ mesa, isSel, elegante, colorMesa = '#3a2c24' }) {
  if (mesa.tipo === 'escenario') {
    return (
      <path
        d={ovalPath(mesa.ancho, mesa.alto)}
        fill="#B5732A"
        opacity={isSel ? 0.45 : 0.28}
        stroke="#E3B341"
        strokeWidth={isSel ? 5 : 2.5}
      />
    )
  }
  if (mesa.tipo === 'decor') {
    if (mesa.estilo === 'parlante') return <ParlanteShape ancho={mesa.ancho} alto={mesa.alto} isSel={isSel} />
    if (mesa.estilo === 'jardinera') return <JardineraShape ancho={mesa.ancho} alto={mesa.alto} isSel={isSel} />
    if (mesa.estilo === 'entrada') return <EntradaShape ancho={mesa.ancho} isSel={isSel} />
    if (mesa.estilo === 'rampa') return <RampaShape ancho={mesa.ancho} alto={mesa.alto} isSel={isSel} />
    return <CarritoShape ancho={mesa.ancho} alto={mesa.alto} isSel={isSel} />
  }
  if (mesa.tipo === 'round' && mesa.estilo === 'sombrilla') {
    return <SombrillaShape radio={mesa.ancho / 2} isSel={isSel} />
  }
  if (mesa.tipo === 'round' && elegante) {
    return <MesaEleganteShape radio={mesa.ancho / 2} isSel={isSel} />
  }
  if (mesa.tipo === 'round') {
    return (
      <circle
        r={mesa.ancho / 2}
        fill={isSel ? '#FF7A1A' : colorMesa}
        stroke={isSel ? '#FFD9B3' : '#B5732A'}
        strokeWidth={isSel ? 6 : 3}
      />
    )
  }
  return (
    <rect
      x={-mesa.ancho / 2}
      y={-mesa.alto / 2}
      width={mesa.ancho}
      height={mesa.alto}
      rx="10"
      fill={isSel ? '#FF7A1A' : colorMesa}
      stroke={isSel ? '#FFD9B3' : '#B5732A'}
      strokeWidth={isSel ? 6 : 3}
    />
  )
}

export default function AdminMesas() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [room, setRoom] = useState('comedor')
  const [fechaReservas, setFechaReservas] = useState(todayISO())
  const [mesas, setMesas] = useState([])
  const [zonas, setZonas] = useState([])
  const [salas, setSalas] = useState({ comedor: { activo: true }, salon: { activo: true }, terraza: { activo: true } })
  const [selectedId, setSelectedId] = useState(null)
  const [mostrarReservasMobile, setMostrarReservasMobile] = useState(false)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  // `ROOMS[room]` trae label/table/idPrefix/nuevaMesa (fijos por código) más
  // los valores por defecto de geometría/color; se pisan acá con lo que haya
  // en `salas[room]` (la fila real de Supabase, si ya tiene las columnas
  // nuevas) para que el recinto y los colores reaccionen a lo que edite el
  // admin sin recargar la página.
  const config = { ...ROOMS[room], ...getSalaGeometria(room, salas[room]) }

  useEffect(() => {
    if (!isAdmin) return
    setSelectedId(null)
    supabase
      .from(config.table)
      .select('*')
      .order('orden')
      .then(({ data }) => setMesas(data ?? []))
    supabase
      .from('zonas')
      .select('*')
      .eq('room', room)
      .order('orden')
      .then(({ data }) => setZonas(data ?? []))
  }, [isAdmin, room])

  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('salas')
      .select('*')
      .then(({ data }) => {
        if (!data?.length) return
        const map = {}
        data.forEach((s) => {
          map[s.id] = s
        })
        setSalas(map)
      })
  }, [isAdmin])

  function updateZonaLocal(id, texto) {
    setZonas((prev) => prev.map((z) => (z.id === id ? { ...z, texto } : z)))
  }

  async function persistZona(id, texto) {
    await supabase.from('zonas').update({ texto }).eq('id', id)
  }

  async function toggleSalaActiva() {
    const actual = salas[room]?.activo ?? true
    const nuevo = !actual
    setSalas((prev) => ({ ...prev, [room]: { ...prev[room], activo: nuevo } }))
    await supabase.from('salas').update({ activo: nuevo }).eq('id', room)
  }

  // Recinto/materiales de la sala (ancho, largo, hueco en L, colores) — mismo
  // patrón que `updateZonaLocal`/`persistZona`: actualiza el estado local
  // para que el plano reaccione al toque, y guarda en Supabase.
  function updateSalaLocal(patch) {
    setSalas((prev) => ({ ...prev, [room]: { ...prev[room], ...patch } }))
  }

  async function persistSala(patch) {
    const { error } = await supabase.from('salas').update(patch).eq('id', room)
    if (error) {
      console.error('No se pudo guardar la configuración de la sala:', error)
      alert('No se pudo guardar ese cambio (revisa tu conexión) — vuelve a intentarlo.')
    }
  }

  // Nueva línea de zona: arranca centrada, cruzando la sala de lado a lado a
  // media altura, para que sea fácil de encontrar y arrastrar a su lugar.
  async function agregarLineaZona() {
    const l = config.limite
    const midY = Math.round((l.y0 + l.y1) / 2)
    const nueva = {
      id: `linea_${Date.now()}`,
      room,
      texto: '',
      x: l.x0 + 40,
      y: midY,
      x2: l.x1 - 40,
      y2: midY,
      angulo: 0,
      tam: 26,
      orden: zonas.length + 1
    }
    const { data, error } = await supabase.from('zonas').insert(nueva).select().single()
    if (!error && data) {
      setZonas((prev) => [...prev, data])
    } else if (error) {
      console.error('No se pudo agregar la línea de zona:', error)
      alert('No se pudo agregar la línea de zona (revisa tu conexión) — vuelve a intentarlo.')
    }
  }

  async function eliminarLineaZona(id) {
    await supabase.from('zonas').delete().eq('id', id)
    setZonas((prev) => prev.filter((z) => z.id !== id))
  }

  // Arrastre de las puntas de una línea de zona: solo visual, así que se
  // acota al viewBox nomás (no a `limitarASala`, que es para mesas).
  function limitarAViewBox(vb, x, y) {
    return {
      x: Math.min(vb.x + vb.w, Math.max(vb.x, x)),
      y: Math.min(vb.y + vb.h, Math.max(vb.y, y))
    }
  }

  function onPointerDownZonaPunto(e, zona, punto) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'zonaPunto', id: zona.id, punto }
  }

  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div className="px-6 pt-24 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h2 className="font-head text-lg font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm text-paper/50">Esta sección es solo para administradores de Varo's.</p>
      </div>
    )
  }

  const selected = mesas.find((m) => m.id === selectedId)
  // Las filas de `zonas` con x2/y2 son líneas de separación, no texto — se
  // editan en secciones distintas del panel.
  const zonasTexto = zonas.filter((z) => z.x2 == null)
  const lineasZona = zonas.filter((z) => z.x2 != null && z.y2 != null)

  function updateLocal(id, patch) {
    setMesas((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function persist(id, patch) {
    const { error } = await supabase.from(config.table).update(patch).eq('id', id)
    if (error) {
      console.error('No se pudo guardar el cambio de la mesa:', error)
      alert('No se pudo guardar ese cambio (revisa tu conexión) — vuelve a intentarlo.')
    }
  }

  function onPointerDownMesa(e, mesa) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelectedId(mesa.id)
    const p = svgPoint(svgRef.current, e.clientX, e.clientY)
    dragRef.current = { mode: 'move', id: mesa.id, startX: p.x, startY: p.y, origX: mesa.x, origY: mesa.y }
  }

  function onPointerDownRotate(e, mesa) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'rotate', id: mesa.id }
  }

  function onPointerDownResize(e, mesa) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'resize', id: mesa.id }
  }

  function onPointerMove(e) {
    const drag = dragRef.current
    if (!drag) return
    const p = svgPoint(svgRef.current, e.clientX, e.clientY)

    if (drag.mode === 'zonaPunto') {
      const pos = limitarAViewBox(config.viewBox, p.x, p.y)
      setZonas((prev) =>
        prev.map((z) => {
          if (z.id !== drag.id) return z
          return drag.punto === 'a' ? { ...z, x: pos.x, y: pos.y } : { ...z, x2: pos.x, y2: pos.y }
        })
      )
      return
    }

    const mesa = mesas.find((m) => m.id === drag.id)
    if (!mesa) return

    if (drag.mode === 'move') {
      // Sin este límite una mesa se puede arrastrar fuera del plano y
      // desaparecer de la pantalla (pasó con Mesa R1). Se acota al recinto
      // real de la sala — antes se acotaba al viewBox, que ahora es más
      // ancho porque tiene que dar lugar a las cotas del margen.
      const pos = limitarASala(config, drag.origX + (p.x - drag.startX), drag.origY + (p.y - drag.startY))
      updateLocal(mesa.id, pos)
    } else if (drag.mode === 'rotate') {
      const angle = (Math.atan2(p.y - mesa.y, p.x - mesa.x) * 180) / Math.PI + 90
      const snapped = e.shiftKey ? Math.round(angle / 15) * 15 : angle
      updateLocal(mesa.id, { angulo: snapped })
    } else if (drag.mode === 'resize') {
      const dx = p.x - mesa.x
      const dy = p.y - mesa.y
      if (mesa.tipo === 'round') {
        const radius = Math.hypot(dx, dy)
        const diametro = Math.min(300, Math.max(60, radius * 2))
        updateLocal(mesa.id, { ancho: diametro })
      } else {
        const { lx, ly } = toLocal(dx, dy, mesa.angulo)
        const ancho = Math.min(400, Math.max(40, Math.abs(lx) * 2))
        const alto = Math.min(500, Math.max(60, Math.abs(ly) * 2))
        updateLocal(mesa.id, { ancho, alto })
      }
    }
  }

  function onPointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return

    if (drag.mode === 'zonaPunto') {
      const zona = zonas.find((z) => z.id === drag.id)
      if (zona) supabase.from('zonas').update({ x: zona.x, y: zona.y, x2: zona.x2, y2: zona.y2 }).eq('id', zona.id)
      return
    }

    const mesa = mesas.find((m) => m.id === drag.id)
    if (!mesa) return
    if (drag.mode === 'move') persist(mesa.id, { x: mesa.x, y: mesa.y })
    else if (drag.mode === 'rotate') persist(mesa.id, { angulo: mesa.angulo })
    else if (drag.mode === 'resize') persist(mesa.id, { ancho: mesa.ancho, alto: mesa.alto })
  }

  function cambiarCapacidad(delta) {
    if (!selected) return
    const nueva = Math.min(20, Math.max(1, selected.capacidad + delta))
    updateLocal(selected.id, { capacidad: nueva })
    persist(selected.id, { capacidad: nueva })
  }

  // Bloqueo manual (mantención, evento privado, mobiliario retirado, etc.) —
  // se refleja automáticamente en /reservas: la mesa deja de ser reservable.
  function toggleBloqueo() {
    if (!selected) return
    const nuevaActiva = selected.activa === false
    const patch = nuevaActiva ? { activa: true, bloqueo_motivo: null } : { activa: false }
    updateLocal(selected.id, patch)
    persist(selected.id, patch)
  }

  function guardarMotivoBloqueo(motivo) {
    if (!selected) return
    updateLocal(selected.id, { bloqueo_motivo: motivo })
    persist(selected.id, { bloqueo_motivo: motivo })
  }

  async function agregarMesa(tipo) {
    const base = config.nuevaMesa
    const nueva =
      tipo === 'rect'
        ? {
            id: `${config.idPrefix}${Date.now()}`,
            tipo: 'rect',
            etiqueta: `Mesa ${mesas.length + 1}`,
            x: base.x,
            y: base.y,
            ancho: 180,
            alto: 90,
            angulo: 0,
            capacidad: base.capacidad,
            orden: mesas.length + 1
          }
        : {
            id: `${config.idPrefix}${Date.now()}`,
            tipo: 'round',
            etiqueta: `Mesa ${mesas.length + 1}`,
            x: base.x,
            y: base.y,
            ancho: base.ancho,
            alto: null,
            angulo: 0,
            capacidad: base.capacidad,
            orden: mesas.length + 1
          }
    const { data, error } = await supabase.from(config.table).insert(nueva).select().single()
    if (!error && data) {
      setMesas((prev) => [...prev, data])
      setSelectedId(data.id)
    } else if (error) {
      console.error('No se pudo agregar la mesa:', error)
      alert('No se pudo agregar la mesa (revisa tu conexión) — vuelve a intentarlo.')
    }
  }

  // Clona el elemento seleccionado (mesa u objeto decorativo) con un id
  // nuevo, levemente desplazado para que no quede encimado con el original.
  async function duplicarMesa() {
    if (!selected) return
    const vb = config.viewBox
    const offset = 40
    const nueva = {
      ...selected,
      id: `${config.idPrefix}${Date.now()}`,
      x: Math.min(vb.x + vb.w, Math.max(vb.x, selected.x + offset)),
      y: Math.min(vb.y + vb.h, Math.max(vb.y, selected.y + offset)),
      orden: mesas.length + 1
    }
    const { data, error } = await supabase.from(config.table).insert(nueva).select().single()
    if (!error && data) {
      setMesas((prev) => [...prev, data])
      setSelectedId(data.id)
    } else if (error) {
      console.error('No se pudo duplicar:', error)
      alert('No se pudo duplicar (revisa tu conexión) — vuelve a intentarlo.')
    }
  }

  async function eliminarMesa() {
    if (!selected) return
    if (!window.confirm(`¿Eliminar ${selected.etiqueta}?`)) return
    await supabase.from(config.table).delete().eq('id', selected.id)
    setMesas((prev) => prev.filter((m) => m.id !== selected.id))
    setSelectedId(null)
  }

  return (
    <div className="px-4 pt-8 pb-24 lg:px-6 lg:grid lg:grid-cols-[260px_1fr_320px] lg:gap-6 lg:items-start">
      <div className="hidden lg:block lg:sticky lg:top-8">
        <CalendarioReservas fechaSeleccionada={fechaReservas} onSelectFecha={setFechaReservas} sala={room} />
      </div>

      <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
          <h1 className="font-head text-2xl font-semibold">Editar mesas</h1>
          <p className="text-xs text-paper/50 mt-1">
            Arrastra una mesa u objeto (escenario, carrito) para moverlo. Las mesas rectangulares y el escenario
            tienen un punto celeste para girar y un cuadrado en la esquina para agrandar/achicar. Selecciona
            cualquiera para eliminarlo. Los cambios se guardan solos.
          </p>
        </div>
        <div className="shrink-0 flex flex-col gap-1.5">
          <button
            onClick={() => agregarMesa('round')}
            className="px-3 py-2 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink whitespace-nowrap"
          >
            + Redonda
          </button>
          <button
            onClick={() => agregarMesa('rect')}
            className="px-3 py-2 rounded-lg font-head font-semibold text-xs border border-ember/40 text-ember whitespace-nowrap"
          >
            + Rectangular
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {Object.entries(ROOMS).map(([key, r]) => (
          <button
            key={key}
            onClick={() => setRoom(key)}
            className={`flex-1 min-h-[44px] px-1 flex items-center justify-center text-center leading-tight rounded-xl font-head font-semibold text-xs border ${
              room === key ? 'border-ember text-ember bg-ember/10' : 'border-white/10 text-paper/50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-inkSoft border border-white/5 rounded-xl px-4 py-3 mb-4">
        <div>
          <div className="text-xs text-paper/70">Disponible para reservas online</div>
          <div className="text-[10px] text-paper/40">Si la apagas, los clientes no pueden reservar en {config.label}</div>
        </div>
        <button
          onClick={toggleSalaActiva}
          className={`px-4 py-2 rounded-lg font-head font-semibold text-xs border whitespace-nowrap ${
            (salas[room]?.activo ?? true) ? 'border-ember/40 text-ember bg-ember/10' : 'border-white/10 text-paper/40'
          }`}
        >
          {(salas[room]?.activo ?? true) ? 'Activa' : 'Inactiva'}
        </button>
      </div>

      <div className="bg-inkSoft rounded-2xl p-3 mb-4">
        <svg
          ref={svgRef}
          viewBox={`${config.viewBox.x} ${config.viewBox.y} ${config.viewBox.w} ${config.viewBox.h}`}
          className="w-full h-auto touch-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {room === 'comedor' && <ComedorBackground zonas={zonas} sala={config} />}
          {room === 'salon' && <SalonBackground zonas={zonas} sala={config} />}
          {room === 'terraza' && <TerrazaBackground zonas={zonas} sala={config} />}

          {mesas.map((mesa) => {
            const isSel = mesa.id === selectedId
            const chairs = chairPositions(mesa)
            return (
              <g
                key={mesa.id}
                transform={`translate(${mesa.x},${mesa.y}) rotate(${mesa.angulo})`}
                opacity={mesa.activa === false ? 0.45 : 1}
              >
                {chairs.map((c, i) => (
                  <rect
                    key={i}
                    x={c.x - 12}
                    y={c.y - 12}
                    width="24"
                    height="24"
                    rx="5"
                    transform={`rotate(${c.rot} ${c.x} ${c.y})`}
                    fill={config.colorSilla}
                    stroke="#B5732A"
                    strokeWidth="2"
                  />
                ))}

                <g onPointerDown={(e) => onPointerDownMesa(e, mesa)} className="cursor-move">
                  <MesaShape mesa={mesa} isSel={isSel} elegante={room === 'salon'} colorMesa={config.colorMesa} />
                  {/* El número se contra-rota: identifica la mesa, así que debe
                      leerse derecho aunque la mesa esté girada 90° o 180°. */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${-mesa.angulo})`}
                    fontSize={mesa.tipo === 'escenario' || mesa.tipo === 'decor' ? 22 : 30}
                    fontWeight="700"
                    fill={isSel ? '#15100D' : '#FFF8F1'}
                  >
                    {mesa.etiqueta.replace('Mesa ', '')}
                  </text>
                </g>

                {isSel && (() => {
                  // Las redondas no tienen `alto` (es null) — el brazo del
                  // handle de giro se apoya en el radio en ese caso.
                  const brazo = mesa.tipo === 'round' ? mesa.ancho / 2 : mesa.alto / 2
                  return (
                    <>
                      <line x1="0" y1={-brazo} x2="0" y2={-brazo - 45} stroke="#7DD3E8" strokeWidth="3" strokeDasharray="4 4" />
                      <circle
                        cx="0"
                        cy={-brazo - 45}
                        r="14"
                        fill="#7DD3E8"
                        onPointerDown={(e) => onPointerDownRotate(e, mesa)}
                        className="cursor-grab"
                      />
                    </>
                  )
                })()}

                {isSel && (
                  <rect
                    x={mesa.tipo === 'round' ? mesa.ancho / 2 - 10 : mesa.ancho / 2 - 10}
                    y={mesa.tipo === 'round' ? -10 : mesa.alto / 2 - 10}
                    width="20"
                    height="20"
                    fill="#FFD9B3"
                    stroke="#15100D"
                    strokeWidth="2"
                    onPointerDown={(e) => onPointerDownResize(e, mesa)}
                    className="cursor-nwse-resize"
                  />
                )}
              </g>
            )
          })}

          {/* Puntas arrastrables de cada línea de zona — la línea en sí la
              dibuja ZonaLineas() dentro del *Background de arriba, esto solo
              agrega los dos handles para moverla. Solo visual: no pasa por
              limitarASala. */}
          {zonas
            .filter((z) => z.x2 != null && z.y2 != null)
            .map((z) => (
              <g key={`linea-${z.id}`}>
                <circle
                  cx={z.x}
                  cy={z.y}
                  r="14"
                  fill="#7DD3E8"
                  fillOpacity="0.85"
                  stroke="#15100D"
                  strokeWidth="2"
                  onPointerDown={(e) => onPointerDownZonaPunto(e, z, 'a')}
                  className="cursor-grab"
                />
                <circle
                  cx={z.x2}
                  cy={z.y2}
                  r="14"
                  fill="#7DD3E8"
                  fillOpacity="0.85"
                  stroke="#15100D"
                  strokeWidth="2"
                  onPointerDown={(e) => onPointerDownZonaPunto(e, z, 'b')}
                  className="cursor-grab"
                />
              </g>
            ))}
        </svg>
      </div>

      <div className="lg:hidden mb-4">
        <button
          type="button"
          onClick={() => setMostrarReservasMobile((v) => !v)}
          className="w-full flex items-center justify-between bg-inkSoft border border-white/5 rounded-xl px-4 py-3"
        >
          <span className="text-xs font-head font-semibold">Reservas del día</span>
          <span className="text-paper/40 text-[11px]">{mostrarReservasMobile ? 'Ocultar ▲' : 'Ver ▼'}</span>
        </button>
        {mostrarReservasMobile && (
          <div className="flex flex-col gap-3 mt-3">
            <CalendarioReservas fechaSeleccionada={fechaReservas} onSelectFecha={setFechaReservas} sala={room} />
            <ListaReservasDia fecha={fechaReservas} sala={room} />
          </div>
        )}
      </div>

      {zonasTexto.length > 0 && (
        <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-4">
          <div className="font-head font-semibold text-sm mb-2">Nombres de zona</div>
          <p className="text-[11px] text-paper/40 mb-3">
            Cambia el texto y toca fuera del campo para guardar. Déjalo vacío para que no se muestre en el plano.
          </p>
          <div className="flex flex-col gap-2">
            {zonasTexto.map((z) => (
              <input
                key={z.id}
                defaultValue={z.texto}
                placeholder="(vacío — no se muestra)"
                onBlur={(e) => {
                  const val = e.target.value.trim()
                  if (val !== z.texto) {
                    updateZonaLocal(z.id, val)
                    persistZona(z.id, val)
                  }
                }}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs text-paper"
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-4">
        <div className="font-head font-semibold text-sm mb-2">Recinto y materiales</div>
        <p className="text-[11px] text-paper/40 mb-3">
          Cambia el tamaño del plano, agrega líneas de separación (solo visuales, no limitan dónde se puede
          arrastrar una mesa) y los colores de piso, mesas y sillas de {config.label}.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-paper/40">Ancho (cm)</span>
            <input
              key={`${room}-ancho-${config.ancho}`}
              type="number"
              defaultValue={config.ancho}
              onBlur={(e) => {
                const val = Number(e.target.value)
                if (val > 0 && val !== config.ancho) {
                  updateSalaLocal({ ancho: val })
                  persistSala({ ancho: val })
                }
              }}
              className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs text-paper"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-paper/40">Largo (cm)</span>
            <input
              key={`${room}-largo-${config.largo}`}
              type="number"
              defaultValue={config.largo}
              onBlur={(e) => {
                const val = Number(e.target.value)
                if (val > 0 && val !== config.largo) {
                  updateSalaLocal({ largo: val })
                  persistSala({ largo: val })
                }
              }}
              className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs text-paper"
            />
          </label>
        </div>

        {room === 'comedor' && (
          <div className="mb-3">
            <div className="text-[10px] text-paper/40 mb-1.5">Recorte en L (cm) — x0, y0, x1, y1</div>
            <div className="grid grid-cols-4 gap-1.5">
              {['x0', 'y0', 'x1', 'y1'].map((campo) => (
                <input
                  key={`${room}-hueco-${campo}-${config.hueco?.[campo] ?? 0}`}
                  type="number"
                  defaultValue={config.hueco?.[campo] ?? 0}
                  onBlur={(e) => {
                    const val = Number(e.target.value)
                    const actual = config.hueco?.[campo] ?? 0
                    if (val !== actual) {
                      const columna = `hueco_${campo}`
                      updateSalaLocal({ [columna]: val })
                      persistSala({ [columna]: val })
                    }
                  }}
                  className="bg-ink border border-white/10 rounded-lg px-2 py-2 text-[11px] text-paper"
                />
              ))}
            </div>
          </div>
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-paper/40">Líneas de separación</span>
            <button onClick={agregarLineaZona} className="px-2 py-1 rounded-md border border-ember/40 text-ember text-[10px]">
              + Línea de zona
            </button>
          </div>
          {lineasZona.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {lineasZona.map((z, i) => (
                <div key={z.id} className="flex items-center justify-between bg-ink border border-white/10 rounded-lg px-3 py-1.5">
                  <span className="text-[11px] text-paper/60">Línea {i + 1} — arrástrala del plano</span>
                  <button onClick={() => eliminarLineaZona(z.id)} className="text-[10px] text-wineSoft">
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { campo: 'color_piso', label: 'Piso', valor: config.colorPiso },
            { campo: 'color_mesa', label: 'Mesas', valor: config.colorMesa },
            { campo: 'color_silla', label: 'Sillas', valor: config.colorSilla }
          ].map(({ campo, label, valor }) => (
            <label key={campo} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-paper/40">{label}</span>
              <input
                type="color"
                value={valor}
                // El selector nativo de color no siempre dispara blur al
                // cerrarse (a diferencia de un <input type="text">), así que
                // acá se guarda directo en cada cambio en vez de esperarlo.
                onChange={(e) => {
                  updateSalaLocal({ [campo]: e.target.value })
                  persistSala({ [campo]: e.target.value })
                }}
                className="w-full h-8 rounded-md border border-white/10 bg-ink cursor-pointer"
              />
            </label>
          ))}
        </div>
      </div>

      {selected && (
        <div className="bg-inkSoft border border-ember/20 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="font-head font-semibold text-sm">{selected.etiqueta}</div>
            <div className="flex gap-1.5">
              <button onClick={duplicarMesa} className="px-2 py-1 rounded-md border border-ember/40 text-ember text-[10px]">
                Duplicar
              </button>
              <button onClick={eliminarMesa} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px]">
                Eliminar
              </button>
            </div>
          </div>
          {selected.tipo !== 'escenario' && selected.tipo !== 'decor' && (
            <div className="flex items-center justify-between text-xs text-paper/60">
              <span>Sillas</span>
              <div className="flex items-center gap-3">
                <button onClick={() => cambiarCapacidad(-1)} className="w-8 h-8 rounded-lg border border-white/10 text-paper/70">
                  −
                </button>
                <span className="font-mono text-ember w-6 text-center">{selected.capacidad}</span>
                <button onClick={() => cambiarCapacidad(1)} className="w-8 h-8 rounded-lg border border-ember/40 text-ember">
                  +
                </button>
              </div>
            </div>
          )}
          {selected.tipo !== 'escenario' && selected.tipo !== 'decor' && (
            <div className="flex flex-col gap-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between text-xs text-paper/60">
                <span>Disponible para reservar</span>
                <button
                  onClick={toggleBloqueo}
                  className={`px-3 py-1.5 rounded-md border text-[11px] whitespace-nowrap ${
                    selected.activa === false ? 'border-wine/40 text-wineSoft' : 'border-ember/40 text-ember'
                  }`}
                >
                  {selected.activa === false ? 'Bloqueada — reactivar' : 'Bloquear mesa'}
                </button>
              </div>
              {selected.activa === false && (
                <input
                  key={selected.id}
                  defaultValue={selected.bloqueo_motivo ?? ''}
                  placeholder="Motivo (mantención, evento privado...)"
                  onBlur={(e) => {
                    const val = e.target.value.trim()
                    if (val !== (selected.bloqueo_motivo ?? '')) guardarMotivoBloqueo(val)
                  }}
                  className="bg-ink border border-wine/20 rounded-lg px-3 py-2 text-xs text-paper"
                />
              )}
            </div>
          )}
          <div className="text-[11px] text-paper/40">
            {selected.tipo === 'round'
              ? `Diámetro: ${Math.round(selected.ancho)} cm`
              : `Ancho: ${Math.round(selected.ancho)} cm · Largo: ${Math.round(selected.alto)} cm · Ángulo: ${Math.round(selected.angulo)}°`}
          </div>
        </div>
      )}
      </div>

      {/* Lista de clientes con reserva ese día, columna propia a la derecha
          en pantallas anchas — el calendario de la izquierda elige la fecha. */}
      <div className="hidden lg:block lg:sticky lg:top-8">
        <ListaReservasDia fecha={fechaReservas} sala={room} />
      </div>
    </div>
  )
}
