import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { detectarPerfil, armarRecomendacion, perfilDePlato, PERFIL_GENERICO } from '../data/maridaje.js'

// Sommelier — consultor de bebidas de cara al cliente (y de paso, del
// garzón). Pública igual que /carta2: no exige cuenta, se abre por link
// desde el BottomNav. Motor de reglas determinístico (ver
// src/data/maridaje.js) — nada de IA generativa, y nada de vinos que no
// existan hoy en la carta real: mismo patrón de fetch que Carta2.jsx
// (menu_items, visible_carta=true, available=true), solo que acá filtramos
// a las categorías de bebida en vez de comida.
//
// Categorías de bebida reales confirmadas contra la base (2026-09-17):
// VINOS & ESPUMANTES (foco principal), NUESTRO BAR (destilados, cerveza,
// café, té, cócteles — "el sommelier también domina esto") y MOCKTAILS (SIN
// ALCOHOL). No hay una categoría separada de "cervezas" o "cafés": todo eso
// vive adentro de NUESTRO BAR.

const CATEGORIA_VINOS = 'VINOS & ESPUMANTES'
const CATEGORIAS_BAR = ['NUESTRO BAR', 'MOCKTAILS (SIN ALCOHOL)']

// Categorías de comida reales cuyos platos alimentan los chips rápidos —
// pedido explícito del dueño (2026-09-17): "todas las preparaciones reales",
// no una lista fija de 10. NIÑOS y GUARNICIONES quedan afuera a propósito
// (ver CATEGORIAS_SIN_MARIDAJE en maridaje.js).
const CATEGORIAS_COMIDA = ['ENTRADAS FRIAS Y CALIENTES', 'PLATOS PRINCIPALES', 'POSTRES & TENTACIONES']
// Encabezados cortos para las secciones de chips (los nombres reales de
// categoría son largos y en mayúscula sostenida).
const TITULO_CATEGORIA = {
  'ENTRADAS FRIAS Y CALIENTES': 'Entradas',
  'PLATOS PRINCIPALES': 'Platos principales',
  'POSTRES & TENTACIONES': 'Postres',
}

// Sin precio cargado no se muestra nada: antes salía "$0".
function formatCLP(valor) {
  if (valor == null || valor === '') return ''
  return `$${Number(valor).toLocaleString('es-CL')}`
}

