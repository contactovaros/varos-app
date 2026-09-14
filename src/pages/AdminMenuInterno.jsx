import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdminData } from '../context/AdminDataContext.jsx'

// Menú interno del Club Varo's (tabla `menu_items`) — distinto de
// /admin/productos, que es la carta pública que se muestra en varos.cl.

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

function TablaMenuDesktop({ menuItems, toggleDish, updateDishPrice, deleteDish }) {
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

  const filas = menuItems
    .filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let diff = 0
      if (sortKey === 'precio') diff = (a.price_clp ?? 0) - (b.price_clp ?? 0)
      else if (sortKey === 'categoria') diff = (a.category ?? '').localeCompare(b.category ?? '')
      else diff = (a.name ?? '').localeCompare(b.name ?? '')
      return sortDir === 'asc' ? diff : -diff
    })

  return (
    <div className="hidden lg:block">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar plato o categoría…"
        className="w-full mb-3 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
      />
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/5 text-[10px] uppercase tracking-wide">
            <ThOrdenable label="Plato" active={sortKey === 'nombre'} dir={sortDir} onClick={() => toggleSort('nombre')} />
            <ThOrdenable label="Categoría" active={sortKey === 'categoria'} dir={sortDir} onClick={() => toggleSort('categoria')} />
            <ThOrdenable label="Precio" active={sortKey === 'precio'} dir={sortDir} onClick={() => toggleSort('precio')} />
            <th className="py-2 px-2 font-normal text-right text-paper/40">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m) => (
            <tr key={m.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors">
              <td className={`py-2 px-2 ${m.available ? 'text-paper' : 'text-paper/30 line-through'}`}>{m.name}</td>
              <td className="py-2 px-2 text-paper/50">{m.category}</td>
              <td className="py-2 px-2">
                <input
                  type="number"
                  value={m.price_clp}
                  onChange={(e) => updateDishPrice(m.id, Number(e.target.value))}
                  className="w-24 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
                />
              </td>
              <td className="py-2 px-2">
                <div className="flex justify-end items-center gap-1.5">
                  <button
                    onClick={() => toggleDish(m.id, m.available)}
                    className="px-2 py-1 rounded-md border border-white/10 text-[10px] whitespace-nowrap hover:border-white/25 transition-colors"
                  >
                    {m.available ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    onClick={() => deleteDish(m.id)}
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

export default function AdminMenuInterno() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { menuItems, newDish, setNewDish, savingDish, addDish, toggleDish, updateDishPrice, deleteDish } = useAdminData()

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
      <h1 className="font-head text-2xl font-semibold mb-2">Menú</h1>
      <span className="inline-block mb-4 text-[10px] font-mono text-ember/90 bg-ember/10 border border-ember/20 rounded-full px-2 py-0.5">
        {menuItems.length} platos
      </span>

      <div className="flex flex-col gap-2 mb-4">
        <input
          placeholder="Nombre del plato"
          value={newDish.name}
          onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
          className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
        />
        <input
          placeholder="Descripción"
          value={newDish.description}
          onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
          className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Precio CLP"
            value={newDish.price_clp}
            onChange={(e) => setNewDish({ ...newDish, price_clp: e.target.value })}
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
          />
          <select
            value={newDish.category}
            onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          >
            <option>Entradas</option>
            <option>Platos principales</option>
            <option>Postres</option>
            <option>Bebidas</option>
          </select>
        </div>
        <button
          onClick={addDish}
          disabled={savingDish}
          className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink"
        >
          {savingDish ? 'Agregando…' : '+ Agregar plato al menú'}
        </button>
      </div>

      <TablaMenuDesktop
        menuItems={menuItems}
        toggleDish={toggleDish}
        updateDishPrice={updateDishPrice}
        deleteDish={deleteDish}
      />
      <div className="lg:hidden flex flex-col">
        {menuItems.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex-1">
              <div className={m.available ? 'text-paper' : 'text-paper/30 line-through'}>{m.name}</div>
              <div className="text-paper/35 text-[10px]">{m.category}</div>
            </div>
            <input
              type="number"
              value={m.price_clp}
              onChange={(e) => updateDishPrice(m.id, Number(e.target.value))}
              className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
            />
            <button onClick={() => toggleDish(m.id, m.available)} className="px-2 py-1 rounded-md border border-white/10 text-[10px]">
              {m.available ? 'Ocultar' : 'Mostrar'}
            </button>
            <button onClick={() => deleteDish(m.id)} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px]">
              Eliminar
            </button>
          </div>
        ))}
        {menuItems.length === 0 && <p className="text-paper/35 text-xs py-2">Aún no has agregado platos — usa el formulario de arriba.</p>}
      </div>
    </div>
  )
}
