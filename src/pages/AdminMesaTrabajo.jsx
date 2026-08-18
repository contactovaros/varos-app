import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import { chairPositions } from '../lib/mesasLayout'
import { ROOMS, ComedorBackground, SalonBackground, TerrazaBackground, MesaShape } from './AdminMesas.jsx'
import { formatFechaCL } from './AdminReservas.jsx'
import { todayISO, ReservaCard, CalendarioReservas } from '../components/PanelReservasDia.jsx'

// Mesa coloreada por estado de reserva (no de edición): disponible = negro +
// contorno dorado, con reserva = bronce apagado, con el detalle abierto =
// naranja. Los objetos decorativos (piscina/escenario/carrito/parlante)
// reusan el MesaShape del editor tal cual, no tienen estado de reserva.
function EstadoMesaShape({ mesa, tieneReserva, isSel }) {
  let fill = '#15100D'
  let stroke = '#E3B341'
  if (isSel) {
    fill = '#FF7A1A'
    stroke = '#FFD9B3'
  } else if (tieneReserva) {
    fill = '#4a3a24'
    stroke = '#6b5330'
  }
  if (mesa.tipo === 'round') {
    return <circle r={mesa.ancho / 2} fill={fill} stroke={stroke} strokeWidth={isSel ? 6 : 3} />
  }
  return (
    <rect
      x={-mesa.ancho / 2}
      y={-mesa.alto / 2}
      width={mesa.ancho}
      height={mesa.alto}
      rx="10"
      fill={fill}
      stroke={stroke}
      strokeWidth={isSel ? 6 : 3}
    />
  )
}

