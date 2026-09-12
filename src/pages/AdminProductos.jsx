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

// Piloto "reflejar /admin/productos en varos.cl/carta sin cambiar de URL"
// (varos-pos/DECISIONES.md). varos.cl/carta la sigue generando el PHP viejo
// (gestion.php) — la única forma de que se vea reflejado ahí un cambio de
// acá es escribirlo de vuelta en esa base, y la única vía que existe para
// eso es la cola del Worker `varos-kds` + el userscript de la PC de caja
// (que sí tiene la cookie de sesión). Ver worker.js de varos-kds.
//
// Solo funciona para los 192/206 productos que ya tienen `pos_prodid`
// mapeado — si no lo tiene, no hay a qué producto real del PHP escribirle,
// así que se omite en silencio (Supabase igual queda actualizado, que sigue
// siendo la fuente de verdad de este panel).
const KDS_WORKER = 'https://varos-kds.varosnocturno.workers.dev'
const KDS_KEY = '797a0ed49a8623e452b03fc0'

async function syncCampoConPos(item, campo, dato) {
  if (!item?.pos_prodid) return
  try {
    await fetch(`${KDS_WORKER}/product-update?k=${KDS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prodid: item.pos_prodid, campo, dato: String(dato) })
    })
  } catch {
    // silencioso a propósito: es un espejo best-effort hacia el PHP, no debe
    // bloquear ni alarmar por una falla de red momentánea de este lado.
  }
}

async function syncFotoConPos(item, imageUrl) {
  if (!item?.pos_prodid) return
  try {
    await fetch(`${KDS_WORKER}/product-photo?k=${KDS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prodid: item.pos_prodid, imageUrl, catid: item.pos_catid || '' })
    })
  } catch {}
}

// Paleta de esta pantalla: dorado/bronce como acento (no ember/wine, que son
// el protagonista del resto de /admin). Los estados de disponibilidad son
// semánticos (verde/rojo) y van aparte del acento de marca.
const ESTADO_PILL = {
  disponible: 'border-emerald-400/40 text-emerald-400 bg-emerald-400/10',
  agotado: 'border-rose-400/40 text-rose-400 bg-rose-400/10'
}

