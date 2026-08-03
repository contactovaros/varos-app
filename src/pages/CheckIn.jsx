import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

function TarjetaVaros({ customer, estrellas, mensaje }) {
  const primerNombre = customer.full_name?.split(' ')[0] ?? ''
  const puedeCanjear = estrellas >= 5

  return (
    <div className="w-full max-w-xs flex flex-col items-center">
      <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1">Varo's</div>
      <h1 className="font-display text-3xl text-paper mb-1">Hola, {primerNombre}</h1>
      <p className="text-wineSoft text-sm mb-5">Tu tarjeta de fidelización</p>

      <div className="w-full rounded-[28px] border border-ember/30 bg-ink p-6 text-center shadow-glow relative">
        <div className="rounded-2xl border border-ember/20 p-5">
          {/* Logo tipo escudo con la inicial */}
          <div className="mx-auto w-14 h-14 rounded-full border-2 border-ember/50 flex items-center justify-center mb-1 overflow-hidden bg-inkSoft">
            {customer.avatar_url ? (
              <img src={customer.avatar_url} alt={primerNombre} className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl text-ember">V</span>
            )}
          </div>
          <div className="text-ember text-[10px] tracking-[0.3em] mb-4">· ⚜ ·</div>

          <div className="flex gap-2 justify-center mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`text-3xl ${i < estrellas ? 'opacity-100 drop-shadow-[0_0_6px_rgba(227,179,65,0.5)]' : 'opacity-15'}`}>⭐</span>
            ))}
          </div>
          <p className="font-head text-paper text-sm mb-4">{estrellas} de 5 visitas</p>

          <div className="border-t border-white/10 pt-4 mb-5">
            <p className="text-paper/70 text-sm leading-relaxed">{mensaje}</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border-2 border-gold/60 inline-block">
            <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={130} />
          </div>
        </div>
      </div>

      {puedeCanjear && (
        <button
          onClick={() => alert('Muéstrale esta pantalla a tu garzón para canjear tu premio 🎁')}
          className="w-full mt-5 py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-wineSoft to-wine flex items-center justify-center gap-2 shadow-glow"
        >
          🎁 Ver mi premio
        </button>
      )}

      <div className="text-center mt-6 text-[10px] text-paper/35">
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center gap-6">
        <TarjetaVaros customer={customer} estrellas={customer.estrellas_actuales ?? 0} mensaje="Ya registramos tu visita de hoy. ¡Vuelve mañana!" />
        <button
          onClick={() => navigate('/club')}
          className="w-full max-w-xs py-4 rounded-2xl font-head font-bold border border-white/10"
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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
      <TarjetaVaros customer={customer} estrellas={estrellas} mensaje={mensaje} />
      <button
        onClick={() => navigate('/club')}
        className="w-full max-w-xs py-3 rounded-2xl font-head font-semibold text-sm border border-white/10"
      >
        Ver mi Club Varo's
      </button>
    </div>
  )
}
