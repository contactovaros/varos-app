import { Outlet, useLocation } from 'react-router-dom'
import { AdminMenu, IconSprite } from './AdminNav.jsx'
import { AdminDataProvider } from '../context/AdminDataContext.jsx'

// Mismas rutas que App.jsx ensancha a lg:max-w-7xl (su `anchoAmplio`). Acá solo
// decide el margen del menú en escritorio: en estas páginas el contenido ya
// tiene su propio aire lateral (lg:px-6), en el resto —que se queda en
// max-w-md— el menú usa el mismo relleno que la tira que reemplazó. Se
// duplica esta lista chica a propósito, sin tocar App.jsx.
const ADMIN_WIDE_PATHS = [
  '/admin',
  '/admin/mesas',
  '/admin/plano',
  '/admin/productos',
  '/admin/clientes',
  '/admin/menu',
  '/admin/canjes',
  '/admin/ajustes'
]

// Layout compartido de TODO /admin: pone el menú de navegación (un solo botón
// que abre todos los destinos agrupados, ver AdminNav.jsx) arriba de cualquier
// página hija y deja que esa página siga siendo dueña de su propio contenido y
// de su propio chequeo de isAdmin — este componente no gatea nada, solo enmarca.
// Desde 2026-09-21 ya no hay barra lateral fija ni tira deslizable: las páginas
// anchas ganan los 224 px de la barra y en el celular se ven todos los destinos
// de una vez.
export default function AdminLayout() {
  const location = useLocation()
  const ancho = ADMIN_WIDE_PATHS.includes(location.pathname)

  return (
    <div className={ancho ? 'lg:px-6 lg:pt-8' : ''}>
      <IconSprite />

      <AdminMenu className={ancho ? 'lg:px-0 lg:pt-0 lg:pb-4' : ''} />

      {/* El estado del club (clientes, menú, canjes, ajustes…) se carga acá,
          una sola vez para toda la subruta /admin — así Clientes, Ajustes,
          etc. comparten los mismos datos sin repetir el fetch al saltar
          entre pantallas por el menú. Caja/Garzones/Mesas del POS no
          consumen este contexto, pero heredarlo no les cuesta nada más
          que las mismas 9 consultas livianas que ya se hacían antes. */}
      <AdminDataProvider>
        <Outlet />
      </AdminDataProvider>
    </div>
  )
}
