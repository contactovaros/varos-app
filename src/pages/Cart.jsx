import { useState } from 'react'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import { pointsForPurchase, tierForPoints } from '../lib/pointsEngine.js'

export default function Cart() {
  const { items, updateQty, removeItem, clear, total } = useCart()
  const { customer, refreshCustomer } = useAuth()
  const [placing, setPlacing] = useState(false)
  const [done, setDone] = useState(null)

  async function confirmOrder() {
    setPlacing(true)
    const tier = customer ? tierForPoints(customer.points) : { multiplier: 1 }
    const earned = pointsForPurchase(total, 100, tier.multiplier)

    const { data: order, error } = await supabase
      .from('orders')
      .insert({ customer_id: customer?.id, total_clp: total, points_earned: earned, status: 'pendiente' })
      .select()
      .single()

    if (!error && order) {
      await supabase.from('order_items').insert(
        items.map((i) => ({ order_id: order.id, menu_item_id: i.id, quantity: i.qty, unit_price_clp: i.price }))
      )
      await supabase.rpc('add_points', { p_customer_id: customer.id, p_points: earned, p_reason: 'compra', p_order_id: order.id })
      await refreshCustomer()
      setDone(earned)
      clear()
    }
    setPlacing(false)
  }

  if (done !== null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-8">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="font-head text-xl font-semibold mb-2">¡Pedido confirmado!</h2>
        <p className="text-sm text-paper/60">Ganaste <b className="text-ember">{done} puntos</b> para tu Club Varo's.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-8">
      <div className="text-center mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-display text-4xl">Tu pedido</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-paper/40 mt-16">Aún no has agregado nada del menú.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-6">
            {items.map((i) => (
              <div key={i.id} className="bg-inkSoft border border-white/5 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <div className="font-head font-semibold text-sm">{i.name}</div>
                  <div className="font-mono text-ember text-xs mt-1">${(i.price * i.qty).toLocaleString('es-CL')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => updateQty(i.id, i.qty - 1)} className="w-7 h-7 rounded-full bg-white/10">−</button>
                  <span className="text-sm w-4 text-center">{i.qty}</span>
                  <button onClick={() => updateQty(i.id, i.qty + 1)} className="w-7 h-7 rounded-full bg-white/10">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-paper/60">Total</span>
              <span className="font-mono">${total.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-paper/40">Puntos que ganarás</span>
              <span className="text-ember font-mono">
                +{pointsForPurchase(total, 100, customer ? tierForPoints(customer.points).multiplier : 1)}
              </span>
            </div>
          </div>

          <button
            disabled={placing}
            onClick={confirmOrder}
            className="w-full py-4 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow"
          >
            {placing ? 'Confirmando…' : 'Confirmar pedido'}
          </button>
        </>
      )}
    </div>
  )
}
