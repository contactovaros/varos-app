import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { chairPositions } from '../lib/mesasLayout'
import { BotonRedSocial, IconoInstagram, IconoFacebook, IconoSitioWeb, IconoWhatsApp, IconoResena } from '../components/TarjetaFidelidad.jsx'

const BUFFER_MIN = 120 // ventana de conflicto entre reservas en la misma mesa
const COMBO_MAX_DIST = 420 // distancia máxima entre centros para considerarlas "adyacentes"
const HOLD_MIN = 5 // minutos que se retiene una mesa mientras el cliente completa sus datos

const SALON_ROOM_W = 1000
const SALON_ROOM_H = 1500
const TERRAZA_ROOM_W = 1200
const TERRAZA_ROOM_H = 2000

const ROOM_LABELS = { comedor: 'Comedor Exterior', salon: 'Comedor Principal', terraza: 'Terraza' }

// Objetos decorativos (escenario, carrito) — mismas formas que en
// /admin/mesas, no son reservables (ver esReservable), solo dan contexto
// del plano. ovalPath() es la mitad recta + mitad ovalada del escenario.
function ovalPath(ancho, alto) {
  const r = alto / 2
  const straightEnd = ancho / 2 - r
  return `M${-ancho / 2},${-r} L${straightEnd},${-r} A${r},${r} 0 0 1 ${straightEnd},${r} L${-ancho / 2},${r} Z`
}

function SombrillaShape({ radio, seleccionada, reservada }) {
  const n = 8
  const tones = seleccionada ? ['#FF7A1A', '#E85D04'] : reservada ? ['#E3B341', '#c99a2e'] : ['#B5732A', '#8a5a25']
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
        fill={tones[i % 2]}
        stroke="#221A16"
        strokeWidth="1.5"
      />
    )
  }
  return (
    <g>
      {wedges}
      <circle r={radio} fill="none" stroke={seleccionada ? '#FFD9B3' : '#221A16'} strokeWidth={seleccionada ? 5 : 2.5} />
      <circle r="6" fill="#221A16" stroke="#B5732A" strokeWidth="2" />
    </g>
  )
}

function CarritoShape({ ancho, alto }) {
  return (
    <g opacity="0.8">
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="6" fill="#221A16" stroke="#FFF8F1" strokeWidth="2" />
      <circle cx={-ancho / 2 + 14} cy={alto / 2} r="7" fill="#221A16" stroke="#FFF8F1" strokeWidth="1.5" />
      <circle cx={ancho / 2 - 14} cy={alto / 2} r="7" fill="#221A16" stroke="#FFF8F1" strokeWidth="1.5" />
    </g>
  )
}

function ParlanteShape({ ancho, alto }) {
  const stroke = '#E3B341'
  return (
    <g opacity="0.85">
      <rect x={-ancho / 2} y={-alto / 2} width={ancho} height={alto} rx="8" fill="#221A16" stroke={stroke} strokeWidth="2" />
      <circle cx={-ancho / 6} cy="0" r={alto / 4} fill="none" stroke={stroke} strokeWidth="2" />
      <circle cx={-ancho / 6} cy="0" r={alto / 10} fill={stroke} />
      <path d={`M${ancho / 8},${-alto / 4} A${alto / 3},${alto / 3} 0 0 1 ${ancho / 8},${alto / 4}`} fill="none" stroke={stroke} strokeWidth="2" />
      <path d={`M${ancho / 3.2},${-alto / 3} A${alto / 2},${alto / 2} 0 0 1 ${ancho / 3.2},${alto / 3}`} fill="none" stroke={stroke} strokeWidth="2" opacity="0.6" />
    </g>
  )
}

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

// El estado interno sigue en ISO (lo necesitan el <input type="date">, las
// queries a Supabase y el orden lexicográfico) — esto es solo para mostrarle
// la fecha al cliente en formato chileno, nunca el ISO crudo.
function formatFechaCL(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function telefonoValido(t) {
  return t.replace(/\D/g, '').length >= 9
}

function IconCalendario(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  )
}

function IconReloj(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMesa(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M4 9h16M6 9v10M18 9v10M4 15h16" strokeLinecap="round" />
    </svg>
  )
}

