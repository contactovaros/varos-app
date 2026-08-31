import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'
import { whatsappHref, mensajeConfirmacionReserva } from '../lib/whatsapp.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export const SALA_LABEL = { comedor: 'Comedor Exterior', salon: 'Comedor Principal', terraza: 'Terraza' }

export const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_asistio: 'No asistió'
}
export const ESTADO_CLASS = {
  pendiente: 'border-gold/40 text-gold',
  confirmada: 'border-ember/40 text-ember',
  cancelada: 'border-white/10 text-paper/30 line-through',
  completada: 'border-diamond/40 text-diamond',
  no_asistio: 'border-wine/40 text-wineSoft'
}

export function formatFechaCL(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Ventana de conflicto entre dos reservas en la misma mesa (mismo valor que
// BUFFER_MIN en Reservas.jsx). Acá solo sirve para AVISAR al admin, no bloquea.
const BUFFER_MIN = 120

// Qué tabla de mesas mira cada sala. Mismo mapeo que usa Reservas.jsx.
const SALA_TABLA = { comedor: 'mesas', salon: 'mesas_salon', terraza: 'mesas_terraza' }

function horaToMin(hora) {
  const [h, m] = String(hora).split(':').map(Number)
  return h * 60 + m
}

// Mismo criterio que Reservas.jsx: los objetos decorativos (escenario, carrito,
// parlante) y las mesas bloqueadas a mano no son reservables.
function esReservable(m) {
  return (m.tipo === 'round' || m.tipo === 'rect') && m.activa !== false
}

// Carga manual de una reserva desde el panel — para las que entran por
// WhatsApp o teléfono, que si no nunca aparecen en el plano ni en la mesa de
// trabajo. Versión MVP: sala y mesa por <select>, sin plano clickeable.
// Inserta con estado 'confirmada' y origen 'admin'. Si la mesa ya tiene algo
// en esa franja lo avisa pero deja guardar igual (decisión del admin).
function CargaManualReserva({ reservas, mesasPorSala, onCreada }) {
  const [sala, setSala] = useState('comedor')
  const [mesaId, setMesaId] = useState('')
  const [fecha, setFecha] = useState(todayISO())
  const [hora, setHora] = useState('13:00')
  const [personas, setPersonas] = useState(2)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const mesasSala = (mesasPorSala[sala] ?? []).filter(esReservable)
  const mesa = mesasSala.find((m) => m.id === mesaId)

  // Si se cambia de sala y la mesa elegida ya no pertenece, se deselecciona.
  useEffect(() => {
    if (mesaId && !mesasSala.some((m) => m.id === mesaId)) setMesaId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala])

  // Choques en la misma mesa/fecha dentro de ±BUFFER_MIN — solo aviso.
  const conflictos = mesaId
    ? reservas.filter(
        (r) =>
          r.fecha === fecha &&
          r.mesa_id === mesaId &&
          r.estado !== 'cancelada' &&
          Math.abs(horaToMin(r.hora) - horaToMin(hora)) < BUFFER_MIN
      )
    : []

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setOk('')
    if (!mesa) {
      setError('Elegí una mesa.')
      return
    }
    if (telefono.replace(/\D/g, '').length < 8) {
      setError('El teléfono no parece válido.')
      return
    }
    setGuardando(true)

    // El código se pide por RPC ANTES del insert y se manda explícito en la
    // fila — mismo patrón que Reservas.jsx. No encadenar .select() sobre
    // `reservas` (ver la trampa de RLS 42501 documentada en el proyecto).
    const { data: codigo } = await supabase.rpc('siguiente_codigo_reserva')

    const fila = {
      mesa_id: mesa.id,
      mesa_label: mesa.etiqueta,
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      fecha,
      hora,
      personas,
      sala,
      estado: 'confirmada',
      origen: 'admin',
      alergias: notas.trim() || null
    }
    if (codigo) fila.codigo = codigo

    const { error: errIns } = await supabase.from('reservas').insert(fila)
    setGuardando(false)

    if (errIns) {
      setError(
        errIns.code === '23505'
          ? 'Esa mesa ya tiene una reserva exactamente a esa fecha y hora.'
          : 'No se pudo guardar: ' + errIns.message
      )
      return
    }

    setOk(`Reserva de ${nombre.trim()} cargada y confirmada.`)
    setNombre('')
    setTelefono('')
    setNotas('')
    setPersonas(2)
    onCreada()
  }

  const inputCls =
    'w-full rounded-lg bg-ink border border-white/10 px-3 py-2 text-sm text-paper focus:border-ember/50 focus:outline-none'

  return (
    <details className="group bg-inkSoft border border-white/5 rounded-2xl mb-6">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div>
          <div className="font-head font-semibold text-sm">Cargar una reserva a mano</div>
          <div className="text-[11px] text-paper/40 mt-0.5">
            Para las que entran por WhatsApp o teléfono. Queda confirmada al instante.
          </div>
        </div>
        <span className="text-ember text-sm shrink-0 transition-transform duration-200 group-open:rotate-180">▾</span>
      </summary>

      <form onSubmit={guardar} className="px-4 pb-4 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1 text-[11px] text-paper/50">
            Sala
            <select value={sala} onChange={(e) => setSala(e.target.value)} className={inputCls + ' mt-1'}>
              {Object.keys(SALA_TABLA).map((s) => (
                <option key={s} value={s}>
                  {SALA_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-[11px] text-paper/50">
            Mesa
            <select value={mesaId} onChange={(e) => setMesaId(e.target.value)} className={inputCls + ' mt-1'}>
              <option value="">Elegí una mesa…</option>
              {mesasSala.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.etiqueta} · {m.capacidad}p
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex-1 text-[11px] text-paper/50">
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls + ' mt-1'} />
          </label>
          <label className="flex-1 text-[11px] text-paper/50">
            Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls + ' mt-1'} />
          </label>
          <label className="w-20 text-[11px] text-paper/50">
            Personas
            <input
              type="number"
              min="1"
              max="60"
              value={personas}
              onChange={(e) => setPersonas(Math.max(1, Number(e.target.value) || 1))}
              className={inputCls + ' mt-1'}
            />
          </label>
        </div>

        {mesa && personas > mesa.capacidad && (
          <p className="text-[11px] text-gold">
            ⚠ {mesa.etiqueta} es para {mesa.capacidad} — cargás {personas} personas.
          </p>
        )}

        {conflictos.length > 0 && (
          <p className="text-[11px] text-gold bg-gold/10 border border-gold/25 rounded-lg px-2.5 py-1.5">
            ⚠ {mesa?.etiqueta} ya tiene {conflictos.length} reserva(s) cerca de esa hora (±2 h):{' '}
            {conflictos.map((c) => `${c.nombre} ${c.hora?.slice(0, 5)}`).join(', ')}. Podés guardar igual.
          </p>
        )}

        <div className="flex gap-3">
          <label className="flex-1 text-[11px] text-paper/50">
            Nombre
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls + ' mt-1'} />
          </label>
          <label className="flex-1 text-[11px] text-paper/50">
            Teléfono
            <input
              required
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={inputCls + ' mt-1'}
            />
          </label>
        </div>

        <label className="text-[11px] text-paper/50">
          Alergias / notas
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className={inputCls + ' mt-1 resize-none'}
            placeholder="Opcional — alergias, silla de bebé, ventana, etc."
          />
        </label>

        {error && <p className="text-sm text-wineSoft">{error}</p>}
        {ok && <p className="text-sm text-diamond">{ok}</p>}

        <button
          type="submit"
          disabled={guardando}
          className="self-end px-4 py-2 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Cargar reserva'}
        </button>
      </form>
    </details>
  )
}

export default function AdminReservas() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [cenaHabilitada, setCenaHabilitada] = useState(false)
  const [publicado, setPublicado] = useState(false)
  const [mesasPorSala, setMesasPorSala] = useState({ comedor: [], salon: [], terraza: [] })

  async function cargar() {
    const { data } = await supabase
      .from('reservas')
      .select('*')
      .gte('fecha', todayISO())
      .order('fecha')
      .order('hora')
    setReservas(data ?? [])
    setLoading(false)
  }

  async function cargarConfig() {
    const { data } = await supabase.from('configuracion_reservas').select('*').eq('id', 1).maybeSingle()
    setCenaHabilitada(data?.cena_habilitada ?? false)
    setPublicado(data?.publicado ?? false)
  }

  async function cargarMesas() {
    const [c, s, t] = await Promise.all([
      supabase.from('mesas').select('*').order('orden'),
      supabase.from('mesas_salon').select('*').order('orden'),
      supabase.from('mesas_terraza').select('*').order('orden')
    ])
    setMesasPorSala({ comedor: c.data ?? [], salon: s.data ?? [], terraza: t.data ?? [] })
  }

  useEffect(() => {
    if (isAdmin) {
      cargar()
      cargarConfig()
      cargarMesas()
    }
  }, [isAdmin])

  async function toggleCena() {
    const nuevo = !cenaHabilitada
    setCenaHabilitada(nuevo)
    const { error } = await supabase.from('configuracion_reservas').upsert({ id: 1, cena_habilitada: nuevo })
    if (error) {
      setCenaHabilitada(!nuevo)
      alert('No se pudo actualizar el horario: ' + error.message)
    }
  }

  async function togglePublicado() {
    const nuevo = !publicado
    setPublicado(nuevo)
    const { error } = await supabase.from('configuracion_reservas').upsert({ id: 1, publicado: nuevo })
    if (error) {
      setPublicado(!nuevo)
      alert('No se pudo actualizar: ' + error.message)
    }
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

  async function cambiarEstado(r, estado) {
    setReservas((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado } : x)))
    // Confirmar pasa por el RPC (guarda el estado) — el aviso al cliente ya
    // no es un correo automático, se abre WhatsApp abajo para que el admin
    // mande el mensaje a mano. El resto de los estados solo se guardan.
    const { error } =
      estado === 'confirmada'
        ? await supabase.rpc('admin_confirmar_reserva', { p_reserva_id: r.id })
        : await supabase.from('reservas').update({ estado }).eq('id', r.id)
    if (error) {
      setReservas((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado: r.estado } : x)))
      alert('No se pudo actualizar la reserva: ' + error.message)
      return
    }
    if (estado === 'confirmada') {
      if (r.telefono) window.open(whatsappHref(r.telefono, mensajeConfirmacionReserva(r)), '_blank')
      else alert('Reserva confirmada, pero no tiene teléfono guardado para avisarle por WhatsApp.')
    }
  }

  async function cancelar(r) {
    if (!window.confirm(`¿Cancelar la reserva de ${r.nombre} (${r.mesa_label}, ${r.fecha} ${r.hora})?`)) return
    cambiarEstado(r, 'cancelada')
  }

  return (
    <div className="px-4 pt-8 pb-24">
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-head text-2xl font-semibold">Reservas</h1>
        <p className="text-xs text-paper/50 mt-1">De hoy en adelante, ordenadas por fecha y hora.</p>
      </div>

      <div className="flex items-center justify-between gap-3 bg-inkSoft border border-white/5 rounded-xl px-4 py-3 mb-3">
        <div>
          <div className="text-xs text-paper/70">Reservas online — página pública /reservas</div>
          <div className="text-[10px] mt-0.5">
            {publicado ? (
              <span className="text-ember">● Publicada — el cliente puede reservar online.</span>
            ) : (
              <span className="text-paper/40">● En pausa — el cliente ve “Reservas muy pronto” + WhatsApp.</span>
            )}
          </div>
        </div>
        <button
          onClick={togglePublicado}
          className={`px-4 py-2 rounded-lg font-head font-semibold text-xs border whitespace-nowrap ${
            publicado
              ? 'border-white/10 text-paper/50'
              : 'border-ember/50 text-ember bg-ember/10'
          }`}
        >
          {publicado ? 'Poner en pausa' : 'Publicar ahora'}
        </button>
      </div>

      <div className="flex items-center justify-between bg-inkSoft border border-white/5 rounded-xl px-4 py-3 mb-6">
        <div>
          <div className="text-xs text-paper/70">Reserva online en horario de cena</div>
          <div className="text-[10px] text-paper/40">
            Atención martes a domingo, 12:30–16:30. Si la activas, /reservas también deja pedir hora fuera de ese rango.
          </div>
        </div>
        <button
          onClick={toggleCena}
          className={`px-4 py-2 rounded-lg font-head font-semibold text-xs border whitespace-nowrap ${
            cenaHabilitada ? 'border-ember/40 text-ember bg-ember/10' : 'border-white/10 text-paper/40'
          }`}
        >
          {cenaHabilitada ? 'Habilitada' : 'Solo almuerzo'}
        </button>
      </div>

      <CargaManualReserva reservas={reservas} mesasPorSala={mesasPorSala} onCreada={cargar} />

      {loading && <p className="text-paper/40 text-sm">Cargando…</p>}
      {!loading && reservas.length === 0 && <p className="text-paper/40 text-sm">No hay reservas próximas.</p>}

      <div className="flex flex-col gap-3">
        {reservas.map((r) => (
          <div key={r.id} className="bg-inkSoft border border-white/5 rounded-2xl p-4">
            <div className="flex justify-between items-start gap-3 mb-2">
              <div>
                <div className="font-head font-semibold text-sm">{r.nombre}</div>
                <div className="text-paper/50 text-xs mt-0.5">
                  {r.mesa_label} · {r.personas} personas{r.sala ? ` · ${SALA_LABEL[r.sala] ?? r.sala}` : ''}
                </div>
              </div>
              <span className={`px-2 py-1 rounded-md border text-[10px] whitespace-nowrap ${ESTADO_CLASS[r.estado] ?? ''}`}>
                {ESTADO_LABEL[r.estado] ?? r.estado}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-paper/60 font-mono mb-1">
              <span>{formatFechaCL(r.fecha)} · {r.hora?.slice(0, 5)}</span>
              <span>{r.telefono}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-paper/40 mb-3">
              <span>{r.email || 'sin correo'}</span>
              <span>{r.codigo ? `N° ${String(r.codigo).replace(/^VRS-/, '')}` : ''}</span>
            </div>
            {r.alergias && (
              <div className="text-[11px] text-gold bg-gold/10 border border-gold/25 rounded-lg px-2.5 py-1.5 mb-3">
                ⚠ Alergia/intolerancia: {r.alergias}
              </div>
            )}
            {r.created_at && (
              <div className="text-[10px] text-paper/30 mb-2">
                Creada {new Date(r.created_at).toLocaleString('es-CL')}
              </div>
            )}
            {r.estado !== 'cancelada' && (
              <div className="flex gap-2 justify-end flex-wrap">
                {r.estado === 'pendiente' && (
                  <button
                    onClick={() => cambiarEstado(r, 'confirmada')}
                    className="px-3 py-1.5 rounded-md border border-ember/40 text-ember text-[11px]"
                  >
                    Confirmar por WhatsApp
                  </button>
                )}
                {r.estado === 'confirmada' && (
                  <>
                    <button
                      onClick={() => cambiarEstado(r, 'completada')}
                      className="px-3 py-1.5 rounded-md border border-diamond/40 text-diamond text-[11px]"
                    >
                      Completada
                    </button>
                    <button
                      onClick={() => cambiarEstado(r, 'no_asistio')}
                      className="px-3 py-1.5 rounded-md border border-wine/40 text-wineSoft text-[11px]"
                    >
                      No asistió
                    </button>
                  </>
                )}
                <button
                  onClick={() => cancelar(r)}
                  className="px-3 py-1.5 rounded-md border border-wine/40 text-wineSoft text-[11px]"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
