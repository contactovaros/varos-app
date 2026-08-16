import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { chairPositions } from '../lib/mesasLayout'

const BUFFER_MIN = 120 // ventana de conflicto entre reservas en la misma mesa
const COMBO_MAX_DIST = 420 // distancia máxima entre centros para considerarlas "adyacentes"

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function horaToMin(hora) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default function Reservas() {
  const [step, setStep] = useState('filtros') // filtros | plano | contacto | ok
  const [fecha, setFecha] = useState(todayISO())
  const [hora, setHora] = useState('20:00')
  const [personas, setPersonas] = useState(2)
  const [zona, setZona] = useState('cualquiera')

  const [mesas, setMesas] = useState([])
  const [reservasDelDia, setReservasDelDia] = useState([])
  const [mesaId, setMesaId] = useState(null)
  const [comboIds, setComboIds] = useState(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    supabase.from('mesas').select('*').order('orden').then(({ data }) => setMesas(data ?? []))
  }, [])

  async function verPlano() {
    setMesaId(null)
    setComboIds(null)
    const { data } = await supabase
      .from('reservas')
      .select('mesa_id, hora')
      .eq('fecha', fecha)
      .neq('estado', 'cancelada')
    setReservasDelDia(data ?? [])
    setStep('plano')
  }

  function estaReservada(mesa) {
    const solicitada = horaToMin(hora)
    return reservasDelDia.some((r) => r.mesa_id === mesa.id && Math.abs(horaToMin(r.hora) - solicitada) < BUFFER_MIN)
  }

  function esCompatible(mesa) {
    if (zona !== 'cualquiera' && mesa.zona !== zona) return false
    return mesa.capacidad >= personas
  }

  const libres = mesas.filter((m) => !estaReservada(m))
  const candidatosSolos = libres.filter((m) => esCompatible(m)).sort((a, b) => a.capacidad - b.capacidad)
  const necesitaCombo = candidatosSolos.length === 0

  function mejorCombo() {
    let mejor = null
    for (let i = 0; i < libres.length; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        const a = libres[i]
        const b = libres[j]
        if (zona !== 'cualquiera' && (a.zona !== zona || b.zona !== zona)) continue
        const capacidad = a.capacidad + b.capacidad
        if (capacidad < personas) continue
        if (dist(a, b) > COMBO_MAX_DIST) continue
        const desperdicio = capacidad - personas
        if (!mejor || desperdicio < mejor.desperdicio) mejor = { a, b, capacidad, desperdicio }
      }
    }
    return mejor
  }

  const combo = necesitaCombo ? mejorCombo() : null

  function seleccionarMesa(mesa) {
    if (!esCompatible(mesa) || estaReservada(mesa)) return
    setMesaId(mesa.id)
    setComboIds(null)
  }

  function usarCombo() {
    if (!combo) return
    setComboIds([combo.a.id, combo.b.id])
    setMesaId(null)
  }

  const mesaSeleccionada = mesas.find((m) => m.id === mesaId)
  const comboSeleccionado = comboIds ? mesas.filter((m) => comboIds.includes(m.id)) : null
  const puedeContinuar = !!mesaSeleccionada || !!comboSeleccionado

  async function confirmarReserva(e) {
    e.preventDefault()
    setEnviando(true)
    setErrorMsg('')

    const base = { nombre, telefono, fecha, hora, personas }
    let error
    if (comboSeleccionado) {
      const label = comboSeleccionado.map((m) => m.etiqueta.replace('Mesa ', '')).join(' + ')
      const inserts = comboSeleccionado.map((m) => ({ ...base, mesa_id: m.id, mesa_label: `Mesa ${label} (combinada)` }))
      ;({ error } = await supabase.from('reservas').insert(inserts))
    } else {
      ;({ error } = await supabase.from('reservas').insert({ ...base, mesa_id: mesaSeleccionada.id, mesa_label: mesaSeleccionada.etiqueta }))
    }

    setEnviando(false)
    if (error) {
      setErrorMsg(
        error.code === '23505'
          ? 'Justo se ocupó esa mesa para ese horario. Vuelve al plano y elige otra.'
          : 'No pudimos registrar tu reserva. Inténtalo de nuevo o escríbenos por WhatsApp.'
      )
      return
    }
    setStep('ok')
  }

  if (step === 'ok') {
    const label = comboSeleccionado ? comboSeleccionado.map((m) => m.etiqueta).join(' + ') : mesaSeleccionada.etiqueta
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 text-center text-paper">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="font-head text-xl font-semibold mb-2">¡Reserva enviada!</h1>
        <p className="text-sm text-paper/60 max-w-xs">
          {label} para {personas} personas el {fecha} a las {hora}. El restaurante recibirá tu solicitud y te
          contactará al {telefono} para confirmarla.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink text-paper px-4 py-8 flex flex-col items-center">
      <h1 className="font-display text-3xl text-ember mb-1">Reserva tu mesa</h1>
      <p className="text-paper/60 text-sm mb-6 text-center max-w-sm">
        {step === 'filtros' && 'Cuéntanos cuándo y cuántos son.'}
        {step === 'plano' && 'Elige tu mesa en el plano.'}
        {step === 'contacto' && 'Últimos datos para confirmar.'}
      </p>

      {step === 'filtros' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            verPlano()
          }}
          className="w-full max-w-md flex flex-col gap-3"
        >
          <div className="flex gap-3">
            <label className="text-sm text-paper/70 flex-1">
              Fecha
              <input
                required
                type="date"
                min={todayISO()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-xl bg-inkSoft border border-white/10 px-4 py-3 text-paper"
              />
            </label>
            <label className="text-sm text-paper/70 flex-1">
              Hora
              <input
                required
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="mt-1 w-full rounded-xl bg-inkSoft border border-white/10 px-4 py-3 text-paper"
              />
            </label>
          </div>

          <label className="text-sm text-paper/70">
            Personas
            <div className="mt-1 flex items-center gap-3 bg-inkSoft border border-white/10 rounded-xl px-4 py-2">
              <button
                type="button"
                onClick={() => setPersonas((p) => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-lg border border-white/10 text-paper/70"
              >
                −
              </button>
              <span className="flex-1 text-center font-mono text-ember text-lg">{personas}</span>
              <button
                type="button"
                onClick={() => setPersonas((p) => Math.min(20, p + 1))}
                className="w-8 h-8 rounded-lg border border-ember/40 text-ember"
              >
                +
              </button>
            </div>
          </label>

          <div>
            <span className="text-sm text-paper/70">Zona (opcional)</span>
            <div className="mt-1 flex gap-2 flex-wrap">
              {['cualquiera', 'Exterior principal', 'Exterior lateral'].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZona(z)}
                  className={`px-3 py-2 rounded-full text-xs border ${
                    zona === z ? 'border-ember text-ember bg-ember/10' : 'border-white/10 text-paper/50'
                  }`}
                >
                  {z === 'cualquiera' ? 'Cualquier lugar' : z}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="mt-3 w-full py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine text-paper shadow-glow"
          >
            Ver plano del comedor
          </button>
        </form>
      )}

      {step === 'plano' && (
        <>
          <div className="w-full max-w-md flex items-center justify-between text-xs text-paper/50 mb-3">
            <button onClick={() => setStep('filtros')} className="underline">
              ← Cambiar fecha/hora/personas
            </button>
            <span className="font-mono text-ember">
              {personas} · {hora} · {fecha}
            </span>
          </div>

          <div className="w-full max-w-md bg-inkSoft rounded-2xl p-3 mb-4">
            <svg viewBox="-40 -40 1420 1780" className="w-full h-auto" role="img" aria-label="Plano del comedor, elige una mesa">
              <defs>
                <pattern id="hatchReservada" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#E3B341" strokeWidth="3" opacity="0.5" />
                </pattern>
              </defs>
              <path d="M0,0 L324,0 L324,550 L1314,550 L1314,1700 L0,1700 Z" fill="none" stroke="#B5732A" strokeWidth="10" />
              <text x="20" y="40" fontFamily="'Space Grotesk',Arial,sans-serif" fontWeight="700" fontSize="30" fill="#FFF8F1" opacity="0.6">
                COMEDOR LATERAL
              </text>
              <text x="344" y="600" fontFamily="'Space Grotesk',Arial,sans-serif" fontWeight="700" fontSize="34" fill="#FFF8F1" opacity="0.6">
                COMEDOR PRINCIPAL
              </text>

              {mesas.map((m) => {
                const reservada = estaReservada(m)
                const compatible = esCompatible(m)
                const enCombo = comboIds?.includes(m.id)
                const seleccionada = m.id === mesaId || enCombo
                const chairs = chairPositions(m)

                let fill = '#3a2c24'
                let stroke = '#B5732A'
                let opacity = 1
                if (seleccionada) {
                  fill = '#FF7A1A'
                  stroke = '#FFD9B3'
                } else if (reservada) {
                  fill = 'url(#hatchReservada)'
                  stroke = '#E3B341'
                } else if (!compatible) {
                  opacity = 0.3
                } else {
                  stroke = '#8fae76'
                }

                const clickable = compatible && !reservada
                return (
                  <g
                    key={m.id}
                    transform={`translate(${m.x},${m.y}) rotate(${m.tipo === 'rect' ? m.angulo : 0})`}
                    opacity={opacity}
                  >
                    {chairs.map((c, i) => (
                      <rect
                        key={i}
                        x={c.x - 10}
                        y={c.y - 10}
                        width="20"
                        height="20"
                        rx="4"
                        transform={`rotate(${c.rot} ${c.x} ${c.y})`}
                        fill="#221A16"
                        stroke={stroke}
                        strokeWidth="1.5"
                      />
                    ))}
                    <g onClick={() => clickable && seleccionarMesa(m)} className={clickable ? 'cursor-pointer' : ''}>
                      {m.tipo === 'round' ? (
                        <circle r={m.ancho / 2} fill={fill} stroke={stroke} strokeWidth={seleccionada ? 6 : 3} />
                      ) : (
                        <rect
                          x={-m.ancho / 2}
                          y={-m.alto / 2}
                          width={m.ancho}
                          height={m.alto}
                          rx="10"
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={seleccionada ? 6 : 3}
                        />
                      )}
                      <text textAnchor="middle" dy="8" fontSize={m.tipo === 'round' ? 34 : 30} fontWeight="700" fill={seleccionada ? '#15100D' : '#FFF8F1'}>
                        {m.etiqueta.replace('Mesa ', '')}
                      </text>
                    </g>
                  </g>
                )
              })}
            </svg>

            <div className="flex items-center gap-4 justify-center mt-3 text-[10px] text-paper/50">
              <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#3a2c24', border: '1.5px solid #8fae76' }} />Disponible</span>
              <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#E3B341', opacity: 0.5 }} />Reservada</span>
              <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#FF7A1A' }} />Seleccionada</span>
            </div>
          </div>

          {necesitaCombo && combo && (
            <div className="w-full max-w-md bg-inkSoft border border-ember/30 rounded-2xl p-4 mb-4">
              <p className="text-xs text-paper/50 mb-2">Ninguna mesa sola alcanza para {personas} personas — combinación recomendada:</p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-head font-semibold text-sm">
                    {combo.a.etiqueta} + {combo.b.etiqueta}
                  </div>
                  <div className="text-xs text-paper/50">Capacidad {combo.capacidad} · {fecha} {hora}</div>
                </div>
                <button
                  onClick={usarCombo}
                  className={`px-4 py-2 rounded-xl font-head font-semibold text-xs ${
                    comboIds ? 'bg-ember text-ink' : 'border border-ember/40 text-ember'
                  }`}
                >
                  {comboIds ? 'Elegida ✓' : 'Usar esta combinación'}
                </button>
              </div>
            </div>
          )}

          {necesitaCombo && !combo && (
            <p className="w-full max-w-md text-center text-xs text-wineSoft mb-4">
              No encontramos mesas ni combinaciones disponibles para {personas} personas a esa hora. Prueba otro horario.
            </p>
          )}

          <p className="text-center text-xs text-paper/50 mb-4">
            {mesaSeleccionada
              ? `Seleccionaste: ${mesaSeleccionada.etiqueta}`
              : comboSeleccionado
              ? `Seleccionaste: ${comboSeleccionado.map((m) => m.etiqueta).join(' + ')}`
              : 'Toca una mesa disponible'}
          </p>

          <button
            onClick={() => setStep('contacto')}
            disabled={!puedeContinuar}
            className="w-full max-w-md py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine text-paper shadow-glow disabled:opacity-40"
          >
            Continuar
          </button>
        </>
      )}

      {step === 'contacto' && (
        <form onSubmit={confirmarReserva} className="w-full max-w-md flex flex-col gap-3">
          <button type="button" onClick={() => setStep('plano')} className="text-xs text-paper/50 underline text-left mb-1">
            ← Volver al plano
          </button>

          <div className="bg-inkSoft rounded-xl p-3 text-xs text-paper/60 flex justify-between">
            <span>
              {mesaSeleccionada ? mesaSeleccionada.etiqueta : comboSeleccionado.map((m) => m.etiqueta).join(' + ')} · {personas} personas
            </span>
            <span className="font-mono text-ember">{fecha} · {hora}</span>
          </div>

          <label className="text-sm text-paper/70">
            Nombre
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-xl bg-inkSoft border border-white/10 px-4 py-3 text-paper"
              placeholder="Tu nombre completo"
            />
          </label>
          <label className="text-sm text-paper/70">
            Teléfono de contacto
            <input
              required
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="mt-1 w-full rounded-xl bg-inkSoft border border-white/10 px-4 py-3 text-paper"
              placeholder="+56 9 ..."
            />
          </label>

          {errorMsg && <p className="text-sm text-wineSoft">{errorMsg}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 w-full py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine text-paper shadow-glow disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : 'Confirmar reserva'}
          </button>
        </form>
      )}
    </div>
  )
}
