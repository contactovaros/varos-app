import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import TarjetaFidelidad from '../components/TarjetaFidelidad.jsx'

const LOCAL_LAT = -18.50020878986493
const LOCAL_LNG = -70.25482300543662
const RADIO_METROS = 200

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function TarjetaVaros({ customer, estrellas, mensaje }) {
  const puedeCanjear = estrellas >= 5

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 py-10">
      <TarjetaFidelidad customer={customer} estrellas={estrellas} mensaje={mensaje} />

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
  const [status, setStatus] = useState('registrando') // registrando | listo | premio | ya_hoy | error | lejos | sin_ubicacion
  const [resultado, setResultado] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!customer) return
    let cancelled = false

    async function registrar() {
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

    function run() {
      if (!navigator.geolocation) {
        setStatus('sin_ubicacion')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          const distancia = distanciaMetros(
            pos.coords.latitude,
            pos.coords.longitude,
            LOCAL_LAT,
            LOCAL_LNG
          )
          if (distancia > RADIO_METROS) {
            setStatus('lejos')
            return
          }
          registrar()
        },
        () => {
          if (!cancelled) setStatus('sin_ubicacion')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
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

  if (status === 'lejos') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-ink">
        <div className="text-4xl mb-3">📍</div>
        <h2 className="font-head text-lg font-semibold mb-2 text-paper">Debes estar en Varo's para registrar tu visita</h2>
        <p className="text-sm text-paper/50 mb-6">Parece que no estás en el local en este momento. Escanea el QR nuevamente cuando estés aquí.</p>
        <button onClick={() => navigate('/club')} className="px-6 py-3 rounded-xl font-head font-semibold text-sm border border-white/10 text-paper">
          Ir al Club Varo's
        </button>
      </div>
    )
  }

  if (status === 'sin_ubicacion') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center bg-ink">
        <div className="text-4xl mb-3">📍</div>
        <h2 className="font-head text-lg font-semibold mb-2 text-paper">Necesitamos tu ubicación</h2>
        <p className="text-sm text-paper/50 mb-6">Activa el permiso de ubicación en tu celular y vuelve a escanear el QR para registrar tu visita.</p>
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
