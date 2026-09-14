import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

// Navegación compartida de todo /admin: el sprite de íconos, el array de
// destinos y las dos formas de mostrarlos (grilla/tira compacta en mobile,
// sidebar sticky en desktop). Vive acá — y no en Admin.jsx — porque
// AdminLayout.jsx la usa para darle navegación persistente a las 9 páginas
// hijas (Caja, Garzones, Mesas del POS, etc.), no solo al panel principal.

// Las 12 tarjetas de navegación a pantallas completas (Link, no contenido
// in-page). Un solo array alimenta las distintas formas de mostrarlas:
// tarjetas grandes apiladas en el flujo o tira compacta (mobile) y una barra
// fija a la izquierda (desktop) — mismo destino y mismo texto, solo cambia
// la densidad.
// Orden por prioridad (pedido explícito del usuario, 2026-09-14 y ampliado
// el mismo día): el sistema de POS/comandas va primero — es lo que se usa a
// diario —, Clientes entra junto a ese grupo porque se consulta seguido,
// Menú queda al lado de Productos porque son la misma familia de datos, y
// Canjes/Ajustes cierran la lista: son los que menos se tocan.
export const NAV_ITEMS = [
  {
    to: '/admin/productos',
    mobileHeading: '💲 Productos',
    icon: 'i-tag',
    label: 'Productos',
    desc: 'Precio, disponibilidad y qué se muestra en la carta pública de varos.cl',
    accent: 'gold'
  },
  {
    to: '/admin/menu',
    mobileHeading: 'Menú',
    icon: 'i-book',
    label: 'Menú',
    desc: 'El menú interno del Club Varo’s — distinto de Productos, que es la carta pública de varos.cl',
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
    to: '/admin/clientes',
    mobileHeading: 'Clientes',
    icon: 'i-users',
    label: 'Clientes',
    desc: 'Socios del club, sus estrellas y el premio de 5 visitas',
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
  },
  {
    to: '/admin/canjes',
    mobileHeading: 'Historial de canjes',
    icon: 'i-swap',
    label: 'Canjes',
    desc: 'Qué recompensa canjeó cada cliente y cuándo',
    accent: 'ember'
  },
  {
    to: '/admin/ajustes',
    mobileHeading: 'Ajustes',
    icon: 'i-gear',
    label: 'Ajustes',
    desc: 'QR del local, premio de 5 estrellas, campañas, alertas GPS, regla de puntos, recompensas, ranking e inactivos',
    accent: 'ember'
  }
]

// Sprite con los 8 íconos monocromos de la Dirección "Escaneo" (ver mockup
// aprobado por el usuario). Se define una sola vez, oculto, y cada ícono se
// referencia con <use href="#i-tag">. Trazo fino (stroke-width 1.5), sin
// relleno — el mismo lenguaje visual que ya usa BottomNav.
export function IconSprite() {
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
      <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 4.5c2-1 5-1 8 0 3-1 6-1 8 0v14c-2-1-5-1-8 0-3-1-6-1-8 0V4.5Z" /><path d="M12 4.5v14" /></symbol>
      <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c0-3.6 2.5-6.5 5.5-6.5s5.5 2.9 5.5 6.5" /><circle cx="17" cy="7.5" r="2.2" /><path d="M15 13.6c2.5.5 4.5 3 4.5 6.4" /></symbol>
      <symbol id="i-swap" viewBox="0 0 24 24"><path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" /><path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" /></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" /></symbol>
    </svg>
  )
}

// Un ícono del sprite de arriba, listo para usar con el mismo trazo en
// cualquier tamaño (tira mobile, grilla o sidebar compacta de escritorio).
export function NavIcon({ id, className = 'w-4 h-4' }) {
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

// Grilla/tira de escaneo — ícono + label corto, sin descripción a la vista
// (la descripción larga queda de tooltip). Gana velocidad de lectura sobre
// personalidad: es lo que el dueño mira parado en el local muchas veces al
// día, no algo para detenerse a leer.
// `compact` la achica para vivir arriba de CUALQUIER página de admin (vía
// AdminLayout) sin pesar tanto como la grilla grande original de /admin —
// ahí se muestra en tira horizontal con scroll en vez de grid 4×2.
export function NavGridMobile({ item, compact = false }) {
  const location = useLocation()
  const active = location.pathname === item.to
  return (
    <Link
      to={item.to}
      title={item.desc}
      data-nav-active={active ? 'true' : undefined}
      className={
        compact
          ? `flex flex-col items-center justify-center gap-1 rounded-lg py-2 w-16 shrink-0 border transition-colors duration-150 ease-salida ${active ? 'bg-ember/10 border-ember/50 text-ember' : 'bg-inkSoft border-transparent hover:bg-white/5 active:bg-white/5'}`
          : `flex flex-col items-center justify-center gap-1.5 rounded-lg py-3.5 border transition-colors duration-150 ease-salida ${active ? 'bg-ember/10 border-ember/50 text-ember' : 'bg-inkSoft border-transparent hover:bg-white/5 active:bg-white/5'}`
      }
    >
      <NavIcon id={item.icon} className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      <span className={`font-head text-center leading-tight ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{item.label}</span>
    </Link>
  )
}

// Envoltorio de la tira horizontal: la hace autodesplazarse hasta la página
// activa al entrar o cambiar de ruta (si no, entrar directo a Canjes o
// Ajustes — los últimos del array — los deja fuera de vista, obligando a
// swipear a ciegas) y agrega degradés en los bordes cuando hay más ítems
// fuera de pantalla, para que se note que la tira scrollea.
export function NavStrip({ className = '' }) {
  const containerRef = useRef(null)
  const location = useLocation()
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)

  const updateFades = () => {
    const el = containerRef.current
    if (!el) return
    setShowLeft(el.scrollLeft > 0)
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const activeEl = el.querySelector('[data-nav-active="true"]')
    if (activeEl) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      activeEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion ? 'auto' : 'instant' })
    }
    updateFades()
  }, [location.pathname])

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} onScroll={updateFades} className="flex gap-2 overflow-x-auto px-4 pt-4 pb-2">
        {NAV_ITEMS.map((item) => (
          <NavGridMobile key={item.to} item={item} compact />
        ))}
      </div>
      {showLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-ink to-transparent" />
      )}
      {showRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-ink to-transparent" />
      )}
    </div>
  )
}

// Versión compacta para la barra fija de escritorio: ícono + label, la
// descripción larga queda como tooltip (title) en vez de ocupar dos líneas.
export function NavCardCompact({ item }) {
  const a = NAV_ACCENTS[item.accent]
  const location = useLocation()
  const active = location.pathname === item.to
  return (
    <Link
      to={item.to}
      title={item.desc}
      className={
        active
          ? 'flex items-center gap-2.5 bg-ember/10 border border-ember/50 text-ember rounded-xl px-3 py-2.5 transition-colors duration-150 ease-salida'
          : `flex items-center gap-2.5 bg-inkSoft border ${a.border} rounded-xl px-3 py-2.5 transition-colors duration-150 ease-salida ${a.hover} ${a.active}`
      }
    >
      <NavIcon id={item.icon} className="w-4 h-4 shrink-0" />
      <span className="font-head text-xs font-medium truncate">{item.label}</span>
    </Link>
  )
}