export default function Sommelier() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')

  // Una sola consulta activa a la vez: o texto libre, o un plato real
  // tocado en los chips. `null` = todavía no se preguntó nada.
  const [consulta, setConsulta] = useState(null) // { modo: 'texto', texto } | { modo: 'plato', item }

  // Con las ~50 preparaciones reales, mostrar las tres categorías abiertas de
  // entrada tapaba la pantalla entera (pedido del dueño, 2026-09-17: "que sea
  // desplegable"). Arrancan cerradas; cada categoría se abre por separado.
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(() => new Set())

  function toggleCategoria(categoria) {
    setCategoriasAbiertas((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(categoria)) siguiente.delete(categoria)
      else siguiente.add(categoria)
      return siguiente
    })
  }

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    supabase
      .from('menu_items')
      .select('*')
      .eq('visible_carta', true)
      .eq('available', true)
      .in('category', [CATEGORIA_VINOS, ...CATEGORIAS_BAR, ...CATEGORIAS_COMIDA])
      // Orden fijo: sin esto la base devolvía las filas en cualquier orden y,
      // entre dos vinos igual de buenos, la recomendación cambiaba sola.
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelado) return
        if (err) {
          setError(err.message)
          setItems([])
        } else {
          setItems(data ?? [])
        }
        setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const vinos = useMemo(() => items.filter((i) => i.category === CATEGORIA_VINOS), [items])
  const bebidasBar = useMemo(() => items.filter((i) => CATEGORIAS_BAR.includes(i.category)), [items])

  // Chips agrupados por categoría real — cada plato usa su perfil mapeado
  // directo (perfilDePlato), no el detector de texto libre: acá el nombre es
  // exacto, no hay nada que adivinar.
  const gruposChips = useMemo(() => {
    return CATEGORIAS_COMIDA.map((categoria) => ({
      categoria,
      titulo: TITULO_CATEGORIA[categoria] || categoria,
      platos: items
        .filter((i) => i.category === categoria)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')),
    })).filter((g) => g.platos.length > 0)
  }, [items])

  const perfilDetectado = useMemo(() => {
    if (!consulta) return null
    if (consulta.modo === 'plato') return perfilDePlato(consulta.item)
    return detectarPerfil(consulta.texto)
  }, [consulta])
  const perfilUsado = consulta ? perfilDetectado || PERFIL_GENERICO : null
  const tituloConsulta = consulta ? (consulta.modo === 'plato' ? consulta.item.name : consulta.texto) : ''
  const recomendacion = useMemo(() => {
    if (!perfilUsado) return null
    return armarRecomendacion(perfilUsado, vinos, bebidasBar)
  }, [perfilUsado, vinos, bebidasBar])

  // En el celular la recomendación quedaba debajo de las categorías abiertas,
  // fuera de la pantalla: al tocar un plato parecía que no pasaba nada. Ahora
  // se cierran las categorías y la pantalla baja sola hasta el resultado, que
  // además recibe el foco para que el lector de pantalla lo lea.
  const resultadoRef = useRef(null)
  const [irAlResultado, setIrAlResultado] = useState(0)

  useEffect(() => {
    if (!irAlResultado || !resultadoRef.current) return
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    resultadoRef.current.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' })
    resultadoRef.current.focus({ preventScroll: true })
  }, [irAlResultado])

  function consultarPlato(item) {
    setConsulta({ modo: 'plato', item })
    setCategoriasAbiertas(new Set())
    setIrAlResultado((n) => n + 1)
  }

  function onSubmit(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setConsulta({ modo: 'texto', texto })
    setCategoriasAbiertas(new Set())
    setIrAlResultado((n) => n + 1)
  }

  return (
    <div className="min-h-screen bg-ink px-5 pt-10 pb-20">
      {/* Solo si se llegó desde la pestaña de /carta2 (el Sommelier también se
          abre desde el nav del personal, ahí no tiene sentido "volver"). */}
      {typeof document !== 'undefined' && /\/carta2\/?$/.test(document.referrer) && (
        <a href="/carta2" className="inline-block text-paper/55 hover:text-gold text-xs mb-5 transition-colors">
          ← Volver a la carta
        </a>
      )}
      <header className="text-center mb-8">
        <h1 className="font-serif text-3xl text-gold tracking-wide">Sommelier</h1>
        <p className="text-paper/65 text-sm mt-2 leading-relaxed max-w-xs mx-auto">
          Dinos qué vas a comer y te decimos qué tomar.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4 mx-auto w-24">
          <span className="h-px flex-1 bg-gold/30" />
          <span className="w-1.5 h-1.5 rotate-45 bg-gold/50 shrink-0" />
          <span className="h-px flex-1 bg-gold/30" />
        </div>
      </header>

      {error && (
        <p role="alert" className="text-[#F07C88] text-xs text-center mb-6 leading-relaxed">
          No se pudo cargar la carta de bebidas: {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mb-4">
        <label htmlFor="sommelier-input" className="sr-only">
          ¿Qué vas a comer?
        </label>
        <div className="flex gap-2">
          <input
            id="sommelier-input"
            type="text"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setConsulta(null)
            }}
            placeholder="¿Qué vas a comer hoy?"
            className="flex-1 bg-inkSoft border border-bronze/80 rounded-2xl px-4 py-3 text-sm text-paper placeholder:text-paper/50 outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="shrink-0 px-5 rounded-2xl font-head font-bold text-sm text-ink bg-[linear-gradient(135deg,#C08A2E_0%,#E3B341_38%,#F0D284_50%,#E3B341_62%,#C08A2E_100%)] transition-transform duration-150 ease-salida active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Ver
          </button>
        </div>
      </form>

      {!cargando && gruposChips.length > 0 && (
        <div className="mb-8 flex flex-col gap-2.5">
          {gruposChips.map((grupo) => {
            const abierta = categoriasAbiertas.has(grupo.categoria)
            return (
              <div key={grupo.categoria} className="border border-bronze/40 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  aria-expanded={abierta}
                  aria-controls={`platos-${grupo.categoria}`}
                  onClick={() => toggleCategoria(grupo.categoria)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-paper/70 text-xs font-head font-semibold uppercase tracking-wide">
                    {grupo.titulo} <span className="text-paper/55 font-normal normal-case">· {grupo.platos.length}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`text-gold/70 text-[10px] transition-transform duration-150 ease-salida ${abierta ? 'rotate-180' : ''}`}
                  >
                    ▾
                  </span>
                </button>
                {abierta && (
                  <div id={`platos-${grupo.categoria}`} className="flex flex-wrap gap-2 px-4 pb-4">
                    {grupo.platos.map((plato) => {
                      const activo = consulta?.modo === 'plato' && consulta.item.id === plato.id
                      return (
                        <button
                          key={plato.id}
                          type="button"
                          onClick={() => consultarPlato(plato)}
                          aria-pressed={activo}
                          className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                            activo
                              ? 'border-gold/60 text-paper bg-gold/10'
                              : 'border-bronze/50 text-paper/70 hover:border-gold/50 hover:text-paper'
                          }`}
                        >
                          {plato.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {cargando && <p className="text-paper/55 text-sm text-center py-6">Revisando la carta…</p>}

      <div ref={resultadoRef} tabIndex={-1} aria-live="polite" className="scroll-mt-6 outline-none">
        {!cargando && consulta && recomendacion && (
          <RecomendacionCard texto={tituloConsulta} recomendacion={recomendacion} sinCoincidencia={!perfilDetectado} />
        )}
      </div>

      {!cargando && !consulta && (
        <p className="text-paper/55 text-xs text-center leading-relaxed px-4">
          Escribe tu plato o elige uno de la lista.
        </p>
      )}
    </div>
  )
}

function RecomendacionCard({ texto, recomendacion, sinCoincidencia }) {
  const { perfil, vino, notaEscasez, alternativaBar, alternativaSinAlcohol } = recomendacion

  return (
    <div className="bg-inkSoft border border-gold/15 rounded-2xl p-4">
      <p className="text-paper/60 text-[11px] uppercase tracking-wide mb-1">
        {sinCoincidencia ? `Sobre "${texto}"` : perfil.etiqueta}
      </p>

      {sinCoincidencia && (
        <p className="text-paper/65 text-xs mb-3 leading-relaxed">
          Ese plato todavía no lo tenemos mapeado, pero esta va segura. Para algo más afinado, pregúntale a tu garzón.
        </p>
      )}

      <p className="text-paper/70 text-[13px] leading-relaxed mb-4">{perfil.principio}</p>

      {vino ? (
        <div className="border-t border-gold/10 pt-3">
          <p className="text-gold/80 text-[11px] uppercase tracking-wide mb-1">Te recomendamos</p>
          <div className="flex items-baseline gap-2">
            <span className="font-serif italic text-paper/90 text-sm leading-snug">{vino.name}</span>
            {formatCLP(vino.price_clp) && (
              <>
                <span className="flex-1 min-w-[6px] border-b border-dotted border-gold/20 translate-y-[-3px]" />
                <span className="font-mono text-[12px] tabular-nums text-gold whitespace-nowrap shrink-0">
                  {formatCLP(vino.price_clp)}
                </span>
              </>
            )}
          </div>
          {notaEscasez && <p className="text-paper/60 text-[11px] mt-2 leading-relaxed italic">{notaEscasez}</p>}
        </div>
      ) : perfil.sinVino ? null : (
        <p className="text-paper/65 text-xs border-t border-gold/10 pt-3">
          Ahora mismo no hay disponible ningún vino de este estilo. Pregúntale a tu garzón por lo que quedó del día.
        </p>
      )}

      {alternativaBar && (
        <div className="border-t border-gold/10 mt-3 pt-3">
          {/* Si se pidió sin alcohol no hay vino: esta pasa a ser la recomendación principal. */}
          <p className="text-gold/80 text-[11px] uppercase tracking-wide mb-1">
            {perfil.sinVino ? 'Te recomendamos' : 'O, si prefieres algo distinto'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="font-serif italic text-paper/90 text-sm leading-snug">{alternativaBar.item.name}</span>
            {formatCLP(alternativaBar.item.price_clp) && (
              <>
                <span className="flex-1 min-w-[6px] border-b border-dotted border-gold/20 translate-y-[-3px]" />
                <span className="font-mono text-[12px] tabular-nums text-gold whitespace-nowrap shrink-0">
                  {formatCLP(alternativaBar.item.price_clp)}
                </span>
              </>
            )}
          </div>
          <p className="text-paper/60 text-[11px] mt-2 leading-relaxed italic">{alternativaBar.motivo}</p>
        </div>
      )}

      {alternativaSinAlcohol && (
        <div className="border-t border-gold/10 mt-3 pt-3">
          <p className="text-gold/80 text-[11px] uppercase tracking-wide mb-1">Sin alcohol</p>
          <div className="flex items-baseline gap-2">
            <span className="font-serif italic text-paper/90 text-sm leading-snug">{alternativaSinAlcohol.item.name}</span>
            {formatCLP(alternativaSinAlcohol.item.price_clp) && (
              <>
                <span className="flex-1 min-w-[6px] border-b border-dotted border-gold/20 translate-y-[-3px]" />
                <span className="font-mono text-[12px] tabular-nums text-gold whitespace-nowrap shrink-0">
                  {formatCLP(alternativaSinAlcohol.item.price_clp)}
                </span>
              </>
            )}
          </div>
          <p className="text-paper/60 text-[11px] mt-2 leading-relaxed italic">{alternativaSinAlcohol.motivo}</p>
        </div>
      )}
    </div>
  )
}
