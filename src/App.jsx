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
import Mozo from './pages/Mozo.jsx'
import AdminMesas from './pages/AdminMesas.jsx'
import AdminReservas from './pages/AdminReservas.jsx'
import AdminMesaTrabajo from './pages/AdminMesaTrabajo.jsx'
import AdminResenas from './pages/AdminResenas.jsx'
import AdminPlano from './pages/AdminPlano.jsx'
import AdminProductos from './pages/AdminProductos.jsx'
import Plano from './pages/Plano.jsx'
import PlanoFlujo from './pages/PlanoFlujo.jsx'
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

  // Pantalla del mozo: sin gate de admin, a propósito — mismo modelo de
  // seguridad que ya usa la pantalla de cocina del KDS (un secreto embebido
  // en la página, no login individual de Google). Ver varos-pos/DECISIONES.md.
  if (location.pathname === '/mozo') {
    return <Mozo />
  }

  // Un plano publicado también es público: se comparte por enlace y no debe
  // exigir cuenta. La RLS de `public.planos` es la que decide si hay algo que
  // mostrar — si está en borrador, la pantalla dice "no disponible".
  if (location.pathname.startsWith('/plano/')) {
    return (
      <Routes>
        <Route path="/plano/:id" element={<Plano />} />
        <Route path="/plano/:id/flujo" element={<PlanoFlujo />} />
      </Routes>
    )
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

  // El resto de la app va en una columna de ancho móvil, centrada, incluso en
  // desktop — se ensancha solo en las pantallas de admin que necesitan mostrar
  // una lista o plano junto a un panel lateral fijo: mesas, plano y productos.
  const anchoAmplio =
    location.pathname === '/admin/mesas' ||
    location.pathname === '/admin/plano' ||
    location.pathname === '/admin/productos'

  return (
    <CartProvider>
      <div className={`${anchoAmplio ? 'lg:max-w-7xl' : ''} max-w-md mx-auto min-h-screen pb-24 relative`}>
        <Routes>
          <Route path="/" element={isAdmin ? <Menu /> : <Navigate to="/club" replace />} />
          <Route path="/pedidos" element={isAdmin ? <Cart /> : <Navigate to="/club" replace />} />
          <Route path="/club" element={<Club />} />
          <Route path="/perfil" element={<Navigate to="/club" replace />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/mesas" element={<AdminMesas />} />
          <Route path="/admin/reservas" element={<AdminReservas />} />
          <Route path="/admin/mesa-trabajo" element={<AdminMesaTrabajo />} />
          <Route path="/admin/resenas" element={<AdminResenas />} />
          <Route path="/admin/plano" element={<AdminPlano />} />
          <Route path="/admin/productos" element={<AdminProductos />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/mostrar-qr" element={<MostrarQR />} />
        </Routes>
        <BottomNav />
      </div>
    </CartProvider>
  )
}
