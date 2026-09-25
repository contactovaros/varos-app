import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext.jsx'
import BottomNav, { NavEscritorio } from './components/BottomNav.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import Menu from './pages/Menu.jsx'
import Cart from './pages/Cart.jsx'
import Club from './pages/Club.jsx'
import Admin from './pages/Admin.jsx'
import Login from './pages/Login.jsx'
import CheckIn from './pages/CheckIn.jsx'
import MostrarQR from './pages/MostrarQR.jsx'
import CompletarPerfil from './pages/CompletarPerfil.jsx'
import Reservas from './pages/Reservas.jsx'
import Carta2 from './pages/Carta2.jsx'
import Sommelier from './pages/Sommelier.jsx'
import Mozo from './pages/Mozo.jsx'
import Cocina from './pages/Cocina.jsx'
import AdminMesas from './pages/AdminMesas.jsx'
import AdminReservas from './pages/AdminReservas.jsx'
import AdminMesaTrabajo from './pages/AdminMesaTrabajo.jsx'
import AdminResenas from './pages/AdminResenas.jsx'
import AdminPlano from './pages/AdminPlano.jsx'
import AdminProductos from './pages/AdminProductos.jsx'
import AdminGarzones from './pages/AdminGarzones.jsx'
import AdminMesasPos from './pages/AdminMesasPos.jsx'
import AdminCaja from './pages/AdminCaja.jsx'
import AdminClientes from './pages/AdminClientes.jsx'
import AdminMenuInterno from './pages/AdminMenuInterno.jsx'
import AdminCanjes from './pages/AdminCanjes.jsx'
import AdminAjustes from './pages/AdminAjustes.jsx'
import Plano from './pages/Plano.jsx'
import PlanoFlujo from './pages/PlanoFlujo.jsx'
import { useAuth } from './context/AuthContext.jsx'

export default function App() {
  const { session, customer, isAdmin, loading } = useAuth()
  const location = useLocation()

  // Pantalla de cocina (tablet / TV con ?tv=1): sin sesión de Google ni gate de
  // admin — entra con un código de cocina propio validado por las funciones de
  // base, guardado en el localStorage del aparato. Va ANTES del "Cargando" para
  // no depender de que el login de Supabase responda (la TV nadie la toca).
  if (location.pathname === '/cocina') {
    return <Cocina />
  }

  // Pantalla de la barra: la misma pantalla de cocina pero con las bebidas y
  // estado propio. Mismo código de acceso, mismo `?tv=1`, mismo trato (fuera del
  // gate de admin y del "Cargando").
  if (location.pathname === '/barra') {
    return <Cocina estacion="barra" />
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-paper/50 text-sm">Cargando Varo's…</div>
  }

  // Reservar mesa es público: cualquier visitante del sitio web debe poder
  // hacerlo sin crear cuenta ni iniciar sesión.
  if (location.pathname === '/reservas') {
    return <Reservas />
  }

  // Carta pública de solo lectura ("carta2.0", nombre de trabajo — ver
  // DECISIONES.md). Pública igual que /reservas: cualquiera con el link debe
  // poder mirar la carta sin cuenta. Sin link visible desde ningún lado de la
  // app todavía — se abre a mano por URL mientras se prueba (ver ruta en la
  // decisión, ESTADO: decidido, sin ejecutar → en progreso).
  if (location.pathname === '/carta2') {
    return <Carta2 />
  }

  // Sommelier: consultor de bebidas. Público igual que /carta2 — cualquier
  // cliente sentado a la mesa debe poder abrirlo sin cuenta, y lee la misma
  // tabla (menu_items) filtrada a las categorías de bebida.
  if (location.pathname === '/sommelier') {
    return <Sommelier />
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
  // una lista o plano junto a un panel lateral fijo: mesas, plano, productos,
  // y las páginas nuevas con tablas de escritorio (clientes, menú, canjes,
  // ajustes). Ojo: AdminLayout.jsx mantiene su propia copia de esta lista
  // (ADMIN_WIDE_PATHS) para decidir sidebar vs. tira de nav — si se agrega
  // una ruta acá, hay que agregarla ahí también.
  const anchoAmplio =
    location.pathname === '/admin' ||
    location.pathname === '/admin/mesas' ||
    location.pathname === '/admin/plano' ||
    location.pathname === '/admin/productos' ||
    location.pathname === '/admin/clientes' ||
    location.pathname === '/admin/menu' ||
    location.pathname === '/admin/canjes' ||
    location.pathname === '/admin/ajustes'

  return (
    <CartProvider>
      <NavEscritorio />
      <div className={`${anchoAmplio ? 'lg:max-w-7xl' : ''} max-w-md mx-auto min-h-screen pb-24 lg:pb-10 relative`}>
        <Routes>
          <Route path="/" element={isAdmin ? <Menu /> : <Navigate to="/club" replace />} />
          <Route path="/pedidos" element={isAdmin ? <Cart /> : <Navigate to="/club" replace />} />
          <Route path="/club" element={<Club />} />
          <Route path="/perfil" element={<Navigate to="/club" replace />} />
          {/* Las 10 pantallas de admin comparten AdminLayout (navegación
              persistente — grilla/tira + sidebar) para poder saltar de una a
              otra sin volver a /admin. Rutas hijas relativas, sin el
              prefijo /admin/. Cada página conserva su propio chequeo
              isAdmin — el layout no gatea nada. */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Admin />} />
            <Route path="mesas" element={<AdminMesas />} />
            <Route path="reservas" element={<AdminReservas />} />
            <Route path="mesa-trabajo" element={<AdminMesaTrabajo />} />
            <Route path="resenas" element={<AdminResenas />} />
            <Route path="plano" element={<AdminPlano />} />
            <Route path="productos" element={<AdminProductos />} />
            <Route path="garzones" element={<AdminGarzones />} />
            <Route path="mesas-pos" element={<AdminMesasPos />} />
            <Route path="caja" element={<AdminCaja />} />
            <Route path="clientes" element={<AdminClientes />} />
            <Route path="menu" element={<AdminMenuInterno />} />
            <Route path="canjes" element={<AdminCanjes />} />
            <Route path="ajustes" element={<AdminAjustes />} />
          </Route>
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/mostrar-qr" element={<MostrarQR />} />
        </Routes>
        <BottomNav />
      </div>
    </CartProvider>
  )
}
