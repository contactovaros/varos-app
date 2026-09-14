import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'

function formatFechaCorta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// Acordeón con estado propio (no <details> nativo): el salto brusco del
// <details>/<summary> del navegador no se puede animar de forma confiable
// entre navegadores. Con grid-template-rows 0fr→1fr conseguimos una
// transición real y mantenemos la accesibilidad con aria-expanded en el botón.
function Seccion({ titulo, subtitulo, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-inkSoft border border-white/5 rounded-2xl mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.03] active:bg-white/[0.04]"
      >
        <div>
          <div className="font-head font-semibold text-sm">{titulo}</div>
          {subtitulo && (
            <span className="inline-block mt-1 text-[10px] font-mono text-ember/90 bg-ember/10 border border-ember/20 rounded-full px-2 py-0.5">
              {subtitulo}
            </span>
          )}
        </div>
        <span
          className={`text-ember text-sm shrink-0 transition-transform duration-200 ease-salida ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-salida motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

// Las 8 tarjetas de navegación a pantallas completas (Link, no contenido
// in-page). Un solo array alimenta dos formas de mostrarlas: tarjetas grandes
// apiladas en el flujo (mobile) y una barra compacta fija a la izquierda
// (desktop) — mismo destino y mismo texto, solo cambia la densidad.
// Orden por prioridad (pedido explícito del usuario, 2026-09-14): el sistema
// nuevo de POS/comandas va primero — es lo que se usa a diario ahora mismo —,
// las herramientas más viejas (planos, reseñas) quedan después.
const NAV_ITEMS = [
  {
    to: '/admin/productos',
    mobileHeading: '💲 Productos',
    icon: 'i-tag',
    label: 'Productos',
    desc: 'Precio, disponibilidad y qué se muestra en la carta pública de varos.cl',
    accent: 'gold'
  },
  {
    to: '/admin/garzones',
    mobileHeading: '🧑‍🍳 Garzones',
    icon: 'i-tray',
    label: 'Garzones',
    desc: 'Registrar garzones y generar el código que usan para entrar a /mozo',
    accent: 'gold'
  },
  {
    to: '/admin/caja',
    mobileHeading: '💰 Caja',
    icon: 'i-cash',
    label: 'Caja',
    desc: 'Cobrar una mesa y cerrar turno — piloto, en paralelo con gestion.php',
    accent: 'gold'
  },
  {
    to: '/admin/mesas-pos',
    mobileHeading: '🪑 Mesas del POS',
    icon: 'i-grid',
    label: 'Mesas del POS',
    desc: 'La numeración real por sector (Bar, Carpa, Andino…) que ve el garzón en /mozo',
    accent: 'gold'
  },
  {
    to: '/admin/mesa-trabajo',
    mobileHeading: '🗂️ Mesa de trabajo',
    icon: 'i-clip',
    label: 'Mesa de trabajo',
    desc: 'Reservas del día junto al plano — toca una mesa reservada para ver el cliente y escribirle por WhatsApp',
    accent: 'ember'
  },
  {
    to: '/admin/mesas',
    mobileHeading: '🥂 Editar planos y mesas',
    icon: 'i-compass',
    label: 'Editar planos y mesas',
    desc: 'Comedor Exterior, Comedor Principal y Terraza — mover, agrandar y bloquear mesas',
    accent: 'ember'
  },
  {
    to: '/admin/plano',
    mobileHeading: '📐 Plano de la terraza',
    icon: 'i-plan',
    label: 'Plano de la terraza',
    desc: 'Recinto de 9 × 24 m — mover, girar y medir cada mesa y equipo, y publicarlo cuando quieras',
    accent: 'ember'
  },
  {
    to: '/admin/resenas',
    mobileHeading: 'Consultor de reseñas',
    icon: 'i-chat',
    label: 'Consultor de reseñas',
    desc: 'Preguntale a tus reseñas de Google qué reclama y qué celebra la gente',
    accent: 'ember'
  }
]

// Sprite con los 8 íconos monocromos de la Dirección "Escaneo" (ver mockup
// aprobado por el usuario). Se define una sola vez, oculto, y cada ícono se
// referencia con <use href="#i-tag">. Trazo fino (stroke-width 1.5), sin
// relleno — el mismo lenguaje visual que ya usa BottomNav.
function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-tag" viewBox="0 0 24 24"><path d="M3 11.5V5a2 2 0 0 1 2-2h6.5L21 11.5 12.5 20 3 11.5Z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></symbol>
      <symbol id="i-tray" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="4" rx="1" /><circle cx="8" cy="6" r="2.2" /><circle cx="16" cy="6" r="2.2" /><path d="M4 13v6h16v-6" /></symbol>
      <symbol id="i-cash" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none" /></symbol>
      <symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></symbol>
      <symbol id="i-clip" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="1.5" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><path d="M8 10h8M8 13.5h8M8 17h5" /></symbol>
      <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="m9 15 3-6 3 6-3-1.5Z" /></symbol>
      <symbol id="i-plan" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="16" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="0.9" fill="currentColor" stroke="none" /><circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" /><circle cx="16" cy="16" r="0.9" fill="currentColor" stroke="none" /></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z" /><path d="m12 8.5.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z" fill="currentColor" stroke="none" /></symbol>
    </svg>
  )
}

// Un ícono del sprite de arriba, listo para usar con el mismo trazo en
// cualquier tamaño (grilla mobile o sidebar compacta de escritorio).
function NavIcon({ id, className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <use href={`#${id}`} />
    </svg>
  )
}

