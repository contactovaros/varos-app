import { useAuth } from '../context/AuthContext.jsx'
import { useAdminData } from '../context/AdminDataContext.jsx'

function formatFechaCorta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// Portada de /admin (index de la ruta anidada). Pedido explícito del usuario
// (2026-09-14): acá va UNA sola cosa — el bloque de premios pendientes, gold,
// sin acordeón, porque es lo único del panel que tiene a una persona
// esperando algo. Todo lo demás (Clientes, Menú, Canjes, Ajustes, y las
// otras 8 pantallas) se accede por la navegación que pone AdminLayout.
export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { pendientes, entregarPremio } = useAdminData()

  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div className="px-6 pt-24 text-center">
        <h1 className="font-head text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-paper/50">Esta sección es solo para administradores de Varo's.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8 pb-10 lg:px-6">
      <div className="mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-head text-2xl font-semibold">Panel admin</h1>
      </div>

      {pendientes.length > 0 ? (
        <div className="bg-gold/10 border border-gold/40 rounded-2xl p-4">
          <h2 className="font-head font-semibold text-sm text-gold mb-0.5">
            {pendientes.length === 1 ? 'Hay un premio por entregar' : `Hay ${pendientes.length} premios por entregar`}
          </h2>
          <p className="text-[11px] text-paper/50 mb-3">
            Completaron sus 5 visitas. Marca la entrega cuando se lo hayas dado.
          </p>
          <ul>
          {pendientes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 border-t border-gold/15 text-xs">
              <div className="min-w-0">
                <div className="text-paper truncate">{p.customers?.full_name ?? 'Cliente eliminado'}</div>
                <div className="text-gold/80 truncate">{p.producto || 'Sin premio configurado'}</div>
                <div className="text-paper/55 text-[11px]">
                  {p.customers?.member_number} · {formatFechaCorta(p.fecha_ganado)}
                </div>
              </div>
              <button
                onClick={() => entregarPremio(p)}
                aria-label={`Marcar entregado el premio de ${p.customers?.full_name ?? 'cliente eliminado'}`}
                className="shrink-0 px-3 py-2 rounded-lg font-head font-semibold text-[11px] text-ink bg-gradient-to-br from-gold to-bronze"
              >
                Marcar entregado
              </button>
            </li>
          ))}
          </ul>
        </div>
      ) : (
        <p className="text-paper/55 text-xs">Sin premios pendientes por ahora. Usa la navegación para ir a Clientes, Menú, Caja y el resto.</p>
      )}
    </div>
  )
}
