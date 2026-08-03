import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const itemsCliente = [
  { to: '/club', label: "Club Varo's", icon: '⭐' },
  { to: '/perfil', label: 'Perfil', icon: '👤' }
]

const itemsAdmin = [
  { to: '/', label: 'Menú', icon: '📖', end: true },
  { to: '/pedidos', label: 'Pedidos', icon: '🧾' },
  { to: '/club', label: "Club Varo's", icon: '⭐' },
  { to: '/perfil', label: 'Perfil', icon: '👤' },
  { to: '/admin', label: 'Admin', icon: '🛠️' }
]

export default function BottomNav() {
  const { isAdmin } = useAuth()
  const list = isAdmin ? itemsAdmin : itemsCliente

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-ink/95 backdrop-blur border-t border-white/5 flex px-2 pt-2 pb-5 max-w-md mx-auto">
      {list.map((item) => (
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
