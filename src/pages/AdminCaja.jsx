import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import ReciboBoleta from '../components/ReciboBoleta.jsx'

// Caja fase 1 — cobrar y cerrar mesa. Ver varos-pos/DECISIONES.md,
// "Caja fase 1: cobrar y cerrar mesa".
//
// Modo espejo: mientras convive con gestion.php, el cobro real de la plata
// sigue siendo el del PHP. Esto registra en paralelo para validar el flujo
// un ciclo de servicio completo — no reemplaza nada todavía.
//
// El KDS (/state) sigue siendo la única fuente de "qué está pendiente" (la
// misma que ve cocina) — acá no se duplica esa lista, solo se lee y se
// resume por mesa. `pos_cobros` es la única tabla nueva: el libro de caja
// permanente que hoy no existe en ningún lado.

const KDS_STATE_URL = 'https://varos-kds.varosnocturno.workers.dev/state?k=797a0ed49a8623e452b03fc0'
const KDS_DETALLE_URL = 'https://varos-kds.varosnocturno.workers.dev/pedido-nuevo-detalle?k=797a0ed49a8623e452b03fc0'
const KDS_CERRAR_MESA_URL = 'https://varos-kds.varosnocturno.workers.dev/cerrar-mesa?k=797a0ed49a8623e452b03fc0'
const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
]

const SIN_TILDE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' }

function normalizarNombre(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[áéíóúñ]/g, (c) => SIN_TILDE[c])
    .replace(/^[-+*\s]+/, '')
    .trim()
}