// Producto vacío para el panel de creación — mismos campos que una fila real
// de menu_items, con los defaults que pide el negocio: disponible sí (recién
// creado, se puede vender), visible en la carta NO (el admin la prende a
// mano cuando la foto/precio estén listos, ver punto 2 del pedido).
const NUEVO_PRODUCTO = {
  id: null,
  name: '',
  category: '',
  price_clp: '',
  description: '',
  available: true,
  visible_carta: false,
  image_url: null
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

  // Panel de creación: cuando está abierto, reemplaza al de edición. `null`
  // = cerrado. Objeto de formulario aparte del de edición (no `nuevo`, para
  // no chocar con la variable local del mismo nombre en guardarPrecio) porque
  // un producto nuevo no existe todavía en `items` — no tiene id hasta el insert.
  const [nuevoProducto, setNuevoProducto] = useState(null)
  const [creando, setCreando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [errorFoto, setErrorFoto] = useState('')

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
    setNuevoProducto(null) // seleccionar un producto existente cierra el panel de creación
    setSeleccionadoId(item.id === seleccionadoId ? null : item.id)
  }

  function abrirNuevoProducto() {
    setSeleccionadoId(null)
    setErrorFoto('')
    setNuevoProducto({ ...NUEVO_PRODUCTO })
  }

  function cerrarNuevoProducto() {
    setNuevoProducto(null)
    setErrorFoto('')
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
    } else {
      syncCampoConPos(seleccionado, 'Precio', nuevo)
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
    } else {
      // "Bloqueado" en el PHP es justo lo inverso de visible_carta (confirmado:
      // solo oculta de la carta pública, no del catálogo interno de menús).
      syncCampoConPos(item, 'Bloqueado', nuevo ? '0' : '1')
    }
  }

  // Sube un archivo al bucket público `menu-fotos` (ver
  // supabase/add_menu_fotos_bucket.sql) con un nombre único, y devuelve la URL
  // pública ya lista para guardar en `image_url`. `null` si falla.
  async function subirFotoAlBucket(file) {
    setErrorFoto('')
    setSubiendoFoto(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: err } = await supabase.storage.from('menu-fotos').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      })
      if (err) throw err
      const { data } = supabase.storage.from('menu-fotos').getPublicUrl(path)
      return data.publicUrl
    } catch (err) {
      setErrorFoto('No se pudo subir la foto: ' + err.message)
      return null
    } finally {
      setSubiendoFoto(false)
    }
  }

  // Cambiar la foto de un producto YA existente: sube y guarda de una, igual
  // que el resto de los campos de esta pantalla (no hay botón "Guardar" aparte).
  async function onFotoExistente(e, item) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo después
    if (!file) return
    const url = await subirFotoAlBucket(file)
    if (!url) return
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, image_url: url } : i)))
    const { error: err } = await supabase.from('menu_items').update({ image_url: url }).eq('id', item.id)
    if (err) alert('La foto se subió pero no se pudo guardar en el producto: ' + err.message)
    else syncFotoConPos(item, url)
  }

  // Cambiar la foto en el panel de creación: solo queda en el formulario en
  // memoria hasta que se cree el producto (el archivo en el bucket ya quedó
  // subido, con nombre único, así que no hay conflicto si el admin cambia de
  // foto varias veces antes de guardar).
  async function onFotoNueva(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = await subirFotoAlBucket(file)
    if (!url) return
    setNuevoProducto((prev) => ({ ...prev, image_url: url }))
  }

  async function crearProducto() {
    if (!nuevoProducto) return
    const nombre = nuevoProducto.name.trim()
    const cat = nuevoProducto.category.trim()
    const precio = Number(nuevoProducto.price_clp)
    if (!nombre || !cat || !Number.isFinite(precio) || precio < 0) return

    setCreando(true)
    const payload = {
      name: nombre,
      category: cat,
      price_clp: precio,
      description: nuevoProducto.description?.trim() || null,
      available: nuevoProducto.available,
      visible_carta: nuevoProducto.visible_carta,
      image_url: nuevoProducto.image_url || null
    }
    const { data, error: err } = await supabase.from('menu_items').insert(payload).select().single()
    setCreando(false)
    if (err) {
      alert('No se pudo crear el producto: ' + err.message)
      return
    }
    setNuevoProducto(null)
    await cargar() // vuelve a leer todo para mantener el orden real (categoría → orden → nombre)
    setSeleccionadoId(data.id)
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
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
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
        </div>
        <button
          onClick={abrirNuevoProducto}
          className="shrink-0 bg-gradient-to-br from-gold to-bronze text-ink font-head text-xs font-medium px-3.5 py-2.5 rounded-lg whitespace-nowrap"
        >
          + Nuevo producto
        </button>
      </header>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* ---- Columna izquierda: buscador + chips + tabla ----
             order-last en mobile: la tabla tiene 200+ filas, así que si el
             panel (que sí necesita verse apenas se abre) quedara debajo de
             ella, "+ Nuevo producto" parecería no hacer nada — quedaría a
             miles de píxeles de scroll. En desktop el flex-row ya la pone a
             la izquierda sin necesitar order. */}
        <div className="flex-1 min-w-0 order-last lg:order-none">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full bg-inkSoft border border-white/10 rounded-lg px-3 py-2.5 text-xs mb-3 focus:outline-none focus:border-gold/50"
          />

          <div className="flex flex-wrap gap-2 mb-3">
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

        {/* ---- Panel lateral: crear, o editar ---- */}
        <aside className="lg:w-80 shrink-0 lg:sticky lg:top-6 lg:self-start">
          <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
            {nuevoProducto ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="font-head font-semibold text-sm">Nuevo producto</span>
                  <button onClick={cerrarNuevoProducto} className="text-paper/40 text-xs hover:text-paper/70">
                    Cancelar
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Nombre</label>
                  <input
                    value={nuevoProducto.name}
                    onChange={(e) => setNuevoProducto((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Ceviche mixto"
                    className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gold/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Categoría</label>
                  <input
                    value={nuevoProducto.category}
                    onChange={(e) => setNuevoProducto((prev) => ({ ...prev, category: e.target.value }))}
                    list="categorias-existentes"
                    placeholder="Elegí una o escribí una nueva"
                    className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gold/50"
                  />
                  <datalist id="categorias-existentes">
                    {categorias.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Precio</label>
                  <input
                    type="number"
                    value={nuevoProducto.price_clp}
                    onChange={(e) => setNuevoProducto((prev) => ({ ...prev, price_clp: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gold/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">
                    Descripción <span className="text-paper/25">(opcional)</span>
                  </label>
                  <textarea
                    value={nuevoProducto.description}
                    onChange={(e) => setNuevoProducto((prev) => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gold/50 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Foto</label>
                  <div className="flex items-center gap-3">
                    {nuevoProducto.image_url && (
                      <img
                        src={nuevoProducto.image_url}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onFotoNueva}
                      disabled={subiendoFoto}
                      className="flex-1 text-[11px] text-paper/50 min-w-0"
                    />
                  </div>
                  {subiendoFoto && <p className="text-paper/35 text-[10px] mt-1.5">Subiendo…</p>}
                  {errorFoto && <p className="text-rose-400 text-[10px] mt-1.5 leading-relaxed">{errorFoto}</p>}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3.5">
                  <span className="text-xs text-paper">Disponible</span>
                  <button
                    onClick={() => setNuevoProducto((prev) => ({ ...prev, available: !prev.available }))}
                    aria-pressed={!!nuevoProducto.available}
                    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
                      nuevoProducto.available ? 'bg-gradient-to-br from-gold to-bronze' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-paper transition-transform duration-200 ${
                        nuevoProducto.available ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-paper">Visible en la carta de varos.cl</span>
                  <button
                    onClick={() => setNuevoProducto((prev) => ({ ...prev, visible_carta: !prev.visible_carta }))}
                    aria-pressed={!!nuevoProducto.visible_carta}
                    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
                      nuevoProducto.visible_carta ? 'bg-gradient-to-br from-gold to-bronze' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-paper transition-transform duration-200 ${
                        nuevoProducto.visible_carta ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <p className="text-paper/35 text-[10px] -mt-2 leading-relaxed">
                  Apagado por defecto: prendelo cuando la foto y el precio estén listos.
                </p>

                <button
                  onClick={crearProducto}
                  disabled={creando || !nuevoProducto.name.trim() || !nuevoProducto.category.trim() || nuevoProducto.price_clp === ''}
                  className="w-full bg-gradient-to-br from-gold to-bronze text-ink font-head text-xs font-medium py-2.5 rounded-lg disabled:opacity-40"
                >
                  {creando ? 'Creando…' : 'Crear producto'}
                </button>
              </div>
            ) : !seleccionado ? (
              <p className="text-paper/35 text-xs py-4 text-center">
                Toca un producto de la tabla para editarlo.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="font-head font-semibold text-sm">{seleccionado.name}</div>
                  <div className="text-paper/40 text-[11px] mt-0.5">{seleccionado.category}</div>
                  {!seleccionado.pos_prodid && (
                    <p className="text-amber-400/80 text-[10px] mt-1.5 leading-relaxed">
                      Sin conectar con varos.cl/carta — los cambios acá no se ven reflejados ahí todavía.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-paper/40 mb-1.5">Foto</label>
                  <div className="flex items-center gap-3">
                    {seleccionado.image_url ? (
                      <img
                        src={seleccionado.image_url}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-white/10 shrink-0 flex items-center justify-center text-paper/20 text-[9px] text-center">
                        Sin foto
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onFotoExistente(e, seleccionado)}
                      disabled={subiendoFoto}
                      className="flex-1 text-[11px] text-paper/50 min-w-0"
                    />
                  </div>
                  {subiendoFoto && <p className="text-paper/35 text-[10px] mt-1.5">Subiendo…</p>}
                  {errorFoto && <p className="text-rose-400 text-[10px] mt-1.5 leading-relaxed">{errorFoto}</p>}
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
