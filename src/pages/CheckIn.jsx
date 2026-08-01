import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

export default function CheckIn() {
  const { customer, refreshCustomer } = useAuth()
  const [status, setStatus] = useState('registrando') // registrando | listo | premio | error
  const [resultado, setResultado] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!customer) return
    let cancelled = false

    async function run() {
      const { data, error } = await supabase.rpc('register_visit', { p_customer_id: customer.id })
      if (cancelled) return
      if (error) {
        setStatus('error')
      } else {
        await refreshCustomer()
        setResultado(data)
        if (data?.gano_premio) {
          setStatus('premio')
          confetti({ particleCount: 160, spread: 100, colors: ['#FF7A1A', '#7A1620', '#E3B341'] })
        } else {
          setStatus('listo')
          confetti({ particleCount: 70, spread: 65, colors: ['#FF7A1A', '#7A1620', '#E3B341'] })
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [customer?.id])

  if (!customer || status === 'registrando') {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-paper/50 px-8 text-center">
        Registrando tu visita…
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-4xl mb-3">😕</div>
        <h2 className="font-head text-lg font-semibold mb-2">No pudimos registrar tu visita</h2>
        <p className="text-sm text-paper/50 mb-6">Muéstrale esta pantalla a tu garzón para que te ayude.</p>
        <button onClick={() => navigate('/club')} className="px-6 py-3 rounded-xl font-head font-semibold text-sm border border-white/10">
          Ir al Club Varo's
        </button>
      </div>
    )
  }

  if (status === 'premio') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-full max-w-xs rounded-3xl border-2 border-dashed border-ember/60 bg-inkSoft p-6 relative overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle at 0 50%, transparent 12px, #221A16 13px), radial-gradient(circle at 100% 50%, transparent 12px, #221A16 13px)'
          }}
        >
          <p className="uppercase tracking-widest text-xs text-ember font-head mb-1">Ticket ganador 🎟️</p>
          <div className="text-5xl mb-3">🏆</div>
          <h2 className="font-display text-3xl text-paper mb-2">¡Completaste tus 5 estrellas!</h2>
          <p className="text-sm text-paper/60 mb-4">Ganaste:</p>
          <p className="font-head text-xl font-bold text-ember mb-4">{resultado?.producto}</p>
          <div className="border-t border-white/10 pt-3 text-xs text-paper/40">
            Muéstrale esta pantalla a tu garzón para canjearlo
          </div>
        </div>
        <button
          onClick={() => navigate('/club')}
          className="w-full max-w-xs mt-6 py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow"
        >
          Ver mi Club Varo's
        </button>
      </div>
    )
  }

  const estrellas = resultado?.estrellas ?? 0
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="font-head text-2xl font-semibold mb-2">¡Bienvenido de vuelta!</h2>
      <p className="text-sm text-paper/60 mb-1">
        Esta es tu visita <b className="text-ember">N° {customer.visit_count}</b> a Varo's.
      </p>
      <p className="text-sm text-paper/60 mb-5">Ganaste <b className="text-ember">1 estrella ⭐</b> por registrarte hoy.</p>

      <div className="flex gap-2 mb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-3xl ${i < estrellas ? 'opacity-100' : 'opacity-20'}`}>⭐</span>
        ))}
      </div>
      <p className="text-xs text-paper/40 mb-8">
        {5 - estrellas > 0
          ? `Te faltan ${5 - estrellas} visita${5 - estrellas === 1 ? '' : 's'} para ganar un premio`
          : '¡Ya puedes canjear tu premio!'}
      </p>

      <button
        onClick={() => navigate('/club')}
        className="w-full max-w-xs py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow"
      >
        Ver mi Club Varo's
      </button>
    </div>
  )
}