import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { estadoNotificacionesGarzon, activarNotificacionesGarzon } from '../lib/pushNotifications'
import ReciboBoleta from '../components/ReciboBoleta.jsx'
import { perfilDePlato, detectarPerfil, armarRecomendacion } from '../data/maridaje.js'

// Mismas categorías de bebida que usa /sommelier (ver Sommelier.jsx) — se
// duplican acá en vez de importarlas para no acoplar esta pantalla a esa
// (la están retocando en paralelo). Sirven para no ofrecer "vino para el
// vino": la sugerencia del sommelier solo se dispara al agregar comida.
const CATEGORIA_VINOS_MOZO = 'VINOS & ESPUMANTES'
const CATEGORIAS_BAR_MOZO = ['NUESTRO BAR', 'MOCKTAILS (SIN ALCOHOL)']
const CATEGORIAS_BEBIDA_MOZO = [CATEGORIA_VINOS_MOZO, ...CATEGORIAS_BAR_MOZO]

// Pantalla del mozo — reemplazo del POS viejo (varos.cl/gestion). Desde el
// 2026-09-16 (decisión explícita del usuario) opera solo con este sistema,
// sin depender del puente con gestion.php — ver varos-pos/DECISIONES.md,
// "Reemplazo de Comandas (fase 1, sin Caja) · 2026-09-11".
//
// Sin login de Google a propósito (decisión del usuario, 2026-09-12): el
// candado es un código corto por garzón, generado en /admin/garzones
// (tabla `garzones` + RPC `validar_codigo_garzon`), no una cuenta. Se pide
// una sola vez por celular y queda guardado en localStorage — cada mozo usa
// su propio teléfono, así que no hace falta volver a pedirlo cada vez.
const KDS_URL = 'https://varos-kds.varosnocturno.workers.dev/pedido-nuevo?k=797a0ed49a8623e452b03fc0'
const KDS_EDITAR_URL = 'https://varos-kds.varosnocturno.workers.dev/pedido-nuevo-editar?k=797a0ed49a8623e452b03fc0'
const KDS_DETALLE_URL = 'https://varos-kds.varosnocturno.workers.dev/pedido-nuevo-detalle?k=797a0ed49a8623e452b03fc0'
const KDS_CERRAR_MESA_URL = 'https://varos-kds.varosnocturno.workers.dev/cerrar-mesa?k=797a0ed49a8623e452b03fc0'
const KDS_STATE_URL = 'https://varos-kds.varosnocturno.workers.dev/state?k=797a0ed49a8623e452b03fc0'

const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' }
]
const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' }
function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[áéíóúñ]/g, (c) => SIN_TILDE[c])
    .replace(/^[-+*\s]+/, '')
    .trim()
}
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

// Antes, si el garzón refrescaba la página a mitad de armar un pedido (sin
// querer, o porque el celular se quedó sin batería y se prendió de nuevo),
// se perdía todo — el carrito solo vivía en memoria hasta tocar "Enviar".
// Se guarda en el propio celular (no en el servidor: es un borrador, todavía
// no es un pedido real) y se restaura solo al volver a abrir /mozo.
const PEDIDO_EN_CURSO_KEY = 'varos_mozo_pedido_en_curso'

function leerPedidoEnCurso() {
  try {
    const raw = localStorage.getItem(PEDIDO_EN_CURSO_KEY)
    if (!raw) return { mesa: null, cart: {} }
    const p = JSON.parse(raw)
    return { mesa: p?.mesa ?? null, cart: p?.cart ?? {} }
  } catch {
    return { mesa: null, cart: {} }
  }
}

