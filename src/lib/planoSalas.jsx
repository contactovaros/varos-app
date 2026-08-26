// =============================================================================
// LENGUAJE GRÁFICO DE LOS PLANOS DE SALA
//
// Las salas (Comedor Exterior, Comedor Principal, Terraza) se dibujaban como
// alambre: un contorno de una línea y algunas marcas sueltas. Acá vive lo que
// las convierte en una planta de arquitectura de verdad — piso con material,
// muro con espesor (poché), sombra bajo el mobiliario y cotas.
//
// UNIDADES: centímetros. Los planos de sala usan 1 unidad = 1 cm (el salón
// mide 1000 x 1500 = 10 x 15 m). Ojo, es distinto de planoTerraza.js, que
// trabaja en metros — no mezclar los dos módulos en un mismo SVG.
// =============================================================================

// Paleta literal del design system (tailwind.config.js): el SVG no puede usar
// clases de Tailwind.
export const C = {
  muro: '#FFF8F1',      // paper — el muro se dibuja lleno, en claro
  fondo: '#15100D',     // ink
  ember: '#FF7A1A',
  bronze: '#B5732A',
  gold: '#E3B341',
  silver: '#9AA1A9',
  diamond: '#6FD4D9',
  wine: '#7A1620',
  texto: '#FFF8F1',
  texto2: '#C3B7AC',
  texto3: '#9AA1A9'
}

const F = "'Space Grotesk',Arial,sans-serif"
const FM = "'JetBrains Mono',monospace"

export const metros = (cm) => (cm / 100).toFixed(2).replace('.', ',')

// Patrones de piso. Cada sala elige el suyo según lo que realmente hay en el
// piso de ese espacio, no por decoración.
//
// `pisoDeck`/`pisoPulido` son el color base editable desde /admin/mesas
// (columna `salas.color_piso`) — cada sala solo pisa el patrón que usa como
// piso principal (comedor/terraza → deck, salón → pulido). Las texturas
// secundarias de la terraza (piedra de la pista, pasto del jardín) se quedan
// con su tono fijo: `color_piso` es un solo campo por sala, no por parche.
export function PlanoDefs({ pisoDeck = '#7A5432', pisoPulido = '#2A211C' } = {}) {
  return (
    <defs>
      {/* deck de madera: tablas de 17 cm con junta cada 240 cm */}
      <pattern id="slDeck" width="17" height="240" patternUnits="userSpaceOnUse">
        <rect width="17" height="240" fill={pisoDeck} />
        <rect width="17" height="120" fill="#8E6540" opacity="0.38" />
        <line x1="0" y1="0" x2="0" y2="240" stroke="#4E3320" strokeWidth="1.2" opacity="0.75" />
        <line x1="0" y1="120" x2="17" y2="120" stroke="#4E3320" strokeWidth="1.2" opacity="0.5" />
      </pattern>

      {/* piso pulido del salón: palmeta grande de 100 cm */}
      <pattern id="slPulido" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill={pisoPulido} />
        <path d="M0 0 H100 M0 0 V100" stroke="#3B2F27" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="30" fill="#FFF8F1" opacity="0.012" />
      </pattern>

      {/* pavimento de la pista: baldosa de 80 cm, tono frío */}
      <pattern id="slPiedra" width="80" height="80" patternUnits="userSpaceOnUse">
        <rect width="80" height="80" fill="#332F2B" />
        <path d="M0 0 H80 M0 0 V80" stroke="#413C36" strokeWidth="1.6" />
      </pattern>

      {/* jardín */}
      <pattern id="slPasto" width="60" height="60" patternUnits="userSpaceOnUse">
        <rect width="60" height="60" fill="#2C3B26" />
        <g stroke="#3E5435" strokeWidth="1.4" opacity="0.9">
          <path d="M10 46 l4 -12 M22 52 l3 -10 M40 44 l4 -13 M52 50 l3 -11 M31 34 l3 -11" />
        </g>
      </pattern>

      <filter id="slSombra" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="rgba(0,0,0,.55)" />
      </filter>
    </defs>
  )
}

