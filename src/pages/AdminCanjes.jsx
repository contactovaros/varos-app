import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdminData } from '../context/AdminDataContext.jsx'

function formatFechaCorta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

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

function TablaCanjesDesktop({ redemptions }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'fecha' ? 'desc' : 'asc')
    }
  }

  const filas = redemptions
    .filter((r) => `${r.customers?.full_name ?? ''} ${r.rewards?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let diff = 0
      if (sortKey === 'puntos') diff = (a.points_spent ?? 0) - (b.points_spent ?? 0)
      else if (sortKey === 'recompensa') diff = (a.rewards?.name ?? '').localeCompare(b.rewards?.name ?? '')
      else if (sortKey === 'fecha') diff = new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
      else diff = (a.customers?.full_name ?? '').localeCompare(b.customers?.full_name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar cliente o recompensa…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Cliente" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Recompensa" active={sortKey === 'recompensa'} dir={sortDir} onClick={() => toggleSort('recompensa')} />
            <ThOrdenable label="Puntos" active={sortKey === 'puntos'} dir={sortDir} onClick={() => toggleSort('puntos')} align="right" />
            <ThOrdenable label="Fecha" active={sortKey === 'fecha'} dir={sortDir} onClick={() => toggleSort('fecha')} align="right" />
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-2 text-paper">{r.customers?.full_name ?? 'Cliente eliminado'}</td>
              <td className="py-2 px-2 text-paper/60">{r.rewards?.name}</td>
              <td className="py-2 px-2 font-mono text-wineSoft text-right">-{r.points_spent}</td>
              <td className="py-2 px-2 text-paper/40 text-right">{formatFechaCorta(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-paper/35 text-xs py-3">Sin resultados.</p>}
    </div>
  )
}

export default function AdminCanjes() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { redemptions } = useAdminData()

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
      <h1 className="font-head text-2xl font-semibold mb-2">Historial de canjes</h1>
      <span className="inline-block mb-4 text-[10px] font-mono text-ember/90 bg-ember/10 border border-ember/20 rounded-full px-2 py-0.5">
        {redemptions.length} canjes
      </span>

      <TablaCanjesDesktop redemptions={redemptions} />
      <div className="lg:hidden">
        {redemptions.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{r.customers?.full_name} — {r.rewards?.name}</span>
            <span className="font-mono text-wineSoft">-{r.points_spent}</span>
          </div>
        ))}
        {redemptions.length === 0 && <p className="text-paper/35 text-xs">Sin canjes todavía.</p>}
      </div>
    </div>
  )
}
