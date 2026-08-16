import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const itemsAdmin = [
  { to: '/', label: 'Menú', icon: '📖', end: true },
  { to: '/pedidos', label: 'Pedidos', icon: '🧾' },
  { to: '/club', label: "Club Varo's", icon: '⭐' },
  { to: '/admin', label: 'Admin', icon: '🛠️' },
  { to: '/admin/mesas', label: 'Mesas', icon: '🪑' },
  { to: '/admin/reservas', label: 'Reservas', icon: '📅' }
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
          <span className="block text-base mb-0.5">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
