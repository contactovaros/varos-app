import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import { chairPositions } from '../lib/mesasLayout'

// Dos salas editables desde la misma pantalla: el comedor (tabla `mesas`) y el
// salón de eventos (tabla `mesas_salon`, reconstruido de un video, 10 x 15 m).
// Van en tablas separadas para no mezclar el salón con las reservas del comedor,
// pero se editan las dos desde /admin/mesas con el selector de abajo.
const ROOMS = {
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
function ZonaLabels({ zonas, fontSize = 26, fontFamily = "'Space Grotesk',Arial,sans-serif", fill = '#FFF8F1', opacity = 0.55 }) {
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

function ComedorBackground({ zonas }) {
  return (
    <>
      <path d="M0,0 L324,0 L324,550 L1314,550 L1314,1700 L0,1700 Z" fill="none" stroke="#B5732A" strokeWidth="10" />
      <ZonaLabels zonas={zonas} opacity={0.6} />
    </>
  )
}

// Salón de 10 x 15 m reconstruido desde el video de recorrido (agosto 2026).
// Columnas, barra, cabina telefónica, etc. son solo referencia fija del espacio.
function SalonBackground({ zonas }) {
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

export default function AdminMesas() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [room, setRoom] = useState('comedor')
  const [mesas, setMesas] = useState([])
  const [zonas, setZonas] = useState([])
  const [selectedId, setSelectedId] = useState(null)
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

  function updateZonaLocal(id, texto) {
    setZonas((prev) => prev.map((z) => (z.id === id ? { ...z, texto } : z)))
  }

  async function persistZona(id, texto) {
    await supabase.from('zonas').update({ texto }).eq('id', id)
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
    await supabase.from(config.table).update(patch).eq('id', id)
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
      updateLocal(mesa.id, { x: drag.origX + (p.x - drag.startX), y: drag.origY + (p.y - drag.startY) })
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

  async function agregarMesa() {
    const base = config.nuevaMesa
    const nueva = {
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
    <div className="px-4 pt-8 pb-24">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
          <h1 className="font-head text-2xl font-semibold">Editar mesas</h1>
          <p className="text-xs text-paper/50 mt-1">
            Arrastra una mesa para moverla. Las mesas rectangulares tienen un punto celeste para girar y un
            cuadrado en la esquina para agrandar/achicar. Los cambios se guardan solos.
          </p>
        </div>
        <button
          onClick={agregarMesa}
          className="shrink-0 px-3 py-2 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink"
        >
          + Mesa
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {Object.entries(ROOMS).map(([key, r]) => (
          <button
            key={key}
            onClick={() => setRoom(key)}
            className={`flex-1 py-2.5 rounded-xl font-head font-semibold text-xs border ${
              room === key ? 'border-ember text-ember bg-ember/10' : 'border-white/10 text-paper/50'
            }`}
          >
            {r.label}
          </button>
        ))}
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
          {room === 'comedor' ? <ComedorBackground zonas={zonas} /> : <SalonBackground zonas={zonas} />}

          {mesas.map((mesa) => {
            const isSel = mesa.id === selectedId
            const chairs = chairPositions(mesa)
            return (
              <g key={mesa.id} transform={`translate(${mesa.x},${mesa.y}) rotate(${mesa.tipo === 'rect' ? mesa.angulo : 0})`}>
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
                  {mesa.tipo === 'round' ? (
                    <circle
                      r={mesa.ancho / 2}
                      fill={isSel ? '#FF7A1A' : '#3a2c24'}
                      stroke={isSel ? '#FFD9B3' : '#B5732A'}
                      strokeWidth={isSel ? 6 : 3}
                    />
                  ) : (
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
                  )}
                  <text textAnchor="middle" dy="8" fontSize="30" fontWeight="700" fill={isSel ? '#15100D' : '#FFF8F1'}>
                    {mesa.etiqueta.replace('Mesa ', '')}
                  </text>
                </g>

                {isSel && mesa.tipo === 'rect' && (
                  <>
                    <line x1="0" y1={-mesa.alto / 2} x2="0" y2={-mesa.alto / 2 - 45} stroke="#7DD3E8" strokeWidth="3" strokeDasharray="4 4" />
                    <circle
                      cx="0"
                      cy={-mesa.alto / 2 - 45}
                      r="14"
                      fill="#7DD3E8"
                      onPointerDown={(e) => onPointerDownRotate(e, mesa)}
                      className="cursor-grab"
                    />
                  </>
                )}

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
            <button onClick={eliminarMesa} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px]">
              Eliminar
            </button>
          </div>
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
          <div className="text-[11px] text-paper/40">
            {selected.tipo === 'round'
              ? `Diámetro: ${Math.round(selected.ancho)} cm`
              : `Ancho: ${Math.round(selected.ancho)} cm · Largo: ${Math.round(selected.alto)} cm · Ángulo: ${Math.round(selected.angulo)}°`}
          </div>
        </div>
      )}
    </div>
  )
}
