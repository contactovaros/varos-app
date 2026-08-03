import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

function Ornamento() {
  return (
    <div className="flex items-center gap-2 justify-center my-2">
      <span className="h-px w-10 bg-gold/50" />
      <span className="text-gold text-[10px]">✦</span>
      <span className="h-px w-10 bg-gold/50" />
    </div>
  )
}

function TarjetaVaros({ customer, estrellas, mensaje }) {
  const primerNombre = customer.full_name?.split(' ')[0] ?? ''
  const puedeCanjear = estrellas >= 5

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-10">
      <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1">Varo's</div>
      <h1 className="font-head text-3xl text-paper font-semibold mb-1">Hola, {primerNombre}</h1>
      <p className="text-wineSoft font-medium mb-1">Tu tarjeta de fidelización</p>
      <Ornamento />

      {/* Tarjeta oscura */}
      <div className="w-full max-w-xs rounded-[26px] border-2 border-gold/70 bg-inkSoft p-1.5 mt-4 shadow-glow">
        <div className="rounded-[20px] border border-gold/30 p-6 text-center">
          <div className="font-display text-2xl text-gold leading-tight">Varo's</div>
          <p className="text-gold/70 text-[10px] tracking-wide mt-1">+56 9 9923 5368 · contacto@varos.cl</p>
          <Ornamento />

          <div className="flex gap-1.5 justify-center mb-3 mt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`text-3xl ${i < estrellas ? 'text-gold' : 'text-gold/20'}`}>
                {i < estrellas ? '★' : '☆'}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 justify-center mb-4">
            <span className="h-px w-8 bg-gold/40" />
            <p className="text-paper text-sm">{estrellas} de 5 visitas</p>
            <span className="h-px w-8 bg-gold/40" />
          </div>

          <div className="border-t border-gold/20 pt-4 mb-5">
            <p className="text-paper/85 text-[15px] leading-relaxed">{mensaje}</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border-2 border-gold/60 inline-block">
            <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={130} />
          </div>
        </div>
      </div>

      {puedeCanjear && (
        <button
          onClick={() => alert('Muéstrale esta pantalla a tu garzón para canjear tu premio 🎁')}
          className="w-full max-w-xs mt-5 py-4 rounded-2xl font-head font-bold bg-bronze text-paper flex items-center justify-center gap-2 shadow-lg"
        >
          🎁 Ver mi premio
        </button>
      )}
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
      <div className="min-h-screen flex items-center justify-center text-sm text-paper/50 px-8 text-center bg-ink">
        Registrando tu visita…
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-ink">
        <div className="text-4xl mb-3">😕</div>
        <h2 className="font-head text-lg font-semibold mb-2 text-paper">No pudimos registrar tu visita</h2>
        <p className="text-sm text-paper/50 mb-6">Muéstrale esta pantalla a tu garzón para que te ayude.</p>
        <button onClick={() => navigate('/club')} className="px-6 py-3 rounded-xl font-head font-semibold text-sm border border-white/10 text-paper">
          Ir al Club Varo's
        </button>
      </div>
    )
  }

  if (status === 'ya_hoy') {
    return <TarjetaVaros customer={customer} estrellas={customer.estrellas_actuales ?? 0} mensaje="Ya registramos tu visita de hoy. ¡Vuelve mañana!" />
  }

  if (status === 'premio') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-ink">
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
          className="w-full max-w-xs mt-6 py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow text-paper"
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

  return <TarjetaVaros customer={customer} estrellas={estrellas} mensaje={mensaje} />
}