const NAV_ACCENTS = {
  ember: {
    border: 'border-ember/20',
    hover: 'hover:bg-ember/5 hover:border-ember/40',
    active: 'active:bg-ember/5 active:border-ember/40',
    text: 'text-ember'
  },
  gold: {
    border: 'border-gold/25',
    hover: 'hover:bg-gold/5 hover:border-gold/45',
    active: 'active:bg-gold/5 active:border-gold/45',
    text: 'text-gold'
  }
}

// Grilla de escaneo — solo mobile: ícono + label corto, sin descripción a la
// vista (la descripción larga queda de tooltip). Gana velocidad de lectura
// sobre personalidad: es lo que el dueño mira parado en el local muchas veces
// al día, no algo para detenerse a leer.
function NavGridMobile({ item }) {
  return (
    <Link
      to={item.to}
      title={item.desc}
      className="flex flex-col items-center justify-center gap-1.5 bg-inkSoft rounded-lg py-3.5 transition-colors duration-150 ease-salida hover:bg-white/5 active:bg-white/5"
    >
      <NavIcon id={item.icon} className="w-5 h-5" />
      <span className="font-head text-[10px] text-center leading-tight">{item.label}</span>
    </Link>
  )
}

// Versión compacta para la barra fija de escritorio: ícono + label, la
// descripción larga queda como tooltip (title) en vez de ocupar dos líneas.
function NavCardCompact({ item }) {
  const a = NAV_ACCENTS[item.accent]
  return (
    <Link
      to={item.to}
      title={item.desc}
      className={`flex items-center gap-2.5 bg-inkSoft border ${a.border} rounded-xl px-3 py-2.5 transition-colors duration-150 ease-salida ${a.hover} ${a.active}`}
    >
      <NavIcon id={item.icon} className="w-4 h-4 shrink-0" />
      <span className="font-head text-xs font-medium truncate">{item.label}</span>
    </Link>
  )
}

// Header de columna clickeable para ordenar una tabla de escritorio.
function ThOrdenable({ label, active, dir, onClick, align = 'left' }) {
  return (
    <th className={`py-2 px-2 font-normal ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-paper/80 ${active ? 'text-ember' : 'text-paper/40'}`}
      >
        {label}
        <span className="text-[9px] w-2.5 inline-block">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )
}

