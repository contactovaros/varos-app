import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import TarjetaFidelidad from '../components/TarjetaFidelidad.jsx'
import AlertaCercania from '../components/AlertaCercania.jsx'

export default function Club() {
  const { customer, signOut } = useAuth()
  const [campanas, setCampanas] = useState([])

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

  if (!customer) {
    return <div className="min-h-screen bg-ink pt-24 text-center text-sm text-paper/50">Cargando tu perfil del club…</div>
  }

  const estrellas = customer.estrellas_actuales ?? 0

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-10">
      <AlertaCercania />
      <TarjetaFidelidad customer={customer} estrellas={estrellas} />

      {campanas.length > 0 && (
        <div className="w-full max-w-xs mt-5 flex flex-col gap-2">
          {campanas.map((c) => (
            <div key={c.id} className="bg-inkSoft border border-ember/30 rounded-xl p-3">
              <p className="font-head font-semibold text-xs text-ember">📣 {c.title}</p>
              <p className="text-paper/70 text-xs mt-1">{c.message}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={signOut}
        className="mt-8 px-6 py-3 rounded-xl text-sm font-head font-semibold border border-white/10 text-paper/60"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
