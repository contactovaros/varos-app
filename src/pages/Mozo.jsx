import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Pantalla del mozo — fase 2 del reemplazo incremental del POS viejo
// (varos.cl/gestion). Ver varos-pos/DECISIONES.md, "Reemplazo de Comandas
// (fase 1, sin Caja) · 2026-09-11".
//
// Sin login de Google a propósito (decisión del usuario, 2026-09-12): el
// candado es un código corto por garzón, generado en /admin/garzones
// (tabla `garzones` + RPC `validar_codigo_garzon`), no una cuenta. Se pide
// una sola vez por celular y queda guardado en localStorage — cada mozo usa
// su propio teléfono, así que no hace falta volver a pedirlo cada vez.
const KDS_URL = 'https://varos-kds.varosnocturno.workers.dev/pedido-nuevo?k=797a0ed49a8623e452b03fc0'
const GARZON_STORAGE_KEY = 'varos_mozo_garzon'

// Numeración de mesas por sector: placeholder razonable (no hay data real de
// numeración exacta todavía). El usuario la puede ajustar después si hace falta.
const SECTORES = [
  { sector: 'Bar', nums: [1, 2, 3] },
  { sector: 'Carpa', nums: [4, 5, 6, 7, 8, 9] },
  { sector: 'Andino', nums: [10, 11, 12, 13, 14] },
  { sector: 'Chic', nums: [15, 16, 17] },
  { sector: 'Jardín', nums: [18, 19, 20, 21] }
]

function formatCLP(valor) {
  const n = Number(valor) || 0
  return `$${n.toLocaleString('es-CL')}`
}

