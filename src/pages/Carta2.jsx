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

function formatCLP(valor) {
  const n = Number(valor) || 0
  return `$${n.toLocaleString('es-CL')}`
}

export default function Carta2() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div className="min-h-screen bg-ink px-5 pt-10 pb-16">
      <header className="text-center mb-8">
        <div className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase mb-2">Varo's Restaurant</div>
        <h1 className="font-display text-4xl tracking-wide text-paper">La Carta</h1>
        <p className="text-paper/40 text-xs mt-2 leading-relaxed">
          {cargando ? 'Cargando…' : `${items.length} platos disponibles`}
        </p>
      </header>

      {/* Microcopy obligatorio: visible arriba, no al pie en chico — pedido
          explícito de varos-negocio para que nadie la confunda con un
          sistema de pedidos (ya existe /pedidos en el sitio de WordPress). */}
      <div className="bg-inkSoft border border-gold/20 rounded-2xl px-4 py-3 mb-8 text-center">
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

      <div className="flex flex-col gap-8">
        {categorias.map(({ nombre, platos }) => (
          <section key={nombre}>
            <h2 className="font-head text-sm font-semibold uppercase tracking-[0.15em] text-ember mb-3">
              {nombre}
            </h2>
            <div className="flex flex-col gap-2">
              {platos.map((plato) => (
                <div
                  key={plato.id}
                  className="bg-inkSoft border border-white/5 rounded-2xl p-4 flex gap-3 items-center"
                >
                  {plato.image_url && (
                    <img
                      src={plato.image_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-head text-sm font-medium text-paper truncate">{plato.name}</h3>
                      <span className="font-mono text-xs tabular-nums text-gold whitespace-nowrap">
                        {formatCLP(plato.price_clp)}
                      </span>
                    </div>
                    {plato.description && (
                      <p className="text-paper/50 text-[11px] mt-1 leading-relaxed">{plato.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
