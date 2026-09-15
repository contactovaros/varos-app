import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { estadoNotificacionesGarzon, activarNotificacionesGarzon } from '../lib/pushNotifications'

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
const MENU_CATALOG_URL = 'https://varos-kds.varosnocturno.workers.dev/menu-catalog?k=797a0ed49a8623e452b03fc0'
const GARZON_STORAGE_KEY = 'varos_mozo_garzon'

// "Menú del Día" en menu_items es UN solo producto contenedor (sin
// Entrada/Principal/Postre propios) — el desglose real vive en el POS
// viejo y se scrapea al Worker vía /menu-catalog (mismo dato que usa el
// panel "Editar menú" del KDS). Sin esto, pedirlo desde /mozo no dejaba
// elegir el curso — el mozo tenía que escribirlo a mano en la nota.
const CURSOS_MENU_DIA = ['Entrada', 'Plato Principal', 'Postres y Tentaciones']

// Respaldo cuando /menu-catalog no tiene nada (el puente con gestion.php
// caído, o directamente sin usarlo — piloto "solo sistema nuevo" del
// 2026-09-15): parsea el mismo formato "Entrada: a, b, c" que ya escribe el
// admin en Descripción (ver AdminProductos.jsx) para que carta2.0 muestre el
// desglose. Reusa ese mismo texto en vez de pedir cargarlo dos veces.
const ALIAS_CURSO_MENU_DIA = {
  entrada: 'Entrada',
  'plato principal': 'Plato Principal',
  principal: 'Plato Principal',
  postre: 'Postres y Tentaciones',
  postres: 'Postres y Tentaciones',
  'postres y tentaciones': 'Postres y Tentaciones'
}

function parseCursosDeDescripcion(descripcion) {
  if (!descripcion) return null
  const porCurso = { Entrada: [], 'Plato Principal': [], 'Postres y Tentaciones': [] }
  let encontrado = false
  for (const linea of descripcion.split('\n')) {
    const m = linea.trim().match(/^([^:]{1,28}):\s*(.+)$/)
    if (!m) continue
    const curso = ALIAS_CURSO_MENU_DIA[m[1].trim().toLowerCase()]
    if (!curso) continue
    const opciones = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    if (opciones.length) {
      porCurso[curso].push(...opciones)
      encontrado = true
    }
  }
  return encontrado ? porCurso : null
}

