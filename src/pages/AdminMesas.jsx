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
export const ROOMS = {
  comedor: {
    label: 'Comedor Exterior',
    table: 'mesas',
    idPrefix: 't',
    viewBox: { x: -40, y: -40, w: 1420, h: 1780 },
    nuevaMesa: { x: 690, y: 1080, ancho: 120, capacidad: 8 }
  },
  salon: {
    label: 'Comedor Principal',
    table: 'mesas_salon',
    idPrefix: 'sm',
    viewBox: { x: -40, y: -40, w: 1080, h: 1580 },
    nuevaMesa: { x: 500, y: 750, ancho: 120, capacidad: 4 }
  },
  terraza: {
    label: 'Terraza',
    table: 'mesas_terraza',
    idPrefix: 'tz',
    viewBox: { x: -40, y: -40, w: 1280, h: 2080 },
    nuevaMesa: { x: 400, y: 1700, ancho: 70, capacidad: 2 }
  }
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
      {zonas.map((z) => (
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

export function ComedorBackground({ zonas }) {
  return (
    <>
      <path d="M0,0 L324,0 L324,550 L1314,550 L1314,1700 L0,1700 Z" fill="none" stroke="#B5732A" strokeWidth="10" />
      <ZonaLabels zonas={zonas} opacity={0.6} />
    </>
  )
}

// Salón de 10 x 15 m reconstruido desde el video de recorrido (agosto 2026).
// Columnas, barra, cabina telefónica, etc. son solo referencia fija del espacio.
export function SalonBackground({ zonas }) {
  const ROOM_W = 1000
  const ROOM_H = 1500
  return (
    <>
      <rect x="0" y="0" width={ROOM_W} height={ROOM_H} fill="none" stroke="#B5732A" strokeWidth="10" />

      <g stroke="#B5732A" strokeWidth="2" strokeDasharray="2 14" opacity="0.4">
        <line x1="0" y1="250" x2={ROOM_W} y2="250" />
        <line x1="0" y1="900" x2={ROOM_W} y2="900" />
        <line x1="0" y1="1100" x2={ROOM_W} y2="1100" />
      </g>

      <ZonaLabels zonas={zonas.filter((z) => z.id !== 's_barra_letrero' && z.id !== 's_terraza' && z.texto)} />

      {/* puerta de acceso */}
      <line x1="350" y1="0" x2="650" y2="0" stroke="#221A16" strokeWidth="10" />
      <line x1="350" y1="0" x2="650" y2="0" stroke="#E3B341" strokeWidth="3" />

      {/* columnas doradas junto al acceso */}
      <circle cx="330" cy="60" r="16" fill="#E3B341" />
      <circle cx="670" cy="60" r="16" fill="#E3B341" />

      {/* cordones rojos de acceso */}
      <g stroke="#E3B341" strokeWidth="2" opacity="0.6">
        <line x1="140" y1="120" x2="140" y2="200" />
        <line x1="860" y1="120" x2="860" y2="200" />
      </g>
      <circle cx="140" cy="120" r="8" fill="#7A1620" stroke="#E3B341" strokeWidth="1.5" />
      <circle cx="140" cy="200" r="8" fill="#7A1620" stroke="#E3B341" strokeWidth="1.5" />
      <circle cx="860" cy="120" r="8" fill="#7A1620" stroke="#E3B341" strokeWidth="1.5" />
      <circle cx="860" cy="200" r="8" fill="#7A1620" stroke="#E3B341" strokeWidth="1.5" />

      {/* panel de bienvenida, pared izquierda */}
      <rect x="0" y="140" width="16" height="70" fill="#221A16" stroke="#E3B341" strokeWidth="2" />

      {/* pared espejada + esferas colgantes, pared derecha del salón */}
      <rect x={ROOM_W - 16} y="420" width="16" height="260" fill="#221A16" stroke="#6FD4D9" strokeWidth="2" />
      <circle cx={ROOM_W - 40} cy="450" r="10" fill="#E3B341" opacity="0.85" />
      <circle cx={ROOM_W - 40} cy="540" r="10" fill="#E3B341" opacity="0.85" />
      <circle cx={ROOM_W - 40} cy="630" r="10" fill="#E3B341" opacity="0.85" />

      {/* marco dorado de fotos, pared derecha */}
      <rect x={ROOM_W - 16} y="330" width="16" height="50" fill="#221A16" stroke="#E3B341" strokeWidth="2.5" />

      {/* mueble/cava, pared izquierda */}
      <rect x="0" y="700" width="16" height="140" fill="#221A16" stroke="#9AA1A9" strokeWidth="1.5" />

      {/* barra, pared derecha */}
      <rect x={ROOM_W - 70} y="920" width="70" height="150" fill="#221A16" stroke="#E3B341" strokeWidth="2.5" />
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
            fill="#E3B341"
            transform={`rotate(${z.angulo} ${z.x} ${z.y})`}
          >
            {z.texto}
          </text>
        ))}

      {/* cabina telefónica, pared izquierda del lounge */}
      <rect x="0" y="1160" width="90" height="90" fill="#7A1620" stroke="#E3B341" strokeWidth="3" />

      {/* banqueta lounge, pared derecha */}
      <rect x={ROOM_W - 60} y="1180" width="60" height="180" rx="14" fill="#7A1620" opacity="0.55" stroke="#E3B341" strokeWidth="2" />

      {/* puerta trasera hacia terraza / piscina */}
      <line x1="400" y1={ROOM_H} x2="600" y2={ROOM_H} stroke="#221A16" strokeWidth="10" />
      <line x1="400" y1={ROOM_H} x2="600" y2={ROOM_H} stroke="#6FD4D9" strokeWidth="2.5" strokeDasharray="6 5" />
      {zonas
        .filter((z) => z.id === 's_terraza' && z.texto)
        .map((z) => (
          <text key={z.id} x={z.x} y={z.y} textAnchor="middle" fontSize={z.tam || 18} fill="#6FD4D9" opacity="0.7">
            {z.texto}
          </text>
        ))}
    </>
  )
}

// Terraza/jardín trasera, estimada a partir de fotos del recinto (agosto 2026,
// sin medidas reales todavía). 3 zonas apiladas: caminata cubierta con carpas,
// pista central bajo un arco de truss, y jardín con barra/mesas de barril
// junto al escenario (objeto arrastrable, ver MesaShape).
export function TerrazaBackground({ zonas }) {
  const ROOM_W = 1200
  const ROOM_H = 2000
  return (
    <>
      <rect x="0" y="0" width={ROOM_W} height={ROOM_H} fill="none" stroke="#B5732A" strokeWidth="10" />

      <g stroke="#B5732A" strokeWidth="2" strokeDasharray="2 14" opacity="0.4">
        <line x1="0" y1="650" x2={ROOM_W} y2="650" />
        <line x1="0" y1="1350" x2={ROOM_W} y2="1350" />
      </g>

      <ZonaLabels zonas={zonas} />

      {/* carpas tipo pagoda sobre la caminata cubierta */}
      <g fill="#FFF8F1" opacity="0.12">
        <path d="M0,0 L150,-40 L300,0 Z" />
        <path d="M300,0 L450,-40 L600,0 Z" />
      </g>
      <line x1="0" y1="0" x2="600" y2="0" stroke="#B5732A" strokeWidth="4" opacity="0.5" />

      {/* arco de truss que marca el ingreso a la pista */}
      <line x1="0" y1="700" x2="0" y2="600" stroke="#9AA1A9" strokeWidth="6" />
      <line x1="0" y1="600" x2={ROOM_W} y2="600" stroke="#9AA1A9" strokeWidth="6" />
      <line x1={ROOM_W} y1="600" x2={ROOM_W} y2="700" stroke="#9AA1A9" strokeWidth="6" />
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

export function MesaShape({ mesa, isSel, elegante }) {
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
        fill={isSel ? '#FF7A1A' : '#3a2c24'}
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
      fill={isSel ? '#FF7A1A' : '#3a2c24'}
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
  const config = ROOMS[room]

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
    const mesa = mesas.find((m) => m.id === drag.id)
    if (!mesa) return
    const p = svgPoint(svgRef.current, e.clientX, e.clientY)

    if (drag.mode === 'move') {
      // Sin este límite una mesa se puede arrastrar fuera del viewBox y
      // desaparecer por completo de la pantalla (pasó con Mesa R1) —
      // se acota el centro al recuadro visible del plano.
      const vb = config.viewBox
      const x = Math.min(vb.x + vb.w, Math.max(vb.x, drag.origX + (p.x - drag.startX)))
      const y = Math.min(vb.y + vb.h, Math.max(vb.y, drag.origY + (p.y - drag.startY)))
      updateLocal(mesa.id, { x, y })
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
    if (!drag) return
    const mesa = mesas.find((m) => m.id === drag.id)
    dragRef.current = null
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
          {room === 'comedor' && <ComedorBackground zonas={zonas} />}
          {room === 'salon' && <SalonBackground zonas={zonas} />}
          {room === 'terraza' && <TerrazaBackground zonas={zonas} />}

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
                    fill="#221A16"
                    stroke="#B5732A"
                    strokeWidth="2"
                  />
                ))}

                <g onPointerDown={(e) => onPointerDownMesa(e, mesa)} className="cursor-move">
                  <MesaShape mesa={mesa} isSel={isSel} elegante={room === 'salon'} />
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

      {zonas.length > 0 && (
        <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-4">
          <div className="font-head font-semibold text-sm mb-2">Nombres de zona</div>
          <p className="text-[11px] text-paper/40 mb-3">
            Cambia el texto y toca fuera del campo para guardar. Déjalo vacío para que no se muestre en el plano.
          </p>
          <div className="flex flex-col gap-2">
            {zonas.map((z) => (
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
