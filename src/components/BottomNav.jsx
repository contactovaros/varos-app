import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Iconos de un solo trazo, todos con la misma caja, grosor y estilo de remate.
// Antes eran emoji (📖 🧾 ⭐ 🛠️ 🪑 📅): cada uno venía de una familia visual
// distinta y el de reservas traía una fecha ajena impresa dentro.
function Icono({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block w-full h-full"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const IconoClub = (
  <Icono>
    <path d="M12 3.6l2.5 5.2 5.6.8-4 4 .9 5.7-5-2.7-5 2.7.9-5.7-4-4 5.6-.8z" />
  </Icono>
)

const IconoAdmin = (
  <Icono>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
  </Icono>
)

const IconoMesas = (
  <Icono>
    <circle cx="12" cy="12" r="4.4" />
    <path d="M3.2 12h4.4M16.4 12h4.4M12 3.2v4.4M12 16.4v4.4" />
  </Icono>
)

const IconoReservas = (
  <Icono>
    <rect x="3.4" y="5" width="17.2" height="15.6" rx="2.2" />
    <path d="M3.4 9.6h17.2M8.2 3.4v3.2M15.8 3.4v3.2" />
    <circle cx="12" cy="14.6" r="1.5" />
  </Icono>
)

const IconoSommelier = (
  <Icono>
    <path d="M7 3.5h10l-1.2 8.4A3.8 3.8 0 0 1 12 15.5a3.8 3.8 0 0 1-3.8-3.6z" />
    <path d="M12 15.5v4M8.6 19.5h6.8" />
  </Icono>
)

const IconoCarta = (
  <Icono>
    <rect x="5" y="3.4" width="14" height="17.2" rx="1.6" />
    <path d="M8.4 8h7.2M8.4 11.5h7.2M8.4 15h4" />
  </Icono>
)

const itemsAdmin = [
  { to: '/club', label: 'Club', icon: IconoClub },
  { to: '/carta2', label: 'Carta', icon: IconoCarta },
  { to: '/sommelier', label: 'Sommelier', icon: IconoSommelier },
  { to: '/admin', label: 'Admin', icon: IconoAdmin },
  { to: '/admin/mesas', label: 'Mesas', icon: IconoMesas },
  { to: '/admin/reservas', label: 'Reservas', icon: IconoReservas }
]

// Admin marca todo /admin salvo Mesas y Reservas, que tienen su propio botón.
// Con NavLink quedaban dos encendidos a la vez en /admin/mesas.
function estaActivo(to, pathname) {
  if (to === '/') return pathname === '/'
  if (to === '/admin') return pathname.startsWith('/admin') && !['/admin/mesas', '/admin/reservas'].includes(pathname)
  return pathname === to || pathname.startsWith(`${to}/`)
}

// Lo del salón y el club a la izquierda, lo de administrar a la derecha.
const DE_ADMIN = ['/admin', '/admin/mesas', '/admin/reservas']

// Escritorio: encabezado fijo arriba, a todo el ancho. Antes era la misma barra
// del celular, de 448 px, flotando chica al pie de una pantalla de 1300 px.
// Va antes del contenido en el DOM para que el teclado la recorra primero.
export function NavEscritorio() {
  const { isAdmin } = useAuth()
  const { pathname } = useLocation()
  if (!isAdmin) return null

  const enlace = (item) => {
    const activo = estaActivo(item.to, pathname)
    return (
      <li key={item.to}>
        <Link
          to={item.to}
          aria-current={activo ? 'page' : undefined}
          className={`flex items-center gap-2 h-9 px-3 rounded-lg font-head text-sm transition-colors duration-150 ease-salida ${
            activo ? 'bg-ember/10 text-ember' : 'text-paper/70 hover:text-paper hover:bg-paper/5'
          }`}
        >
          <span className="w-[18px] h-[18px] shrink-0">{item.icon}</span>
          {item.label}
        </Link>
      </li>
    )
  }

  return (
    <header className="hidden lg:block sticky top-0 z-40 bg-ink/90 backdrop-blur border-b border-paper/10">
      <div className="max-w-7xl mx-auto h-14 px-6 flex items-center gap-8">
        <Link to="/admin" className="font-display text-[1.7rem] leading-none text-ember tracking-wide">
          Varo's
        </Link>
        <nav aria-label="Principal" className="flex-1 flex items-center">
          <ul className="flex items-center gap-1">{itemsAdmin.filter((i) => !DE_ADMIN.includes(i.to)).map(enlace)}</ul>
          <ul className="flex items-center gap-1 ml-auto pl-4 border-l border-paper/10">
            {itemsAdmin.filter((i) => DE_ADMIN.includes(i.to)).map(enlace)}
          </ul>
        </nav>
      </div>
    </header>
  )
}

// Celular: barra fija abajo. Ocupa todo el ancho (antes el fondo terminaba en
// 448 px y en tablet quedaba una franja suelta), respeta la zona del gesto de
// inicio del iPhone, y el activo lleva una píldora detrás del ícono además del
// color. Etiquetas a paper/60: a paper/40 no llegaban al contraste mínimo.
export default function BottomNav() {
  const { isAdmin } = useAuth()
  const { pathname } = useLocation()

  // Los clientes normales solo tienen una pantalla (su tarjeta), sin necesidad de navegación
  if (!isAdmin) return null

  return (
    <nav
      aria-label="Principal"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-ink/95 backdrop-blur border-t border-paper/10 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="max-w-md mx-auto flex px-1">
        {itemsAdmin.map((item) => {
          const activo = estaActivo(item.to, pathname)
          return (
            <li key={item.to} className="flex-1 min-w-0">
              <Link
                to={item.to}
                aria-current={activo ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 pt-2 pb-2.5 ${activo ? 'text-ember' : 'text-paper/60'}`}
              >
                <span
                  className={`flex items-center justify-center w-11 h-7 rounded-full transition-colors duration-150 ease-salida ${
                    activo ? 'bg-ember/15' : ''
                  }`}
                >
                  <span className="w-[21px] h-[21px]">{item.icon}</span>
                </span>
                <span className="text-[10px] min-[400px]:text-[11px] font-medium leading-none truncate max-w-full">
                  {item.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
