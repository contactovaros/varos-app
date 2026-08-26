import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import { fetchPlaceReviews } from '../lib/googleReviews.js'
import { formatPromedio, mesAnio } from '../lib/resenas'
import ConsultorResenas from '../components/ConsultorResenas.jsx'
import ImportadorResenas from '../components/ImportadorResenas.jsx'
import Estrellas from '../components/Estrellas.jsx'

// Esta pantalla tiene dos fuentes distintas y conviene no confundirlas:
//
//   - El corpus propio (`resenas_google`): lo que el dueño pegó desde su
//     Perfil de Empresa. Puede ser todo su historial. Es sobre esto que
//     responde el consultor.
//   - La ficha de Google (Places API): el rating oficial y las 5 reseñas que
//     Google elige mostrar. Es el dato de referencia — la nota que ve un
//     cliente cuando busca el local — pero cinco reseñas no alcanzan para
//     analizar nada, así que va abajo y en voz baja.
export default function AdminResenas() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [corpus, setCorpus] = useState({ total: 0, promedio: null, desde: null, cargado: false })
  const [ficha, setFicha] = useState(null)
  const [errorFicha, setErrorFicha] = useState(null)
  const [errorCorpus, setErrorCorpus] = useState(null)

  const cargarCorpus = useCallback(async () => {
    const { data, error } = await supabase
      .from('resenas_google')
      .select('rating, fecha_aprox')

    if (error) {
      setErrorCorpus(error.message)
      setCorpus((c) => ({ ...c, cargado: true }))
      return
    }

    const filas = data ?? []
    const fechas = filas.map((r) => r.fecha_aprox).filter(Boolean).sort()
    setCorpus({
      total: filas.length,
      promedio: filas.length ? filas.reduce((a, r) => a + r.rating, 0) / filas.length : null,
      desde: fechas[0] ?? null,
      cargado: true
    })
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    cargarCorpus()
  }, [isAdmin, cargarCorpus])

  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false

    fetchPlaceReviews(import.meta.env.VITE_GOOGLE_PLACE_ID)
      .then((d) => !cancelado && setFicha(d))
      .catch((e) => !cancelado && setErrorFicha(e.message))

    return () => {
      cancelado = true
    }
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
    <div className="px-4 pt-8 pb-10 flex flex-col gap-4">
      <header>
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-head text-2xl font-semibold">Consultor de reseñas</h1>
        <p className="text-paper/40 text-xs mt-1 leading-relaxed">
          {!corpus.cargado
            ? 'Cargando el corpus…'
            : corpus.total === 0
              ? 'Sin reseñas guardadas todavía.'
              : `${corpus.total} reseñas guardadas · promedio ${formatPromedio(corpus.promedio)}${
                  corpus.desde ? ` · desde ${mesAnio(corpus.desde)}` : ''
                }`}
        </p>
        {errorCorpus && (
          <p className="text-wineSoft text-[11px] mt-1 leading-relaxed">
            No se pudo leer el corpus: {errorCorpus}. Si dice algo de "row-level security",
            falta correr la migración add_resenas_google.sql en Supabase.
          </p>
        )}
      </header>

      <ConsultorResenas totalResenas={corpus.total} />

      <ImportadorResenas onImportado={cargarCorpus} />

      <section className="border-t border-white/5 pt-4">
        <h2 className="font-head text-xs font-semibold text-paper/50 mb-2">
          Tu ficha en Google, ahora
        </h2>

        {errorFicha && (
          <p className="text-paper/35 text-[11px] leading-relaxed">
            {errorFicha.includes('VITE_GOOGLE_PLACES_API_KEY')
              ? 'Falta configurar la API key de Google Places en el .env.'
              : errorFicha.includes('Place ID')
                ? 'Falta el Place ID del local (variable VITE_GOOGLE_PLACE_ID en el .env).'
                : errorFicha}
          </p>
        )}

        {ficha && (
          <>
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-ember leading-none">
                {ficha.rating?.toFixed(1) ?? '—'}
              </span>
              <div>
                <Estrellas valor={ficha.rating} className="text-xs" />
                <div className="text-paper/35 text-[10px]">
                  {ficha.userRatingCount ?? 0} reseñas en Google
                  {ficha.googleMapsUri && (
                    <>
                      {' · '}
                      <a
                        href={ficha.googleMapsUri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ember underline"
                      >
                        ver en Maps
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {(ficha.reviews ?? []).length > 0 && (
              <details className="mt-2">
                <summary className="text-paper/40 text-[11px] cursor-pointer">
                  Las {ficha.reviews.length} que Google destaca
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {ficha.reviews.map((r, i) => (
                    <div key={r.name ?? i} className="text-[11px] border-t border-white/5 pt-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-paper/70">
                          {r.authorAttribution?.displayName ?? 'Anónimo'}
                        </span>
                        <Estrellas valor={r.rating} className="text-[10px]" />
                      </div>
                      <div className="text-paper/30">{r.relativePublishTimeDescription}</div>
                      {r.text?.text && <p className="text-paper/50 mt-0.5">{r.text.text}</p>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  )
}
