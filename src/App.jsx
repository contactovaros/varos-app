import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext.jsx'
import BottomNav from './components/BottomNav.jsx'
import Menu from './pages/Menu.jsx'
import Cart from './pages/Cart.jsx'
import Club from './pages/Club.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import CheckIn from './pages/CheckIn.jsx'
import MostrarQR from './pages/MostrarQR.jsx'
import CompletarPerfil from './pages/CompletarPerfil.jsx'
import Reservas from './pages/Reservas.jsx'
import AdminMesas from './pages/AdminMesas.jsx'
import AdminReservas from './pages/AdminReservas.jsx'
import AdminMesaTrabajo from './pages/AdminMesaTrabajo.jsx'
import { useAuth } from './context/AuthContext.jsx'

export default function App() {
  const { session, customer, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-paper/50 text-sm">Cargando Varo's…</div>
  }

  // Reservar mesa es público: cualquier visitante del sitio web debe poder
  // hacerlo sin crear cuenta ni iniciar sesión.
  if (location.pathname === '/reservas') {
    return <Reservas />
  }

  // Si alguien entra a un link directo (QR del local, /admin/mesas, etc.) sin
  // sesión iniciada, lo mandamos a Login recordando esa misma ruta para volver
  // ahí apenas inicie sesión con Google.
  if (!session) {
    return <Login redirectPath={location.pathname} />
  }

  // Primera vez: le faltan datos de su tarjeta (nombre / fecha de nacimiento)
  if (customer && (!customer.full_name || !customer.birthday)) {
    return <CompletarPerfil />
  }

  return (
    <CartProvider>
      <div className="max-w-md mx-auto min-h-screen pb-24 relative">
        <Routes>
          <Route path="/" element={isAdmin ? <Menu /> : <Navigate to="/club" replace />} />
          <Route path="/pedidos" element={isAdmin ? <Cart /> : <Navigate to="/club" replace />} />
          <Route path="/club" element={<Club />} />
          <Route path="/perfil" element={<Navigate to="/club" replace />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/mesas" element={<AdminMesas />} />
          <Route path="/admin/reservas" element={<AdminReservas />} />
          <Route path="/admin/mesa-trabajo" element={<AdminMesaTrabajo />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/mostrar-qr" element={<MostrarQR />} />
        </Routes>
        <BottomNav />
      </div>
    </CartProvider>
  )
}
