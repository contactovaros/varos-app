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

export function ReservaCard({ r }) {
  const turno = turnoDe(r.hora?.slice(0, 5))
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
      <div className="flex items-center justify-between">
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
    </div>
  )
}

// Panel compacto y autocontenido: fecha + total de personas + lista, filtrado
// a una sola sala. Usado como columna lateral en /admin/mesas (pantallas
// anchas) para ver las reservas de la sala que se está editando sin salir
// de esa pantalla.
export function PanelReservasDia({ sala }) {
  const [fecha, setFecha] = useState(todayISO())
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
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="w-full rounded-xl bg-ink border border-white/10 px-3 py-2.5 text-paper text-sm"
      />
      <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-0.5">
        {cargando && <p className="text-paper/40 text-xs">Cargando…</p>}
        {!cargando && reservas.length === 0 && (
          <p className="text-paper/40 text-xs">Sin reservas para {SALA_LABEL[sala] ?? sala} este día.</p>
        )}
        {reservas.map((r) => (
          <ReservaCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  )
}
