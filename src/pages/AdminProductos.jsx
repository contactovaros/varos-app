import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

// Primer módulo del reemplazo incremental del POS viejo (varos.cl/gestion).
// Reusa `menu_items` (ver DECISIONES.md, "Reusar menu_items para el primer
// módulo del reemplazo del POS (Productos) · 2026-09-11") en vez de crear una
// tabla `productos` nueva. `visible_carta` y `orden` son columnas aditivas
// que se agregan por una migración .sql que el usuario corre a mano — este
// componente ya asume que existen.

function formatCLP(valor) {
  const n = Number(valor) || 0
  return `$${n.toLocaleString('es-CL')}`
}

// Paleta de esta pantalla: dorado/bronce como acento (no ember/wine, que son
// el protagonista del resto de /admin). Los estados de disponibilidad son
// semánticos (verde/rojo) y van aparte del acento de marca.
const ESTADO_PILL = {
  disponible: 'border-emerald-400/40 text-emerald-400 bg-emerald-400/10',
  agotado: 'border-rose-400/40 text-rose-400 bg-rose-400/10'
}

export default function AdminProductos() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState(null) // null = "Todas"

  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [precioForm, setPrecioForm] = useState('')
  const [guardandoPrecio, setGuardandoPrecio] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data, error: err } = await supabase.from('menu_items').select('*')
    if (err) {
      setError(err.message)
      setItems([])
    } else {
      // Orden manual por categoría (`orden`), y por nombre cuando no hay uno
      // definido — se ordena en el cliente por si la migración que agrega la
      // columna todavía no corrió en esta base.
      const ordenados = [...(data ?? [])].sort((a, b) => {
        if (a.category !== b.category) return (a.category ?? '').localeCompare(b.category ?? '', 'es')
        const oa = a.orden ?? 9999
        const ob = b.orden ?? 9999
        if (oa !== ob) return oa - ob
        return (a.name ?? '').localeCompare(b.name ?? '', 'es')
      })
      setItems(ordenados)
    }
    setCargando(false)
  }

  useEffect(() => {
    if (isAdmin) cargar()
  }, [isAdmin])

  const categorias = useMemo(() => {
    const set = new Set(items.map((i) => i.category).filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [items])

  const filtrados = items.filter((i) => {
    if (categoria && i.category !== categoria) return false
    if (busqueda.trim() && !i.name?.toLowerCase().includes(busqueda.trim().toLowerCase())) return false
    return true
  })

  const seleccionado = items.find((i) => i.id === seleccionadoId) ?? null

  useEffect(() => {
    setPrecioForm(seleccionado ? String(seleccionado.price_clp ?? '') : '')
  }, [seleccionadoId, seleccionado?.price_clp])

  function seleccionar(item) {
    setSeleccionadoId(item.id === seleccionadoId ? null : item.id)
  }

  async function guardarPrecio() {
    if (!seleccionado) return
    const nuevo = Number(precioForm)
    if (!Number.isFinite(nuevo) || nuevo < 0 || nuevo === seleccionado.price_clp) return
    setGuardandoPrecio(true)
    const anterior = seleccionado.price_clp
    setItems((prev) => prev.map((i) => (i.id === seleccionado.id ? { ...i, price_clp: nuevo } : i)))
    const { error: err } = await supabase.from('menu_items').update({ price_clp: nuevo }).eq('id', seleccionado.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === seleccionado.id ? { ...i, price_clp: anterior } : i)))
      setPrecioForm(String(anterior))
      alert('No se pudo guardar el precio: ' + err.message)
    }
    setGuardandoPrecio(false)
  }

  async function marcarDisponible(item, disponible) {
    if (item.available === disponible) return
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: disponible } : i)))
    const { error: err } = await supabase.from('menu_items').update({ available: disponible }).eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: !disponible } : i)))
      alert('No se pudo cambiar el estado: ' + err.message)
    }
  }

  async function alternarVisibleCarta(item) {
    const nuevo = !item.visible_carta
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, visible_carta: nuevo } : i)))
    const { error: err } = await supabase.from('menu_items').update({ visible_carta: nuevo }).eq('id', item.id)
    if (err) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, visible_carta: !nuevo } : i)))
      alert('No se pudo cambiar la visibilidad en varos.cl: ' + err.message)
    }
  }

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
      <header className="mb-5">
        <div className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase">Varo's · Gestión</div>
        <h1 className="font-head text-2xl font-semibold">Productos</h1>
        <p className="text-paper/40 text-xs mt-1 leading-relaxed">
          {cargando ? 'Cargando…' : `${items.length} productos · ${filtrados.length} en esta vista`}
        </p>
        {error && (
          <p className="text-rose-400 text-[11px] mt-1 leading-relaxed">
            No se pudo leer el menú: {error}
          </p>
        )}
      </header>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ---- Columna izquierda: buscador + chips + tabla ---- */}
        <div className="flex-1 min-w-0">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full bg-inkSoft border border-white/10 rounded-lg px-3 py-2.5 text-xs mb-3 focus:outline-none focus:border-gold/50"
          />

          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button
              onClick={() => setCategoria(null)}
              className={`shrink-0 font-head text-xs font-medium px-4 py-2 rounded-full border whitespace-nowrap ${
                categoria === null
                  ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink'
                  : 'border-white/10 text-paper/60'
              }`}
            >
              Todas
            </button>
            {categorias.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={`shrink-0 font-head text-xs font-medium px-4 py-2 rounded-full border whitespace-nowrap ${
                  categoria === c
                    ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink'
                    : 'border-white/10 text-paper/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="bg-inkSoft border border-white/5 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-paper/35 border-b border-white/5">
                    <th className="text-left font-head font-medium px-3 py-2.5">Producto</th>
                    <th className="text-left font-head font-medium px-3 py-2.5">Categoría</th>
                    <th className="text-right font-head font-medium px-3 py-2.5">Precio</th>
                    <th className="text-left font-head font-medium px-3 py-2.5">Estado</th>
                    <th className="text-center font-head font-medium px-3 py-2.5" title="Visible en la carta pública de varos.cl">
                      En varos.cl
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => seleccionar(item)}
                      className={`cursor-pointer border-b border-white/5 last:border-b-0 transition-colors ${
                        item.id === seleccionadoId ? 'bg-gold/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="px-3 py-2.5 font-head text-paper max-w-[140px] truncate">{item.name}</td>
                      <td className="px-3 py-2.5 text-paper/50 whitespace-nowrap">{item.category}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-paper/80">
                        {formatCLP(item.price_clp)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap ${
                            item.available ? ESTADO_PILL.disponible : ESTADO_PILL.agotado
                          }`}
                        >
                          {item.available ? 'Disponible' : 'Agotado'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full border ${
                            item.visible_carta ? 'bg-gold border-gold' : 'bg-transparent border-white/20'
                          }`}
                          title={item.visible_carta ? 'Visible en varos.cl' : 'Oculto en varos.cl'}
                        />
                      </td>
                    </tr>
                  ))}
                  {!cargando && filtrados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-paper/35">
                        {items.length === 0 ? 'Aún no hay productos cargados.' : 'Ningún producto coincide con la búsqueda.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ---- Panel lateral de edición ---- */}
        <aside className="lg:w-80 shrink-0 lg:sticky lg:top-6 lg:self-start">
          <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
            {!seleccionado ? (
              <p className="text-paper/35 text-xs py-4 text-center">
                Toca un producto de la tabla para editarlo.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="font-head font-semibold text-sm">{seleccionado.name}</div>
                  <div className="text-paper/40 text-[11px] mt-0.5">{seleccionado.category}</div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Precio</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={precioForm}
                      onChange={(e) => setPrecioForm(e.target.value)}
                      onBlur={guardarPrecio}
                      className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gold/50"
                    />
                    <span className="self-center text-[10px] text-paper/30 w-14">
                      {guardandoPrecio ? 'Guardando…' : ''}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Estado</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => marcarDisponible(seleccionado, true)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-head font-medium ${
                        seleccionado.available ? ESTADO_PILL.disponible : 'border-white/10 text-paper/40'
                      }`}
                    >
                      Disponible
                    </button>
                    <button
                      onClick={() => marcarDisponible(seleccionado, false)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-head font-medium ${
                        !seleccionado.available ? ESTADO_PILL.agotado : 'border-white/10 text-paper/40'
                      }`}
                    >
                      Agotado
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-paper">Visible en la carta de varos.cl</span>
                    <button
                      onClick={() => alternarVisibleCarta(seleccionado)}
                      aria-pressed={!!seleccionado.visible_carta}
                      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
                        seleccionado.visible_carta ? 'bg-gradient-to-br from-gold to-bronze' : 'bg-white/10'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-paper transition-transform duration-200 ${
                          seleccionado.visible_carta ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-paper/35 text-[10px] mt-1.5 leading-relaxed">
                    Se actualiza al instante en la web pública.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
