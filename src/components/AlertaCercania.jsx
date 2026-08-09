import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

function horaEnRango(hora_inicio, hora_fin) {
  if (!hora_inicio && !hora_fin) return true
  const ahora = new Date()
  const actual = ahora.getHours() * 60 + ahora.getMinutes()
  const [hi, mi] = (hora_inicio ?? '00:00').split(':').map(Number)
  const [hf, mf] = (hora_fin ?? '23:59').split(':').map(Number)
  return actual >= hi * 60 + mi && actual <= hf * 60 + mf
}

function diaPermitido(dias_semana) {
  if (!dias_semana || dias_semana.length === 0) return true
  return dias_semana.includes(new Date().getDay())
}

function yaMostradaHoy(id) {
  const hoy = new Date().toISOString().slice(0, 10)
  return localStorage.getItem(`varos_alerta_${id}`) === hoy
}

function marcarMostrada(id) {
  const hoy = new Date().toISOString().slice(0, 10)
  localStorage.setItem(`varos_alerta_${id}`, hoy)
}

// Muestra un aviso DENTRO de la app cuando el cliente (con la app abierta)
// está cerca de una de las coordenadas configuradas en el panel admin.
// No es una notificación push del celular: eso requeriría una app nativa.
export default function AlertaCercania() {
  const [alerta, setAlerta] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    let cancelado = false
    let alertas = []

    supabase
      .from('location_alerts')
      .select('*')
      .eq('activo', true)
      .then(({ data }) => {
        alertas = data ?? []
      })

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelado || alerta) return
        const candidata = alertas.find((a) => {
          if (yaMostradaHoy(a.id)) return false
          if (!diaPermitido(a.dias_semana)) return false
          if (!horaEnRango(a.hora_inicio, a.hora_fin)) return false
          const distancia = distanciaMetros(pos.coords.latitude, pos.coords.longitude, a.lat, a.lng)
          return distancia <= a.radio_metros
        })
        if (candidata) {
          marcarMostrada(candidata.id)
          setAlerta(candidata)
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
    )

    return () => {
      cancelado = true
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  if (!alerta) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4">
      <div className="w-full max-w-xs bg-inkSoft border border-gold/50 rounded-2xl shadow-[0_0_30px_rgba(227,179,65,0.25)] p-4">
        <div className="flex justify-between items-start gap-2">
          <p className="font-head font-semibold text-sm text-gold">{alerta.titulo}</p>
          <button onClick={() => setAlerta(null)} className="text-paper/40 text-xs leading-none px-1">✕</button>
        </div>
        <p className="text-paper/80 text-xs mt-1.5">{alerta.mensaje}</p>
      </div>
    </div>
  )
}
