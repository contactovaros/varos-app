import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { postStream } from '../lib/apiAdmin'
import { aFilaResena, dedupePorHuella, partirEnLotes, recortar, formatPromedio } from '../lib/resenas'
import Estrellas from './Estrellas'

// Google no deja exportar reseñas, así que la vía real es copiar y pegar desde
// el Perfil de Empresa.
//
// Cada lote se guarda apenas se procesa — no hay un botón de "Guardar" al
// final que junte todo. Con un pegado grande esto tarda varios minutos en
// varios lotes, y esperar hasta el final para guardar es justo el paso que se
// pierde si alguien actualiza la página o se corta la conexión a mitad de
// camino (pasó en producción). Guardando de a lote, lo que ya se procesó
// queda guardado pase lo que pase con el resto.
//
// Si un lote falla (por ejemplo por un corte de red), se lo salta y se sigue
// con los demás: es mejor guardar 8 lotes de 9 que perder los 9 porque uno
// falló.
export default function ImportadorResenas({ onImportado }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [progreso, setProgreso] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [ejemplos, setEjemplos] = useState([])

  async function importar() {
    const lotes = partirEnLotes(texto)
    if (lotes.length === 0) return

    setResultado(null)
    setEjemplos([])

    let guardadas = 0
    let vistas = 0
    const fallidos = []

    for (let i = 0; i < lotes.length; i++) {
      setProgreso({ actual: i + 1, total: lotes.length, guardadas })

      const inicio = Date.now()
      try {
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
          // El tiempo transcurrido queda en el mensaje a propósito: si esto
          // se corta siempre cerca del mismo número de segundos, es la pista
          // de que hay un límite de duración de la infraestructura por medio
          // (no de tokens ni de red), y ese número ayuda a acotarlo.
          const segundos = Math.round((Date.now() - inicio) / 1000)
          throw new Error(`No se pudo terminar de leer este lote (se cortó a los ${segundos}s).`)
        }
        if (datos.error) throw new Error(datos.error)

        const filas = dedupePorHuella((datos.resenas ?? []).map((r) => aFilaResena(r)).filter(Boolean))
        vistas += filas.length

        if (filas.length > 0) {
          // `.select()` después del upsert devuelve, por cómo funciona
          // ON CONFLICT DO NOTHING en Postgres, SOLO las filas que se
          // insertaron de verdad — las que ya existían por `huella` no
          // vienen en la respuesta. Así se sabe cuántas eran nuevas sin
          // tener que contar la tabla antes y después.
          const { data: insertadas, error: errorInsert } = await supabase
            .from('resenas_google')
            .upsert(filas, { onConflict: 'huella', ignoreDuplicates: true })
            .select('id')

          if (errorInsert) throw new Error(errorInsert.message)

          guardadas += insertadas?.length ?? 0
          setEjemplos((prev) => (prev.length >= 5 ? prev : [...prev, ...filas].slice(0, 5)))
          onImportado?.()
        }
      } catch (e) {
        fallidos.push({ lote: i + 1, mensaje: e.message })
      }

      setProgreso({ actual: i + 1, total: lotes.length, guardadas })
    }

    setProgreso(null)
    setResultado({ guardadas, vistas, fallidos, totalLotes: lotes.length })
    if (fallidos.length === 0) setTexto('')
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
            Reseñas, scrolleá para que carguen todas, seleccioná todo y pegalo
            acá. Podés repetirlo cuando quieras: las que ya están no se duplican.
          </p>
        </div>
        <button
          onClick={() => setAbierto(false)}
          disabled={!!progreso}
          className="text-paper/30 hover:text-paper/60 text-xs shrink-0 transition-colors duration-150 disabled:opacity-20"
        >
          Cerrar
        </button>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={!!progreso}
        rows={6}
        placeholder="Pegá acá las reseñas…"
        className="w-full bg-ink/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-paper placeholder:text-paper/25 outline-none focus:border-ember/40 resize-y disabled:opacity-50 transition-colors duration-150"
      />

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={importar}
          disabled={!texto.trim() || !!progreso}
          className="bg-ember text-ink font-semibold text-xs rounded-xl px-3.5 py-2 disabled:opacity-25 transition-opacity duration-150"
        >
          {progreso
            ? `Lote ${progreso.actual} de ${progreso.total} — ${progreso.guardadas} guardadas`
            : 'Importar'}
        </button>
        {texto.trim() && !progreso && (
          <span className="text-paper/30 text-[11px]">
            {texto.length.toLocaleString('es-CL')} caracteres
          </span>
        )}
      </div>

      {progreso && (
        <p className="text-paper/35 text-[11px] mt-2 leading-relaxed">
          Se está guardando a medida que avanza — podés cerrar esta pantalla en
          cualquier momento sin perder lo que ya se guardó, aunque mejor esperá
          a que termine.
        </p>
      )}

      {resultado && (
        <div className="mt-3">
          <p className="text-paper/60 text-xs leading-relaxed">
            Se guardaron <strong className="text-paper">{resultado.guardadas}</strong> reseñas
            nuevas de {resultado.vistas} reconocidas en {resultado.totalLotes} lote
            {resultado.totalLotes === 1 ? '' : 's'}
            {resultado.vistas > resultado.guardadas &&
              ` (${resultado.vistas - resultado.guardadas} ya estaban)`}
            .
          </p>

          {resultado.fallidos.length > 0 && (
            <div className="mt-2 text-wineSoft text-[11px] leading-relaxed">
              <p>
                {resultado.fallidos.length === 1
                  ? '1 lote no se pudo procesar.'
                  : `${resultado.fallidos.length} lotes no se pudieron procesar.`}{' '}
                Lo ya guardado arriba quedó bien igual — para completar el resto, volvé a pegar el
                mismo texto: lo que ya está no se duplica, solo se procesa de nuevo lo que faltó.
              </p>
              <ul className="mt-1 list-disc list-inside">
                {resultado.fallidos.map((f) => (
                  <li key={f.lote}>
                    Lote {f.lote}: {f.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {ejemplos.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-paper/50 text-[11px]">Algunas de las que se guardaron</span>
            <span className="text-paper/30 text-[11px]">
              promedio de esta tanda {formatPromedio(ejemplos.reduce((a, r) => a + r.rating, 0) / ejemplos.length)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {ejemplos.map((r) => (
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
        </div>
      )}
    </section>
  )
}