// Recinto: piso + muro con espesor real.
//
// El truco del muro: se traza el mismo contorno dos veces. Primero con un
// stroke del doble del espesor (SVG centra el stroke sobre la línea), después
// se pinta el piso encima, que tapa la mitad interior. Queda una banda de muro
// enteramente por fuera del contorno, así las medidas del plano siguen siendo
// las interiores libres — y funciona con cualquier forma, incluida la L del
// Comedor Exterior, sin tener que calcular un polígono paralelo.
export function Recinto({ d, piso = 'slDeck', espesor = 14 }) {
  return (
    <g>
      <path d={d} fill="none" stroke={C.muro} strokeWidth={espesor * 2} strokeLinejoin="miter" />
      <path d={d} fill={`url(#${piso})`} />
    </g>
  )
}

// Parche de piso distinto dentro del recinto (la terraza tiene tres materiales).
export function Piso({ x, y, w, h, piso }) {
  return <rect x={x} y={y} width={w} height={h} fill={`url(#${piso})`} />
}

// Cota acotada al estilo del plano del Parque Centenario: línea, marcas a 45°
// y la medida en metros.
export function Cota({ x1, y1, x2, y2, texto, color = C.ember }) {
  const t = 20
  const vertical = x1 === x2
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const label = metros(texto !== undefined ? texto : vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1))
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.6" />
      <path
        d={`M${x1 - t} ${y1 + t} L${x1 + t} ${y1 - t} M${x2 - t} ${y2 + t} L${x2 + t} ${y2 - t}`}
        stroke={color}
        strokeWidth="2.6"
      />
      {vertical ? (
        <text
          x={mx} y={my} transform={`rotate(-90 ${mx} ${my})`} textAnchor="middle" dy="-14"
          fontSize="34" fontFamily={FM} fill={color}
        >
          {label}
        </text>
      ) : (
        <text x={mx} y={my - 16} textAnchor="middle" fontSize="34" fontFamily={FM} fill={color}>
          {label}
        </text>
      )}
    </g>
  )
}

// Rótulo de una franja de la sala, en el margen y girado — el mismo recurso
// que ordena el plano del Parque Centenario.
export function FranjaLabel({ x, y0, y1, texto, sub, color = C.texto2 }) {
  const my = (y0 + y1) / 2
  return (
    <g>
      <path d={`M${x - 22} ${y0} H${x} V${y1} H${x - 22}`} fill="none" stroke="#372C25" strokeWidth="3" />
      <text
        x={x + 38} y={my} transform={`rotate(-90 ${x + 38} ${my})`} textAnchor="middle"
        fontSize="34" fontWeight="600" fontFamily={F} fill={color} letterSpacing="2"
      >
        {texto}
      </text>
      {sub && (
        <text
          x={x + 74} y={my} transform={`rotate(-90 ${x + 74} ${my})`} textAnchor="middle"
          fontSize="24" fontFamily={F} fill={C.texto3}
        >
          {sub}
        </text>
      )}
    </g>
  )
}

// Nota al pie del plano (para dejar dicho, por ejemplo, que unas medidas son
// estimadas y no relevadas).
export function NotaPlano({ x, y, texto }) {
  return (
    <text x={x} y={y} fontSize="24" fontFamily={F} fill={C.texto3} opacity="0.9">
      {texto}
    </text>
  )
}

// Puerta de doble hoja abatiendo hacia adentro, dibujada como en un plano:
// las dos hojas y su arco de barrido. `dir` es hacia dónde está el interior:
// 1 = abajo, -1 = arriba.
export function PuertaDoble({ cx, y, ancho, dir = 1, color = C.muro }) {
  const h = ancho / 2
  return (
    <g stroke={color} fill="none" strokeWidth="4">
      <path d={`M${cx - h} ${y} L${cx - h} ${y + dir * h}`} />
      <path
        d={`M${cx - h} ${y + dir * h} A${h} ${h} 0 0 ${dir > 0 ? 0 : 1} ${cx} ${y}`}
        strokeDasharray="14 10" opacity="0.6"
      />
      <path d={`M${cx + h} ${y} L${cx + h} ${y + dir * h}`} />
      <path
        d={`M${cx + h} ${y + dir * h} A${h} ${h} 0 0 ${dir > 0 ? 1 : 0} ${cx} ${y}`}
        strokeDasharray="14 10" opacity="0.6"
      />
    </g>
  )
}
