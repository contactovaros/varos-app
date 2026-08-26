import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { postStream } from '../lib/apiAdmin'
import { aFilaResena, dedupePorHuella, partirEnLotes, recortar, formatPromedio, promedioRating } from '../lib/resenas'
import Estrellas from './Estrellas'

// Google no deja exportar reseñas, así que la vía real es copiar y pegar desde
// el Perfil de Empresa. La IA parsea ese pegado sucio; acá se muestra qué
// entendió ANTES de escribir nada en la base, porque un parseo mal hecho que
// se guarda solo ensucia el corpus para todas las consultas que vengan.
export default function ImportadorResenas({ onImportado }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  async function analizar() {
    const lotes = partirEnLotes(texto)
    if (lotes.length === 0) return

    setError(null)
    setResultado(null)
    setPrevia(null)

    const encontradas = []
    try {
      for (let i = 0; i < lotes.length; i++) {
        setProgreso({ actual: i + 1, total: lotes.length })

        // La función responde en streaming (el JSON llega de a pedazos, ver
        // el comentario en importar-resenas.mjs): acá se junta todo antes de
        // parsear, porque un JSON a medio recibir no es válido todavía.
        let acumulado = ''
        await postStream('importar-resenas', { texto: lotes[i] }, (pedazo) => {
          acumulado += pedazo
        })

        let datos
        try {
          datos = JSON.parse(acumulado)
        } catch {
          throw new Error(
            `No se pudo terminar de leer el lote ${i + 1} de ${lotes.length}. Probá pegando menos reseñas por vez.`
          )
        }
        if (datos.error) throw new Error(datos.error)
        encontradas.push(...(datos.resenas ?? []))
      }
    } catch (e) {
      setError(e.message)
      setProgreso(null)
      // Lo que se alcanzó a leer antes del error se muestra igual: sirve para
      // guardar esa parte y reintentar con el resto.
      if (encontradas.length === 0) return
    }

    setProgreso(null)
    const filas = dedupePorHuella(encontradas.map((r) => aFilaResena(r)).filter(Boolean))
    setPrevia(filas)
  }

  async function guardar() {
    if (!previa?.length) return
    setGuardando(true)
    setError(null)

    try {
      const { count: antes } = await supabase
        .from('resenas_google')
        .select('id', { count: 'exact', head: true })

      const { error: errorInsert } = await supabase
        .from('resenas_google')
        .upsert(previa, { onConflict: 'huella', ignoreDuplicates: true })

      if (errorInsert) throw new Error(errorInsert.message)

      const { count: despues } = await supabase
        .from('resenas_google')
        .select('id', { count: 'exact', head: true })

      const nuevas = (despues ?? 0) - (antes ?? 0)
      setResultado({ nuevas, repetidas: previa.length - nuevas, total: despues ?? 0 })
      setPrevia(null)
      setTexto('')
      onImportado?.()
    } catch (e) {
      setError(`No se pudieron guardar: ${e.message}`)
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full text-left bg-inkSoft/60 border border-white/5 rounded-2xl px-4 py-3 text-sm text-paper/60 hover:text-paper hover:border-white/10 transition-colors duration-150"
      >
        Importar reseñas desde Google
        <span className="block text-[11px] text-paper/30 mt-0.5">
          Pegá lo que copiaste de tu Perfil de Empresa
        </span>
      </button>
    )
  }

  return (
    <section className="bg-inkSoft/60 border border-white/5 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-head font-semibold text-sm">Importar reseñas</h3>
          <p className="text-paper/35 text-[11px] leading-relaxed mt-1 max-w-sm">
            Entrá a business.google.com con la cuenta del local, abrí la sección
            Reseñas, seleccioná todo lo que veas en pantalla y pegalo acá. Podés
            repetirlo cuando quieras: las que ya están no se duplican.
          </p>
        </div>
        <button
          onClick={() => setAbierto(false)}
          className="text-paper/30 hover:text-paper/60 text-xs shrink-0 transition-colors duration-150"
        >
          Cerrar
        </button>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        placeholder="Pegá acá las reseñas…"
        className="w-full bg-ink/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-paper placeholder:text-paper/25 outline-none focus:border-ember/40 resize-y transition-colors duration-150"
      />

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={analizar}
          disabled={!texto.trim() || !!progreso}
          className="bg-ember text-ink font-semibold text-xs rounded-xl px-3.5 py-2 disabled:opacity-25 transition-opacity duration-150"
        >
          {progreso ? `Leyendo ${progreso.actual} de ${progreso.total}…` : 'Leer lo pegado'}
        </button>
        {texto.trim() && !progreso && (
          <span className="text-paper/30 text-[11px]">
            {texto.length.toLocaleString('es-CL')} caracteres
          </span>
        )}
      </div>

      {error && <p className="text-wineSoft text-[11px] leading-relaxed mt-3">{error}</p>}

      {resultado && (
        <p className="text-paper/60 text-xs mt-3 leading-relaxed">
          Se guardaron <strong className="text-paper">{resultado.nuevas}</strong> reseñas nuevas
          {resultado.repetidas > 0 && ` (${resultado.repetidas} ya estaban)`}. El corpus quedó
          en {resultado.total}.
        </p>
      )}

      {previa && (
        <div className="mt-4 border-t border-white/5 pt-3">
          {previa.length === 0 ? (
            <p className="text-paper/40 text-[11px]">
              No se reconoció ninguna reseña en ese texto. Fijate de haber copiado el bloque
              de reseñas y no otra parte de la página.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-paper text-xs font-semibold">
                  {previa.length} reseñas reconocidas
                </span>
                <span className="text-paper/40 text-[11px]">
                  promedio {formatPromedio(promedioRating(previa))}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto flex flex-col gap-2 mb-3">
                {previa.map((r) => (
                  <div key={r.huella} className="text-[11px] border-b border-white/5 pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-paper/80">{r.autor}</span>
                      <Estrellas valor={r.rating} className="text-[10px]" />
                    </div>
                    <div className="text-paper/30">{r.fecha_texto || 'sin fecha'}</div>
                    {r.texto && <p className="text-paper/50 mt-0.5">{recortar(r.texto, 120)}</p>}
                  </div>
                ))}
              </div>

              <button
                onClick={guardar}
                disabled={guardando}
                className="bg-ember text-ink font-semibold text-xs rounded-xl px-3.5 py-2 disabled:opacity-40 transition-opacity duration-150"
              >
                {guardando ? 'Guardando…' : `Guardar estas ${previa.length}`}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