// Wordmark + regla dorada, coherente en las tres pantallas del flujo.
function Header() {
  return (
    <div className="w-full max-w-md text-center mb-4">
      <div className="font-serif text-[26px] leading-none tracking-[0.12em] text-gold">VARO’S</div>
      <div className="font-head text-[9px] tracking-[0.45em] text-gold/60 mt-1.5">RESTAURANT</div>
      <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
    </div>
  )
}

// Mismos 5 botones que la tarjeta de fidelización, fijos al pie de las
// cuatro pantallas del flujo (no solo la de confirmación).
function FooterRedes() {
  return (
    <div className="w-full max-w-md flex flex-col items-center gap-3 mt-8 pt-5 border-t border-gold/10">
      <div className="flex items-center justify-center gap-2">
        <BotonRedSocial href="https://www.instagram.com/varosrestaurant/?hl=es" label="Síguenos en Instagram">
          <IconoInstagram />
        </BotonRedSocial>
        <BotonRedSocial href="https://www.facebook.com/varosrestaurant" label="Síguenos en Facebook">
          <IconoFacebook />
        </BotonRedSocial>
        <BotonRedSocial href="https://varos.cl/" label="Visita nuestro sitio web">
          <IconoSitioWeb />
        </BotonRedSocial>
        <BotonRedSocial href="https://wa.me/56999235368" label="Escríbenos por WhatsApp">
          <IconoWhatsApp />
        </BotonRedSocial>
        <BotonRedSocial href="https://g.page/r/CfTLjMLhcWvCEBM/review" label="Déjanos tu reseña">
          <IconoResena />
        </BotonRedSocial>
      </div>
      <div className="text-[10px] text-gold/40 tracking-wide">contacto@varos.cl</div>
    </div>
  )
}

function TituloReserva({ children }) {
  return (
    <div className="w-full max-w-md text-center mb-5">
      <h1 className="font-serif text-2xl sm:text-[28px] tracking-wide text-gold">RESERVA TU MESA</h1>
      <p className="text-paper/45 text-sm mt-1.5">{children}</p>
      <div className="flex items-center justify-center gap-2 mt-4 mx-auto w-32">
        <span className="h-px flex-1 bg-gold/30" />
        <span className="w-1.5 h-1.5 rotate-45 bg-gold/50 shrink-0" />
        <span className="h-px flex-1 bg-gold/30" />
      </div>
    </div>
  )
}