// ---- Tabla de escritorio: Clientes (dentro de "⭐ Clientes") ----
function TablaClientesDesktop({ customers, premioEstrellas, agregarEstrella, quitarEstrella, eliminarCliente }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState('asc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filas = customers
    .filter((c) => (c.full_name ?? '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const diff =
        sortKey === 'estrellas'
          ? (a.estrellas_actuales ?? 0) - (b.estrellas_actuales ?? 0)
          : (a.full_name ?? '').localeCompare(b.full_name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Cliente" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Estrellas" active={sortKey === 'estrellas'} dir={sortDir} onClick={() => toggleSort('estrellas')} />
            <th className="py-2 px-2 font-normal text-left text-paper/40">Premio</th>
            <th className="py-2 px-2 font-normal text-right text-paper/40">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-2 text-paper">{c.full_name}</td>
              <td className="py-2 px-2 font-mono text-paper/70">{c.estrellas_actuales ?? 0} / 5 ⭐</td>
              <td className="py-2 px-2 text-ember/80">{premioEstrellas ? premioEstrellas : 'Sin premio configurado'}</td>
              <td className="py-2 px-2">
                <div className="flex justify-end items-center gap-1.5">
                  <button
                    onClick={() => quitarEstrella(c)}
                    disabled={(c.estrellas_actuales ?? 0) <= 0}
                    className="w-6 h-6 rounded-md border border-white/10 text-paper/60 disabled:opacity-30 hover:border-white/25 transition-colors"
                  >
                    −
                  </button>
                  <button
                    onClick={() => agregarEstrella(c)}
                    className="w-6 h-6 rounded-md border border-ember/40 text-ember hover:bg-ember/10 transition-colors"
                  >
                    +
                  </button>
                  <button
                    onClick={() => eliminarCliente(c)}
                    className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap hover:bg-wine/10 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-paper/35 text-xs py-3">Sin resultados.</p>}
    </div>
  )
}

// ---- Tabla de escritorio: Menú (dentro de "🍽️ Menú del restaurante") ----
function TablaMenuDesktop({ menuItems, toggleDish, updateDishPrice, deleteDish }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState('asc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filas = menuItems
    .filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let diff = 0
      if (sortKey === 'precio') diff = (a.price_clp ?? 0) - (b.price_clp ?? 0)
      else if (sortKey === 'categoria') diff = (a.category ?? '').localeCompare(b.category ?? '')
      else diff = (a.name ?? '').localeCompare(b.name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar plato o categoría…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Plato" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Categoría" active={sortKey === 'categoria'} dir={sortDir} onClick={() => toggleSort('categoria')} />
            <ThOrdenable label="Precio" active={sortKey === 'precio'} dir={sortDir} onClick={() => toggleSort('precio')} />
            <th className="py-2 px-2 font-normal text-right text-paper/40">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => (
            <tr key={m.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className={`py-2 px-2 ${m.available ? 'text-paper' : 'text-paper/30 line-through'}`}>{m.name}</td>
              <td className="py-2 px-2 text-paper/50">{m.category}</td>
              <td className="py-2 px-2">
                <input
                  type="number"
                  value={m.price_clp}
                  onChange={(e) => updateDishPrice(m.id, Number(e.target.value))}
                  className="w-24 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
                />
              </td>
              <td className="py-2 px-2">
                <div className="flex justify-end items-center gap-1.5">
                  <button
                    onClick={() => toggleDish(m.id, m.available)}
                    className="px-2 py-1 rounded-md border border-white/10 text-[10px] whitespace-nowrap hover:border-white/25 transition-colors"
                  >
                    {m.available ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    onClick={() => deleteDish(m.id)}
                    className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap hover:bg-wine/10 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-paper/35 text-xs py-3">Sin resultados.</p>}
    </div>
  )
}

// ---- Tabla de escritorio: Historial de canjes ----
function TablaCanjesDesktop({ redemptions }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'fecha' ? 'desc' : 'asc')
    }
  }

  const filas = redemptions
    .filter((r) => `${r.customers?.full_name ?? ''} ${r.rewards?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let diff = 0
      if (sortKey === 'puntos') diff = (a.points_spent ?? 0) - (b.points_spent ?? 0)
      else if (sortKey === 'recompensa') diff = (a.rewards?.name ?? '').localeCompare(b.rewards?.name ?? '')
      else if (sortKey === 'fecha') diff = new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
      else diff = (a.customers?.full_name ?? '').localeCompare(b.customers?.full_name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente o recompensa…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Cliente" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Recompensa" active={sortKey === 'recompensa'} dir={sortDir} onClick={() => toggleSort('recompensa')} />
            <ThOrdenable label="Puntos" active={sortKey === 'puntos'} dir={sortDir} onClick={() => toggleSort('puntos')} align="right" />
            <ThOrdenable label="Fecha" active={sortKey === 'fecha'} dir={sortDir} onClick={() => toggleSort('fecha')} align="right" />
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-2 text-paper">{r.customers?.full_name ?? 'Cliente eliminado'}</td>
              <td className="py-2 px-2 text-paper/60">{r.rewards?.name}</td>
              <td className="py-2 px-2 font-mono text-wineSoft text-right">-{r.points_spent}</td>
              <td className="py-2 px-2 text-paper/40 text-right">{formatFechaCorta(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-paper/35 text-xs py-3">Sin resultados.</p>}
    </div>
  )
}

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [customers, setCustomers] = useState([])
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [promotions, setPromotions] = useState([])
  const [rule, setRule] = useState(100)
  const [premiosGanados, setPremiosGanados] = useState([])
  const [premioEstrellas, setPremioEstrellas] = useState('')
  const [premioVisible, setPremioVisible] = useState(true)
  const [savingPremio, setSavingPremio] = useState(false)
  const [checkinUrl, setCheckinUrl] = useState(`${window.location.origin}/checkin`)
  const [newDish, setNewDish] = useState({ name: '', description: '', price_clp: '', category: 'Platos principales' })
  const [newPromo, setNewPromo] = useState({ title: '', message: '', target_customer_id: '', enviarPush: false })
  const [enviandoPush, setEnviandoPush] = useState(false)
  const [pushResultado, setPushResultado] = useState('')
  const [savingDish, setSavingDish] = useState(false)
  const [locationAlerts, setLocationAlerts] = useState([])
  const [newAlert, setNewAlert] = useState({ titulo: '', mensaje: '', lat: '', lng: '' })

  async function loadAll() {
    const [c, r, rd, mi, pr, promo, premio, alerts, ganados] = await Promise.all([
      supabase.from('customers').select('*').order('points', { ascending: false }).limit(30),
      supabase.from('rewards').select('*').order('cost_points'),
      supabase.from('redemptions').select('*, customers(full_name), rewards(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('menu_items').select('*').order('category'),
      supabase.from('points_rules').select('*').eq('id', 1).single(),
      supabase.from('promotions').select('*').order('starts_at', { ascending: false }).limit(10),
      supabase.from('config_recompensa_estrellas').select('*').eq('id', 1).single(),
      supabase.from('location_alerts').select('*').order('created_at', { ascending: false }),
      // Premios de 5 estrellas, los pendientes primero. Sin esto la tabla se
      // escribía sola y nadie podía verla: el aviso de que alguien ganó vivía
      // solo en la pantalla del check-in y se perdía al cerrarla.
      supabase
        .from('premios_ganados')
        .select('*, customers(full_name, member_number)')
        .order('canjeado')
        .order('fecha_ganado', { ascending: false })
        .limit(50)
    ])
    setCustomers(c.data ?? [])
    setRewards(r.data ?? [])
    setRedemptions(rd.data ?? [])
    setMenuItems(mi.data ?? [])
    setRule(pr.data?.clp_per_point ?? 100)
    setPromotions(promo.data ?? [])
    setPremioEstrellas(premio.data?.producto ?? '')
    setPremioVisible(premio.data?.visible ?? true)
    setLocationAlerts(alerts.data ?? [])
    setPremiosGanados(ganados.data ?? [])
  }

  async function entregarPremio(premio) {
    const nombre = premio.customers?.full_name ?? 'este cliente'
    if (!window.confirm(`¿Confirmas que le entregaste "${premio.producto}" a ${nombre}?`)) return
    const { data, error } = await supabase.rpc('admin_entregar_premio', { p_premio_id: premio.id })
    if (error) {
      alert('No se pudo marcar la entrega: ' + error.message)
      return
    }
    if (data === false) {
      alert('Ese premio ya figuraba como entregado.')
    }
    setPremiosGanados((prev) =>
      prev.map((p) => (p.id === premio.id ? { ...p, canjeado: true, fecha_canjeado: new Date().toISOString() } : p))
    )
  }

  useEffect(() => {
    if (isAdmin) loadAll()
  }, [isAdmin])

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

  const now = Date.now()
  const inactive = customers.filter((c) => c.last_visit_at && now - new Date(c.last_visit_at).getTime() > 30 * 86400000)
  const pendientes = premiosGanados.filter((p) => !p.canjeado)

  async function updateRewardCost(id, cost) {
    setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, cost_points: cost } : r)))
    await supabase.from('rewards').update({ cost_points: cost }).eq('id', id)
  }

  async function toggleReward(id, active) {
    setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, active: !active } : r)))
    await supabase.from('rewards').update({ active: !active }).eq('id', id)
  }

  async function guardarPremioEstrellas() {
    if (!premioEstrellas) return
    setSavingPremio(true)
    const { data, error } = await supabase
      .from('config_recompensa_estrellas')
      .update({ producto: premioEstrellas })
      .eq('id', 1)
      .select()
    setSavingPremio(false)
    if (error || !data?.length) {
      alert('No se pudo guardar el premio. Puede faltar el permiso de escritura (RLS) en Supabase para la tabla config_recompensa_estrellas.')
    }
  }

  async function toggleVisiblePremio() {
    const nuevoValor = !premioVisible
    setPremioVisible(nuevoValor)
    const { data, error } = await supabase
      .from('config_recompensa_estrellas')
      .update({ visible: nuevoValor })
      .eq('id', 1)
      .select()
    if (error || !data?.length) {
      setPremioVisible(!nuevoValor)
      alert('No se pudo cambiar la visibilidad del premio.')
    }
  }

  async function eliminarCliente(c) {
    const escrito = window.prompt(
      `Esto borrará PERMANENTEMENTE a "${c.full_name}" y todo su historial (visitas, estrellas, canjes, pedidos).\n\nEscribe su nombre completo exactamente para confirmar:`
    )
    if (escrito === null) return
    if (escrito.trim() !== c.full_name) {
      alert('El nombre no coincide. No se eliminó al cliente.')
      return
    }
    if (!window.confirm(`Última confirmación: ¿eliminar a "${c.full_name}" para siempre?`)) return

    const { error } = await supabase.rpc('admin_delete_customer', { p_customer_id: c.id })
    if (error) {
      alert('No se pudo eliminar al cliente: ' + error.message)
      return
    }
    setCustomers((prev) => prev.filter((x) => x.id !== c.id))
  }

  async function agregarEstrella(c) {
    const { data, error } = await supabase.rpc('admin_add_star', { p_customer_id: c.id })
    if (error) {
      alert('No se pudo agregar la estrella: ' + error.message)
      return
    }
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: data.estrellas } : x)))
    if (data.gano_premio) {
      alert(`🎉 ${c.full_name} llegó a 5 estrellas y ganó: ${data.producto}`)
    }
  }

  async function quitarEstrella(c) {
    const actual = c.estrellas_actuales ?? 0
    if (actual <= 0) return
    const nuevo = actual - 1
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: nuevo } : x)))
    const { error } = await supabase.from('customers').update({ estrellas_actuales: nuevo }).eq('id', c.id)
    if (error) {
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: actual } : x)))
      alert('No se pudo quitar la estrella.')
    }
  }

  async function updateRule(value) {
    setRule(value)
    await supabase.from('points_rules').update({ clp_per_point: value }).eq('id', 1)
  }

  async function addDish() {
    if (!newDish.name || !newDish.price_clp) return
    setSavingDish(true)
    const { data, error } = await supabase
      .from('menu_items')
      .insert({ ...newDish, price_clp: Number(newDish.price_clp) })
      .select()
      .single()
    if (!error && data) {
      setMenuItems((prev) => [...prev, data])
      setNewDish({ name: '', description: '', price_clp: '', category: 'Platos principales' })
    }
    setSavingDish(false)
  }

  async function toggleDish(id, available) {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, available: !available } : m)))
    await supabase.from('menu_items').update({ available: !available }).eq('id', id)
  }

  async function updateDishPrice(id, price_clp) {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, price_clp } : m)))
    await supabase.from('menu_items').update({ price_clp }).eq('id', id)
  }

  async function deleteDish(id) {
    setMenuItems((prev) => prev.filter((m) => m.id !== id))
    await supabase.from('menu_items').delete().eq('id', id)
  }

  async function addPromo() {
    if (!newPromo.title || !newPromo.message) return
    const payload = {
      title: newPromo.title,
      message: newPromo.message,
      target_customer_id: newPromo.target_customer_id || null
    }
    const { data, error } = await supabase.from('promotions').insert(payload).select().single()
    if (!error && data) {
      setPromotions((prev) => [data, ...prev])
      if (newPromo.enviarPush) {
        await enviarPushCampana(newPromo.title, newPromo.message, newPromo.target_customer_id || null)
      }
      setNewPromo({ title: '', message: '', target_customer_id: '', enviarPush: false })
    }
  }

  async function enviarPushCampana(title, body, customerId) {
    setEnviandoPush(true)
    setPushResultado('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title, body, customerId })
      })
      // La función puede caerse antes de responder JSON (ej. un crash del runtime
      // devuelve el stack en texto plano), así que leemos como texto y luego
      // intentamos parsear — si no, mostramos el cuerpo crudo con el status.
      const texto = await res.text()
      let json = null
      try {
        json = JSON.parse(texto)
      } catch {
        // se queda en null: el cuerpo no era JSON
      }
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status} — ${texto.slice(0, 300)}`)
      }
      setPushResultado(`🔔 Enviado a ${json.enviados} de ${json.total} dispositivos suscritos.`)
    } catch (e) {
      console.error('[push] fallo el envío', e)
      setPushResultado('⚠️ ' + e.message)
    } finally {
      setEnviandoPush(false)
    }
  }

  async function togglePromo(id, active) {
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, active: !active } : p)))
    await supabase.from('promotions').update({ active: !active }).eq('id', id)
  }

  async function deletePromo(id) {
    if (!window.confirm('¿Eliminar esta campaña/notificación?')) return
    setPromotions((prev) => prev.filter((p) => p.id !== id))
    await supabase.from('promotions').delete().eq('id', id)
  }

  async function addLocationAlert() {
    if (!newAlert.titulo || !newAlert.mensaje || !newAlert.lat || !newAlert.lng) return
    const { data, error } = await supabase
      .from('location_alerts')
      .insert({
        titulo: newAlert.titulo,
        mensaje: newAlert.mensaje,
        lat: Number(newAlert.lat),
        lng: Number(newAlert.lng)
      })
      .select()
      .single()
    if (!error && data) {
      setLocationAlerts((prev) => [data, ...prev])
      setNewAlert({ titulo: '', mensaje: '', lat: '', lng: '' })
    }
  }

  async function updateAlertField(id, field, value) {
    setLocationAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
    await supabase.from('location_alerts').update({ [field]: value }).eq('id', id)
  }

  function toggleAlertDia(alert, dia) {
    const actuales = alert.dias_semana ?? []
    const nuevos = actuales.includes(dia) ? actuales.filter((d) => d !== dia) : [...actuales, dia].sort()
    updateAlertField(alert.id, 'dias_semana', nuevos)
  }

  async function deleteLocationAlert(id) {
    if (!window.confirm('¿Eliminar esta alerta de cercanía?')) return
    setLocationAlerts((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('location_alerts').delete().eq('id', id)
  }

  function exportCSV() {
    const rows = [
      ['Cliente', 'N° socio', 'Nivel', 'Puntos', 'Última visita'],
      ...customers.map((c) => [c.full_name, c.member_number, c.tier, c.points, c.last_visit_at ?? ''])
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'club-varos-estadisticas.csv'
    link.click()
  }

  return (
    <div className="px-4 pt-8 pb-10 lg:px-6">
      <IconSprite />
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
          <h1 className="font-head text-2xl font-semibold">Panel admin</h1>
        </div>
        <button onClick={exportCSV} className="font-head text-xs font-semibold px-3 py-2 rounded-lg border border-ember/30 bg-ember/10 text-ember">
          ⬇ Exportar
        </button>
      </div>

      {/* En mobile esto es una sola columna, igual que siempre. En desktop se
          parte en dos: la navegación queda fija a la izquierda y el resto
          (stats, premios pendientes, listas siempre visibles, Ajustes) respira
          con más ancho a la derecha. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <nav className="hidden lg:flex lg:flex-col lg:gap-1.5 lg:w-56 lg:shrink-0 lg:sticky lg:top-6">
          <div className="font-mono text-[10px] tracking-[0.2em] text-paper/35 uppercase px-2 mb-1">Navegación</div>
          {NAV_ITEMS.map((item) => (
            <NavCardCompact key={item.to} item={item} />
          ))}
        </nav>

        <div className="lg:flex-1 lg:min-w-0">
          {/* Franja de stats sin cajas individuales — se lee de un vistazo,
              cero clics. Dirección "Escaneo": el dueño la mira parado en el
              local, no se sienta a leer tarjetas. */}
          <div className="flex divide-x divide-white/10 bg-inkSoft rounded-xl py-3 mb-6">
            <div className="flex-1 text-center">
              <div className="font-display text-2xl tabular-nums">{customers.length}</div>
              <div className="font-mono text-[9px] text-paper/35 uppercase tracking-wider mt-0.5">Socios</div>
            </div>
            <div className="flex-1 text-center">
              <div className="font-display text-2xl text-ember tabular-nums">{redemptions.length}</div>
              <div className="font-mono text-[9px] text-paper/35 uppercase tracking-wider mt-0.5">Canjes</div>
            </div>
            <div className="flex-1 text-center">
              <div className="font-display text-2xl tabular-nums">{inactive.length}</div>
              <div className="font-mono text-[9px] text-paper/35 uppercase tracking-wider mt-0.5">Inactivos</div>
            </div>
          </div>

          {/* Las mismas 8 rutas de navegación, pero como grilla de íconos —
              solo en mobile; en desktop ya están en la barra fija de arriba. */}
          <div className="lg:hidden grid grid-cols-4 gap-2 mb-6">
            {NAV_ITEMS.map((item) => (
              <NavGridMobile key={item.to} item={item} />
            ))}
          </div>

      {/* Premios pendientes: va abierto y arriba de todo, y no dentro de un
          acordeón, porque es lo único del panel que tiene a una persona
          esperando algo. Si no hay ninguno pendiente, desaparece. */}
      {pendientes.length > 0 && (
        <div className="bg-gold/10 border border-gold/40 rounded-2xl p-4 mb-4">
          <div className="font-head font-semibold text-sm text-gold mb-0.5">
            {pendientes.length === 1 ? 'Hay un premio por entregar' : `Hay ${pendientes.length} premios por entregar`}
          </div>
          <p className="text-[11px] text-paper/50 mb-3">
            Completaron sus 5 visitas. Marca la entrega cuando se lo hayas dado.
          </p>
          {pendientes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-t border-gold/15 text-xs">
              <div className="min-w-0">
                <div className="text-paper truncate">{p.customers?.full_name ?? 'Cliente eliminado'}</div>
                <div className="text-gold/80 truncate">{p.producto || 'Sin premio configurado'}</div>
                <div className="text-paper/35 text-[10px]">
                  {p.customers?.member_number} · {formatFechaCorta(p.fecha_ganado)}
                </div>
              </div>
              <button
                onClick={() => entregarPremio(p)}
                className="shrink-0 px-3 py-2 rounded-lg font-head font-semibold text-[11px] text-ink bg-gradient-to-br from-gold to-bronze"
              >
                Entregado
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- CLIENTES: siempre visible, sin acordeón — es lo primero que el
          dueño necesita ver de un vistazo, junto con Menú e Historial. ---- */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-head text-xs font-semibold">Clientes</span>
          <span className="font-mono text-[10px] text-paper/35">{customers.length}</span>
        </div>
        <TablaClientesDesktop
          customers={customers}
          premioEstrellas={premioEstrellas}
          agregarEstrella={agregarEstrella}
          quitarEstrella={quitarEstrella}
          eliminarCliente={eliminarCliente}
        />
        <div className="lg:hidden max-h-72 overflow-y-auto">
        {customers.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex justify-between items-center gap-2">
              <div>
                <div className="text-paper">{c.full_name}</div>
                <div className="text-paper/40 text-[10px]">{c.estrellas_actuales ?? 0} de 5 ⭐</div>
              </div>
              <span className="text-ember text-[11px] text-right max-w-[110px]">
                {premioEstrellas ? `Ganaría: ${premioEstrellas}` : 'Sin premio configurado'}
              </span>
            </div>
            <div className="flex justify-end items-center gap-1.5">
              <button
                onClick={() => quitarEstrella(c)}
                disabled={(c.estrellas_actuales ?? 0) <= 0}
                className="w-6 h-6 rounded-md border border-white/10 text-paper/60 disabled:opacity-30"
              >
                −
              </button>
              <button
                onClick={() => agregarEstrella(c)}
                className="w-6 h-6 rounded-md border border-ember/40 text-ember"
              >
                +
              </button>
              <button
                onClick={() => eliminarCliente(c)}
                className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs py-2">Sin clientes registrados aún.</p>}
        </div>
      </div>

      {/* ---- MENÚ: siempre visible, sin acordeón ---- */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-head text-xs font-semibold">Menú</span>
          <span className="font-mono text-[10px] text-paper/35">{menuItems.length}</span>
        </div>
        <div className="flex flex-col gap-2 mb-3">
          <input
            placeholder="Nombre del plato"
            value={newDish.name}
            onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <input
            placeholder="Descripción"
            value={newDish.description}
            onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Precio CLP"
              value={newDish.price_clp}
              onChange={(e) => setNewDish({ ...newDish, price_clp: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <select
              value={newDish.category}
              onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
            >
              <option>Entradas</option>
              <option>Platos principales</option>
              <option>Postres</option>
              <option>Bebidas</option>
            </select>
          </div>
          <button
            onClick={addDish}
            disabled={savingDish}
            className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink"
          >
            {savingDish ? 'Agregando…' : '+ Agregar plato al menú'}
          </button>
        </div>

        <TablaMenuDesktop
          menuItems={menuItems}
          toggleDish={toggleDish}
          updateDishPrice={updateDishPrice}
          deleteDish={deleteDish}
        />
        <div className="lg:hidden flex flex-col max-h-72 overflow-y-auto">
          {menuItems.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
              <div className="flex-1">
                <div className={m.available ? 'text-paper' : 'text-paper/30 line-through'}>{m.name}</div>
                <div className="text-paper/35 text-[10px]">{m.category}</div>
              </div>
              <input
                type="number"
                value={m.price_clp}
                onChange={(e) => updateDishPrice(m.id, Number(e.target.value))}
                className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
              />
              <button onClick={() => toggleDish(m.id, m.available)} className="px-2 py-1 rounded-md border border-white/10 text-[10px]">
                {m.available ? 'Ocultar' : 'Mostrar'}
              </button>
              <button onClick={() => deleteDish(m.id)} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px]">
                Eliminar
              </button>
            </div>
          ))}
          {menuItems.length === 0 && <p className="text-paper/35 text-xs py-2">Aún no has agregado platos — usa el formulario de arriba.</p>}
        </div>
      </div>

      {/* ---- HISTORIAL DE CANJES: siempre visible, sin acordeón ---- */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="font-head text-xs font-semibold">Historial de canjes</span>
          <span className="font-mono text-[10px] text-paper/35">{redemptions.length}</span>
        </div>
        <TablaCanjesDesktop redemptions={redemptions} />
        <div className="lg:hidden max-h-72 overflow-y-auto">
        {redemptions.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{r.customers?.full_name} — {r.rewards?.name}</span>
            <span className="font-mono text-wineSoft">-{r.points_spent}</span>
          </div>
        ))}
        {redemptions.length === 0 && <p className="text-paper/35 text-xs">Sin canjes todavía.</p>}
        </div>
      </div>

      {/* ---- AJUSTES: todo lo demás vive acá, colapsado por defecto — un
          solo acordeón largo con sub-encabezados simples, no 8 acordeones
          anidados. ---- */}
      <Seccion titulo="⚙️ Ajustes">
        <div className="flex flex-col gap-6">
          {/* QR de bienvenida del local */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">QR de bienvenida del local</div>
            <div className="flex flex-col items-center text-center gap-3">
              <p className="text-xs text-paper/55 max-w-xs">
                Imprime este código y ponlo en tus mesas o en la entrada. Cada cliente lo escanea con la cámara
                de su celular, entra con su email y su visita queda registrada automáticamente (+1 estrella ⭐).
              </p>
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG value={checkinUrl} size={160} />
              </div>
              <input
                value={checkinUrl}
                onChange={(e) => setCheckinUrl(e.target.value)}
                className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-center"
              />
              <p className="text-[10px] text-paper/35">
                Ahora mismo apunta a tu dirección local — cuando publiques la app (paso 6 del README), reemplaza este texto
                por tu URL final (ej. https://club.varos.cl/checkin) antes de imprimir el QR definitivo.
              </p>
            </div>
          </div>

          {/* Premio por 5 estrellas: único sub-encabezado en gold dentro de
              Ajustes — sigue tratado como la misma familia que la tarjeta
              gold de premios pendientes, arriba de todo. */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold/70 mb-3">Premio por 5 estrellas</div>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-paper/45">
                Lo que gana el cliente al completar sus 5 visitas. Se muestra en su ticket ganador.
              </p>
              <div className="flex gap-2">
                <input
                  value={premioEstrellas}
                  onChange={(e) => setPremioEstrellas(e.target.value)}
                  placeholder="Ej: Postre a elección"
                  className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
                />
                <button
                  onClick={guardarPremioEstrellas}
                  disabled={savingPremio}
                  className="px-4 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
                >
                  {savingPremio ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  onClick={toggleVisiblePremio}
                  className={`px-3 rounded-lg font-head font-semibold text-xs border whitespace-nowrap ${premioVisible ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
                >
                  {premioVisible ? 'Visible' : 'No visible'}
                </button>
              </div>
              <p className="text-[10px] text-paper/35">
                {premioVisible
                  ? 'El cliente ve el nombre del premio en su ticket ganador.'
                  : 'El cliente NO ve el nombre del premio — solo el garzón sabrá cuál es.'}
              </p>
            </div>
          </div>

          {/* Campañas y notificaciones */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Campañas y notificaciones</span>
              <span className="font-mono text-[10px] text-paper/35">{promotions.length}</span>
            </div>
            <p className="text-[11px] text-paper/45 mb-2">
              Escribe un título y un mensaje, elige a quién va dirigido, y aparecerá dentro de la app del cliente en su Club Varo's.
            </p>
            <div className="flex flex-col gap-2 mb-3">
              <input
                placeholder="Título (ej. 2x1 en pisco sour)"
                value={newPromo.title}
                onChange={(e) => setNewPromo({ ...newPromo, title: e.target.value })}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="Mensaje para el cliente"
                value={newPromo.message}
                onChange={(e) => setNewPromo({ ...newPromo, message: e.target.value })}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={newPromo.target_customer_id}
                onChange={(e) => setNewPromo({ ...newPromo, target_customer_id: e.target.value })}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
              >
                <option value="">Todos los clientes</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-[11px] text-paper/60 px-1">
                <input
                  type="checkbox"
                  checked={newPromo.enviarPush}
                  onChange={(e) => setNewPromo({ ...newPromo, enviarPush: e.target.checked })}
                />
                🔔 Enviar también como notificación push (a quienes las activaron)
              </label>
              <button
                onClick={addPromo}
                disabled={enviandoPush}
                className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
              >
                {enviandoPush ? 'Enviando push…' : '+ Enviar campaña'}
              </button>
              {pushResultado && <p className="text-[11px] text-paper/50">{pushResultado}</p>}
            </div>
            {promotions.map((p) => (
              <div key={p.id} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
                <div className="flex-1">
                  <div className="text-paper">{p.title}</div>
                  <div className="text-paper/40 text-[10px]">{p.message}</div>
                  <div className="text-ember/70 text-[10px] mt-0.5">
                    {p.target_customer_id ? (customers.find((c) => c.id === p.target_customer_id)?.full_name ?? 'Cliente eliminado') : 'Todos los clientes'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => togglePromo(p.id, p.active)}
                    className={`px-2 py-1 rounded-md text-[10px] border whitespace-nowrap ${p.active ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
                  >
                    {p.active ? 'Activa' : 'Inactiva'}
                  </button>
                  <button onClick={() => deletePromo(p.id)} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {promotions.length === 0 && <p className="text-paper/35 text-xs">Sin campañas creadas.</p>}
          </div>

          {/* Alertas por cercanía (GPS) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Alertas por cercanía (GPS)</span>
              <span className="font-mono text-[10px] text-paper/35">{locationAlerts.length}</span>
            </div>
            <p className="text-[11px] text-paper/45 mb-3">
              Un mensaje distinto según en qué coordenada esté el cliente. Ojo: NO es una notificación push del celular
              (eso requiere una app nativa) — es un aviso que aparece dentro de la app cuando el cliente la tiene abierta
              y su GPS lo ubica cerca de ese punto, en el día y horario que configures.
            </p>
            <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/5">
              <input
                placeholder="Título (ej. Publicidad zona 3)"
                value={newAlert.titulo}
                onChange={(e) => setNewAlert({ ...newAlert, titulo: e.target.value })}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="Mensaje para el cliente"
                value={newAlert.mensaje}
                onChange={(e) => setNewAlert({ ...newAlert, mensaje: e.target.value })}
                className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Latitud (ej. -18.489485)"
                  value={newAlert.lat}
                  onChange={(e) => setNewAlert({ ...newAlert, lat: e.target.value })}
                  className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
                />
                <input
                  placeholder="Longitud (ej. -70.285883)"
                  value={newAlert.lng}
                  onChange={(e) => setNewAlert({ ...newAlert, lng: e.target.value })}
                  className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>
              <button onClick={addLocationAlert} className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink">
                + Agregar coordenada
              </button>
            </div>

            {locationAlerts.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 py-3 border-b border-white/5 last:border-b-0 text-xs">
                <div className="flex justify-between items-start gap-2">
                  <input
                    defaultValue={a.titulo}
                    onBlur={(e) => e.target.value !== a.titulo && updateAlertField(a.id, 'titulo', e.target.value)}
                    className="flex-1 bg-ink border border-white/10 rounded-lg px-2 py-1.5 text-paper font-head font-semibold"
                  />
                  <button
                    onClick={() => updateAlertField(a.id, 'activo', !a.activo)}
                    className={`px-2 py-1 rounded-md text-[10px] border whitespace-nowrap ${a.activo ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
                  >
                    {a.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
                <textarea
                  defaultValue={a.mensaje}
                  onBlur={(e) => e.target.value !== a.mensaje && updateAlertField(a.id, 'mensaje', e.target.value)}
                  className="bg-ink border border-white/10 rounded-lg px-2 py-1.5 text-paper/70 resize-none"
                  rows={2}
                />
                <div className="text-paper/35 text-[10px] font-mono">
                  📍 {a.lat}, {a.lng} — radio {a.radio_metros} m
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((letra, dia) => (
                    <button
                      key={dia}
                      onClick={() => toggleAlertDia(a, dia)}
                      className={`w-6 h-6 rounded-md border text-[10px] ${
                        (a.dias_semana ?? []).includes(dia) || !a.dias_semana?.length
                          ? 'border-ember/40 text-ember'
                          : 'border-white/10 text-paper/30'
                      }`}
                      title={(a.dias_semana ?? []).length === 0 ? 'Todos los días (toca para elegir días específicos)' : undefined}
                    >
                      {letra}
                    </button>
                  ))}
                  <span className="text-paper/30 text-[10px] ml-1">{(a.dias_semana ?? []).length === 0 ? 'todos los días' : 'días marcados'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-paper/40 text-[10px]">Desde</span>
                  <input
                    type="time"
                    defaultValue={a.hora_inicio ?? ''}
                    onBlur={(e) => updateAlertField(a.id, 'hora_inicio', e.target.value || null)}
                    className="bg-ink border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono"
                  />
                  <span className="text-paper/40 text-[10px]">hasta</span>
                  <input
                    type="time"
                    defaultValue={a.hora_fin ?? ''}
                    onBlur={(e) => updateAlertField(a.id, 'hora_fin', e.target.value || null)}
                    className="bg-ink border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono"
                  />
                  <button onClick={() => deleteLocationAlert(a.id)} className="ml-auto px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap">
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {locationAlerts.length === 0 && <p className="text-paper/35 text-xs">Sin alertas configuradas.</p>}
          </div>

          {/* Regla de puntos */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">Regla de puntos — cada {rule} CLP = 1 punto</div>
            <div className="flex items-center gap-2 text-xs">
              <span>Cada</span>
              <input type="number" value={rule} onChange={(e) => updateRule(Number(e.target.value))} className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember" />
              <span>CLP = 1 punto</span>
            </div>
          </div>

          {/* Recompensas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Recompensas</span>
              <span className="font-mono text-[10px] text-paper/35">{rewards.length}</span>
            </div>
            <p className="text-[11px] text-paper/40 mb-2">Elige qué recompensas ven tus clientes en "Canjea tus puntos".</p>
            {rewards.map((r) => (
              <div key={r.id} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
                <span className={r.active ? 'text-paper' : 'text-paper/30 line-through'}>{r.icon} {r.name}</span>
                <input
                  type="number"
                  value={r.cost_points}
                  onChange={(e) => updateRewardCost(r.id, Number(e.target.value))}
                  className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
                />
                <button
                  onClick={() => toggleReward(r.id, r.active)}
                  className={`px-2 py-1.5 rounded-md border text-[10px] whitespace-nowrap ${r.active ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
                >
                  {r.active ? 'Visible' : 'Oculta'}
                </button>
              </div>
            ))}
            {rewards.length === 0 && <p className="text-paper/35 text-xs py-2">Aún no tienes recompensas creadas.</p>}
          </div>

          {/* Ranking de clientes */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">Ranking de clientes</div>
            {customers.slice(0, 8).map((c, i) => (
              <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
                <span><span className="font-mono text-ember mr-2">{i + 1}</span>{c.full_name}</span>
                <span className="font-mono">{c.points}</span>
              </div>
            ))}
            {customers.length === 0 && <p className="text-paper/35 text-xs">Sin datos aún.</p>}
          </div>

          {/* Clientes inactivos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Clientes inactivos (+30 días)</span>
              <span className="font-mono text-[10px] text-paper/35">{inactive.length}</span>
            </div>
            {inactive.map((c) => (
              <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
                <span>{c.full_name}</span>
                <span className="font-mono text-wineSoft bg-wine/20 px-2 py-0.5 rounded-full">
                  {Math.floor((now - new Date(c.last_visit_at).getTime()) / 86400000)} días
                </span>
              </div>
            ))}
            {inactive.length === 0 && <p className="text-paper/35 text-xs">No hay clientes inactivos por ahora.</p>}
          </div>
        </div>
      </Seccion>
        </div>
      </div>
    </div>
  )
}
