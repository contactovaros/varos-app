import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import TarjetaFidelidad from '../components/TarjetaFidelidad.jsx'
import AlertaCercania from '../components/AlertaCercania.jsx'
import CampanaPopup from '../components/CampanaPopup.jsx'
import { pushSoportado, notificacionesActivas, activarNotificaciones } from '../lib/pushNotifications.js'

export default function Club() {
  const { customer, signOut } = useAuth()
  const [campanas, setCampanas] = useState([])
  const [pushActivo, setPushActivo] = useState(false)
  const [activandoPush, setActivandoPush] = useState(false)

  useEffect(() => {
    if (!customer) return
    supabase
      .from('promotions')
      .select('*')
      .eq('active', true)
      .or(`target_customer_id.is.null,target_customer_id.eq.${customer.id}`)
      .order('starts_at', { ascending: false })
      .then(({ data }) => setCampanas(data ?? []))
  }, [customer?.id])

  useEffect(() => {
    if (!customer) return
    notificacionesActivas().then(setPushActivo)
  }, [customer?.id])

  async function handleActivarPush() {
    setActivandoPush(true)
    try {
      await activarNotificaciones()
      setPushActivo(true)
    } catch (e) {
      alert(e.message)
    } finally {
      setActivandoPush(false)
    }
  }

  if (!customer) {
    return <div className="min-h-screen bg-ink pt-24 text-center text-sm text-paper/50">Cargando tu perfil del club…</div>
  }

  const estrellas = customer.estrellas_actuales ?? 0

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-6">
      <AlertaCercania />
      <CampanaPopup campanas={campanas} />
      <TarjetaFidelidad customer={customer} estrellas={estrellas} />

      {pushSoportado() && !pushActivo && (
        <button
          onClick={handleActivarPush}
          disabled={activandoPush}
          className="mt-4 px-6 py-2.5 rounded-xl text-sm font-head font-semibold bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
        >
          {activandoPush ? 'Activando…' : 'Activar notificaciones'}
        </button>
      )}
      {pushActivo && (
        <p className="mt-4 text-[11px] text-paper/40">Notificaciones activas</p>
      )}

      {/* Enlace discreto y no botón: nadie entra a la app para cerrar sesión, y
          como botón competía en peso con la acción principal. */}
      <button onClick={signOut} className="mt-2.5 text-xs text-paper/40 underline">
        Cerrar sesión
      </button>
    </div>
  )
}
