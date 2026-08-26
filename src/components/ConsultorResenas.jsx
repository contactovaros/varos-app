import { useEffect, useRef, useState } from 'react'
import { postStream } from '../lib/apiAdmin'

// Las preguntas que el dueño se hace de verdad, en el orden en que suelen
// importar: primero lo que duele, después lo que funciona, después el detalle.
// Son atajos, no un menú: cualquier cosa se puede escribir a mano.
const SUGERIDAS = [
  '¿Qué es lo que más reclaman?',
  '¿Qué es lo que más les gusta?',
  '¿Cómo venimos con el servicio?',
  '¿Qué dicen de los eventos y matrimonios?',
  '¿Cambió algo en los últimos meses?'
]

// Render mínimo del markdown que devuelve el consultor: párrafos, viñetas y
// negritas. No entra una librería nueva al proyecto por tres reglas.
function Formateado({ texto }) {
  const lineas = String(texto).split('\n')

  return (
    <>
      {lineas.map((linea, i) => {
        const limpia = linea.trim()
        if (!limpia) return <div key={i} className="h-2" />

        const esVineta = /^[-*•]\s+/.test(limpia)
        const contenido = esVineta ? limpia.replace(/^[-*•]\s+/, '') : limpia

        const partes = contenido.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
          parte.startsWith('**') && parte.endsWith('**') ? (
            <strong key={j} className="text-paper font-semibold">
              {parte.slice(2, -2)}
            </strong>
          ) : (
            <span key={j}>{parte}</span>
          )
        )

        if (esVineta) {
          return (
            <div key={i} className="flex gap-2 mb-1.5">
              <span className="text-ember shrink-0 leading-relaxed">–</span>
              <p className="leading-relaxed">{partes}</p>
            </div>
          )
        }
        return (
          <p key={i} className="leading-relaxed mb-1.5">
            {partes}
          </p>
        )
      })}
    </>
  )
}

export default function ConsultorResenas({ totalResenas }) {
  const [turnos, setTurnos] = useState([])
  const [pregunta, setPregunta] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState(null)
  const finRef = useRef(null)
  const inputRef = useRef(null)

  const vacio = totalResenas === 0

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnos, pensando])

  async function preguntar(texto) {
    const limpia = texto.trim()
    if (!limpia || pensando || vacio) return

    setError(null)
    setPregunta('')

    // El historial que viaja es el de ANTES de esta pregunta: la pregunta va
    // aparte en el body, y mandarla dos veces le haría creer al modelo que se
    // la repitieron.
    const historial = turnos.map((t) => ({ role: t.role, content: t.texto }))

    setTurnos((prev) => [...prev, { role: 'user', texto: limpia }, { role: 'assistant', texto: '' }])
    setPensando(true)

    try {
      await postStream('consultor-resenas', { pregunta: limpia, historial }, (pedazo) => {
        setTurnos((prev) => {
          const copia = [...prev]
          const ultimo = copia[copia.length - 1]
          copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + pedazo }
          return copia
        })
      })
    } catch (e) {
      setError(e.message)
      // Se saca la burbuja vacía: dejarla como respuesta en blanco parece que
      // el consultor no tuvo nada que decir, y no es eso lo que pasó.
      setTurnos((prev) => prev.slice(0, -1))
    } finally {
      setPensando(false)
      inputRef.current?.focus()
    }
  }

  return (
    <section className="bg-inkSoft border border-white/5 rounded-2xl overflow-hidden">
      <div className="max-h-[60vh] overflow-y-auto px-4 pt-4">
        {turnos.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-paper/50 text-sm leading-relaxed max-w-xs mx-auto">
              {vacio
                ? 'Todavía no hay reseñas guardadas. Importalas acá abajo y volvé: sin reseñas no hay nada que analizar.'
                : `Preguntá lo que quieras sobre tus ${totalResenas} reseñas.`}
            </p>
          </div>
        )}

        {turnos.map((turno, i) =>
          turno.role === 'user' ? (
            <div key={i} className="flex justify-end mb-3">
              <div className="bg-ember/15 border border-ember/20 text-paper rounded-2xl rounded-br-sm px-3.5 py-2 text-sm max-w-[85%]">
                {turno.texto}
              </div>
            </div>
          ) : (
            <div key={i} className="mb-4 text-sm text-paper/75 max-w-[95%]">
              <Formateado texto={turno.texto} />
              {pensando && i === turnos.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-ember/70 align-middle ml-0.5 animate-pulse" />
              )}
            </div>
          )
        )}

        {pensando && turnos[turnos.length - 1]?.texto === '' && (
          <p className="text-paper/35 text-xs mb-4">
            Leyendo las {totalResenas} reseñas…
          </p>
        )}

        {error && <p className="text-wineSoft text-xs mb-4 leading-relaxed">{error}</p>}

        <div ref={finRef} />
      </div>

      {!vacio && turnos.length === 0 && (
        <div className="px-4 pb-1 flex flex-wrap gap-1.5">
          {SUGERIDAS.map((s) => (
            <button
              key={s}
              onClick={() => preguntar(s)}
              className="text-[11px] text-paper/60 border border-white/10 hover:border-ember/40 hover:text-paper rounded-full px-2.5 py-1 transition-colors duration-150"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          preguntar(pregunta)
        }}
        className="flex items-center gap-2 p-3 border-t border-white/5 mt-2"
      >
        <input
          ref={inputRef}
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          disabled={vacio || pensando}
          placeholder={vacio ? 'Importá reseñas para empezar' : 'Preguntá algo…'}
          className="flex-1 bg-ink/60 border border-white/5 rounded-xl px-3 py-2 text-sm text-paper placeholder:text-paper/25 outline-none focus:border-ember/40 disabled:opacity-40 transition-colors duration-150"
        />
        <button
          type="submit"
          disabled={vacio || pensando || !pregunta.trim()}
          className="bg-ember text-ink font-semibold text-sm rounded-xl px-4 py-2 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity duration-150"
        >
          {pensando ? '…' : 'Preguntar'}
        </button>
      </form>
    </section>
  )
}
