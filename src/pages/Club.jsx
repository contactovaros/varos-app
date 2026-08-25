import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import TarjetaFidelidad from '../components/TarjetaFidelidad.jsx'
import AlertaCercania from '../components/AlertaCercania.jsx'
import CampanaPopup from '../components/CampanaPopup.jsx'
import { estadoNotificaciones, activarNotificaciones } from '../lib/pushNotifications.js'

export default function Club() {
  const { customer, signOut } = useAuth()
  const [campanas, setCampanas] = useState([])
  // 'no-soportado' | 'activa' | 'inactiva' | 'desconocida' | null (aún cargando)
  const [estadoPush, setEstadoPush] = useState(null)
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
    estadoNotificaciones().then(setEstadoPush)
  }, [customer?.id])

  async function handleActivarPush() {
    setActivandoPush(true)
    try {
      await activarNotificaciones()
      setEstadoPush('activa')
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

      {/* Única puerta de entrada a /reservas desde la app: antes solo se llegaba
          escribiendo la URL, y para un socio no-admin esta pantalla es la única
          que existe (BottomNav no se dibuja). Va pegado a la tarjeta y es la
          acción principal porque reservar es lo que el socio viene a hacer;
          activar notificaciones es una configuración de una sola vez y por eso
          quedó en segundo plano, abajo.

          Dorado, el mismo #E3B341 del borde de la tarjeta, y no el naranja de
          acción del resto de la app: esta pantalla la manda la tarjeta, y un
          botón naranja pegado a ella metía un segundo color sin motivo. El halo
          también es dorado por lo mismo — con el `shadow-glow` naranja de los
          otros botones quedaba un aura de otro color alrededor de un botón
          dorado.

          El relleno no es plano: es una rampa corta bronce → dorado → dorado
          claro → dorado → bronce, que es lo que hace que el ojo lea metal y no
          mostaza. Encima cruza un haz de luz cada 5 segundos (`animate-haz`).
          Va con `overflow-hidden` para que el haz se recorte en el borde
          redondeado, y con `motion-reduce:hidden` porque a quien pidió menos
          movimiento en su sistema no le mandamos un destello. */}
      <Link
        to="/reservas"
        className="relative overflow-hidden w-full max-w-xs mt-5 py-3.5 rounded-2xl font-head font-semibold text-center text-ink shadow-[0_0_24px_rgba(227,179,65,0.35)] bg-[linear-gradient(135deg,#C08A2E_0%,#E3B341_38%,#F0D284_50%,#E3B341_62%,#C08A2E_100%)]"
      >
        <span className="relative z-10">Reservar una mesa</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,248,241,0.55),transparent)] animate-haz motion-reduce:hidden"
        />
      </Link>

      {/* Mientras el estado es null todavía se está comprobando: no mostramos nada,
          para no parpadear entre "Activar" y "Notificaciones activas". Ante
          'desconocida' ofrecemos el botón igual (activar es idempotente), pero sin
          afirmar que están apagadas. */}
      {(estadoPush === 'inactiva' || estadoPush === 'desconocida') && (
        <button
          onClick={handleActivarPush}
          disabled={activandoPush}
          className="mt-3 px-6 py-2.5 rounded-xl text-sm font-head font-medium border border-gold/30 text-gold/90 disabled:opacity-50"
        >
          {activandoPush ? 'Activando…' : 'Activar notificaciones'}
        </button>
      )}
      {estadoPush === 'activa' && (
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
