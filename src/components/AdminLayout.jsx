import { Outlet, useLocation } from 'react-router-dom'
import { IconSprite, NAV_ITEMS, NavCardCompact, NavGridMobile } from './AdminNav.jsx'
import { AdminDataProvider } from '../context/AdminDataContext.jsx'

// Mismas 4 rutas que App.jsx ensancha a lg:max-w-7xl (su `anchoAmplio`): son
// las que ya tienen aire de sobra en desktop para una sidebar de 224px al
// costado. Duplicamos esta lista chica acá — a propósito, sin tocar
// App.jsx — porque son las únicas donde el sidebar sticky no aprieta el
// contenido; el resto de /admin se queda en max-w-md incluso en escritorio,
// así que ahí la navegación persistente va como tira horizontal, igual que
// en mobile.
const ADMIN_WIDE_PATHS = ['/admin', '/admin/mesas', '/admin/plano', '/admin/productos']

// Layout compartido de TODO /admin: pone la navegación (tira compacta o
// sidebar, según haya espacio) arriba/al costado de cualquier página hija y
// deja que esa página siga siendo dueña de su propio contenido y de su
// propio chequeo de isAdmin — este componente no gatea nada, solo enmarca.
export default function AdminLayout() {
  const location = useLocation()
  const ancho = ADMIN_WIDE_PATHS.includes(location.pathname)

  return (
    <div className={ancho ? 'lg:flex lg:items-start lg:gap-6 lg:px-6 lg:pt-8' : ''}>
      <IconSprite />

      {ancho && (
        <nav className="hidden lg:flex lg:flex-col lg:gap-1.5 lg:w-56 lg:shrink-0 lg:sticky lg:top-6">
          <div className="font-mono text-[10px] tracking-[0.2em] text-paper/35 uppercase px-2 mb-1">Navegación</div>
          {NAV_ITEMS.map((item) => (
            <NavCardCompact key={item.to} item={item} />
          ))}
        </nav>
      )}

      <div className={ancho ? 'lg:flex-1 lg:min-w-0' : ''}>
        {/* Tira de escaneo persistente: en las páginas anchas solo se ve en
            mobile (el sidebar de arriba la reemplaza en desktop); en las
            páginas angostas queda visible siempre, porque ahí no hay
            sidebar — es la única navegación que tienen en escritorio. */}
        <div className={`${ancho ? 'lg:hidden ' : ''}flex gap-2 overflow-x-auto px-4 pt-4 pb-2`}>
          {NAV_ITEMS.map((item) => (
            <NavGridMobile key={item.to} item={item} compact />
          ))}
        </div>

        {/* El estado del club (clientes, menú, canjes, ajustes…) se carga acá,
            una sola vez para toda la subruta /admin — así Clientes, Ajustes,
            etc. comparten los mismos datos sin repetir el fetch al saltar
            entre pantallas por el nav. Caja/Garzones/Mesas del POS no
            consumen este contexto, pero heredarlo no les cuesta nada más
            que las mismas 9 consultas livianas que ya se hacían antes. */}
        <AdminDataProvider>
          <Outlet />
        </AdminDataProvider>
      </div>
    </div>
  )
}
