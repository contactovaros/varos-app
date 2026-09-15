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
// Sin realtime ni polling: es una página React normal con su propio fetch al
// montar. Si el admin cambia un precio o la visibilidad desde
// /admin/productos, alcanza con recargar esta página para verlo reflejado —
// no hace falta más para esta primera versión interna.
//
// Rediseño 2026-09-15: el usuario mandó una captura de la carta real de
// varos.cl/carta (WordPress) pidiendo que esta se le parezca. Se adoptó el
// lenguaje visual — pestañas de categoría (una a la vez, no scroll con todo
// mezclado), título dorado, ítems en itálica con línea punteada al precio,
// footer con el teléfono en dorado — pero SIN hardcodear la lista de
// categorías ni sus subgrupos: acá `menu_items` solo tiene una columna
// `category` plana, sin subcategoría, así que no existe el subgrupo
// "Entrada / Plato Principal / Postres" en rojo vino que se ve en la
// referencia — se arma solo desde lo que hay en la base para no
// desactualizarse.

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

  // Agrupado por categoría, orden manual (`orden`) dentro de cada una y por
  // nombre cuando no hay uno definido — mismo criterio que /admin/productos,
  // para que el orden que ve el admin sea el mismo que ve el cliente.
  const categorias = useMemo(() => {
    const porCategoria = new Map()
    for (const item of items) {
      const cat = item.category || 'Otros'
      if (!porCategoria.has(cat)) porCategoria.set(cat, [])
      porCategoria.get(cat).push(item)
    }
    const nombres = Array.from(porCategoria.keys()).sort((a, b) => a.localeCompare(b, 'es'))
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

  // La pestaña activa por defecto es la primera categoría una vez que llegan
  // los datos; si la categoría activa deja de existir (recarga con otros
  // datos) se vuelve a la primera disponible.
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

  return (
    <div className="min-h-screen bg-ink px-5 pt-10 pb-14">
      {/* Emblema: mismo badge dorado que ya usa el Club (evita improvisar una
          fuente script nueva — ver /admin, TarjetaFidelidad.jsx). Trae el
          "Varo's" cursivo y "Restaurant" en serif ya integrados. */}
      <header className="text-center mb-6">
        <img
          src="/logo-varos.png"
          alt="Varo's Restaurant"
          className="w-20 h-20 mx-auto mb-2 drop-shadow-[0_0_20px_rgba(227,179,65,0.25)]"
        />
        <p className="text-paper/35 text-[11px] mt-1">
          {cargando ? 'Cargando la carta…' : `${items.length} platos disponibles`}
        </p>
      </header>

      {/* Microcopy obligatorio: visible arriba, no al pie en chico — pedido
          explícito de varos-negocio para que nadie la confunda con un
          sistema de pedidos (ya existe /pedidos en el sitio de WordPress). */}
      <div className="bg-inkSoft border border-gold/20 rounded-2xl px-4 py-3 mb-6 text-center">
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
          {/* Pestañas de categoría, una fila con scroll horizontal — como la
              carta real: se elige una categoría a la vez, no todo mezclado. */}
          <nav className="flex gap-1.5 overflow-x-auto pb-1 mb-6 -mx-5 px-5 scrollbar-none">
            {categorias.map(({ nombre }) => {
              const activa = nombre === categoriaActiva
              return (
                <button
                  key={nombre}
                  type="button"
                  onClick={() => setCategoriaActiva(nombre)}
                  className={
                    'shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ' +
                    (activa
                      ? 'bg-gradient-to-br from-ember to-emberDark text-ink'
                      : 'text-paper/50 border border-white/10')
                  }
                >
                  {nombre}
                </button>
              )
            })}
          </nav>

          {seleccion && (
            <section>
              <h2 className="font-display text-2xl text-gold tracking-wide mb-4">{seleccion.nombre}</h2>
              <div className="flex flex-col gap-3">
                {seleccion.platos.map((plato) => (
                  <div key={plato.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-paper/30 text-xs shrink-0">*</span>
                      <span className="italic text-paper/75 text-sm min-w-0 truncate">{plato.name}</span>
                      <span className="flex-1 min-w-[8px] border-b border-dotted border-paper/20 translate-y-[-4px]" />
                      <span className="font-mono text-xs tabular-nums text-gold whitespace-nowrap shrink-0">
                        {formatCLP(plato.price_clp)}
                      </span>
                    </div>
                    {plato.description && (
                      <p className="text-paper/35 text-[11px] mt-0.5 ml-4 leading-relaxed italic">
                        {plato.description}
                      </p>
                    )}
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
