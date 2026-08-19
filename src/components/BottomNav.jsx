import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Iconos de un solo trazo, todos con la misma caja, grosor y estilo de remate.
// Antes eran emoji (📖 🧾 ⭐ 🛠️ 🪑 📅): cada uno venía de una familia visual
// distinta y el de reservas traía una fecha ajena impresa dentro.
function Icono({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block mx-auto mb-1"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const IconoMenu = (
  <Icono>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 1 4 16z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 0 20 16z" />
  </Icono>
)

const IconoPedidos = (
  <Icono>
    <path d="M6 3.5 7.5 5 9 3.5 10.5 5 12 3.5 13.5 5 15 3.5 16.5 5 18 3.5v15.9a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 1 6 19.4z" />
    <path d="M9 9h6M9 12.5h6M9 16h3" />
  </Icono>
)

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

const itemsAdmin = [
  { to: '/', label: 'Menú', icon: IconoMenu, end: true },
  { to: '/pedidos', label: 'Pedidos', icon: IconoPedidos },
  { to: '/club', label: "Club Varo's", icon: IconoClub },
  { to: '/admin', label: 'Admin', icon: IconoAdmin },
  { to: '/admin/mesas', label: 'Mesas', icon: IconoMesas },
  { to: '/admin/reservas', label: 'Reservas', icon: IconoReservas }
]

export default function BottomNav() {
  const { isAdmin } = useAuth()

  // Los clientes normales solo tienen una pantalla (su tarjeta), sin necesidad de navegación
  if (!isAdmin) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur border-t border-white/5 flex px-2 pt-2 pb-5 max-w-md mx-auto">
      {itemsAdmin.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 text-center text-[10px] ${isActive ? 'text-ember' : 'text-paper/40'}`
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
