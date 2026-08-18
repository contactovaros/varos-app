import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SALA_LABEL, ESTADO_LABEL, ESTADO_CLASS } from '../pages/AdminReservas.jsx'
import { IconoWhatsApp } from './TarjetaFidelidad.jsx'

// Piezas compartidas entre /admin/mesa-trabajo (la página completa) y el
// panel lateral que aparece en /admin/mesas en pantallas anchas — viven acá,
// fuera de ambas páginas, para que ninguna de las dos tenga que importar de
// la otra (evita una dependencia circular entre AdminMesas.jsx y
// AdminMesaTrabajo.jsx).

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Franjas horarias reales de Varo's: almuerzo 12:30–16:30, cena 19:30–00:00.
// Una reserva fuera de esas ventanas (poco común) simplemente no lleva etiqueta.
export function turnoDe(hora) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const mins = h * 60 + m
  if (mins >= 12 * 60 + 30 && mins < 16 * 60 + 30) return 'Almuerzo'
  if (mins >= 19 * 60 + 30) return 'Cena'
  return null
}

// Arma el link de wa.me a partir de lo que la persona haya escrito al reservar
// (con o sin +56) — wa.me necesita el número completo sin el "+".
export function whatsappHref(telefono) {
  const digits = (telefono || '').replace(/\D/g, '')
  const conCodigo = digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits
  return `https://wa.me/${conCodigo}`
}

// Placeholder del cruce con el club de fidelización — a propósito no busca
// datos reales todavía (no existe forma confiable de cruzar reserva↔socio,
// ver memoria de arquitectura). Deja el lugar reservado en la UI.
export function InsigniaFidelizacion() {
  return (
    <span
      className="w-6 h-6 rounded-full border border-white/10 text-paper/25 flex items-center justify-center text-[11px] shrink-0"
      title="Tarjeta de fidelización — cruce automático próximamente"
    >
      ★
    </span>
  )
}

