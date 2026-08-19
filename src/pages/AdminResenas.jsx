import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchPlaceReviews } from '../lib/googleReviews.js'

function Estrellas({ valor }) {
  const llenas = Math.round(valor || 0)
  return (
    <span className="text-gold text-sm tracking-wide" aria-label={`${valor ?? 0} de 5 estrellas`}>
      {'★'.repeat(llenas)}
      {'☆'.repeat(Math.max(0, 5 - llenas))}
    </span>
  )
}

export default function AdminResenas() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false

    async function cargar() {
      setCargando(true)
      try {
        const placeId = import.meta.env.VITE_GOOGLE_PLACE_ID
        const d = await fetchPlaceReviews(placeId)
        if (!cancelado) setDatos(d)
      } catch (e) {
        if (!cancelado) setError(e.message)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [isAdmin])

  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div className="px-6 pt-24 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h2 className="font-head text-lg font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm text-paper/50">Esta sección es solo para administradores de Varo's.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8 pb-10">
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-head text-2xl font-semibold">Reseñas de Google</h1>
      </div>

      {cargando && <p className="text-paper/40 text-xs mb-4">Cargando reseñas…</p>}

      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
        <h3 className="font-head font-semibold text-sm mb-2">Varo's Restaurant & Eventos</h3>

        {error && (
          <p className="text-wineSoft text-[11px] leading-relaxed">
            {error.includes('VITE_GOOGLE_PLACES_API_KEY')
              ? 'Falta configurar la API key de Google Places en el .env.'
              : error.includes('Place ID')
                ? 'Falta el Place ID del local (variable VITE_GOOGLE_PLACE_ID en el .env).'
                : error}
          </p>
        )}

        {datos && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="font-display text-3xl text-ember">{datos.rating?.toFixed(1) ?? '—'}</span>
              <div>
                <Estrellas valor={datos.rating} />
                <div className="text-paper/40 text-[10px]">{datos.userRatingCount ?? 0} reseñas en Google</div>
              </div>
            </div>

            {datos.googleMapsUri && (
              <a
                href={datos.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="text-ember text-[11px] underline"
              >
                Ver en Google Maps →
              </a>
            )}

            <div className="mt-3 flex flex-col gap-3">
              {(datos.reviews ?? []).map((r, i) => (
                <div key={r.name ?? i} className="border-t border-white/5 pt-2 text-xs">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-paper font-semibold">{r.authorAttribution?.displayName ?? 'Anónimo'}</span>
                    <Estrellas valor={r.rating} />
                  </div>
                  <div className="text-paper/40 text-[10px] mb-1">{r.relativePublishTimeDescription}</div>
                  {r.text?.text && <p className="text-paper/60">{r.text.text}</p>}
                </div>
              ))}
              {(datos.reviews ?? []).length === 0 && (
                <p className="text-paper/35 text-[11px]">Google no está devolviendo reseñas de texto para este local por ahora.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