export default function AdminMesaTrabajo() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [fecha, setFecha] = useState(todayISO())
  const [room, setRoom] = useState('comedor')
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mesasPorRoom, setMesasPorRoom] = useState({ comedor: [], salon: [], terraza: [] })
  const [zonasPorRoom, setZonasPorRoom] = useState({ comedor: [], salon: [], terraza: [] })
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    setCargando(true)
    setMesaSeleccionadaId(null)
    supabase
      .from('reservas')
      .select('*')
      .eq('fecha', fecha)
      .neq('estado', 'cancelada')
      .order('hora')
      .then(({ data }) => {
        setReservas(data ?? [])
        setCargando(false)
      })
  }, [isAdmin, fecha])

  // La geometría de las mesas no depende de la fecha — se carga una sola vez.
  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      supabase.from('mesas').select('*').order('orden'),
      supabase.from('mesas_salon').select('*').order('orden'),
      supabase.from('mesas_terraza').select('*').order('orden'),
      supabase.from('zonas').select('*').order('orden')
    ]).then(([m, s, t, z]) => {
      setMesasPorRoom({ comedor: m.data ?? [], salon: s.data ?? [], terraza: t.data ?? [] })
      const porRoom = { comedor: [], salon: [], terraza: [] }
      ;(z.data ?? []).forEach((zn) => porRoom[zn.room]?.push(zn))
      setZonasPorRoom(porRoom)
    })
  }, [isAdmin])

  const totalPersonas = useMemo(() => reservas.reduce((sum, r) => sum + (r.personas ?? 0), 0), [reservas])

  const reservasPorMesa = useMemo(() => {
    const map = {}
    reservas.forEach((r) => {
      if (!map[r.mesa_id]) map[r.mesa_id] = []
      map[r.mesa_id].push(r)
    })
    return map
  }, [reservas])

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

  const config = ROOMS[room]
  const mesasSala = mesasPorRoom[room] ?? []
  const reservasSeleccionadas = mesaSeleccionadaId ? reservasPorMesa[mesaSeleccionadaId] ?? [] : []
  const mesaSeleccionada = mesasSala.find((m) => m.id === mesaSeleccionadaId)

  function marcarConfirmada(id) {
    setReservas((prev) => prev.map((x) => (x.id === id ? { ...x, estado: 'confirmada' } : x)))
  }

  function marcarCancelada(id) {
    setReservas((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="px-4 pt-8 pb-24">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
          <h1 className="font-head text-2xl font-semibold">Mesa de trabajo</h1>
          <p className="text-xs text-paper/50 mt-1">Reservas del día junto al plano — toca una mesa reservada para ver el detalle.</p>
        </div>
        <div className="shrink-0 bg-inkSoft border border-ember/30 rounded-xl px-3 py-2 text-center">
          <div className="text-[9px] text-paper/40 uppercase tracking-wide">Personas</div>
          <div className="font-head font-bold text-ember text-lg leading-none">{totalPersonas}</div>
        </div>
      </div>

      <div className="mb-4">
        <CalendarioReservas fechaSeleccionada={fecha} onSelectFecha={setFecha} />
      </div>

      <div className="flex gap-2 mb-4">
        {Object.entries(ROOMS).map(([key, r]) => (
          <button
            key={key}
            onClick={() => {
              setRoom(key)
              setMesaSeleccionadaId(null)
            }}
            className={`flex-1 py-2.5 rounded-xl font-head font-semibold text-xs border ${
              room === key ? 'border-ember text-ember bg-ember/10' : 'border-white/10 text-paper/50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-inkSoft rounded-2xl p-3 mb-3">
        <svg viewBox={`${config.viewBox.x} ${config.viewBox.y} ${config.viewBox.w} ${config.viewBox.h}`} className="w-full h-auto">
          {room === 'comedor' && <ComedorBackground zonas={zonasPorRoom.comedor} />}
          {room === 'salon' && <SalonBackground zonas={zonasPorRoom.salon} />}
          {room === 'terraza' && <TerrazaBackground zonas={zonasPorRoom.terraza} />}

          {mesasSala.map((mesa) => {
            const clickable = mesa.tipo === 'round' || mesa.tipo === 'rect'
            const tieneReserva = clickable && (reservasPorMesa[mesa.id]?.length ?? 0) > 0
            const isSel = mesa.id === mesaSeleccionadaId
            const chairs = chairPositions(mesa)
            return (
              <g
                key={mesa.id}
                transform={`translate(${mesa.x},${mesa.y}) rotate(${mesa.tipo !== 'round' ? mesa.angulo : 0})`}
                opacity={mesa.activa === false ? 0.35 : 1}
                onClick={() => clickable && setMesaSeleccionadaId(isSel ? null : mesa.id)}
                className={clickable ? 'cursor-pointer' : ''}
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
                {clickable ? (
                  <EstadoMesaShape mesa={mesa} tieneReserva={tieneReserva} isSel={isSel} />
                ) : (
                  <MesaShape mesa={mesa} isSel={false} />
                )}
                <text textAnchor="middle" dy="8" fontSize={mesa.tipo === 'round' ? 30 : 26} fontWeight="700" fill={isSel ? '#15100D' : '#FFF8F1'}>
                  {mesa.etiqueta.replace('Mesa ', '')}
                </text>
                {tieneReserva && !isSel && <circle cx={mesa.ancho / 2 - 4} cy={-(mesa.alto ?? mesa.ancho) / 2 + 4} r="9" fill="#E3B341" />}
              </g>
            )
          })}
        </svg>

        <div className="flex items-center gap-4 text-[10px] text-paper/50 mt-3">
          <span className="flex items-center gap-1.5">
            <i className="w-3 h-3 rounded-full inline-block" style={{ background: '#15100D', border: '1.5px solid #E3B341' }} />
            Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <i className="w-3 h-3 rounded-full inline-block" style={{ background: '#4a3a24', border: '1.5px solid #6b5330' }} />
            Con reserva
          </span>
        </div>
      </div>

      {mesaSeleccionada && (
        <div className="bg-inkSoft border border-ember/30 rounded-2xl p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="font-head font-semibold text-sm">{mesaSeleccionada.etiqueta}</div>
            <button onClick={() => setMesaSeleccionadaId(null)} className="text-paper/40 text-xs">
              ✕
            </button>
          </div>
          {reservasSeleccionadas.length === 0 ? (
            <p className="text-paper/40 text-xs">Sin reservas para el {formatFechaCL(fecha)}.</p>
          ) : (
            reservasSeleccionadas.map((r) => (
              <ReservaCard key={r.id} r={r} onConfirmada={marcarConfirmada} onCancelada={marcarCancelada} />
            ))
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-head font-semibold text-sm">Todas las reservas del {formatFechaCL(fecha)}</h3>
        <Link to="/admin/reservas" className="text-[11px] text-ember underline">
          Ver historial completo →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {cargando && <p className="text-paper/40 text-xs">Cargando…</p>}
        {!cargando && reservas.length === 0 && <p className="text-paper/40 text-xs">No hay reservas para este día.</p>}
        {reservas.map((r) => (
          <ReservaCard key={r.id} r={r} onConfirmada={marcarConfirmada} onCancelada={marcarCancelada} />
        ))}
      </div>
    </div>
  )
}