// onConfirmada(id) / onCancelada(id) son opcionales: si se pasan, la tarjeta
// avisa al padre que esta reserva cambió de estado para que actualice su
// lista local sin tener que refetchear todo.
export function ReservaCard({ r, onConfirmada, onCancelada }) {
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const turno = turnoDe(r.hora?.slice(0, 5))

  async function confirmar() {
    setConfirmando(true)
    const { error } = await supabase.rpc('admin_confirmar_reserva', { p_reserva_id: r.id })
    setConfirmando(false)
    if (error) {
      alert('No se pudo confirmar la reserva: ' + error.message)
      return
    }
    onConfirmada?.(r.id)
  }

  async function cancelar() {
    if (!window.confirm(`¿Cancelar la reserva de ${r.nombre} (${r.mesa_label}, ${r.hora?.slice(0, 5)} hrs)?`)) return
    setCancelando(true)
    const { error } = await supabase.from('reservas').update({ estado: 'cancelada' }).eq('id', r.id)
    setCancelando(false)
    if (error) {
      alert('No se pudo cancelar la reserva: ' + error.message)
      return
    }
    onCancelada?.(r.id)
  }

  return (
    <div className="bg-ink border border-white/5 rounded-xl p-3 text-xs flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className="font-head font-semibold text-paper">{r.nombre}</div>
          <div className="text-paper/50 text-[11px] mt-0.5">
            {r.mesa_label} · {r.personas} personas
            {r.sala ? ` · ${SALA_LABEL[r.sala] ?? r.sala}` : ''}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-md border text-[10px] whitespace-nowrap ${ESTADO_CLASS[r.estado] ?? ''}`}>
          {ESTADO_LABEL[r.estado] ?? r.estado}
        </span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-1.5">
        <span className="font-mono text-ember text-[11px]">
          {r.hora?.slice(0, 5)} hrs{turno ? ` · ${turno}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <InsigniaFidelizacion />
          <a
            href={whatsappHref(r.telefono)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#25D366]/40 text-[#25D366] text-[10px] font-semibold whitespace-nowrap"
          >
            <IconoWhatsApp />
            WhatsApp
          </a>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {r.estado === 'pendiente' && (
          <button
            onClick={confirmar}
            disabled={confirmando}
            className="flex-1 py-1.5 rounded-md font-head font-semibold text-[11px] bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
          >
            {confirmando ? 'Confirmando…' : 'Confirmar (avisa por correo)'}
          </button>
        )}
        <button
          onClick={cancelar}
          disabled={cancelando}
          className="py-1.5 px-3 rounded-md font-head font-semibold text-[11px] border border-wine/40 text-wineSoft disabled:opacity-50"
        >
          {cancelando ? 'Cancelando…' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Calendario mensual con puntito en los días que tienen alguna reserva
// activa (no cancelada) — así se ven las reservas próximas de un vistazo,
// no solo las del día seleccionado. `sala` es opcional: si se pasa, solo
// cuenta reservas de esa sala (panel de /admin/mesas); si no, cuenta todas
// (vista general de /admin/mesa-trabajo).
export function CalendarioReservas({ fechaSeleccionada, onSelectFecha, sala }) {
  const [anio, setAnio] = useState(Number(fechaSeleccionada.slice(0, 4)))
  const [mes, setMes] = useState(Number(fechaSeleccionada.slice(5, 7)) - 1)
  const [conteoPorFecha, setConteoPorFecha] = useState({})

  useEffect(() => {
    const inicio = `${anio}-${pad2(mes + 1)}-01`
    const ultimoDia = new Date(anio, mes + 1, 0).getDate()
    const fin = `${anio}-${pad2(mes + 1)}-${pad2(ultimoDia)}`
    let query = supabase.from('reservas').select('fecha').gte('fecha', inicio).lte('fecha', fin).neq('estado', 'cancelada')
    if (sala) query = query.eq('sala', sala)
    query.then(({ data }) => {
      const mapa = {}
      ;(data ?? []).forEach((r) => {
        mapa[r.fecha] = (mapa[r.fecha] ?? 0) + 1
      })
      setConteoPorFecha(mapa)
    })
  }, [anio, mes, sala])

  function cambiarMes(delta) {
    let m = mes + delta
    let a = anio
    if (m < 0) {
      m = 11
      a -= 1
    } else if (m > 11) {
      m = 0
      a += 1
    }
    setMes(m)
    setAnio(a)
  }

  const primerDiaSemana = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const celdas = [...Array(primerDiaSemana).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)]
  const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const hoyStr = todayISO()

  return (
    <div className="bg-ink border border-white/10 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => cambiarMes(-1)} className="w-7 h-7 rounded-md border border-white/10 text-paper/60">
          ‹
        </button>
        <div className="text-xs font-head font-semibold capitalize">{nombreMes}</div>
        <button type="button" onClick={() => cambiarMes(1)} className="w-7 h-7 rounded-md border border-white/10 text-paper/60">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-paper/35 mb-1">
        {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((d, i) => {
          if (d === null) return <div key={i} />
          const fechaStr = `${anio}-${pad2(mes + 1)}-${pad2(d)}`
          const conReserva = (conteoPorFecha[fechaStr] ?? 0) > 0
          const esHoy = fechaStr === hoyStr
          const esSeleccionada = fechaStr === fechaSeleccionada
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelectFecha(fechaStr)}
              title={conReserva ? `${conteoPorFecha[fechaStr]} reserva(s)` : undefined}
              className={`relative aspect-square rounded-md text-[11px] flex items-center justify-center ${
                esSeleccionada
                  ? 'bg-ember text-ink font-bold'
                  : esHoy
                  ? 'border border-gold/50 text-gold'
                  : conReserva
                  ? 'text-gold font-semibold'
                  : 'text-paper/40'
              }`}
            >
              {d}
              {conReserva && !esSeleccionada && <span className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-ember" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Solo la lista (sin calendario): fecha + total de personas + tarjetas,
// filtrado a una sola sala. `fecha` la controla quien use este componente
// (en /admin/mesas es el <CalendarioReservas> de al lado el que la cambia).
export function ListaReservasDia({ fecha, sala }) {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    setCargando(true)
    supabase
      .from('reservas')
      .select('*')
      .eq('fecha', fecha)
      .eq('sala', sala)
      .neq('estado', 'cancelada')
      .order('hora')
      .then(({ data }) => {
        setReservas(data ?? [])
        setCargando(false)
      })
  }, [fecha, sala])

  const totalPersonas = reservas.reduce((sum, r) => sum + (r.personas ?? 0), 0)

  return (
    <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-head font-semibold text-sm">Reservas del día</h3>
        <div className="bg-ink border border-ember/30 rounded-lg px-2.5 py-1 text-center">
          <div className="text-[8px] text-paper/40 uppercase tracking-wide">Personas</div>
          <div className="font-head font-bold text-ember text-sm leading-none">{totalPersonas}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {cargando && <p className="text-paper/40 text-xs">Cargando…</p>}
        {!cargando && reservas.length === 0 && (
          <p className="text-paper/40 text-xs">Sin reservas para {SALA_LABEL[sala] ?? sala} este día.</p>
        )}
        {reservas.map((r) => (
          <ReservaCard
            key={r.id}
            r={r}
            onConfirmada={(id) => setReservas((prev) => prev.map((x) => (x.id === id ? { ...x, estado: 'confirmada' } : x)))}
            onCancelada={(id) => setReservas((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </div>
  )
}
