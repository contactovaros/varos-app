import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

function TarjetaVaros({ customer, estrellas, mensaje }) {
  return (
    <div className="w-full max-w-xs rounded-3xl border border-ember/30 bg-gradient-to-b from-[#241612] to-ink p-6 text-center shadow-glow">
      <div className="font-display text-2xl text-ember mb-1">Varo's</div>
      <div className="w-16 h-16 rounded-full mx-auto my-4 overflow-hidden border-2 border-ember/40 bg-inkSoft flex items-center justify-center">
        {customer.avatar_url ? (
          <img src={customer.avatar_url} alt={customer.full_name} className="w-full h-full object-cover" />
        ) : (
          <span className="font-head font-bold text-lg">{customer.full_name?.[0]}</span>
        )}
      </div>
      <p className="text-sm text-paper/70 mb-4">Hola, {customer.full_name?.split(' ')[0]}</p>

      <div className="flex gap-1.5 justify-center mb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-2xl ${i < estrellas ? 'opacity-100' : 'opacity-20'}`}>⭐</span>
        ))}
      </div>
      <p className="text-xs text-paper/40 mb-4">{estrellas} de 5 visitas</p>
      <p className="text-sm text-paper/70 mb-5">{mensaje}</p>

      <div className="bg-white p-3 rounded-xl inline-block">
        <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={110} />
      </div>

      <div className="border-t border-white/10 mt-6 pt-3 text-[10px] text-paper/35 leading-relaxed">
        Varo's · +56 9 9923 5368 · contacto@varos.cl
      </div>
    </div>
  )
}

export default function CheckIn() {
  const { customer, refreshCustomer } = useAuth()
  const [status, setStatus] = useState('registrando') // registrando | listo | premio | ya_hoy | error
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
        if (data?.ya_registrado_hoy) {
          setStatus('ya_hoy')
        } else if (data?.gano_premio) {
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

  if (status === 'ya_hoy') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-6">
        <TarjetaVaros customer={customer} estrellas={customer.estrellas_actuales ?? 0} mensaje="Ya registramos tu visita de hoy. ¡Vuelve mañana!" />
        <button
          onClick={() => navigate('/club')}
          className="w-full max-w-xs py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow"
        >
          Ver mi Club Varo's
        </button>
      </div>
    )
  }

  if (status === 'premio') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-xs rounded-3xl border-2 border-dashed border-ember/60 bg-inkSoft p-6 relative overflow-hidden">
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
  const restantes = 5 - estrellas
  const mensaje = restantes > 0
    ? `Te faltan ${restantes} visita${restantes === 1 ? '' : 's'} para ganar tu premio`
    : '¡Ya puedes canjear tu premio!'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-6">
      <TarjetaVaros customer={customer} estrellas={estrellas} mensaje={mensaje} />
      <button
        onClick={() => navigate('/club')}
        className="w-full max-w-xs py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow"
      >
        Ver mi Club Varo's
      </button>
    </div>
  )
}
