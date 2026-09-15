import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Carta pública de solo lectura ("carta2.0", nombre de trabajo — ver
// DECISIONES.md, "Carta pública fuera del hosting frágil de GTD" ·
// 2026-09-15). Ruta técnica temporal /carta2, sin link desde ningún lado de
// la app todavía: solo se abre a mano por URL mientras se prueba.
//
// Lee la MISMA tabla que /admin/productos (menu_items), no la duplica ni la
// escribe. Solo `select`, filtrado a lo que de verdad debe verse en una
// carta pública: visible_carta = true y available = true. No hay carrito ni
// botón de pedido a propósito — para pedir, el cliente le avisa al mozo (ver
// microcopy abajo, pedido explícito de varos-negocio para no confundirse con
// /pedidos, que sí existe en el sitio de WordPress).
//
// Sin realtime ni polling: fetch propio al montar. Si el admin cambia un
// precio o la visibilidad desde /admin/productos, alcanza con recargar esta
// página para verlo reflejado.
//
// Rediseño 2026-09-15 (segunda pasada): el usuario mandó una captura de la
// carta real de varos.cl/carta pidiendo fidelidad visual — la primera pasada
// (badge circular tipo app + pestañas-pill + orden alfabético) "ni se
// parecía". Esta versión: wordmark cursivo en texto (fuente Alex Brush, ver
// index.html), pestañas de texto plano en DOS filas (categorías de comida +
// fila separada de bebidas en `diamond`, mismo agrupamiento que la carta
// real), en el orden real del menú — no alfabético. El orden está fijo acá
// porque son los 10 nombres de categoría reales que ya existen en
// `menu_items` (confirmados contra la captura), no una lista inventada; una
// categoría nueva que no esté en esta lista cae al final del grupo "comida"
// por defecto, así nunca desaparece de la carta aunque no esté prevista.

// Las categorías reales en `menu_items` vienen casi todas en MAYÚSCULA (menos
// "Menú del Día") — se compara normalizado (mayúscula + sin tildes) para no
// depender de que la mayúscula/tilde exacta se mantenga igual para siempre.
function normalizarCategoria(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const ORDEN_CATEGORIAS = [
  'MENU DEL DIA',
  'NUESTRO BAR',
  'APERITIVOS',
  'ENTRADAS FRIAS Y CALIENTES',
  'PLATOS PRINCIPALES',
  'NINOS',
  'GUARNICIONES',
  'POSTRES & TENTACIONES'
].map(normalizarCategoria)
const CATEGORIAS_BEBIDAS = ['MOCKTAILS (SIN ALCOHOL)', 'VINOS & ESPUMANTES'].map(normalizarCategoria)

// Descripción de un plato — respeta saltos de línea (antes se aplastaba
// todo en un solo párrafo). Si una línea tiene forma "Entrada: ..." (como
// el desglose del Menú del Día — ver /admin/productos, campo Descripción),
// la etiqueta se resalta en `wineSoft`, igual que los subgrupos en rojo
// vino de la carta real.
function DescripcionPlato({ texto }) {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="mt-1 ml-4">
      {lineas.map((linea, i) => {
        const m = linea.match(/^([^:]{1,28}):\s*(.+)$/)
        return (
          <p key={i} className="text-paper/35 text-[11px] leading-relaxed italic">
            {m ? (
              <>
                <span className="text-wineSoft not-italic font-semibold">{m[1]}: </span>
                {m[2]}
              </>
            ) : (
              linea
            )}
          </p>
        )
      })}
    </div>
  )
}

function formatCLP(valor) {
  const n = Number(valor) || 0
  return `$${n.toLocaleString('es-CL')}`
}

export default function Carta2() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState(null)

  useEffect(() => {
    let cancelado = false
    setCargando(true)
    supabase
      .from('menu_items')
      .select('*')
      .eq('visible_carta', true)
      .eq('available', true)
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

  const categorias = useMemo(() => {
    const porCategoria = new Map()
    for (const item of items) {
      const cat = item.category || 'Otros'
      if (!porCategoria.has(cat)) porCategoria.set(cat, [])
      porCategoria.get(cat).push(item)
    }
    const ordenConocido = [...ORDEN_CATEGORIAS, ...CATEGORIAS_BEBIDAS]
    const nombres = Array.from(porCategoria.keys()).sort((a, b) => {
      const ia = ordenConocido.indexOf(normalizarCategoria(a))
      const ib = ordenConocido.indexOf(normalizarCategoria(b))
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'es')
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    return nombres.map((nombre) => {
      const platos = [...porCategoria.get(nombre)].sort((a, b) => {
        const oa = a.orden ?? 9999
        const ob = b.orden ?? 9999
        if (oa !== ob) return oa - ob
        return (a.name ?? '').localeCompare(b.name ?? '', 'es')
      })
      return { nombre, platos }
    })
  }, [items])

  const categoriasComida = categorias.filter((c) => !CATEGORIAS_BEBIDAS.includes(normalizarCategoria(c.nombre)))
  const categoriasBebida = categorias.filter((c) => CATEGORIAS_BEBIDAS.includes(normalizarCategoria(c.nombre)))

  useEffect(() => {
    if (categorias.length === 0) {
      setCategoriaActiva(null)
      return
    }
    setCategoriaActiva((actual) => {
      if (actual && categorias.some((c) => c.nombre === actual)) return actual
      return categorias[0].nombre
    })
  }, [categorias])

  const seleccion = categorias.find((c) => c.nombre === categoriaActiva)

  function Pestana({ nombre, color }) {
    const activa = nombre === categoriaActiva
    return (
      <button
        type="button"
        onClick={() => setCategoriaActiva(nombre)}
        className={
          'text-[11px] sm:text-xs font-head font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ' +
          (activa ? 'text-ember' : color === 'diamond' ? 'text-diamond/70 hover:text-diamond' : 'text-paper/70 hover:text-paper')
        }
      >
        {nombre}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-ink px-5 pt-10 pb-14">
      {/* Wordmark real, no una aproximación con fuente: es el mismo PNG
          (`bg_logo.png`) que usa `varos.cl/carta` hoy — se sacó de la copia
          estática que ya se había crawleado (`varos-cl-copia/carta/`), así
          que es pixel-idéntico al de la carta real, no una interpretación. */}
      <header className="text-center mb-5">
        <img src="/varos-wordmark-carta.png" alt="Varo's Restaurant" className="mx-auto w-64 max-w-full h-auto" />
        <p className="text-paper/30 text-[10px] mt-2">
          {cargando ? 'Cargando la carta…' : `${items.length} platos disponibles`}
        </p>
      </header>

      {/* Microcopy obligatorio: visible arriba, no al pie en chico — pedido
          explícito de varos-negocio para que nadie la confunda con un
          sistema de pedidos (ya existe /pedidos en el sitio de WordPress). */}
      <div className="bg-inkSoft border border-gold/20 rounded-2xl px-4 py-3 mb-7 text-center">
        <p className="text-sm text-gold font-head font-medium">Para pedir, avisale a tu mozo</p>
        <p className="text-paper/40 text-[11px] mt-1">Esta carta es solo para mirar los platos y precios.</p>
      </div>

      {error && (
        <p className="text-rose-400 text-xs text-center mb-6 leading-relaxed">
          No se pudo cargar la carta: {error}
        </p>
      )}

      {!cargando && categorias.length === 0 && !error && (
        <p className="text-paper/35 text-sm text-center py-10">Todavía no hay platos publicados en la carta.</p>
      )}

      {categorias.length > 0 && (
        <>
          {/* Pestañas de texto plano (no pills), en dos filas — igual que la
              carta real: la fila principal de comida, y una fila separada
              y centrada solo para bebidas, en `diamond`. */}
          <nav className="mb-1.5">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              {categoriasComida.map(({ nombre }) => (
                <Pestana key={nombre} nombre={nombre} color="ember" />
              ))}
            </div>
          </nav>
          {categoriasBebida.length > 0 && (
            <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 mb-6 pb-4 border-b border-white/5">
              {categoriasBebida.map(({ nombre }) => (
                <Pestana key={nombre} nombre={nombre} color="diamond" />
              ))}
            </nav>
          )}
          {categoriasBebida.length === 0 && <div className="mb-6" />}

          {seleccion && (
            <section className="max-w-lg mx-auto">
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-gold font-head font-semibold text-sm uppercase tracking-wide shrink-0">
                  {seleccion.nombre}
                </h2>
                <span className="flex-1 min-w-[8px] border-b border-dotted border-gold/30 translate-y-[-3px]" />
              </div>
              <div className="flex flex-col gap-2.5">
                {seleccion.platos.map((plato) => (
                  <div key={plato.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-paper/25 text-[10px] shrink-0">*</span>
                      <span className="italic text-paper/80 text-[13px] leading-snug">{plato.name}</span>
                      <span className="flex-1 min-w-[6px] border-b border-dotted border-paper/15 translate-y-[-3px]" />
                      <span className="font-mono text-[12px] tabular-nums text-gold whitespace-nowrap shrink-0">
                        {formatCLP(plato.price_clp)}
                      </span>
                    </div>
                    {plato.description && <DescripcionPlato texto={plato.description} />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Footer, separado del resto — mismo tratamiento que la carta real:
          teléfono en dorado, email y web como links en un tono azulado. */}
      <footer className="text-center mt-12 pt-6 border-t border-white/5">
        <p className="text-gold text-sm font-head font-medium">Pedidos y Reservas al +56 9 9923 5368</p>
        <p className="text-diamond/80 text-xs mt-2">
          <a href="mailto:contacto@varos.cl" className="hover:text-diamond">
            contacto@varos.cl
          </a>
        </p>
        <p className="text-diamond/80 text-xs mt-1">
          <a href="https://www.varos.cl" target="_blank" rel="noreferrer" className="hover:text-diamond">
            www.varos.cl
          </a>
        </p>
      </footer>
    </div>
  )
}