function guardarPedidoEnCurso(mesa, cart) {
  try {
    // Nada que guardar: no ensuciar el localStorage con un borrador vacío.
    if (!mesa && Object.keys(cart).length === 0) {
      localStorage.removeItem(PEDIDO_EN_CURSO_KEY)
      return
    }
    localStorage.setItem(PEDIDO_EN_CURSO_KEY, JSON.stringify({ mesa, cart }))
  } catch {
    // localStorage lleno o bloqueado (modo privado) — el pedido sigue
    // funcionando en memoria, solo no sobrevive a un refresh. No es motivo
    // para romper el flujo de tomar el pedido.
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
    // El código se guarda también (no solo id/nombre) porque la RPC de
    // cobro (registrar_cobro_garzon) lo revalida en cada cobro — es la única
    // forma de que un garzón sin sesión real pueda escribir en pos_cobros de
    // forma segura. Garzones que ya habían entrado ANTES de este cambio no
    // van a tener `codigo` guardado hasta que vuelvan a entrar una vez
    // ("cambiar" arriba a la derecha) — mientras tanto pueden seguir
    // pidiendo normal, solo no van a poder cobrar hasta relogearse.
    const guardado = { id: garzon.id, nombre: garzon.nombre, codigo: limpio }
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

  const [mesa, setMesa] = useState(() => leerPedidoEnCurso().mesa) // { num, sector }
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState(null)

  // id de menu_items -> { qty, nota, item }
  const [cart, setCart] = useState(() => leerPedidoEnCurso().cart)

  // Persiste el borrador a cada cambio — así un refresh accidental (o el
  // celular quedándose sin batería) no borra un pedido a mitad de armar.
  useEffect(() => {
    guardarPedidoEnCurso(mesa, cart)
  }, [mesa, cart])

  // Qué mesas ya tienen un pedido pendiente en cocina — antes el garzón
  // elegía la mesa a ciegas, sin saber si ya estaba ocupada por otro pedido
  // (propio o de otro garzón). Mismo mecanismo que ya se agregó a
  // /admin/caja: se lee el mismo /state del KDS, sin duplicar nada.
  const [mesasPendientes, setMesasPendientes] = useState(() => new Set())
  // Detalle real de lo ya pedido por mesa — antes el garzón solo sabía QUE
  // había algo pendiente (el punto dorado), no QUÉ era. Mismo /state, una
  // sola pasada: se agrupan los items de todas las comandas de una mesa
  // (puede haber más de una si el cliente pidió por rondas) sumando
  // cantidades de un mismo plato.
  const [pedidosPorMesa, setPedidosPorMesa] = useState(() => new Map())
  // Lista de comandas SIN fusionar por mesa (id, hora, si se puede editar) —
  // para la pantalla de Comandas, que edita una comanda puntual, no el
  // agregado. `pedidosPorMesa` de arriba sigue siendo el resumen fusionado
  // que ya usa el panel "Ya pedido en esta mesa".
  const [comandasPorMesa, setComandasPorMesa] = useState(() => new Map())
  useEffect(() => {
    let cancelado = false
    async function cargarPendientes() {
      try {
        const res = await fetch(KDS_STATE_URL)
        if (!res.ok) return
        const data = await res.json()
        const comandasBase = (data.comandas || []).filter((c) => (c.items || []).length > 0)

        // /state le saca las bebidas a los items a propósito (es la vista que
        // arma la pantalla de cocina, a la que no le importan los tragos) —
        // "Ya pedido en esta mesa" y la pantalla de Comandas sí necesitan ver
        // TODO lo pedido, bar incluido (pedido explícito, 2026-09-16). Mismo
        // mecanismo que ya usa /admin/caja al cobrar: para las comandas "N-"
        // se pide el detalle sin filtrar; las que vienen del puente con
        // gestion.php no tienen ese endpoint todavía (limitación conocida).
        const comandasConItems = await Promise.all(
          comandasBase.map(async (c) => {
            if (!c.id.startsWith('N-')) return c
            try {
              const r = await fetch(`${KDS_DETALLE_URL}&id=${encodeURIComponent(c.id)}`)
              if (!r.ok) return c
              const detalle = await r.json()
              return { ...c, items: detalle.items || c.items }
            } catch {
              return c
            }
          })
        )
        const claves = new Set(comandasConItems.map((c) => `${c.mesa}|${c.sector}`))

        const porMesa = new Map()
        const listaPorMesa = new Map()
        for (const c of comandasConItems) {
          const key = `${c.mesa}|${c.sector}`
          const acumulado = porMesa.get(key) || []
          for (const it of c.items) {
            const nombre = it.menus?.length ? 'Menú del Día' : it.nombre
            const existente = acumulado.find((x) => x.nombre === nombre)
            if (existente) existente.cant += Number(it.cant) || 1
            else acumulado.push({ nombre, cant: Number(it.cant) || 1 })
          }
          porMesa.set(key, acumulado)

          const lista = listaPorMesa.get(key) || []
          lista.push({
            id: c.id,
            mesa: c.mesa,
            sector: c.sector,
            hora: c.hora,
            garzon: c.garzon,
            editable: c.id.startsWith('N-'),
            cantItems: c.items.reduce((s, it) => s + (Number(it.cant) || 1), 0)
          })
          listaPorMesa.set(key, lista)
        }

        if (!cancelado) {
          setMesasPendientes(claves)
          setPedidosPorMesa(porMesa)
          setComandasPorMesa(listaPorMesa)
        }
      } catch {
        // silencioso — es una ayuda visual, no crítica
      }
    }
    cargarPendientes()
    const id = setInterval(cargarPendientes, 20000)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [])

  const [sheetMesa, setSheetMesa] = useState(false)
  const [sheetCart, setSheetCart] = useState(false)

  // Pantalla de Comandas: ver y editar (agrandar/achicar) los pedidos ya
  // enviados de cualquier mesa. Pedido explícito (2026-09-15): antes no había
  // forma de tocar un pedido una vez mandado, solo de crear uno nuevo.
  const [sheetComandas, setSheetComandas] = useState(false)
  const [sectoresComandasAbiertos, setSectoresComandasAbiertos] = useState(() => new Set())
  const [comandaEditando, setComandaEditando] = useState(null) // { id, mesa, sector, items } sin filtrar
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  async function abrirComandaParaEditar(id) {
    setErrorDetalle('')
    setCargandoDetalle(true)
    setComandaEditando(null)
    try {
      const res = await fetch(`${KDS_DETALLE_URL}&id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(await res.text().catch(() => 'No se pudo cargar el pedido'))
      const data = await res.json()
      setComandaEditando({
        id: data.id,
        mesa: data.mesa,
        sector: data.sector,
        // clonado para poder tocar cantidades sin mutar la respuesta original
        items: (data.items || []).map((it) => ({ ...it }))
      })
    } catch (err) {
      setErrorDetalle('No se pudo cargar el pedido: ' + err.message)
    } finally {
      setCargandoDetalle(false)
    }
  }

  function cambiarCantEnEdicion(idx, delta) {
    setComandaEditando((prev) => {
      if (!prev) return prev
      const items = prev.items
        .map((it, i) => (i === idx ? { ...it, cant: it.cant + delta } : it))
        .filter((it) => it.cant > 0)
      return { ...prev, items }
    })
  }

  function quitarDeEdicion(idx) {
    setComandaEditando((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev))
  }

  async function guardarEdicion() {
    if (!comandaEditando) return
    setGuardandoEdicion(true)
    setErrorEdicion('')
    try {
      const res = await fetch(KDS_EDITAR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comandaEditando.id, items: comandaEditando.items })
      })
      if (!res.ok) throw new Error(await res.text().catch(() => 'No se pudo guardar'))
      setComandaEditando(null)
    } catch (err) {
      setErrorEdicion('No se pudo guardar: ' + err.message)
    } finally {
      setGuardandoEdicion(false)
    }
  }

  function toggleSectorComandas(sector) {
    setSectoresComandasAbiertos((prev) => {
      const next = new Set(prev)
      next.has(sector) ? next.delete(sector) : next.add(sector)
      return next
    })
  }

  // Cobrar una mesa, sin cuenta de Google — pedido explícito (2026-09-15).
  // Pasa por la RPC registrar_cobro_garzon (ver
  // supabase/add_registrar_cobro_garzon.sql), que revalida el código del
  // garzón adentro y recién ahí escribe en pos_cobros (RLS normal exige
  // admin; la RPC corre security definer). Mismo criterio de precio que
  // /admin/caja: Menú del Día usa su propio precio de contenedor, el resto
  // busca por nombre en el catálogo ya cargado — y ya trae los items SIN
  // filtrar (mismo /pedido-nuevo-detalle del editor), así que las bebidas sí
  // se cobran (bug ya encontrado y arreglado también en /admin/caja).
  const [mesaCobrando, setMesaCobrando] = useState(null) // { num, sector }
  const [comandasCobro, setComandasCobro] = useState([]) // items sin filtrar, todas las comandas de la mesa
  const [cargandoCobro, setCargandoCobro] = useState(false)
  const [errorCargaCobro, setErrorCargaCobro] = useState('')
  const [medioPagoCobro, setMedioPagoCobro] = useState('efectivo')
  const [totalManualCobro, setTotalManualCobro] = useState('')
  const [cobrando, setCobrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState('')
  const [toastCobro, setToastCobro] = useState('')
  const [reciboImprimir, setReciboImprimir] = useState(null) // boleta a mostrar/imprimir tras cobrar

  const precioMenuDia = useMemo(
    () => items.find((i) => i.category === 'Menú del Día')?.price_clp || 0,
    [items]
  )
  const mapaPreciosCobro = useMemo(() => {
    const m = new Map()
    for (const it of items) m.set(normalizarNombre(it.name), it.price_clp)
    return m
  }, [items])

  async function abrirCobro(num, sector) {
    setMesaCobrando({ num, sector })
    setErrorCargaCobro('')
    setErrorCobro('')
    setTotalManualCobro('')
    setPropinaActiva(true)
    setCargandoCobro(true)
    setComandasCobro([])
    try {
      const lista = comandasPorMesa.get(`${num}|${sector}`) || []
      const completas = await Promise.all(
        lista.map(async (c) => {
          if (!c.editable) return { ...c, items: [], sinFiltrar: false }
          const r = await fetch(`${KDS_DETALLE_URL}&id=${encodeURIComponent(c.id)}`)
          if (!r.ok) return { ...c, items: [], sinFiltrar: false }
          const detalle = await r.json()
          return { ...c, items: detalle.items || [], sinFiltrar: true }
        })
      )
      setComandasCobro(completas)
    } catch (err) {
      setErrorCargaCobro('No se pudo cargar el pedido: ' + err.message)
    } finally {
      setCargandoCobro(false)
    }
  }

  const lineasCobro = useMemo(() => {
    const out = []
    for (const c of comandasCobro) {
      for (const it of c.items || []) {
        const esMenuDia = Array.isArray(it.menus) && it.menus.length > 0
        const precioUnit = esMenuDia ? precioMenuDia : mapaPreciosCobro.get(normalizarNombre(it.nombre))
        out.push({
          nombre: it.nombre,
          cant: it.cant,
          precioUnit: precioUnit ?? null,
          subtotal: precioUnit != null ? precioUnit * it.cant : null
        })
      }
    }
    return out
  }, [comandasCobro, precioMenuDia, mapaPreciosCobro])

  const hayComandaSinFiltrar = comandasCobro.some((c) => !c.sinFiltrar)
  const totalCalculadoCobro = useMemo(
    () => lineasCobro.reduce((s, l) => s + (l.subtotal ?? 0), 0),
    [lineasCobro]
  )
  const hayLineasSinPrecioCobro = lineasCobro.some((l) => l.subtotal == null)

  // Propina sugerida del 10% sobre el subtotal — pedido explícito
  // (2026-09-15). "Sugerida" = viene activada por defecto (así se ofrece en
  // el local), pero el garzón la puede sacar con un toque si el cliente no
  // quiere dejarla. Se calcula sobre el subtotal de los ítems, nunca sobre
  // un total editado a mano (si el garzón ya está corrigiendo el total a
  // mano, esa cifra manda entera, la propina no se le vuelve a sumar
  // encima).
  const [propinaActiva, setPropinaActiva] = useState(true)
  const propinaSugerida = Math.round(totalCalculadoCobro * 0.1)
  const totalConPropina = totalCalculadoCobro + (propinaActiva ? propinaSugerida : 0)
  const totalFinalCobro = totalManualCobro !== '' ? Number(totalManualCobro) : totalConPropina

  async function confirmarCobro() {
    if (!mesaCobrando || !lineasCobro.length || !totalFinalCobro) return
    if (!garzon.codigo) {
      setErrorCobro('Tu sesión es de antes de este cambio — tocá "cambiar" arriba y volvé a entrar con tu código para poder cobrar.')
      return
    }
    setCobrando(true)
    setErrorCobro('')
    try {
      const itemsCobro = lineasCobro.map(({ nombre, cant, precioUnit }) => ({ nombre, cant, precioUnit }))
      const { data: cobroId, error } = await supabase.rpc('registrar_cobro_garzon', {
        p_codigo: garzon.codigo,
        p_mesa: String(mesaCobrando.num),
        p_sector: mesaCobrando.sector,
        p_items: itemsCobro,
        p_total: totalFinalCobro,
        p_medio_pago: medioPagoCobro
      })
      if (error) throw error
      try {
        await fetch(KDS_CERRAR_MESA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesa: String(mesaCobrando.num), sector: mesaCobrando.sector })
        })
      } catch {
        // el cobro ya quedó registrado aunque falle el cierre en el KDS
      }
      setToastCobro(`Mesa ${mesaCobrando.num} cobrada — ${formatCLP(totalFinalCobro)}`)
      setTimeout(() => setToastCobro(''), 2500)
      // Imprimir al cobrar, sin pasos extra -- pedido explícito
      // (2026-09-16): "el botón de cobrar debiese imprimir". Si el celular
      // del garzón no tiene impresora conectada, esta pantalla igual sirve
      // de comprobante en el momento; donde sí hay impresora (la PC de
      // caja) el botón "Imprimir boleta" imprime de verdad.
      setReciboImprimir({
        id: cobroId,
        mesa: String(mesaCobrando.num),
        sector: mesaCobrando.sector,
        garzon: garzon.nombre,
        items: itemsCobro,
        total: totalFinalCobro,
        medioPagoLabel: MEDIOS_PAGO.find((m) => m.value === medioPagoCobro)?.label || medioPagoCobro,
        created_at: new Date().toISOString()
      })
      setMesaCobrando(null)
      setComandasCobro([])
    } catch (err) {
      setErrorCobro('No se pudo registrar el cobro: ' + (err.message || 'error desconocido'))
    } finally {
      setCobrando(false)
    }
  }
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

  // Vinos/bar reales ya cargados en `items` (mismo fetch que la carta del
  // mozo) — nada nuevo que traer de Supabase, solo separar por categoría
  // para pasárselo al motor de maridaje (src/data/maridaje.js).
  const vinosParaSommelier = useMemo(() => items.filter((i) => i.category === CATEGORIA_VINOS_MOZO), [items])
  const bebidasBarParaSommelier = useMemo(
    () => items.filter((i) => CATEGORIAS_BAR_MOZO.includes(i.category)),
    [items]
  )

  // Sugerencia del sommelier al agregar un plato — no bloqueante (ver
  // pedido del dueño, 2026-09-17): un banner chico cerca de la barra de
  // carrito, nunca un modal. Si el motor no encuentra nada relevante para
  // el nombre del plato, no se muestra nada (ni fallback genérico).
  const [sugerenciaSommelier, setSugerenciaSommelier] = useState(null)

  // Acepta un plato real de `items` (name + category, para usar el mapeo
  // exacto de maridaje.js vía perfilDePlato) o directamente un nombre suelto
  // (ej. el curso elegido del Menú del Día, que no tiene category propia —
  // ver confirmarMenuDia más abajo). NIÑOS y GUARNICIONES quedan afuera del
  // maridaje (perfilDePlato ya las excluye cuando llega un objeto con
  // category; un string suelto no puede pertenecer a esas categorías).
  function sugerirBebidaPara(platoOrNombre) {
    if (!platoOrNombre) return
    const perfil =
      typeof platoOrNombre === 'string' ? detectarPerfil(platoOrNombre) : perfilDePlato(platoOrNombre)
    if (!perfil) return
    const recomendacion = armarRecomendacion(perfil, vinosParaSommelier, bebidasBarParaSommelier)
    if (!recomendacion?.vino && !recomendacion?.alternativaBar) return
    const nombrePlato = typeof platoOrNombre === 'string' ? platoOrNombre : platoOrNombre.name
    setSugerenciaSommelier({ plato: nombrePlato, perfil, recomendacion })
  }

  function agregarBebidaSugerida(nombreBebida) {
    const bebida = items.find((i) => i.name === nombreBebida)
    if (!bebida) return
    agregar(bebida)
    setSugerenciaSommelier(null)
  }

  // Se retira sola a los 9s para no acumularse en pantalla si el mozo sigue
  // agregando platos sin prestarle atención — no es bloqueante, así que no
  // hace falta que la cierre a mano.
  useEffect(() => {
    if (!sugerenciaSommelier) return
    const t = setTimeout(() => setSugerenciaSommelier(null), 9000)
    return () => clearTimeout(t)
  }, [sugerenciaSommelier])

  // Sin mesa elegida no se puede armar pedido — pedido explícito
  // (2026-09-16): antes se podía ir agregando platos al carrito sin haber
  // elegido mesa todavía, y recién se pedía la mesa al tocar "Enviar".
  function agregar(item) {
    if (!mesa) {
      setSheetMesa(true)
      return
    }
    setCart((prev) => ({ ...prev, [item.id]: { qty: 1, nota: '', item } }))
    // Solo comida dispara la sugerencia — ofrecer vino para el vino mismo
    // no tiene sentido (ver CATEGORIAS_BEBIDA_MOZO más arriba). NIÑOS y
    // GUARNICIONES tampoco disparan nada: perfilDePlato() las excluye
    // adentro (ver CATEGORIAS_SIN_MARIDAJE en maridaje.js).
    if (!CATEGORIAS_BEBIDA_MOZO.includes(item.category)) {
      sugerirBebidaPara(item)
    }
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
    if (!mesa) {
      setSheetMesa(true)
      return
    }
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
    // El Menú del Día también puede tener un plato principal mapeado por el
    // motor de maridaje (ej. "Lomo Saltado" como principal del combo) — se
    // sugiere igual que con un plato suelto.
    sugerirBebidaPara(principal)
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
    const nuevosItems = cartEntries.map(([, c]) => ({
      cant: c.qty,
      nombre: c.item.name,
      comentario: c.nota?.trim() || '',
      // Menú del Día: un `menus` por unidad pedida, mismo formato que ya
      // arma el bridge del PHP real (entrada/principal/postre elegidos).
      ...(c.menuChoice ? { menus: Array.from({ length: c.qty }, () => ({ ...c.menuChoice })) } : {})
    }))
    try {
      // Si esta mesa ya tiene una comanda propia abierta (nacida en /mozo),
      // el pedido nuevo se suma a esa en vez de abrir un ticket aparte —
      // pedido explícito (2026-09-16): antes cada "Enviar" creaba una
      // comanda nueva para la misma mesa y quedaban dos tickets sueltos
      // donde debía haber uno solo. Las comandas que vienen del puente con
      // gestion.php no son editables acá (mismo motivo de siempre), así que
      // si solo hay una de esas, igual se crea una comanda nueva propia.
      const clave = `${mesa.num}|${mesa.sector}`
      const comandaExistente = (comandasPorMesa.get(clave) || []).find((c) => c.editable)

      if (comandaExistente) {
        const detalleRes = await fetch(`${KDS_DETALLE_URL}&id=${encodeURIComponent(comandaExistente.id)}`)
        if (!detalleRes.ok) throw new Error('No se pudo leer el pedido que ya tenía esta mesa.')
        const detalle = await detalleRes.json()
        const res = await fetch(KDS_EDITAR_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: comandaExistente.id, items: [...(detalle.items || []), ...nuevosItems] })
        })
        if (!res.ok) {
          const texto = await res.text().catch(() => '')
          throw new Error(texto || `Cocina respondió con error (${res.status})`)
        }
      } else {
        const payload = { mesa: String(mesa.num), sector: mesa.sector, garzon: garzon?.nombre || '', items: nuevosItems }
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
      }

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

          {mesa && pedidosPorMesa.get(`${mesa.num}|${mesa.sector}`)?.length > 0 && (
            <div className="mt-2 bg-gold/10 border border-gold/25 rounded-lg px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-gold/70 font-semibold mb-1.5">
                Ya pedido en esta mesa
              </div>
              <div className="flex flex-col gap-0.5">
                {pedidosPorMesa.get(`${mesa.num}|${mesa.sector}`).map((it, i) => (
                  <div key={i} className="text-[12px] text-paper/75">
                    <span className="text-gold font-mono">{it.cant}×</span> {it.nombre}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Botón de Comandas: a propósito debajo de las pestañas de
              categoría, no arriba de todo — pedido explícito (2026-09-15)
              para que no compita por espacio con la identidad/mesa/aviso, y
              sigue fijo igual (todo este <header> es sticky), así que nunca
              hay que volver a scrollear arriba para llegar a él. */}
          <button
            onClick={() => setSheetComandas(true)}
            className="w-full flex items-center justify-between bg-inkSoft border border-gold/25 rounded-xl px-3.5 py-2 mt-2.5"
          >
            <span className="text-[11.5px] text-gold font-head font-medium">🧾 Comandas — ver y editar pedidos</span>
            {mesasPendientes.size > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-ink text-[10px] font-bold">
                {mesasPendientes.size}
              </span>
            )}
          </button>
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

        {/* ---- Sugerencia del sommelier (no bloqueante) ---- */}
        {sugerenciaSommelier && (
          <div
            className="fixed left-0 right-0 z-40 flex justify-center px-3 transition-all duration-300 ease-salida"
            style={{
              bottom: cartCount > 0 ? 'calc(78px + env(safe-area-inset-bottom, 0px))' : 'calc(12px + env(safe-area-inset-bottom, 0px))'
            }}
          >
            <div className="w-full max-w-[398px] bg-inkSoft border border-gold/25 rounded-2xl px-3.5 py-3 shadow-lg flex items-center gap-2.5">
              <span className="shrink-0 text-lg leading-none">🍷</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-diamond/70 mb-0.5 truncate">
                  Para {sugerenciaSommelier.plato}
                </p>
                {sugerenciaSommelier.recomendacion.vino && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif italic text-paper/90 text-[12.5px] truncate">
                      {sugerenciaSommelier.recomendacion.vino.name}
                    </span>
                    <span className="font-mono text-[11px] text-gold whitespace-nowrap shrink-0 tabular-nums">
                      {formatCLP(sugerenciaSommelier.recomendacion.vino.price_clp)}
                    </span>
                  </div>
                )}
                {!sugerenciaSommelier.recomendacion.vino && sugerenciaSommelier.recomendacion.alternativaBar && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif italic text-paper/90 text-[12.5px] truncate">
                      {sugerenciaSommelier.recomendacion.alternativaBar.item.name}
                    </span>
                    <span className="font-mono text-[11px] text-gold whitespace-nowrap shrink-0 tabular-nums">
                      {formatCLP(sugerenciaSommelier.recomendacion.alternativaBar.item.price_clp)}
                    </span>
                  </div>
                )}
              </div>
              {(sugerenciaSommelier.recomendacion.vino || sugerenciaSommelier.recomendacion.alternativaBar) && (
                <button
                  onClick={() =>
                    agregarBebidaSugerida(
                      (sugerenciaSommelier.recomendacion.vino || sugerenciaSommelier.recomendacion.alternativaBar.item).name
                    )
                  }
                  className="shrink-0 text-[11px] font-bold px-3 py-2 rounded-lg bg-gradient-to-br from-gold to-bronze text-ink whitespace-nowrap"
                >
                  + Agregar
                </button>
              )}
              <button
                onClick={() => setSugerenciaSommelier(null)}
                className="shrink-0 text-paper/40 text-base leading-none px-0.5"
                aria-label="Cerrar sugerencia"
              >
                ×
              </button>
            </div>
          </div>
        )}

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

        {/* ---- Sheet: Comandas (ver y editar pedidos ya enviados) ---- */}
        <div className="fixed left-0 right-0 bottom-0 z-50 flex justify-center pointer-events-none">
          <div
            className={`w-full max-w-md bg-inkSoft border border-white/10 border-b-0 rounded-t-2xl px-4.5 pt-2 pointer-events-auto transition-transform duration-300 ease-salida max-h-[85vh] overflow-y-auto ${
              sheetComandas ? 'translate-y-0' : 'translate-y-full'
            }`}
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', paddingLeft: '18px', paddingRight: '18px' }}
          >
            <div className="w-9 h-1 rounded-full bg-white/15 mx-auto my-1.5" />
            {mesaCobrando ? (
              <>
                <button
                  onClick={() => {
                    setMesaCobrando(null)
                    setComandasCobro([])
                  }}
                  className="text-paper/60 text-sm font-medium mt-2 mb-2 underline"
                >
                  ← volver a Comandas
                </button>
                <h2 className="font-head text-lg font-semibold mb-1">
                  Cobrar Mesa {mesaCobrando.num} · {mesaCobrando.sector}
                </h2>
                {cargandoCobro && <p className="text-paper/35 text-xs py-4">Cargando pedido…</p>}
                {errorCargaCobro && <p className="text-rose-400 text-xs py-2 leading-relaxed">{errorCargaCobro}</p>}
                {hayComandaSinFiltrar && (
                  <p className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                    ⚠ Esta mesa tiene una comanda que viene de gestion.php — no se pudo traer sin filtrar, revisá con cocina si falta algo antes de cobrar.
                  </p>
                )}
                {!cargandoCobro && lineasCobro.length > 0 && (
                  <>
                    <div className="bg-ink border border-white/10 rounded-2xl p-3.5 mb-3.5">
                      {lineasCobro.map((l, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-b-0 text-[13px]">
                          <span>
                            <span className="text-paper/40 mr-1.5">{l.cant}×</span>
                            {l.nombre}
                          </span>
                          <span className="tabular-nums shrink-0">
                            {l.subtotal != null ? formatCLP(l.subtotal) : <span className="text-amber-400">revisar precio</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    {hayLineasSinPrecioCobro && (
                      <p className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 mb-3 leading-relaxed">
                        ⚠ Algún ítem no tiene precio cargado — ajustá el total a mano abajo antes de cobrar.
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[13px] text-paper/60 mb-1.5">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatCLP(totalCalculadoCobro)}</span>
                    </div>
                    <button
                      onClick={() => setPropinaActiva((v) => !v)}
                      disabled={totalManualCobro !== ''}
                      className="w-full flex items-center justify-between text-[13px] py-1.5 mb-2.5 disabled:opacity-40"
                    >
                      <span className="flex items-center gap-2 text-paper/60">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            propinaActiva ? 'bg-gold border-gold text-ink' : 'border-white/20'
                          }`}
                        >
                          {propinaActiva ? '✓' : ''}
                        </span>
                        Propina sugerida (10%)
                      </span>
                      <span className="tabular-nums text-gold">{formatCLP(propinaSugerida)}</span>
                    </button>

                    <label className="text-[10px] uppercase tracking-wide text-paper/40 block mb-1.5">Total a cobrar</label>
                    <input
                      value={totalManualCobro !== '' ? totalManualCobro : totalConPropina}
                      onChange={(e) => setTotalManualCobro(e.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      className="w-full bg-ink border border-white/10 rounded-lg px-3.5 py-3 text-lg font-head font-semibold text-gold tabular-nums mb-3.5"
                    />
                    <label className="text-[10px] uppercase tracking-wide text-paper/40 block mb-1.5">Medio de pago</label>
                    <div className="flex gap-2 mb-4">
                      {MEDIOS_PAGO.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setMedioPagoCobro(m.value)}
                          className={`flex-1 py-2.5 rounded-lg border text-[13px] font-medium ${
                            medioPagoCobro === m.value
                              ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink font-semibold'
                              : 'bg-ink border-white/10 text-paper'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {errorCobro && <p className="text-rose-400 text-xs mb-3 leading-relaxed">{errorCobro}</p>}
                    <button
                      onClick={confirmarCobro}
                      disabled={cobrando || !totalFinalCobro}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-50"
                    >
                      {cobrando ? 'Cobrando…' : `Cobrar ${formatCLP(totalFinalCobro)}`}
                    </button>
                  </>
                )}
                {!cargandoCobro && lineasCobro.length === 0 && !errorCargaCobro && (
                  <p className="text-paper/35 text-xs py-6 text-center">Esta mesa no tiene ítems para cobrar.</p>
                )}
              </>
            ) : comandaEditando ? (
              <>
                <button onClick={() => setComandaEditando(null)} className="text-paper/60 text-sm font-medium mt-2 mb-2 underline">
                  ← volver a Comandas
                </button>
                <h2 className="font-head text-lg font-semibold mb-1">
                  Mesa {comandaEditando.mesa} · {comandaEditando.sector}
                </h2>
                <p className="text-[11px] text-paper/40 mb-3.5">Tocá +/− para cambiar cantidad, o la X para sacar el plato.</p>
                {errorEdicion && <p className="text-rose-400 text-xs mb-2 leading-relaxed">{errorEdicion}</p>}
                <div className="flex flex-col gap-2 mb-4">
                  {comandaEditando.items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-ink border border-white/10 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-paper truncate">{it.nombre}</div>
                        {it.comentario && <div className="text-[10.5px] text-paper/35 truncate">{it.comentario}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => cambiarCantEnEdicion(idx, -1)}
                          className="w-7 h-7 rounded-md border border-white/10 text-paper/70 font-bold"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-[13px] tabular-nums">{it.cant}</span>
                        <button
                          onClick={() => cambiarCantEnEdicion(idx, 1)}
                          className="w-7 h-7 rounded-md border border-white/10 text-paper/70 font-bold"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => quitarDeEdicion(idx)}
                        className="shrink-0 w-7 h-7 rounded-md border border-wine/40 text-wineSoft"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {comandaEditando.items.length === 0 && (
                    <p className="text-paper/30 text-xs py-2">Sin platos — al guardar, se cancela esta comanda entera.</p>
                  )}
                </div>
                <button
                  onClick={guardarEdicion}
                  disabled={guardandoEdicion}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-50"
                >
                  {guardandoEdicion ? 'Guardando…' : comandaEditando.items.length === 0 ? 'Cancelar comanda' : 'Guardar cambios'}
                </button>
              </>
            ) : (
              <>
                <h2 className="font-head text-lg font-semibold mt-2 mb-1">Comandas</h2>
                <p className="text-[11px] text-paper/40 mb-3.5">Pedidos activos por mesa — tocá uno para verlo o editarlo.</p>
                {cargandoDetalle && <p className="text-paper/35 text-xs py-2">Cargando…</p>}
                {errorDetalle && <p className="text-rose-400 text-xs py-2 leading-relaxed">{errorDetalle}</p>}
                {mesasPendientes.size === 0 && (
                  <p className="text-paper/30 text-xs py-8 text-center">No hay pedidos activos ahora mismo.</p>
                )}
                {gruposMesas.map((g) => {
                  const comandasSector = g.mesas.flatMap((m) => comandasPorMesa.get(`${m.numero}|${g.sector}`) || [])
                  if (comandasSector.length === 0) return null
                  const abierto = sectoresComandasAbiertos.has(g.sector)
                  return (
                    <div key={g.sector} className="mb-2 border-b border-white/5 pb-2 last:border-b-0">
                      <button onClick={() => toggleSectorComandas(g.sector)} className="w-full flex items-center justify-between py-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-paper/60">{g.sector}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-paper/35">{comandasSector.length} comanda(s)</span>
                          <span className={`text-gold text-xs transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
                        </span>
                      </button>
                      {abierto && (
                        <div className="flex flex-col gap-2.5 mt-1.5">
                          {Object.entries(
                            comandasSector.reduce((acc, c) => {
                              ;(acc[c.mesa] ||= []).push(c)
                              return acc
                            }, {})
                          ).map(([numMesa, comandasMesa]) => (
                            <div key={numMesa}>
                              <button
                                onClick={() => abrirCobro(numMesa, g.sector)}
                                className="w-full flex items-center justify-between bg-gold/10 border border-gold/30 rounded-lg px-3 py-2 mb-1.5"
                              >
                                <span className="text-[12px] font-semibold text-gold">Mesa {numMesa}</span>
                                <span className="text-gold text-[11px] font-semibold">💰 Cobrar ›</span>
                              </button>
                              <div className="flex flex-col gap-1.5">
                                {comandasMesa.map((c) => (
                                  <button
                                    key={c.id}
                                    onClick={() => c.editable && abrirComandaParaEditar(c.id)}
                                    disabled={!c.editable}
                                    className="flex items-center justify-between bg-ink border border-white/10 rounded-lg px-3 py-2.5 disabled:opacity-50 text-left"
                                  >
                                    <span className="text-[13px]">
                                      {c.hora} <span className="text-paper/35">· {c.cantItems} ítem(s)</span>
                                      {!c.editable && (
                                        <span className="block text-[10px] text-paper/30">viene de gestion.php, no editable acá</span>
                                      )}
                                    </span>
                                    {c.editable && <span className="text-gold text-xs shrink-0">Editar ›</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* ---- Scrim compartido ---- */}
        <div
          onClick={() => {
            setSheetMesa(false)
            setSheetCart(false)
            setSheetMenuDia(false)
            setSheetComandas(false)
            setComandaEditando(null)
            setMesaCobrando(null)
          }}
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
            sheetMesa || sheetCart || sheetMenuDia || sheetComandas ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
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
              const pendientesDelSector = g.mesas.filter((m) => mesasPendientes.has(`${m.numero}|${g.sector}`)).length
              return (
              <div key={g.sector} className="mb-2.5 border-b border-white/5 pb-2.5 last:border-b-0">
                <button
                  onClick={() => toggleSector(g.sector)}
                  className="w-full flex items-center justify-between py-1.5"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide text-paper/60 flex items-center gap-1.5">
                    {g.sector}
                    {mesaElegidaAca && <span className="text-gold normal-case tracking-normal font-medium"> · Mesa {mesaElegidaAca}</span>}
                    {pendientesDelSector > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gold text-ink text-[10px] font-bold normal-case tracking-normal">
                        {pendientesDelSector}
                      </span>
                    )}
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
                    const pendiente = mesasPendientes.has(`${m.numero}|${g.sector}`)
                    return (
                      <button
                        key={m.id}
                        onClick={() => elegirMesa(m.numero, g.sector)}
                        className={`relative aspect-square rounded-lg border font-bold text-2xl flex items-center justify-center ${
                          sel
                            ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink'
                            : pendiente
                            ? // Rojo = mesa ocupada (pedido explícito, 2026-09-16) — antes
                              // el dorado se confundía con el resto de los acentos de la app.
                              'bg-rose-500/15 border-rose-500/60 text-rose-300'
                            : 'bg-ink border-white/10 text-paper'
                        }`}
                      >
                        {m.numero}
                        {pendiente && !sel && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" aria-hidden="true" />
                        )}
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
                ℹ️ Usando el desglose cargado a mano en Productos.
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
            toast || toastCobro ? 'translate-y-0' : '-translate-y-[180%]'
          }`}
        >
          <div className="flex items-center gap-2.5 bg-[#16301F] border border-[#2C6B44] text-[#B9F0CB] rounded-xl px-4.5 py-3 font-semibold text-[13.5px] whitespace-nowrap shadow-lg">
            {toastCobro ? `✓ ${toastCobro}` : '✓ Pedido enviado a cocina'}
          </div>
        </div>
      </div>

      {reciboImprimir && <ReciboBoleta cobro={reciboImprimir} onCerrar={() => setReciboImprimir(null)} />}
    </div>
  )
}
