import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext.jsx'

const FALLBACK_MENU = [
  { id: 'f1', name: 'Lomo a lo pobre', description: 'Lomo vetado, papas fritas, huevo y cebolla caramelizada', price_clp: 12900, category: 'Platos principales' },
  { id: 'f2', name: 'Empanada de pino', description: 'Receta de la casa, horneada', price_clp: 2900, category: 'Entradas' },
  { id: 'f3', name: 'Parrillada Varo\'s', description: 'Selección de carnes a las brasas para compartir', price_clp: 24900, category: 'Platos principales' },
  { id: 'f4', name: 'Tiramisú', description: 'Clásico italiano, receta de la casa', price_clp: 5200, category: 'Postres' },
  { id: 'f5', name: 'Pisco sour', description: 'Pisco, limón, jarabe de goma', price_clp: 4800, category: 'Bebidas' },
  { id: 'f6', name: 'Ensalada César', description: 'Pollo grillado, parmesano, crotones', price_clp: 7900, category: 'Entradas' }
]

export default function Menu() {
  const [items, setItems] = useState(FALLBACK_MENU)
  const [category, setCategory] = useState('Todos')
  const { addItem, items: cartItems } = useCart()

  useEffect(() => {
    supabase
      .from('menu_items')
      .select('*')
      .eq('available', true)
      .then(({ data, error }) => {
        if (!error && data && data.length) setItems(data)
      })
  }, [])

  const categories = ['Todos', ...new Set(items.map((i) => i.category))]
  const filtered = category === 'Todos' ? items : items.filter((i) => i.category === category)
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="px-4 pt-8">
      <div className="text-center mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-display text-4xl">Menú</h1>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 font-head text-xs font-medium px-4 py-2 rounded-full border ${
              category === c ? 'bg-gradient-to-br from-ember to-emberDark border-transparent text-ink' : 'border-white/10 text-paper/60'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((item) => (
          <div key={item.id} className="bg-inkSoft border border-white/5 rounded-2xl p-4 flex justify-between items-center gap-3">
            <div>
              <div className="font-head font-semibold text-sm">{item.name}</div>
              <div className="text-xs text-paper/50 mt-1">{item.description}</div>
              <div className="font-mono text-ember text-sm mt-2">${item.price_clp.toLocaleString('es-CL')}</div>
            </div>
            <button
              onClick={() => addItem({ id: item.id, name: item.name, price: item.price_clp })}
              className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-ember to-wine text-lg font-bold"
            >
              +
            </button>
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <Link
          to="/pedidos"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 bg-gradient-to-br from-ember to-wine px-6 py-3 rounded-full font-head font-semibold text-sm shadow-glow"
        >
          Ver pedido ({cartCount})
        </Link>
      )}
    </div>
  )
}