function formatCLP(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

function formatHora(iso) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminCaja() {
  const { isAdmin, loading: authLoading, session, customer } = useAuth()

  const [mesas, setMesas] = useState([])
  const [sectoresAbiertos, setSectoresAbiertos] = useState(() => new Set())
  const [mesaSel, setMesaSel] = useState(null) // { numero, sector }

  const [precios, setPrecios] = useState(new Map()) // nombre normalizado -> price_clp
  const [menuDiaPrecio, setMenuDiaPrecio] = useState(0)

  const [comandas, setComandas] = useState([])
  const [cargandoComandas, setCargandoComandas] = useState(false)
  const [errorComandas, setErrorComandas] = useState('')

  const [medioPago, setMedioPago] = useState('efectivo')
  const [totalManual, setTotalManual] = useState('')
  const [cobrando, setCobrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState('')
  const [toast, setToast] = useState('')

  const [resumenHoy, setResumenHoy] = useState(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [reciboImprimir, setReciboImprimir] = useState(null) // fila de pos_cobros a imprimir

  useEffect(() => {
    if (!isAdmin) return
    async function cargar() {
      const { data } = await supabase
        .from('pos_mesas')
        .select('*')
        .eq('activa', true)
        .order('sector', { ascending: true })
        .order('orden', { ascending: true, nullsFirst: false })
      setMesas(data ?? [])
    }
    cargar()
  }, [isAdmin])

  // Qué mesas tienen algo pendiente en cocina, para no tener que abrir cada
  // sector y tocar cada mesa a ciegas — antes de esto no había forma de saber
  // dónde estaba una comanda sin adivinar (encontrado 2026-09-14: una comanda
  // real de Gustavo en Mesa 7 · Carpa quedó "invisible" solo porque nadie
  // sabía en qué mesa buscarla). Se recarga cada 20s, el mismo TTL de caché
  // que ya usa el propio /state del KDS.
  const [mesasPendientes, setMesasPendientes] = useState(() => new Set())

  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false
    async function cargarPendientes() {
      try {
        const res = await fetch(KDS_STATE_URL)
        if (!res.ok) return
        const data = await res.json()
        const claves = new Set(
          (data.comandas || [])
            .filter((c) => (c.items || []).length > 0)
            .map((c) => `${c.mesa}|${c.sector}`)
        )
        if (!cancelado) setMesasPendientes(claves)
      } catch {
        // silencioso — el badge es una ayuda visual, no crítica; si falla, la
        // mesa se sigue pudiendo elegir a mano igual que siempre
      }
    }
    cargarPendientes()
    const id = setInterval(cargarPendientes, 20000)
    return () => {
      cancelado = true
      clearInterval(id)
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    async function cargarPrecios() {
      const { data } = await supabase.from('menu_items').select('name, price_clp, category')
      const mapa = new Map()
      for (const it of data ?? []) mapa.set(normalizarNombre(it.name), it.price_clp)
      setPrecios(mapa)
      const menuDia = (data ?? []).find((it) => it.category === 'Menú del Día')
      setMenuDiaPrecio(menuDia?.price_clp || 0)
    }
    cargarPrecios()
  }, [isAdmin])

  useEffect(() => {
    async function cargarResumen() {
      const hoy = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('pos_cobros')
        .select('id, mesa, sector, garzon, items, total, medio_pago, cobrado_por, created_at')
        .gte('created_at', hoy + 'T00:00:00')
        .order('created_at', { ascending: false })
      if (!data) return
      const porMedio = {}
      let total = 0
      for (const c of data) {
        porMedio[c.medio_pago] = (porMedio[c.medio_pago] || 0) + Number(c.total)
        total += Number(c.total)
      }
      // El detalle fila por fila — antes solo se veía el total del día, sin
      // forma de saber qué mesa se cobró ni a qué hora (pedido del usuario,
      // 2026-09-14): "y el registro de caja dónde lo veo".
      setResumenHoy({ total, porMedio, cantidad: data.length, detalle: data })
    }
    if (isAdmin) cargarResumen()
  }, [isAdmin, toast])

  // Abrir solo el/los sectores que tienen algo pendiente — si no hay ninguno
  // pendiente en absoluto, no tocamos lo que el admin ya haya abierto a mano.
  useEffect(() => {
    if (mesasPendientes.size === 0) return
    setSectoresAbiertos((prev) => {
      const next = new Set(prev)
      for (const clave of mesasPendientes) {
        const sector = clave.split('|')[1]
        if (sector) next.add(sector)
      }
      return next
    })
  }, [mesasPendientes])

  const gruposMesas = useMemo(() => {
    const porSector = {}
    for (const m of mesas) {
      if (!porSector[m.sector]) porSector[m.sector] = []
      porSector[m.sector].push(m)
    }
    for (const lista of Object.values(porSector)) {
      lista.sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }))
    }
    return Object.entries(porSector)
  }, [mesas])

  function toggleSector(sector) {
    setSectoresAbiertos((prev) => {
      const next = new Set(prev)
      next.has(sector) ? next.delete(sector) : next.add(sector)
      return next
    })
  }

  async function elegirMesa(numero, sector) {
    setMesaSel({ numero, sector })
    setErrorCobro('')
    setCargandoComandas(true)
    setErrorComandas('')
    try {
      const res = await fetch(KDS_STATE_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const propias = (data.comandas || []).filter(
        (c) => String(c.mesa) === String(numero) && c.sector === sector
      )

      // /state le saca las bebidas a los items a propósito (es la vista que
      // arma la pantalla de cocina, a la que no le importan los tragos) —
      // cobrar directo con esos datos venía omitiendo las bebidas del total
      // en silencio (encontrado 2026-09-15). Para las comandas "N-" (nacidas
      // en /mozo) hay un endpoint que devuelve el pedido sin filtrar; se pide
      // uno por uno y se reemplazan los items. Las que vienen del puente con
      // gestion.php no tienen ese endpoint todavía — quedan con la vista
      // filtrada como hasta ahora (limitación conocida, no nueva).
      const completas = await Promise.all(
        propias.map(async (c) => {
          if (!String(c.id).startsWith('N-')) return c
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

      setComandas(completas)
      setTotalManual('')
    } catch (err) {
      setErrorComandas('No se pudo cargar el estado de cocina: ' + err.message)
      setComandas([])
    } finally {
      setCargandoComandas(false)
    }
  }

  // Precio por línea: si es un combo de Menú del Día (trae `menus`), el
  // precio es el del contenedor "Menú del Día"; si no, se busca por nombre
  // en el catálogo. Sin match -> null, se avisa en vez de cobrar $0 sin que
  // nadie lo note.
  const lineas = useMemo(() => {
    const out = []
    for (const c of comandas) {
      for (const it of c.items || []) {
        const esMenuDia = Array.isArray(it.menus) && it.menus.length > 0
        const precioUnit = esMenuDia ? menuDiaPrecio : precios.get(normalizarNombre(it.nombre))
        out.push({
          garzon: c.garzon,
          nombre: it.nombre,
          cant: it.cant,
          precioUnit: precioUnit ?? null,
          subtotal: precioUnit != null ? precioUnit * it.cant : null,
        })
      }
    }
    return out
  }, [comandas, precios, menuDiaPrecio])

  const totalCalculado = useMemo(
    () => lineas.reduce((s, l) => s + (l.subtotal ?? 0), 0),
    [lineas]
  )
  const hayLineasSinPrecio = lineas.some((l) => l.subtotal == null)
  const totalFinal = totalManual !== '' ? Number(totalManual) : totalCalculado

  async function cobrar() {
    if (!mesaSel || !lineas.length || !totalFinal) return
    setCobrando(true)
    setErrorCobro('')
    const garzon = comandas.find((c) => c.garzon)?.garzon || ''
    const cobradoPor = customer?.full_name || session?.user?.email || 'admin'
    const itemsCobro = lineas.map(({ nombre, cant, precioUnit }) => ({ nombre, cant, precioUnit }))
    const { data: inserted, error } = await supabase
      .from('pos_cobros')
      .insert({
        mesa: String(mesaSel.numero),
        sector: mesaSel.sector,
        garzon,
        items: itemsCobro,
        total: totalFinal,
        medio_pago: medioPago,
        cobrado_por: cobradoPor,
      })
      .select('id, created_at')
      .single()
    if (error) {
      setErrorCobro('No se pudo registrar el cobro: ' + error.message)
      setCobrando(false)
      return
    }
    // Imprimir al cobrar, sin tener que ir a buscarlo despues a "Ver
    // registro de caja" -- pedido explicito (2026-09-16): "el boton de
    // cobrar debiese imprimir".
    setReciboImprimir({
      id: inserted?.id,
      mesa: String(mesaSel.numero),
      sector: mesaSel.sector,
      garzon,
      items: itemsCobro,
      total: totalFinal,
      medioPagoLabel: MEDIOS_PAGO.find((m) => m.value === medioPago)?.label || medioPago,
      created_at: inserted?.created_at || new Date().toISOString(),
    })
    try {
      await fetch(KDS_CERRAR_MESA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesa: String(mesaSel.numero), sector: mesaSel.sector }),
      })
    } catch {
      // El cobro ya quedó registrado en pos_cobros aunque falle el cierre en
      // el KDS — no se pierde la plata, en el peor caso la mesa sigue
      // apareciendo en cocina hasta que se cierre a mano después.
    }
    setCobrando(false)
    setToast(`Mesa ${mesaSel.numero} cobrada — ${formatCLP(totalFinal)}`)
    setTimeout(() => setToast(''), 3000)
    setMesaSel(null)
    setComandas([])
    setTotalManual('')
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
        <h1 className="font-head text-2xl font-semibold">Caja</h1>
        <p className="text-paper/40 text-xs mt-1 leading-relaxed">
          Piloto — el cobro real sigue siendo el de gestion.php. Esto registra en paralelo para validar el flujo.
        </p>
      </header>

      {toast && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-4 py-3 mb-4">
          ✓ {toast}
        </div>
      )}

      {resumenHoy && resumenHoy.cantidad > 0 && (
        <div className="bg-inkSoft border border-gold/25 rounded-2xl p-4 mb-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-paper/40 mb-2">Cerrar turno — hoy</div>
          <div className="text-xl font-head font-semibold text-gold mb-1.5">{formatCLP(resumenHoy.total)}</div>
          <div className="flex gap-3 text-[11.5px] text-paper/50">
            {Object.entries(resumenHoy.porMedio).map(([medio, monto]) => (
              <span key={medio}>
                {MEDIOS_PAGO.find((m) => m.value === medio)?.label || medio}: {formatCLP(monto)}
              </span>
            ))}
          </div>
          <div className="text-[11px] text-paper/35 mt-1.5">{resumenHoy.cantidad} mesa(s) cobrada(s)</div>

          <button
            onClick={() => setDetalleAbierto((v) => !v)}
            className="text-[11px] text-gold underline mt-2.5"
          >
            {detalleAbierto ? 'Ocultar detalle' : 'Ver registro de caja'}
          </button>

          {detalleAbierto && (
            <div className="mt-3 pt-3 border-t border-white/5 divide-y divide-white/5">
              {resumenHoy.detalle.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-paper">Mesa {c.mesa} · {c.sector}</div>
                    <div className="text-paper/35 text-[10px] truncate">
                      {formatHora(c.created_at)} · {c.garzon || 'sin garzón'} · cobró {c.cobrado_por}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-gold font-medium tabular-nums">{formatCLP(c.total)}</div>
                    <div className="text-paper/35 text-[10px]">
                      {MEDIOS_PAGO.find((m) => m.value === c.medio_pago)?.label || c.medio_pago}
                    </div>
                  </div>
                  <button
                    onClick={() => setReciboImprimir(c)}
                    className="shrink-0 text-base leading-none px-1.5 py-1 -mr-1"
                    title="Imprimir boleta"
                  >
                    🖨️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!mesaSel && (
        <>
          <p className="text-paper/50 text-xs mb-3">Elegí la mesa a cobrar.</p>
          {gruposMesas.map(([sector, mesasDelSector]) => {
            const abierto = sectoresAbiertos.has(sector)
            const pendientesDelSector = mesasDelSector.filter((m) => mesasPendientes.has(`${m.numero}|${sector}`)).length
            return (
              <div key={sector} className="mb-2.5 border-b border-white/5 pb-2.5 last:border-b-0">
                <button onClick={() => toggleSector(sector)} className="w-full flex items-center justify-between py-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-paper/60 flex items-center gap-1.5">
                    {sector}
                    {pendientesDelSector > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gold text-ink text-[10px] font-bold normal-case tracking-normal">
                        {pendientesDelSector}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-paper/35">{mesasDelSector.length} mesas</span>
                    <span className={`text-gold text-xs transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
                  </span>
                </button>
                {abierto && (
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {mesasDelSector.map((m) => {
                      const pendiente = mesasPendientes.has(`${m.numero}|${sector}`)
                      return (
                        <button
                          key={m.id}
                          onClick={() => elegirMesa(m.numero, sector)}
                          className={`relative py-3.5 rounded-lg border text-xl font-bold ${
                            // Rojo = mesa ocupada (pedido explícito, 2026-09-16) — antes
                            // el dorado se confundía con el resto de los acentos de la app.
                            pendiente ? 'bg-rose-500/15 border-rose-500/60 text-rose-300' : 'bg-ink border-white/10'
                          }`}
                        >
                          {m.numero}
                          {pendiente && (
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
        </>
      )}

      {mesaSel && (
        <div>
          <button onClick={() => { setMesaSel(null); setComandas([]) }} className="text-paper/40 text-xs mb-3 underline">
            ← elegir otra mesa
          </button>
          <h2 className="font-head text-lg font-semibold mb-3">Mesa {mesaSel.numero} · {mesaSel.sector}</h2>

          {cargandoComandas && <p className="text-paper/35 text-xs py-6">Cargando pedidos de cocina…</p>}
          {errorComandas && <p className="text-rose-400 text-xs py-4">{errorComandas}</p>}

          {!cargandoComandas && !errorComandas && lineas.length === 0 && (
            <p className="text-paper/35 text-xs py-6">Esta mesa no tiene pedidos pendientes en cocina ahora mismo.</p>
          )}

          {lineas.length > 0 && (
            <>
              <div className="bg-inkSoft border border-white/10 rounded-2xl p-4 mb-4">
                {lineas.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
                    <div className="text-[13px]">
                      <span className="text-paper/40 mr-1.5">{l.cant}×</span>
                      {l.nombre}
                    </div>
                    <div className="text-[13px] tabular-nums shrink-0">
                      {l.subtotal != null ? formatCLP(l.subtotal) : <span className="text-amber-400">revisar precio</span>}
                    </div>
                  </div>
                ))}
              </div>

              {hayLineasSinPrecio && (
                <p className="text-[11.5px] text-amber-400 bg-amber-400/10 border border-amber-400/25 rounded-lg px-3 py-2 mb-3.5 leading-relaxed">
                  ⚠ Algún ítem no tiene precio cargado en el catálogo — el total de abajo está incompleto. Ajustalo a mano antes de cobrar.
                </p>
              )}

              <div className="mb-3.5">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-paper/40 block mb-1.5">Total a cobrar</label>
                <input
                  value={totalManual !== '' ? totalManual : totalCalculado}
                  onChange={(e) => setTotalManual(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  className="w-full bg-ink border border-white/10 rounded-lg px-3.5 py-3 text-lg font-head font-semibold text-gold tabular-nums"
                />
              </div>

              <div className="mb-4">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-paper/40 block mb-1.5">Medio de pago</label>
                <div className="flex gap-2">
                  {MEDIOS_PAGO.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMedioPago(m.value)}
                      className={`flex-1 py-2.5 rounded-lg border text-[13px] font-medium ${
                        medioPago === m.value
                          ? 'bg-gradient-to-br from-gold to-bronze border-transparent text-ink font-semibold'
                          : 'bg-ink border-white/10 text-paper'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {errorCobro && <p className="text-rose-400 text-xs py-2">{errorCobro}</p>}

              <button
                onClick={cobrar}
                disabled={cobrando || !totalFinal}
                className="w-full py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-35"
              >
                {cobrando ? 'Cobrando…' : `Cobrar ${formatCLP(totalFinal)}`}
              </button>
            </>
          )}
        </div>
      )}

      {reciboImprimir && (
        <ReciboBoleta
          cobro={{
            ...reciboImprimir,
            medioPagoLabel:
              reciboImprimir.medioPagoLabel ||
              MEDIOS_PAGO.find((m) => m.value === reciboImprimir.medio_pago)?.label ||
              reciboImprimir.medio_pago,
          }}
          onCerrar={() => setReciboImprimir(null)}
        />
      )}
    </div>
  )
}