const MESAS_POS_URL_TABLE = 'pos_mesas' // ver supabase/add_pos_mesas.sql y /admin/mesas-pos
// Antes había una numeración de mesas inventada acá mismo (placeholder). El
// usuario pidió sacarla: ahora la carga el propio restaurante en
// /admin/mesas-pos, y esta pantalla la lee en vivo (ver useEffect de mesas
// más abajo) — nunca más un número adivinado por Claude.

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
  const [avisoEstado, setAvisoEstado] = useState('desconocida')
  const [avisoError, setAvisoError] = useState('')
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
  // Qué sectores están desplegados en el selector de mesa — colapsados por
  // defecto (con varios sectores y 13+ mesas en Carpa, mostrar todo abierto
  // de una vez obligaba a scrollear demasiado).
  const [sectoresAbiertos, setSectoresAbiertos] = useState(() => new Set())
  function toggleSector(sector) {
    setSectoresAbiertos((prev) => {
      const next = new Set(prev)
      next.has(sector) ? next.delete(sector) : next.add(sector)
      return next
    })
  }
  // Al abrir el selector con una mesa ya elegida, desplegar su sector para
  // que se vea marcada sin tener que buscarla de nuevo.
  useEffect(() => {
    if (sheetMesa && mesa) setSectoresAbiertos((prev) => new Set(prev).add(mesa.sector))
  }, [sheetMesa]) // eslint-disable-line react-hooks/exhaustive-deps

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [toast, setToast] = useState(false)

  // Desglose real de Entrada/Principal/Postre del Menú del Día, scrapeado
  // del POS viejo (ver /menu-catalog en varos-kds). null mientras carga,
  // '' de error si el Worker no respondió.
  const [menuDiaOpciones, setMenuDiaOpciones] = useState(null)
  const [menuDiaError, setMenuDiaError] = useState('')
  const [menuDiaStale, setMenuDiaStale] = useState(false)
  const [sheetMenuDia, setSheetMenuDia] = useState(false)
  const [menuDiaItemActual, setMenuDiaItemActual] = useState(null)
  const [menuDiaSel, setMenuDiaSel] = useState({ Entrada: '', 'Plato Principal': '', 'Postres y Tentaciones': '' })
  const [menuDiaNota, setMenuDiaNota] = useState('')

  // Mesas reales por sector, cargadas desde /admin/mesas-pos (ver
  // supabase/add_pos_mesas.sql) — nunca inventadas acá.
  const [mesasPos, setMesasPos] = useState([])
  const [mesasCargando, setMesasCargando] = useState(true)
  const [mesasError, setMesasError] = useState('')

  useEffect(() => {
    async function cargarMesasPos() {
      setMesasCargando(true)
      const { data, error } = await supabase
        .from(MESAS_POS_URL_TABLE)
        .select('*')
        .eq('activa', true)
        .order('sector', { ascending: true })
        .order('orden', { ascending: true, nullsFirst: false })
      // numero NO se ordena en la base: es texto ("7B" tiene que poder existir),
      // así que un order() de Postgres lo deja alfabético (1,10,11,...,2,3). El
      // orden numérico real se hace client-side más abajo con localeCompare.
      if (error) {
        setMesasError(error.message)
        setMesasPos([])
      } else {
        setMesasPos(data ?? [])
      }
      setMesasCargando(false)
    }
    cargarMesasPos()
  }, [])

  const gruposMesas = useMemo(() => {
    const porSector = {}
    for (const m of mesasPos) {
      if (!porSector[m.sector]) porSector[m.sector] = []
      porSector[m.sector].push(m)
    }
    // Orden numérico real (1,2,3…13), no alfabético (1,10,11…2,3) — numero es
    // texto en la base para poder tener "7B" el día que haga falta.
    for (const lista of Object.values(porSector)) {
      lista.sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }))
    }
    return Object.entries(porSector).map(([sector, lista]) => ({ sector, mesas: lista }))
  }, [mesasPos])

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

  useEffect(() => {
    async function cargarMenuDia() {
      try {
        const res = await fetch(MENU_CATALOG_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const porCurso = { Entrada: [], 'Plato Principal': [], 'Postres y Tentaciones': [] }
        for (const it of data?.catalog?.enMenu ?? []) {
          if (porCurso[it.curso]) porCurso[it.curso].push(it.nombre)
        }
        setMenuDiaOpciones(porCurso)
        // El worker marca `stale` cuando el puente (userscript en la PC de
        // caja) lleva rato sin refrescar este catálogo — pasa siempre que el
        // restaurante está cerrado, y podría pasar en medio de un servicio
        // si el puente se cae. El garzón tiene que saberlo antes de ofrecer
        // estas opciones, no elegirlas a ciegas creyendo que son las de hoy.
        setMenuDiaStale(Boolean(data?.stale))
      } catch (err) {
        setMenuDiaError('No se pudo cargar el Menú del Día de hoy.')
      }
    }
    cargarMenuDia()
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

  // Menú del Día: no es un plato más — es un contenedor con Entrada/
  // Principal/Postre a elección, así que se guarda en el carrito con una
  // key propia (no item.id) para que dos combos distintos convivan como
  // líneas separadas, igual que en la comanda real.
  function abrirMenuDia(item) {
    setMenuDiaSel({ Entrada: '', 'Plato Principal': '', 'Postres y Tentaciones': '' })
    setMenuDiaNota('')
    setSheetMenuDia(true)
    setMenuDiaItemActual(item)
  }

  // Si /menu-catalog no trajo nada para ninguno de los 3 cursos (puente con
  // gestion.php caído, o ni siquiera en uso), se usa el desglose escrito a
  // mano en la Descripción del producto como respaldo — mismo texto que ya
  // lee carta2.0, no hay que cargarlo dos veces.
  const kdsMenuDiaVacio =
    !menuDiaOpciones || CURSOS_MENU_DIA.every((curso) => !(menuDiaOpciones[curso]?.length))
  const cursosDeRespaldo = useMemo(
    () => parseCursosDeDescripcion(menuDiaItemActual?.description),
    [menuDiaItemActual]
  )
  const usandoRespaldoMenuDia = kdsMenuDiaVacio && Boolean(cursosDeRespaldo)
  const menuDiaOpcionesEfectivas = usandoRespaldoMenuDia ? cursosDeRespaldo : menuDiaOpciones

  function confirmarMenuDia() {
    const { Entrada, 'Plato Principal': principal, 'Postres y Tentaciones': postre } = menuDiaSel
    if (!Entrada || !principal || !postre || !menuDiaItemActual) return
    const key = `menudia:${Entrada}|${principal}|${postre}`
    setCart((prev) => {
      const actual = prev[key]
      if (actual) return { ...prev, [key]: { ...actual, qty: actual.qty + 1 } }
      return {
        ...prev,
        [key]: {
          qty: 1,
          nota: menuDiaNota,
          item: menuDiaItemActual,
          menuChoice: { entrada: Entrada, principal, postre }
        }
      }
    })
    setSheetMenuDia(false)
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
        comentario: c.nota?.trim() || '',
        // Menú del Día: un `menus` por unidad pedida, mismo formato que ya
        // arma el bridge del PHP real (entrada/principal/postre elegidos).
        ...(c.menuChoice ? { menus: Array.from({ length: c.qty }, () => ({ ...c.menuChoice })) } : {})
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

  useEffect(() => {
    if (!garzon) return
    estadoNotificacionesGarzon(garzon.id).then(setAvisoEstado)
  }, [garzon])

  async function activarAvisos() {
    setAvisoError('')
    try {
      await activarNotificacionesGarzon(garzon.id)
      setAvisoEstado('activa')
    } catch (err) {
      setAvisoError(err.message || 'No se pudo activar el aviso.')
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
          {(avisoEstado === 'inactiva' || avisoEstado === 'desconocida') && (
            <button
              onClick={activarAvisos}
              className="w-full flex items-center justify-between bg-gold/10 border border-gold/30 rounded-xl px-3.5 py-2 mb-2"
            >
              <span className="text-[11.5px] text-gold">🔔 Avisarme cuando un plato esté listo</span>
              <span className="text-gold text-[11px] font-semibold">Activar</span>
            </button>
          )}
          {avisoError && <p className="text-rose-400 text-[10.5px] mb-2 leading-relaxed">{avisoError}</p>}
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
                  const esMenuDia = item.category === 'Menú del Día'
                  // El Menú del Día nunca usa el stepper +/− de acá: cada
                  // toque abre el selector de curso y puede crear una línea
                  // NUEVA (combo distinto) o sumarle 1 a una ya elegida —
                  // eso se resuelve dentro de confirmarMenuDia(), no acá.
                  const combosEnCarrito = esMenuDia
                    ? Object.values(cart).filter((c) => c.menuChoice).reduce((s, c) => s + c.qty, 0)
                    : 0
                  const enCarrito = !esMenuDia && cart[item.id]
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium truncate">{item.name}</div>
                        {item.description && (
                          <div className="text-[11.5px] text-paper/40 mt-0.5 leading-snug line-clamp-2">{item.description}</div>
                        )}
                        <div className="text-[12.5px] text-gold mt-1 tabular-nums">{formatCLP(item.price_clp)}</div>
                        {esMenuDia && combosEnCarrito > 0 && (
                          <div className="text-[11px] text-paper/40 mt-0.5">
                            {combosEnCarrito === 1 ? '1 en el pedido' : `${combosEnCarrito} en el pedido`}
                          </div>
                        )}
                      </div>
                      {esMenuDia ? (
                        <button
                          onClick={() => abrirMenuDia(item)}
                          disabled={!menuDiaOpciones}
                          className="shrink-0 w-9 h-9 rounded-lg bg-inkSoft border border-white/10 text-gold text-lg font-semibold flex items-center justify-center disabled:opacity-30"
                        >
                          +
                        </button>
                      ) : enCarrito ? (
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
            setSheetMenuDia(false)
          }}
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
            sheetMesa || sheetCart || sheetMenuDia ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
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
            {mesasCargando && <p className="text-center text-paper/35 text-xs py-8">Cargando mesas…</p>}
            {mesasError && (
              <p className="text-center text-rose-400 text-xs py-6 leading-relaxed">
                No se pudo cargar la lista de mesas: {mesasError}
              </p>
            )}
            {!mesasCargando && !mesasError && gruposMesas.length === 0 && (
              <p className="text-center text-paper/35 text-xs py-8 leading-relaxed">
                Todavía no hay mesas cargadas. Pedile a un admin que las agregue en /admin/mesas-pos.
              </p>
            )}
            {gruposMesas.map((g) => {
              const abierto = sectoresAbiertos.has(g.sector)
              const mesaElegidaAca = mesa && mesa.sector === g.sector ? mesa.num : null
              return (
              <div key={g.sector} className="mb-2.5 border-b border-white/5 pb-2.5 last:border-b-0">
                <button
                  onClick={() => toggleSector(g.sector)}
                  className="w-full flex items-center justify-between py-1.5"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide text-paper/60">
                    {g.sector}
                    {mesaElegidaAca && <span className="text-gold normal-case tracking-normal font-medium"> · Mesa {mesaElegidaAca}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-paper/35">{g.mesas.length} mesas</span>
                    <span className={`text-gold text-xs transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
                  </span>
                </button>
                {abierto && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {g.mesas.map((m) => {
                    const sel = mesa && mesa.num === m.numero && mesa.sector === g.sector
                    return (
                      <button
                        key={m.id}
                        onClick={() => elegirMesa(m.numero, g.sector)}
                        className={`aspect-square rounded-lg border font-semibold text-[15px] flex items-center justify-center ${
                          sel ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink' : 'bg-ink border-white/10 text-paper'
                        }`}
                      >
                        {m.numero}
                      </button>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
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
                      {c.menuChoice && (
                        <div className="text-[11.5px] text-paper/50 mt-0.5 leading-snug">
                          {c.menuChoice.entrada} · {c.menuChoice.principal} · {c.menuChoice.postre}
                        </div>
                      )}
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

        {/* ---- Sheet: elegir curso del Menú del Día ---- */}
        <div className={`fixed left-0 right-0 bottom-0 z-50 flex justify-center pointer-events-none`}>
          <div
            className={`w-full max-w-md bg-inkSoft border border-white/10 border-b-0 rounded-t-2xl px-4.5 pt-2 pointer-events-auto transition-transform duration-300 ease-salida max-h-[78vh] overflow-y-auto ${
              sheetMenuDia ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', paddingLeft: '18px', paddingRight: '18px' }}
          >
            <div className="w-9 h-1 rounded-full bg-white/15 mx-auto my-1.5" />
            <h2 className="font-head text-lg font-semibold mt-2 mb-1">Menú del Día</h2>
            <p className="text-[11px] text-paper/40 mb-3.5">Elegí un curso de cada uno.</p>

            {usandoRespaldoMenuDia ? (
              <p className="text-[11.5px] text-diamond bg-diamond/10 border border-diamond/25 rounded-lg px-3 py-2 mb-3.5 leading-relaxed">
                ℹ️ Sin conexión con gestion.php — usando el desglose cargado a mano en Productos.
              </p>
            ) : (
              menuDiaStale && (
                <p className="text-[11.5px] text-amber-400 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 mb-3.5 leading-relaxed">
                  ⚠ Este listado podría no ser el de hoy — confirmá con cocina antes de ofrecerlo.
                </p>
              )
            )}

            {menuDiaError && !cursosDeRespaldo && <p className="text-rose-400 text-xs py-4">{menuDiaError}</p>}

            {menuDiaOpcionesEfectivas &&
              CURSOS_MENU_DIA.map((curso) => (
                <div key={curso} className="mb-4">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-paper/40 mb-2">{curso}</div>
                  <div className="flex flex-col gap-1.5">
                    {(menuDiaOpcionesEfectivas[curso] || []).map((nombre) => {
                      const sel = menuDiaSel[curso] === nombre
                      return (
                        <button
                          key={nombre}
                          onClick={() => setMenuDiaSel((prev) => ({ ...prev, [curso]: nombre }))}
                          className={`text-left px-3.5 py-2.5 rounded-lg border text-[13px] ${
                            sel ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink font-semibold' : 'bg-ink border-white/10 text-paper'
                          }`}
                        >
                          {nombre}
                        </button>
                      )
                    })}
                    {menuDiaOpcionesEfectivas[curso]?.length === 0 && (
                      <p className="text-paper/30 text-[11px] py-1">Sin opciones cargadas para este curso hoy.</p>
                    )}
                  </div>
                </div>
              ))}

            <input
              value={menuDiaNota}
              onChange={(e) => setMenuDiaNota(e.target.value)}
              placeholder="Nota para cocina (ej: sin palta)"
              className="w-full bg-ink border border-white/10 rounded-lg px-2.5 py-2 text-[12.5px] outline-none placeholder:text-paper/30 mb-3.5"
            />

            <button
              onClick={confirmarMenuDia}
              disabled={!menuDiaSel.Entrada || !menuDiaSel['Plato Principal'] || !menuDiaSel['Postres y Tentaciones']}
              className="w-full py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-35"
            >
              Agregar al pedido
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
