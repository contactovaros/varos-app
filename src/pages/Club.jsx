import { useAuth } from '../context/AuthContext.jsx'
import TarjetaFidelidad from '../components/TarjetaFidelidad.jsx'

export default function Club() {
  const { customer, signOut } = useAuth()

  if (!customer) {
    return <div className="min-h-screen bg-ink pt-24 text-center text-sm text-paper/50">Cargando tu perfil del club…</div>
  }

  const estrellas = customer.estrellas_actuales ?? 0

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-10">
      <TarjetaFidelidad customer={customer} estrellas={estrellas} />

      <button
        onClick={signOut}
        className="mt-8 px-6 py-3 rounded-xl text-sm font-head font-semibold border border-white/10 text-paper/60"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