function IconoBuscar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function leerGarzonGuardado() {
  try {
    const raw = localStorage.getItem(GARZON_STORAGE_KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    return g?.id && g?.nombre ? g : null
  } catch {
    return null
  }
}

// Pantalla de candado: pide el código una sola vez por celular. No es un
// login real — valida contra `validar_codigo_garzon` (RPC pública, no
// expone la tabla `garzones` ni los códigos de los demás).
function GateGarzon({ onEntrar }) {
  const [codigo, setCodigo] = useState('')
  const [validando, setValidando] = useState(false)
  const [errorCodigo, setErrorCodigo] = useState('')

  async function entrar() {
    const limpio = codigo.trim()
    if (!limpio) return
    setValidando(true)
    setErrorCodigo('')
    const { data, error } = await supabase.rpc('validar_codigo_garzon', { p_codigo: limpio })
    setValidando(false)
    if (error) {
      setErrorCodigo('No se pudo validar el código. Revisá la conexión e intentá de nuevo.')
      return
    }
    const garzon = Array.isArray(data) ? data[0] : data
    if (!garzon?.id) {
      setErrorCodigo('Código incorrecto.')
      return
    }
    const guardado = { id: garzon.id, nombre: garzon.nombre }
    try {
      localStorage.setItem(GARZON_STORAGE_KEY, JSON.stringify(guardado))
    } catch {}
    onEntrar(guardado)
  }

  return (
    <div className="min-h-screen bg-ink text-paper flex items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="font-mono text-[10px] tracking-[0.22em] text-gold uppercase mb-1 text-center">Varo's · Mozo</div>
        <h1 className="font-head text-xl font-semibold text-center mb-5">Tu código de acceso</h1>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
          inputMode="numeric"
          placeholder="Ej: 384021"
          autoFocus
          className="w-full bg-inkSoft border border-white/10 rounded-xl px-4 py-3.5 text-center font-mono text-2xl tracking-[0.25em] outline-none placeholder:text-paper/25 placeholder:tracking-normal placeholder:text-base"
        />
        {errorCodigo && <p className="text-rose-400 text-[12px] text-center mt-2.5 leading-relaxed">{errorCodigo}</p>}
        <button
          onClick={entrar}
          disabled={validando || !codigo.trim()}
          className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-35"
        >
          {validando ? 'Comprobando…' : 'Entrar'}
        </button>
        <p className="text-center text-paper/30 text-[11px] mt-4 leading-relaxed">
          Pedile el código a quien te registró en el sistema.
        </p>
      </div>
    </div>
  )
}

export default function Mozo() {
  const [garzon, setGarzon] = useState(() => leerGarzonGuardado())
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  const [mesa, setMesa] = useState(null) // { num, sector }
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState(null)

  // id de menu_items -> { qty, nota, item }
  const [cart, setCart] = useState({})

  const [sheetMesa, setSheetMesa] = useState(false)
  const [sheetCart, setSheetCart] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [toast, setToast] = useState(false)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      // Solo platos disponibles: no tiene sentido que el mozo pida algo agotado.
      const { data, error } = await supabase.from('menu_items').select('*').eq('available', true)
      if (error) {
        setErrorCarga(error.message)
        setItems([])
      } else {
        // Mismo orden que AdminProductos: categoría → orden manual (null al
        // final) → nombre como desempate.
        const ordenados = [...(data ?? [])].sort((a, b) => {
          if (a.category !== b.category) return (a.category ?? '').localeCompare(b.category ?? '', 'es')
          const oa = a.orden ?? 9999
          const ob = b.orden ?? 9999
          if (oa !== ob) return oa - ob
          return (a.name ?? '').localeCompare(b.name ?? '', 'es')
        })
        setItems(ordenados)
        if (ordenados.length) setCategoriaActiva(ordenados[0].category)
      }
      setCargando(false)
    }
    cargar()
  }, [])

  const categorias = useMemo(() => {
    const vistas = new Set()
    const list = []
    for (const i of items) {
      if (i.category && !vistas.has(i.category)) {
        vistas.add(i.category)
        list.push(i.category)
      }
    }
    return list
  }, [items])

  const q = busqueda.trim().toLowerCase()
  const grupos = useMemo(() => {
    if (q) {
      const encontrados = items.filter((i) => i.name?.toLowerCase().includes(q))
      return encontrados.length ? [{ nombre: 'Resultados', items: encontrados }] : []
    }
    return categoriaActiva ? [{ nombre: categoriaActiva, items: items.filter((i) => i.category === categoriaActiva) }] : []
  }, [q, items, categoriaActiva])

  const cartEntries = Object.entries(cart)
  const cartCount = cartEntries.reduce((s, [, c]) => s + c.qty, 0)
  const cartTotal = cartEntries.reduce((s, [, c]) => s + (Number(c.item.price_clp) || 0) * c.qty, 0)

  function agregar(item) {
    setCart((prev) => ({ ...prev, [item.id]: { qty: 1, nota: '', item } }))
  }
  function incrementar(id) {
    setCart((prev) => ({ ...prev, [id]: { ...prev[id], qty: prev[id].qty + 1 } }))
  }
  function decrementar(id) {
    setCart((prev) => {
      const actual = prev[id]
      if (!actual) return prev
      if (actual.qty <= 1) {
        const { [id]: _fuera, ...resto } = prev
        return resto
      }
      return { ...prev, [id]: { ...actual, qty: actual.qty - 1 } }
    })
  }
  function quitar(id) {
    setCart((prev) => {
      const { [id]: _fuera, ...resto } = prev
      return resto
    })
  }
  function setNota(id, nota) {
    setCart((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], nota } } : prev))
  }

  function elegirMesa(num, sector) {
    setMesa({ num, sector })
    setTimeout(() => setSheetMesa(false), 150)
  }

  function abrirCarritoOMesa() {
    if (!mesa) {
      setSheetMesa(true)
      return
    }
    setErrorEnvio('')
    setSheetCart(true)
  }

  async function enviarPedido() {
    if (!cartEntries.length) return
    if (!mesa) {
      setSheetCart(false)
      setSheetMesa(true)
      return
    }
    setEnviando(true)
    setErrorEnvio('')
    const payload = {
      mesa: String(mesa.num),
      sector: mesa.sector,
      garzon: garzon?.nombre || '',
      items: cartEntries.map(([, c]) => ({
        cant: c.qty,
        nombre: c.item.name,
        comentario: c.nota?.trim() || ''
      }))
    }
    try {
      const res = await fetch(KDS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const texto = await res.text().catch(() => '')
        throw new Error(texto || `Cocina respondió con error (${res.status})`)
      }
      const data = await res.json().catch(() => null)
      if (!data?.ok) throw new Error('Cocina no confirmó el pedido.')

      // Éxito: recién acá se limpia el carrito, nunca antes.
      setCart({})
      setSheetCart(false)
      setToast(true)
      setTimeout(() => setToast(false), 2200)
    } catch (err) {
      // Falla real: el carrito queda intacto para poder reintentar sin
      // volver a cargar todo el pedido a mano.
      setErrorEnvio(err.message || 'No se pudo enviar el pedido. Revisá la conexión e intentá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  function cambiarDeMozo() {
    try {
      localStorage.removeItem(GARZON_STORAGE_KEY)
    } catch {}
    setGarzon(null)
  }

  if (!garzon) {
    return <GateGarzon onEntrar={setGarzon} />
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <div className="max-w-md mx-auto min-h-screen relative flex flex-col">
        {/* ---- Header ---- */}
        <header className="sticky top-0 z-20 bg-ink px-4 pt-4 pb-2.5 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-[10px] tracking-[0.22em] text-gold uppercase">Varo's · Mozo</div>
            <button onClick={cambiarDeMozo} className="text-[10px] text-paper/35 underline">
              {garzon.nombre} · cambiar
            </button>
          </div>
          <button
            onClick={() => setSheetMesa(true)}
            className="w-full flex items-center justify-between bg-inkSoft border border-white/10 rounded-xl px-3.5 py-2.5"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-[9.5px] text-paper/40 uppercase tracking-wide">Mesa</span>
              <span className="font-head text-base font-semibold">
                {mesa ? `Mesa ${mesa.num} · ${mesa.sector}` : 'Elegir mesa'}
              </span>
            </span>
            <span className="text-gold text-xs">▾</span>
          </button>

          <div className="mt-2.5 flex items-center gap-2 bg-inkSoft border border-white/10 rounded-lg px-3 py-2">
            <IconoBuscar />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plato…"
              className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-paper/30"
            />
          </div>

          {!q && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoriaActiva(c)}
                  className={`shrink-0 text-xs font-medium px-3.5 py-1.5 rounded-full border whitespace-nowrap ${
                    c === categoriaActiva
                      ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink'
                      : 'bg-inkSoft border-white/10 text-paper/60'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ---- Lista de platos ---- */}
        <main className="flex-1 px-4 pt-3.5" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
          {cargando && <p className="text-center text-paper/35 text-xs py-10">Cargando el menú…</p>}
          {errorCarga && (
            <p className="text-center text-rose-400 text-xs py-6 leading-relaxed">
              No se pudo cargar el menú: {errorCarga}
            </p>
          )}
          {!cargando && !errorCarga && grupos.length === 0 && (
            <p className="text-center text-paper/35 text-xs py-10">
              {q ? 'No encontré ningún plato con ese nombre.' : 'No hay platos disponibles ahora mismo.'}
            </p>
          )}
          {!cargando &&
            grupos.map((g) => (
              <div key={g.nombre}>
                <div className="font-head text-[13px] font-semibold text-paper/60 mt-3.5 mb-1.5 first:mt-0">{g.nombre}</div>
                {g.items.map((item) => {
                  const enCarrito = cart[item.id]
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium truncate">{item.name}</div>
                        {item.description && (
                          <div className="text-[11.5px] text-paper/40 mt-0.5 leading-snug line-clamp-2">{item.description}</div>
                        )}
                        <div className="text-[12.5px] text-gold mt-1 tabular-nums">{formatCLP(item.price_clp)}</div>
                      </div>
                      {enCarrito ? (
                        <div className="shrink-0 flex items-center bg-gradient-to-br from-gold to-bronze rounded-lg overflow-hidden">
                          <button onClick={() => decrementar(item.id)} className="w-8 h-9 text-ink font-bold text-base">
                            −
                          </button>
                          <span className="w-5 text-center text-ink font-bold text-[13.5px] tabular-nums">{enCarrito.qty}</span>
                          <button onClick={() => incrementar(item.id)} className="w-8 h-9 text-ink font-bold text-base">
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => agregar(item)}
                          className="shrink-0 w-9 h-9 rounded-lg bg-inkSoft border border-white/10 text-gold text-lg font-semibold flex items-center justify-center"
                        >
                          +
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
        </main>

        {/* ---- Barra de carrito ---- */}
        <div
          className={`fixed left-0 right-0 z-30 flex justify-center px-3 transition-transform duration-300 ease-salida ${
            cartCount > 0 ? 'translate-y-0' : 'translate-y-[130%]'
          }`}
          style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={abrirCarritoOMesa}
            className="w-full max-w-[398px] flex items-center justify-between gap-3 bg-gradient-to-br from-gold to-bronze text-ink rounded-2xl px-4 py-3.5 shadow-glowGold"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span className="font-bold text-sm">{cartCount === 1 ? '1 plato' : `${cartCount} platos`}</span>
              <span className="text-xs opacity-75 tabular-nums">{formatCLP(cartTotal)}</span>
            </span>
            <span className="font-bold text-[13.5px]">Ver pedido ›</span>
          </button>
        </div>

        {/* ---- Scrim compartido ---- */}
        <div
          onClick={() => {
            setSheetMesa(false)
            setSheetCart(false)
          }}
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
            sheetMesa || sheetCart ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* ---- Sheet: elegir mesa ---- */}
        <div className={`fixed left-0 right-0 bottom-0 z-50 flex justify-center pointer-events-none`}>
          <div
            className={`w-full max-w-md bg-inkSoft border border-white/10 border-b-0 rounded-t-2xl px-4.5 pt-2 pointer-events-auto transition-transform duration-300 ease-salida max-h-[78vh] overflow-y-auto ${
              sheetMesa ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', paddingLeft: '18px', paddingRight: '18px' }}
          >
            <div className="w-9 h-1 rounded-full bg-white/15 mx-auto my-1.5" />
            <h2 className="font-head text-lg font-semibold mt-2 mb-3.5">Elegir mesa</h2>
            {SECTORES.map((g) => (
              <div key={g.sector} className="mb-4">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-paper/40 mb-2">{g.sector}</div>
                <div className="grid grid-cols-4 gap-2">
                  {g.nums.map((n) => {
                    const sel = mesa && mesa.num === n && mesa.sector === g.sector
                    return (
                      <button
                        key={n}
                        onClick={() => elegirMesa(n, g.sector)}
                        className={`aspect-square rounded-lg border font-semibold text-[15px] flex items-center justify-center ${
                          sel ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink' : 'bg-ink border-white/10 text-paper'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Sheet: revisión del pedido ---- */}
        <div className={`fixed left-0 right-0 bottom-0 z-50 flex justify-center pointer-events-none`}>
          <div
            className={`w-full max-w-md bg-inkSoft border border-white/10 border-b-0 rounded-t-2xl pointer-events-auto transition-transform duration-300 ease-salida max-h-[78vh] overflow-y-auto ${
              sheetCart ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', paddingLeft: '18px', paddingRight: '18px' }}
          >
            <div className="w-9 h-1 rounded-full bg-white/15 mx-auto my-1.5" />
            <h2 className="font-head text-lg font-semibold mt-2 mb-3.5">
              Pedido — {mesa ? `Mesa ${mesa.num} · ${mesa.sector}` : 'sin mesa'}
            </h2>

            {cartEntries.length === 0 ? (
              <p className="text-center text-paper/35 text-xs py-8">Todavía no agregaste ningún plato.</p>
            ) : (
              cartEntries.map(([id, c]) => (
                <div key={id} className="py-2.5 border-b border-white/5 last:border-b-0">
                  <div className="flex items-start justify-between gap-2.5">
                    <div>
                      <div className="font-semibold text-sm">
                        {c.qty} × {c.item.name}
                      </div>
                      <div className="text-[12.5px] text-paper/40 mt-0.5">
                        <span className="text-gold font-semibold tabular-nums">{formatCLP(c.item.price_clp * c.qty)}</span>
                      </div>
                    </div>
                    <button onClick={() => quitar(id)} className="shrink-0 text-paper/40 text-xs underline">
                      quitar
                    </button>
                  </div>
                  <input
                    value={c.nota}
                    onChange={(e) => setNota(id, e.target.value)}
                    placeholder="Nota para cocina (ej: sin cebolla)"
                    className="mt-1.5 w-full bg-ink border border-white/10 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-paper/30"
                  />
                </div>
              ))
            )}

            {!mesa && cartEntries.length > 0 && (
              <p className="text-rose-400 text-[11px] mt-3 leading-relaxed">Elegí la mesa antes de enviar el pedido.</p>
            )}
            {errorEnvio && <p className="text-rose-400 text-[11px] mt-3 leading-relaxed">No se pudo enviar: {errorEnvio}</p>}

            <div className="flex justify-between items-baseline pt-3.5 mt-1 border-t border-white/5">
              <span className="text-[12.5px] text-paper/40">Total</span>
              <span className="font-head text-xl font-semibold text-gold tabular-nums">{formatCLP(cartTotal)}</span>
            </div>

            <button
              onClick={enviarPedido}
              disabled={enviando || cartEntries.length === 0}
              className="w-full mt-3.5 py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-35"
            >
              {enviando ? 'Enviando…' : 'Enviar pedido a cocina'}
            </button>
          </div>
        </div>

        {/* ---- Toast de confirmación ---- */}
        <div
          className={`fixed left-1/2 top-4.5 z-[60] -translate-x-1/2 transition-transform duration-300 ${
            toast ? 'translate-y-0' : '-translate-y-[180%]'
          }`}
        >
          <div className="flex items-center gap-2.5 bg-[#16301F] border border-[#2C6B44] text-[#B9F0CB] rounded-xl px-4.5 py-3 font-semibold text-[13.5px] whitespace-nowrap shadow-lg">
            ✓ Pedido enviado a cocina
          </div>
        </div>
      </div>
    </div>
  )
}
