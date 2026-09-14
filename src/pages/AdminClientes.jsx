import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdminData } from '../context/AdminDataContext.jsx'

// Header de columna clickeable para ordenar una tabla de escritorio. Se
// repite igual en Clientes/Menú/Canjes — colocado junto a su única tabla en
// cada archivo, mismo criterio que ya usaba el Admin.jsx original antes de
// partirse en páginas.
function ThOrdenable({ label, active, dir, onClick, align = 'left' }) {
  return (
    <th className={`py-2 px-2 font-normal ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-paper/80 ${active ? 'text-ember' : 'text-paper/40'}`}
      >
        {label}
        <span className="text-[9px] w-2.5 inline-block">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )
}

function TablaClientesDesktop({ customers, premioEstrellas, agregarEstrella, quitarEstrella, eliminarCliente }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState('asc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filas = customers
    .filter((c) => (c.full_name ?? '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const diff =
        sortKey === 'estrellas'
          ? (a.estrellas_actuales ?? 0) - (b.estrellas_actuales ?? 0)
          : (a.full_name ?? '').localeCompare(b.full_name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Cliente" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Estrellas" active={sortKey === 'estrellas'} dir={sortDir} onClick={() => toggleSort('estrellas')} />
            <th className="py-2 px-2 font-normal text-left text-paper/40">Premio</th>
            <th className="py-2 px-2 font-normal text-right text-paper/40">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-2 text-paper">{c.full_name}</td>
              <td className="py-2 px-2 font-mono text-paper/70">{c.estrellas_actuales ?? 0} / 5 ⭐</td>
              <td className="py-2 px-2 text-ember/80">{premioEstrellas ? premioEstrellas : 'Sin premio configurado'}</td>
              <td className="py-2 px-2">
                <div className="flex justify-end items-center gap-1.5">
                  <button
                    onClick={() => quitarEstrella(c)}
                    disabled={(c.estrellas_actuales ?? 0) <= 0}
                    className="w-6 h-6 rounded-md border border-white/10 text-paper/60 disabled:opacity-30 hover:border-white/25 transition-colors"
                  >
                    −
                  </button>
                  <button
                    onClick={() => agregarEstrella(c)}
                    className="w-6 h-6 rounded-md border border-ember/40 text-ember hover:bg-ember/10 transition-colors"
                  >
                    +
                  </button>
                  <button
                    onClick={() => eliminarCliente(c)}
                    className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap hover:bg-wine/10 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-paper/35 text-xs py-3">Sin resultados.</p>}
    </div>
  )
}

export default function AdminClientes() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { customers, premioEstrellas, agregarEstrella, quitarEstrella, eliminarCliente, exportCSV } = useAdminData()

  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div className="px-6 pt-24 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h2 className="font-head text-lg font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm text-paper/50">Esta sección es solo para administradores de Varo's.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8 pb-10 lg:px-6">
      <div className="flex justify-between items-start mb-2">
        <h1 className="font-head text-2xl font-semibold">Clientes</h1>
        <button onClick={exportCSV} className="font-head text-xs font-semibold px-3 py-2 rounded-lg border border-ember/30 bg-ember/10 text-ember">
          ⬇ Exportar
        </button>
      </div>
      <span className="inline-block mb-4 text-[10px] font-mono text-ember/90 bg-ember/10 border border-ember/20 rounded-full px-2 py-0.5">
        {customers.length} clientes
      </span>

      <TablaClientesDesktop
        customers={customers}
        premioEstrellas={premioEstrellas}
        agregarEstrella={agregarEstrella}
        quitarEstrella={quitarEstrella}
        eliminarCliente={eliminarCliente}
      />
      <div className="lg:hidden">
        {customers.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex justify-between items-center gap-2">
              <div>
                <div className="text-paper">{c.full_name}</div>
                <div className="text-paper/40 text-[10px]">{c.estrellas_actuales ?? 0} de 5 ⭐</div>
              </div>
              <span className="text-ember text-[11px] text-right max-w-[110px]">
                {premioEstrellas ? `Ganaría: ${premioEstrellas}` : 'Sin premio configurado'}
              </span>
            </div>
            <div className="flex justify-end items-center gap-1.5">
              <button
                onClick={() => quitarEstrella(c)}
                disabled={(c.estrellas_actuales ?? 0) <= 0}
                className="w-6 h-6 rounded-md border border-white/10 text-paper/60 disabled:opacity-30"
              >
                −
              </button>
              <button
                onClick={() => agregarEstrella(c)}
                className="w-6 h-6 rounded-md border border-ember/40 text-ember"
              >
                +
              </button>
              <button
                onClick={() => eliminarCliente(c)}
                className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs py-2">Sin clientes registrados aún.</p>}
      </div>
    </div>
  )
}
