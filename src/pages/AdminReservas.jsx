import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'

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

export default function AdminReservas() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    if (isAdmin) cargar()
  }, [isAdmin])

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
    const { error } = await supabase.from('reservas').update({ estado }).eq('id', r.id)
    if (error) {
      setReservas((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado: r.estado } : x)))
      alert('No se pudo actualizar la reserva.')
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
              <span>{r.codigo}</span>
            </div>
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
                    Confirmar
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