export default function Reservas() {
  const [step, setStep] = useState('filtros') // filtros | plano | contacto | ok
  const [fecha, setFecha] = useState(todayISO())
  const [hora, setHora] = useState('20:00')
  const [personas, setPersonas] = useState(2)
  const [zona, setZona] = useState('cualquiera')

  const [salas, setSalas] = useState({ comedor: { activo: true }, salon: { activo: true }, terraza: { activo: true } })
  const [zonas, setZonas] = useState([])
  const [mesas, setMesas] = useState([])
  const [reservasDelDia, setReservasDelDia] = useState([])
  const [holdsDelDia, setHoldsDelDia] = useState([])
  const [misHolds, setMisHolds] = useState([])
  const [avisoPlano, setAvisoPlano] = useState('')
  const [mesaId, setMesaId] = useState(null)
  const [comboIds, setComboIds] = useState(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [codigoReserva, setCodigoReserva] = useState('')

  useEffect(() => {
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
    supabase
      .from('zonas')
      .select('*')
      .order('orden')
      .then(({ data }) => setZonas(data ?? []))
  }, [])

  useEffect(() => {
    async function cargarMesas() {
      const combinadas = []
      if (salas.comedor?.activo !== false) {
        const { data } = await supabase.from('mesas').select('*').order('orden')
        ;(data ?? []).forEach((m) => combinadas.push({ ...m, sala: 'comedor' }))
      }
      if (salas.salon?.activo !== false) {
        const { data } = await supabase.from('mesas_salon').select('*').order('orden')
        ;(data ?? []).forEach((m) => combinadas.push({ ...m, sala: 'salon', zona: 'Comedor Principal' }))
      }
      if (salas.terraza?.activo !== false) {
        const { data } = await supabase.from('mesas_terraza').select('*').order('orden')
        ;(data ?? []).forEach((m) => combinadas.push({ ...m, sala: 'terraza', zona: 'Terraza' }))
      }
      setMesas(combinadas)
    }
    cargarMesas()
  }, [salas])

  const zonaOptions = [
    'cualquiera',
    ...(salas.comedor?.activo !== false ? ['Comedor Exterior'] : []),
    ...(salas.salon?.activo !== false ? ['Comedor Principal'] : []),
    ...(salas.terraza?.activo !== false ? ['Terraza'] : [])
  ]

  function salaDeZona(z) {
    if (z === 'Comedor Principal') return 'salon'
    if (z === 'Comedor Exterior') return 'comedor'
    if (z === 'Terraza') return 'terraza'
    return null
  }

  async function verPlano() {
    setMesaId(null)
    setComboIds(null)
    const [{ data: reservasData }, { data: holdsData }] = await Promise.all([
      supabase.from('reservas').select('mesa_id, hora').eq('fecha', fecha).neq('estado', 'cancelada'),
      supabase.from('mesa_holds').select('mesa_id, hora').eq('fecha', fecha).gt('expira_at', new Date().toISOString())
    ])
    setReservasDelDia(reservasData ?? [])
    setHoldsDelDia(holdsData ?? [])
    setStep('plano')
  }

  function estaReservada(mesa) {
    const solicitada = horaToMin(hora)
    const enConflicto = (r) => r.mesa_id === mesa.id && Math.abs(horaToMin(r.hora) - solicitada) < BUFFER_MIN
    return reservasDelDia.some(enConflicto) || holdsDelDia.some(enConflicto)
  }

  // Objetos decorativos (escenario, carrito, parlante) viven en la misma
  // tabla que las mesas para heredar drag/resize/eliminar gratis, pero no
  // son reservables. Una mesa bloqueada manualmente (mantención, evento
  // privado, mobiliario retirado) tampoco lo es, aunque sea round/rect.
  function esReservable(mesa) {
    return (mesa.tipo === 'round' || mesa.tipo === 'rect') && mesa.activa !== false
  }

  function esCompatible(mesa) {
    if (!esReservable(mesa)) return false
    if (zona !== 'cualquiera' && mesa.sala !== salaDeZona(zona)) return false
    return mesa.capacidad >= personas
  }

  // Retiene la(s) mesa elegida(s) por HOLD_MIN minutos mientras el cliente
  // completa sus datos, para que no la tome otra persona en ese rato.
  async function crearHolds(ids) {
    const expiraAt = new Date(Date.now() + HOLD_MIN * 60000).toISOString()
    const rows = ids.map((id) => ({ mesa_id: id, fecha, hora, expira_at: expiraAt }))
    const { data, error } = await supabase.from('mesa_holds').insert(rows).select()
    if (!error && data) setMisHolds(data.map((h) => h.id))
  }

  async function liberarHolds() {
    if (!misHolds.length) return
    const ids = misHolds
    setMisHolds([])
    await supabase.from('mesa_holds').delete().in('id', ids)
  }

  // Si el cliente abandona la página con una mesa retenida (sin volver al
  // plano ni confirmar), se libera al salir. Si cierra la pestaña sin más,
  // el hold igual expira solo a los HOLD_MIN minutos.
  useEffect(() => {
    return () => {
      if (misHolds.length) supabase.from('mesa_holds').delete().in('id', misHolds)
    }
  }, [misHolds])

  const libres = mesas.filter((m) => !estaReservada(m))
  const candidatosSolos = libres.filter((m) => esCompatible(m)).sort((a, b) => a.capacidad - b.capacidad)
  const necesitaCombo = candidatosSolos.length === 0

  function mejorCombo() {
    let mejor = null
    for (let i = 0; i < libres.length; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        const a = libres[i]
        const b = libres[j]
        if (!esReservable(a) || !esReservable(b)) continue
        if (a.sala !== b.sala) continue // nunca combinar mesas de salas distintas
        if (zona !== 'cualquiera' && a.sala !== salaDeZona(zona)) continue
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

  // Qué sala dibujar: si el cliente ya restringió la zona, esa manda; si no,
  // seguimos a la mesa/combo elegido, o al primer candidato disponible.
  const salaMostrada =
    salaDeZona(zona) ||
    mesaSeleccionada?.sala ||
    comboSeleccionado?.[0]?.sala ||
    candidatosSolos[0]?.sala ||
    (salas.comedor?.activo !== false ? 'comedor' : salas.salon?.activo !== false ? 'salon' : 'terraza')

  const mesasVisibles = mesas.filter((m) => m.sala === salaMostrada)
  const zonasVisibles = zonas.filter((z) => z.room === salaMostrada && z.texto)

  async function confirmarReserva(e) {
    e.preventDefault()
    if (!telefonoValido(telefono)) {
      setErrorMsg('Revisa el teléfono — debe incluir código de área, ej. +56 9 1234 5678.')
      return
    }
    setEnviando(true)
    setErrorMsg('')

    // El código se pide ANTES del insert (vía RPC) y se manda explícito en
    // la fila — el cliente reserva sin login y no tiene permiso de SELECT
    // sobre `reservas`, así que encadenar .select() después del insert
    // para leer el código de vuelta rompe todo el guardado (RLS 42501).
    const { data: codigoData } = await supabase.rpc('siguiente_codigo_reserva')
    const codigo = codigoData ?? ''

    const sala = mesaSeleccionada?.sala ?? comboSeleccionado?.[0]?.sala
    const base = { nombre, telefono, email, fecha, hora, personas, sala, codigo }
    let error
    let mesaLabelFinal
    if (comboSeleccionado) {
      const label = comboSeleccionado.map((m) => m.etiqueta.replace('Mesa ', '')).join(' + ')
      mesaLabelFinal = `Mesa ${label} (combinada)`
      const inserts = comboSeleccionado.map((m) => ({ ...base, mesa_id: m.id, mesa_label: mesaLabelFinal }))
      ;({ error } = await supabase.from('reservas').insert(inserts))
    } else {
      mesaLabelFinal = mesaSeleccionada.etiqueta
      ;({ error } = await supabase.from('reservas').insert({ ...base, mesa_id: mesaSeleccionada.id, mesa_label: mesaLabelFinal }))
    }

    setEnviando(false)

    // Se vuelve a comprobar disponibilidad recién al guardar (no basta con
    // que estuviera libre cuando se cargó el plano) — el índice único de
    // `reservas` es quien realmente lo garantiza; acá solo reaccionamos.
    if (error) {
      if (error.code === '23505') {
        await liberarHolds()
        setErrorMsg('')
        setAvisoPlano('Esta mesa acaba de ser reservada. Por favor elige otra mesa disponible.')
        await verPlano()
      } else {
        setErrorMsg('No pudimos registrar tu reserva. Inténtalo de nuevo o escríbenos por WhatsApp.')
      }
      return
    }

    setCodigoReserva(codigo)
    liberarHolds()

    // Una sola llamada aunque sea reserva combinada (2 filas insertadas) —
    // si esto falla, la reserva ya quedó guardada igual, no bloqueamos al cliente.
    supabase
      .rpc('confirmar_reserva_cliente', {
        p_nombre: nombre,
        p_email: email,
        p_fecha: fecha,
        p_hora: hora,
        p_personas: personas,
        p_mesa_label: mesaLabelFinal
      })
      .then(({ error: rpcError }) => {
        if (rpcError) console.error('No se pudo enviar el correo de confirmación:', rpcError)
      })

    setStep('ok')
  }

  if (step === 'ok') {
    const label = comboSeleccionado ? comboSeleccionado.map((m) => m.etiqueta).join(' + ') : mesaSeleccionada.etiqueta
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 text-center text-paper">
        <Header />
        <div className="w-14 h-14 rounded-full border border-gold/40 flex items-center justify-center mb-4">
          <span className="text-2xl text-gold">✓</span>
        </div>
        <h1 className="font-serif text-2xl text-gold mb-2">¡Reserva confirmada!</h1>
        <p className="text-sm text-paper/60 max-w-xs">
          {label} · {personas} personas
          <br />
          {formatFechaCL(fecha)} · {hora} hrs
        </p>
        {codigoReserva && (
          <p className="font-mono text-ember text-sm mt-3 tracking-wide border border-ember/30 rounded-full px-4 py-1.5">
            {codigoReserva}
          </p>
        )}
        <p className="text-xs text-paper/40 max-w-xs mt-4">
          El restaurante recibirá tu solicitud y te contactará al {telefono} para confirmarla.
        </p>
        <FooterRedes />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ink text-paper px-4 py-8 flex flex-col items-center">
      <Header />
      <TituloReserva>
        {step === 'filtros' && 'Cuéntanos cuándo y cuántos son.'}
        {step === 'plano' && 'Elige tu mesa en el plano.'}
        {step === 'contacto' && 'Últimos datos para confirmar.'}
      </TituloReserva>

      {step === 'filtros' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            verPlano()
          }}
          className="w-full max-w-md flex flex-col gap-3"
        >
          <div className="flex gap-3">
            <label className="text-xs tracking-wide text-gold/70 flex-1">
              Fecha
              <div className="relative mt-1.5">
                <IconCalendario className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/60 pointer-events-none" />
                <input
                  required
                  type="date"
                  min={todayISO()}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-xl bg-inkSoft border border-bronze/25 pl-10 pr-3 py-3 text-paper focus:border-gold/50 focus:outline-none"
                />
              </div>
            </label>
            <label className="text-xs tracking-wide text-gold/70 flex-1">
              Hora
              <div className="relative mt-1.5">
                <IconReloj className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/60 pointer-events-none" />
                <input
                  required
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full rounded-xl bg-inkSoft border border-bronze/25 pl-10 pr-3 py-3 text-paper focus:border-gold/50 focus:outline-none"
                />
              </div>
            </label>
          </div>

          <label className="text-xs tracking-wide text-gold/70">
            Personas
            <div className="mt-1.5 flex items-center gap-3 bg-inkSoft border border-bronze/25 rounded-xl px-4 py-2.5">
              <button
                type="button"
                onClick={() => setPersonas((p) => Math.max(1, p - 1))}
                className="w-9 h-9 rounded-lg border border-bronze/30 text-paper/70 text-lg"
              >
                −
              </button>
              <span className="flex-1 text-center font-serif text-ember text-xl">{personas}</span>
              <button
                type="button"
                onClick={() => setPersonas((p) => Math.min(20, p + 1))}
                className="w-9 h-9 rounded-lg border border-ember/50 text-ember text-lg"
              >
                +
              </button>
            </div>
          </label>

          <div>
            <span className="text-xs tracking-wide text-gold/70">Zona (opcional)</span>
            <div className="mt-1.5 flex gap-2 flex-wrap">
              {zonaOptions
                .filter((z) => z !== 'cualquiera')
                .map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZona(zona === z ? 'cualquiera' : z)}
                    className={`px-3.5 py-2 rounded-full text-xs border transition-colors ${
                      zona === z ? 'border-gold text-gold bg-gold/10' : 'border-bronze/25 text-paper/50'
                    }`}
                  >
                    {z}
                  </button>
                ))}
            </div>
            {salas.comedor?.activo === false && salas.salon?.activo === false && salas.terraza?.activo === false && (
              <p className="text-xs text-wineSoft mt-2">Hoy no hay salas disponibles para reserva online — escríbenos por WhatsApp.</p>
            )}
          </div>

          <button
            type="submit"
            className="mt-3 w-full py-4 rounded-2xl font-head font-bold tracking-wide bg-gradient-to-br from-ember to-wine text-paper shadow-glow flex items-center justify-center gap-2"
          >
            VER PLANO Y MESAS DISPONIBLES
            <span aria-hidden="true">›</span>
          </button>
        </form>
      )}

      {step === 'plano' && (
        <>
          <div className="w-full max-w-md flex items-center justify-between text-xs text-paper/50 mb-3 gap-2">
            <button onClick={() => { setAvisoPlano(''); setStep('filtros') }} className="text-gold/80 underline decoration-gold/30 shrink-0">
              ← Cambiar fecha/hora/personas
            </button>
            <span className="font-mono text-ember text-right">
              {personas} · {hora} · {formatFechaCL(fecha)}
            </span>
          </div>

          {avisoPlano && (
            <p className="w-full max-w-md text-center text-xs text-gold bg-gold/10 border border-gold/30 rounded-xl px-3 py-2 mb-3">
              {avisoPlano}
            </p>
          )}

          <div className="w-full max-w-md bg-inkSoft rounded-2xl p-3 mb-4">
            <svg
              viewBox={
                salaMostrada === 'salon'
                  ? `-40 -40 ${SALON_ROOM_W + 80} ${SALON_ROOM_H + 80}`
                  : salaMostrada === 'terraza'
                  ? `-40 -40 ${TERRAZA_ROOM_W + 80} ${TERRAZA_ROOM_H + 80}`
                  : '-40 -40 1420 1780'
              }
              className="w-full h-auto"
              role="img"
              aria-label={`Plano de ${ROOM_LABELS[salaMostrada]}, elige una mesa`}
            >
              <defs>
                <filter id="glowSeleccionada" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="9" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {salaMostrada === 'comedor' && (
                <>
                  <path d="M0,0 L324,0 L324,550 L1314,550 L1314,1700 L0,1700 Z" fill="none" stroke="#E3B341" strokeWidth="8" opacity="0.85" />
                  {zonasVisibles.map((z) => (
                    <text key={z.id} x={z.x} y={z.y} fontFamily="'Space Grotesk',Arial,sans-serif" fontWeight="700" fontSize={z.tam || 30} fill="#E3B341" opacity="0.65">
                      {z.texto}
                    </text>
                  ))}
                </>
              )}

              {salaMostrada === 'salon' && (
                <>
                  <rect x="0" y="0" width={SALON_ROOM_W} height={SALON_ROOM_H} fill="none" stroke="#B5732A" strokeWidth="10" />
                  {zonasVisibles
                    .filter((z) => z.id !== 's_barra_letrero' && z.id !== 's_terraza')
                    .map((z) => (
                      <text key={z.id} x={z.x} y={z.y} fontFamily="'Space Grotesk',Arial,sans-serif" fontWeight="700" fontSize={z.tam || 26} fill="#FFF8F1" opacity="0.5">
                        {z.texto}
                      </text>
                    ))}

                  {/* columnas doradas junto al acceso */}
                  <circle cx="330" cy="60" r="16" fill="#E3B341" />
                  <circle cx="670" cy="60" r="16" fill="#E3B341" />

                  {/* pared espejada, referencia */}
                  <rect x={SALON_ROOM_W - 16} y="420" width="16" height="260" fill="#221A16" stroke="#6FD4D9" strokeWidth="2" />

                  {/* barra */}
                  <rect x={SALON_ROOM_W - 70} y="920" width="70" height="150" fill="#221A16" stroke="#E3B341" strokeWidth="2.5" />
                  {zonasVisibles
                    .filter((z) => z.id === 's_barra_letrero')
                    .map((z) => (
                      <text key={z.id} x={z.x} y={z.y} textAnchor="middle" fontSize={z.tam || 22} fontWeight="700" fill="#E3B341" transform={`rotate(${z.angulo} ${z.x} ${z.y})`}>
                        {z.texto}
                      </text>
                    ))}

                  {/* cabina telefónica */}
                  <rect x="0" y="1160" width="90" height="90" fill="#7A1620" stroke="#E3B341" strokeWidth="3" />

                  {/* banqueta lounge */}
                  <rect x={SALON_ROOM_W - 60} y="1180" width="60" height="180" rx="14" fill="#7A1620" opacity="0.55" stroke="#E3B341" strokeWidth="2" />

                  {/* puerta trasera */}
                  <line x1="400" y1={SALON_ROOM_H} x2="600" y2={SALON_ROOM_H} stroke="#6FD4D9" strokeWidth="2.5" strokeDasharray="6 5" />
                  {zonasVisibles
                    .filter((z) => z.id === 's_terraza')
                    .map((z) => (
                      <text key={z.id} x={z.x} y={z.y} textAnchor="middle" fontSize={z.tam || 18} fill="#6FD4D9" opacity="0.7">
                        {z.texto}
                      </text>
                    ))}
                </>
              )}

              {salaMostrada === 'terraza' && (
                <>
                  <rect x="0" y="0" width={TERRAZA_ROOM_W} height={TERRAZA_ROOM_H} fill="none" stroke="#B5732A" strokeWidth="10" />
                  {zonasVisibles.map((z) => (
                    <text key={z.id} x={z.x} y={z.y} fontFamily="'Space Grotesk',Arial,sans-serif" fontWeight="700" fontSize={z.tam || 26} fill="#FFF8F1" opacity="0.5">
                      {z.texto}
                    </text>
                  ))}

                  {/* arco de truss que marca el ingreso a la pista */}
                  <line x1="0" y1="700" x2="0" y2="600" stroke="#9AA1A9" strokeWidth="6" />
                  <line x1="0" y1="600" x2={TERRAZA_ROOM_W} y2="600" stroke="#9AA1A9" strokeWidth="6" />
                  <line x1={TERRAZA_ROOM_W} y1="600" x2={TERRAZA_ROOM_W} y2="700" stroke="#9AA1A9" strokeWidth="6" />
                </>
              )}

              {mesasVisibles.map((m) => {
                if (m.tipo === 'escenario' || m.tipo === 'decor') {
                  // Escenario / carrito / parlante: solo referencia visual del plano, no se clickean.
                  return (
                    <g key={m.id} transform={`translate(${m.x},${m.y}) rotate(${m.angulo})`}>
                      {m.tipo === 'escenario' ? (
                        <path d={ovalPath(m.ancho, m.alto)} fill="#B5732A" opacity="0.28" stroke="#E3B341" strokeWidth="2.5" />
                      ) : m.estilo === 'parlante' ? (
                        <ParlanteShape ancho={m.ancho} alto={m.alto} />
                      ) : (
                        <CarritoShape ancho={m.ancho} alto={m.alto} />
                      )}
                      <text textAnchor="middle" dy="8" fontSize="22" fontWeight="700" fill="#FFF8F1" opacity="0.7">
                        {m.etiqueta.replace('Mesa ', '')}
                      </text>
                    </g>
                  )
                }

                if (m.activa === false) {
                  // Bloqueada manualmente desde /admin/mesas (mantención, evento
                  // privado, etc.) — distinguible de "reservada" por el trazo
                  // punteado y el aria-label, no solo por el color.
                  return (
                    <g
                      key={m.id}
                      transform={`translate(${m.x},${m.y}) rotate(${m.tipo === 'rect' ? m.angulo : 0})`}
                      opacity="0.4"
                      role="img"
                      aria-label={`${m.etiqueta}, no disponible${m.bloqueo_motivo ? ': ' + m.bloqueo_motivo : ''}`}
                    >
                      {m.tipo === 'round' ? (
                        <circle r={m.ancho / 2} fill="#2a2320" stroke="#6b5330" strokeWidth="3" strokeDasharray="6 5" />
                      ) : (
                        <rect
                          x={-m.ancho / 2}
                          y={-m.alto / 2}
                          width={m.ancho}
                          height={m.alto}
                          rx="10"
                          fill="#2a2320"
                          stroke="#6b5330"
                          strokeWidth="3"
                          strokeDasharray="6 5"
                        />
                      )}
                      <text textAnchor="middle" dy="8" fontSize={m.tipo === 'round' ? 34 : 30} fontWeight="700" fill="#FFF8F1">
                        {m.etiqueta.replace('Mesa ', '')}
                      </text>
                    </g>
                  )
                }

                const reservada = estaReservada(m)
                const compatible = esCompatible(m)
                const enCombo = comboIds?.includes(m.id)
                const seleccionada = m.id === mesaId || enCombo
                const chairs = chairPositions(m)
                const esSombrilla = m.tipo === 'round' && m.estilo === 'sombrilla'

                // Disponible: negro + contorno dorado. Reservada: bronce apagado
                // (sin depender solo del color — ver aria-label/aria-disabled abajo).
                // Seleccionada: naranja luminoso con glow.
                let fill = '#15100D'
                let stroke = '#E3B341'
                let opacity = 1
                if (seleccionada) {
                  fill = '#FF7A1A'
                  stroke = '#FFD9B3'
                } else if (reservada) {
                  fill = '#4a3a24'
                  stroke = '#6b5330'
                } else if (!compatible) {
                  opacity = 0.3
                }

                const clickable = compatible && !reservada
                return (
                  <g
                    key={m.id}
                    transform={`translate(${m.x},${m.y}) rotate(${m.tipo === 'rect' ? m.angulo : 0})`}
                    opacity={opacity}
                    filter={seleccionada ? 'url(#glowSeleccionada)' : undefined}
                    role="button"
                    aria-disabled={!clickable}
                    aria-label={`${m.etiqueta}${reservada ? ', reservada' : seleccionada ? ', seleccionada' : ', disponible'}`}
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
                      {esSombrilla ? (
                        <SombrillaShape radio={m.ancho / 2} seleccionada={seleccionada} reservada={reservada} />
                      ) : m.tipo === 'round' ? (
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

            <div className="flex items-center justify-between mt-3 flex-wrap gap-y-2">
              <div className="flex items-center gap-4 text-[10px] text-paper/50">
                <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#15100D', border: '1.5px solid #E3B341' }} />Disponible</span>
                <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#4a3a24', border: '1.5px solid #6b5330' }} />Reservada</span>
                <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full inline-block" style={{ background: '#FF7A1A' }} />Seleccionada</span>
              </div>
              {zonaOptions.length > 1 && <span className="text-[10px] text-paper/40">{ROOM_LABELS[salaMostrada]}</span>}
            </div>
          </div>

          {necesitaCombo && combo && (
            <div className="w-full max-w-md bg-inkSoft border border-gold/25 rounded-2xl p-4 mb-4">
              <p className="text-xs text-paper/50 mb-2">Ninguna mesa sola alcanza para {personas} personas — combinación recomendada:</p>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-head font-semibold text-sm">
                    {combo.a.etiqueta} + {combo.b.etiqueta}
                  </div>
                  <div className="text-xs text-paper/50">Capacidad {combo.capacidad} · {formatFechaCL(fecha)} {hora}</div>
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

          <p className="text-center text-xs text-gold/70 mb-4 flex items-center justify-center gap-1.5">
            {(mesaSeleccionada || comboSeleccionado) && <IconMesa className="w-3.5 h-3.5" />}
            {mesaSeleccionada
              ? `${mesaSeleccionada.etiqueta} · ${personas} personas`
              : comboSeleccionado
              ? `${comboSeleccionado.map((m) => m.etiqueta).join(' + ')} · ${personas} personas`
              : 'Toca una mesa disponible'}
          </p>

          <button
            onClick={async () => {
              const ids = mesaSeleccionada ? [mesaSeleccionada.id] : comboSeleccionado.map((m) => m.id)
              await crearHolds(ids)
              setStep('contacto')
            }}
            disabled={!puedeContinuar}
            className="w-full max-w-md py-4 rounded-2xl font-head font-bold tracking-wide bg-gradient-to-br from-ember to-wine text-paper shadow-glow disabled:opacity-40 disabled:shadow-none"
          >
            CONTINUAR
          </button>
        </>
      )}

      {step === 'contacto' && (
        <form onSubmit={confirmarReserva} className="w-full max-w-md flex flex-col gap-3">
          <button
            type="button"
            onClick={async () => {
              await liberarHolds()
              setStep('plano')
            }}
            className="text-xs text-gold/80 underline decoration-gold/30 text-left mb-1"
          >
            ← Volver al plano
          </button>
          <p className="text-[10px] text-paper/35 -mt-2 mb-1">Tu mesa queda retenida por {HOLD_MIN} minutos mientras completas estos datos.</p>

          <div className="bg-inkSoft border border-bronze/25 rounded-xl p-3.5 text-xs text-paper/70 flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-1.5">
              <IconMesa className="w-3.5 h-3.5 text-gold/70" />
              {mesaSeleccionada ? mesaSeleccionada.etiqueta : comboSeleccionado.map((m) => m.etiqueta).join(' + ')} · {personas} personas
            </span>
            <span className="font-mono text-ember flex items-center gap-1.5">
              <IconReloj className="w-3.5 h-3.5" />
              {formatFechaCL(fecha)} · {hora}
            </span>
          </div>

          <label className="text-xs tracking-wide text-gold/70">
            Nombre
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-inkSoft border border-bronze/25 px-4 py-3 text-paper focus:border-gold/50 focus:outline-none"
              placeholder="Tu nombre completo"
            />
          </label>
          <label className="text-xs tracking-wide text-gold/70">
            Teléfono de contacto
            <input
              required
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-inkSoft border border-bronze/25 px-4 py-3 text-paper focus:border-gold/50 focus:outline-none"
              placeholder="+56 9 ..."
            />
          </label>
          <label className="text-xs tracking-wide text-gold/70">
            Correo (te llega la confirmación ahí)
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-inkSoft border border-bronze/25 px-4 py-3 text-paper focus:border-gold/50 focus:outline-none"
              placeholder="tucorreo@ejemplo.com"
            />
          </label>

          {errorMsg && <p className="text-sm text-wineSoft">{errorMsg}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 w-full py-4 rounded-2xl font-head font-bold tracking-wide bg-gradient-to-br from-ember to-wine text-paper shadow-glow disabled:opacity-50"
          >
            {enviando ? 'ENVIANDO...' : 'CONFIRMAR RESERVA'}
          </button>
        </form>
      )}

      <FooterRedes />
    </div>
  )
}
