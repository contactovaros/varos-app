import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

// Navegación compartida de todo /admin: el sprite de íconos, el array de
// destinos y el menú desplegable que los muestra agrupados (AdminMenu, más
// abajo). Vive acá — y no en Admin.jsx — porque AdminLayout.jsx la usa para
// darle navegación persistente a las páginas hijas (Caja, Garzones, Mesas del
// POS, etc.), no solo al panel principal.

// Los destinos de navegación a pantallas completas (Link, no contenido
// in-page). Este array guarda los datos de cada uno (texto, ícono,
// descripción); NAV_GROUPS, más abajo, decide en qué grupo del menú aparece.
// El orden del array ya no manda: manda el de los grupos.
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
    to: '/carta2',
    mobileHeading: 'Carta 2.0',
    icon: 'i-menu-card',
    label: 'Carta 2.0',
    desc: 'Vista pública de la carta, para compartir el link directo con un cliente',
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
    to: '/cocina',
    mobileHeading: 'Cocina',
    icon: 'i-cook',
    label: 'Cocina',
    desc: 'Pantalla de cocina: las comandas para preparar. Se entra con el código de cocina',
    accent: 'gold',
    nuevo: true
  },
  {
    to: '/barra',
    mobileHeading: 'Barra',
    icon: 'i-bar',
    label: 'Barra',
    desc: 'Pantalla de la barra: las bebidas de cada comanda. Se entra con el código de la barra',
    accent: 'gold',
    nuevo: true
  },
  {
    to: '/cocina?tv=1',
    mobileHeading: 'Cocina en TV',
    icon: 'i-tv',
    label: 'Cocina en TV',
    desc: 'La misma pantalla de cocina en modo solo mirar, para la TV. Se entra con el código de cocina',
    accent: 'gold'
  },
  {
    to: '/mozo',
    mobileHeading: 'Mozo',
    icon: 'i-phone',
    label: 'Mozo',
    desc: 'Pantalla del garzón: tomar pedidos y cobrar desde el celular. Se entra con el código de garzón',
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
  },
  {
    to: '/admin/reservas',
    mobileHeading: 'Reservas',
    icon: 'i-calendar',
    label: 'Reservas',
    desc: 'Lista de reservas: ver, confirmar por WhatsApp y cancelar',
    accent: 'ember'
  },
  {
    to: '/reservas',
    mobileHeading: 'Página de reservas',
    icon: 'i-link',
    label: 'Reservar (público)',
    desc: 'La página que ve el cliente para reservar mesa, para compartir el link directo',
    accent: 'ember'
  },
  {
    to: '/club',
    mobileHeading: 'Club Varo’s',
    icon: 'i-star',
    label: 'Club (público)',
    desc: 'La tarjeta del Club como la ve el socio: estrellas y premio de 5 visitas',
    accent: 'ember'
  },
  {
    to: '/sommelier',
    mobileHeading: 'Sommelier',
    icon: 'i-glass',
    label: 'Sommelier (público)',
    desc: 'El sommelier virtual: recomienda qué tomar según lo que se va a comer',
    accent: 'ember'
  },
  {
    to: '/mostrar-qr',
    mobileHeading: 'QR del local',
    icon: 'i-qr',
    label: 'QR del local',
    desc: 'Muestra en pantalla el QR que los socios escanean para sumar su visita',
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
      <symbol id="i-menu-card" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.6" /><path d="M8.3 8h7.4M8.3 11.8h7.4M8.3 15.6h4.2" /></symbol>
      <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c0-3.6 2.5-6.5 5.5-6.5s5.5 2.9 5.5 6.5" /><circle cx="17" cy="7.5" r="2.2" /><path d="M15 13.6c2.5.5 4.5 3 4.5 6.4" /></symbol>
      <symbol id="i-swap" viewBox="0 0 24 24"><path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" /><path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" /></symbol>
      <symbol id="i-cook" viewBox="0 0 24 24"><path d="M5.5 11h13v6a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-6Z" /><path d="M3.5 11h17" /><path d="M9 7.5c0-1.6 1.2-1.6 1.2-3.2M14 7.5c0-1.6 1.2-1.6 1.2-3.2" /></symbol>
      <symbol id="i-bar" viewBox="0 0 24 24"><path d="M4 5h16l-8 9-8-9Z" /><path d="M12 14v6M8 20h8" /></symbol>
      <symbol id="i-tv" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></symbol>
      <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" /></symbol>
      <symbol id="i-glass" viewBox="0 0 24 24"><path d="M8 3h8v5a4 4 0 0 1-8 0V3Z" /><path d="M12 12v8M9 20h6" /></symbol>
      <symbol id="i-qr" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" /></symbol>
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

// Grupos del menú. Cada grupo lista las rutas que contiene; los datos de cada
// enlace (label, icono, descripción) siguen viviendo en NAV_ITEMS, así que un
// enlace nuevo se agrega ahí y se nombra acá en el grupo que le corresponda.
// El orden es el de uso: lo que se toca todos los días primero, Club y negocio
// (lo que menos se abre) al final.
const NAV_GROUPS = [
  { id: 'dia', label: 'Día a día', rutas: ['/mozo', '/cocina', '/barra', '/cocina?tv=1', '/admin/caja', '/admin/garzones', '/admin/mesas-pos'] },
  { id: 'carta', label: 'Carta', rutas: ['/admin/productos', '/admin/menu', '/carta2'] },
  { id: 'salon', label: 'Salón', rutas: ['/admin/reservas', '/admin/mesa-trabajo', '/admin/mesas', '/admin/plano'] },
  { id: 'club', label: 'Club y negocio', rutas: ['/admin/clientes', '/admin/canjes', '/admin/resenas', '/admin/ajustes'] },
  { id: 'publico', label: 'Para clientes', rutas: ['/reservas', '/club', '/sommelier', '/mostrar-qr'] }
].map((g) => ({ ...g, items: g.rutas.map((to) => NAV_ITEMS.find((i) => i.to === to)).filter(Boolean) }))

// Un solo botón que abre todos los destinos de /admin, agrupados. Reemplaza a
// la barra lateral fija y a la tira que había que deslizar (pedido del
// usuario, 2026-09-21): la pantalla de trabajo queda con todo el ancho y en el
// celular se ven los 14 destinos de una vez. Cerrado por defecto — se abre
// cuando hace falta y se cierra solo al elegir un destino, al tocar fuera o con
// Escape.
export function AdminMenu({ className = '' }) {
  const location = useLocation()
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef(null)
  const boton = useRef(null)
  const actual = NAV_ITEMS.find((i) => i.to === location.pathname)

  useEffect(() => {
    setAbierto(false)
  }, [location.pathname])

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false)
    }
    const tecla = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        boton.current?.focus()
      }
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={contenedor} className={`relative px-4 pt-4 pb-2 ${className}`}>
      <div className="flex items-center gap-3">
        <button
          ref={boton}
          type="button"
          aria-expanded={abierto}
          aria-controls="admin-menu"
          onClick={() => setAbierto((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-head text-sm transition-colors duration-150 ease-salida ${
            abierto
              ? 'bg-ember/10 border-ember/50 text-ember'
              : 'bg-inkSoft border-paper/20 text-paper hover:border-ember/50 active:border-ember/50'
          }`}
        >
          <NavIcon id="i-grid" className="w-4 h-4" />
          Navegación
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-150 ease-salida ${abierto ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {actual && (
          <span className="text-xs text-paper/55 truncate">
            Estás en <span className="text-paper">{actual.label}</span>
          </span>
        )}
      </div>

      {abierto && (
        <nav
          id="admin-menu"
          aria-label="Todo el admin"
          className="absolute z-40 left-4 right-4 mt-2 rounded-2xl border border-paper/15 bg-inkSoft p-4 shadow-2xl shadow-black/50 origin-top motion-safe:animate-panel-in lg:left-0 lg:right-auto lg:w-[58rem] lg:max-w-[calc(100vw-3rem)] max-h-[calc(100dvh-6.5rem)] overflow-y-auto"
        >
          <div className="grid gap-4 lg:grid-cols-5">
            {NAV_GROUPS.map((g) => (
              <div key={g.id}>
                <div className="font-mono text-[10px] tracking-[0.2em] text-paper/40 uppercase px-2 mb-1.5">{g.label}</div>
                <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                  {g.items.map((item) => {
                    const activo = location.pathname === item.to
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        title={item.desc}
                        aria-current={activo ? 'page' : undefined}
                        className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors duration-150 ease-salida ${
                          activo
                            ? 'bg-ember/10 border-ember/50 text-ember'
                            : 'border-transparent text-paper hover:bg-paper/5 active:bg-paper/5'
                        }`}
                      >
                        <NavIcon id={item.icon} className={`w-4 h-4 shrink-0 ${activo ? '' : 'text-gold'}`} />
                        <span className="font-head text-xs font-medium leading-tight">{item.label}</span>
                        {item.nuevo && (
                          <span className="ml-auto rounded bg-ember px-1.5 py-px font-mono text-[9px] font-medium text-ink">nuevo</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
