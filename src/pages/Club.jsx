import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import confetti from 'canvas-confetti'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'
import { progressToNextTier } from '../lib/pointsEngine.js'

export default function Club() {
  const { customer, refreshCustomer } = useAuth()
  const [rewards, setRewards] = useState([])
  const [history, setHistory] = useState([])
  const [redeeming, setRedeeming] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.from('rewards').select('*').eq('active', true).order('cost_points').then(({ data }) => data && setRewards(data))
    if (customer) {
      supabase
        .from('points_transactions')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(6)
        .then(({ data }) => data && setHistory(data))
    }
  }, [customer])

  if (!customer) {
    return <div className="pt-24 text-center text-sm text-paper/50">Cargando tu perfil del club…</div>
  }

  const { pct, current, next } = progressToNextTier(customer.points)

  async function redeem(reward) {
    setRedeeming(reward.id)
    const { error } = await supabase.from('redemptions').insert({
      customer_id: customer.id,
      reward_id: reward.id,
      points_spent: reward.cost_points
    })
    if (!error) {
      await supabase.rpc('add_points', {
        p_customer_id: customer.id,
        p_points: -reward.cost_points,
        p_reason: 'canje'
      })
      await refreshCustomer()
      confetti({ particleCount: 100, spread: 80, colors: ['#FF7A1A', '#E85D04', '#7A1620', '#E3B341'] })
      setToast(reward.name)
      setTimeout(() => setToast(null), 3200)
    }
    setRedeeming(null)
  }

  return (
    <div className="px-4 pt-8">
      <div className="text-center mb-5">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-display text-4xl">Club Varo's</h1>
      </div>

      {/* Membership card */}
      <div className="relative rounded-3xl p-[2px] mb-5 ember-glow">
        <div className="relative z-10 rounded-3xl p-5 overflow-hidden card-shine bg-gradient-to-br from-[#241612] via-ink to-[#1a0f0c] border border-orange-200/10 shadow-2xl">
          <div className="flex justify-between items-start">
            <div className="font-head font-bold text-sm">
              VARO'S
              <span className="block font-mono text-[9px] tracking-[0.2em] text-paper/40 font-normal mt-0.5">
                MIEMBRO DESDE {new Date(customer.created_at).getFullYear()}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11.5px] font-head font-semibold px-2.5 py-1 rounded-full bg-gold/15 border border-gold/40 text-gold">
              {current.icon} {current.name}
            </div>
          </div>

          <div className="flex items-center gap-3 my-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-ember to-wine flex items-center justify-center font-head font-bold text-lg border-2 border-white/20 overflow-hidden">
              {customer.avatar_url ? (
                <img src={customer.avatar_url} alt={customer.full_name} className="w-full h-full object-cover" />
              ) : (
                customer.full_name?.split(' ').map((n) => n[0]).slice(0, 2).join('')
              )}
            </div>
            <div>
              <div className="font-head font-semibold text-base">{customer.full_name}</div>
              <div className="font-mono text-[11px] text-paper/50 mt-0.5">N° socio · {customer.member_number}</div>
              <div className="font-mono text-[10px] text-paper/35 mt-0.5">🔁 {customer.visit_count ?? 0} visitas registradas</div>
            </div>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-paper/50">Puntos disponibles</div>
              <div className="font-display text-4xl text-ember leading-none">{customer.points.toLocaleString('es-CL')}</div>
            </div>
            <div className="bg-white p-1.5 rounded-lg">
              <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={70} />
            </div>
          </div>
        </div>
      </div>

      {/* Estrellas por visita */}
      <div className="bg-inkSoft border border-ember/10 rounded-2xl p-4 mb-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-paper/60 font-head font-semibold">Estrellas de visita</span>
          {customer.ciclos_completados > 0 && (
            <span className="text-[10px] text-paper/35">🏆 {customer.ciclos_completados} premio{customer.ciclos_completados === 1 ? '' : 's'} ganado{customer.ciclos_completados === 1 ? '' : 's'}</span>
          )}
        </div>
        <div className="flex gap-1.5 justify-center mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={`text-2xl ${i < (customer.estrellas_actuales ?? 0) ? 'opacity-100' : 'opacity-20'}`}>⭐</span>
          ))}
        </div>
        <p className="text-center text-[11px] text-paper/40">
          {5 - (customer.estrellas_actuales ?? 0) > 0
            ? `Te faltan ${5 - (customer.estrellas_actuales ?? 0)} visita${5 - (customer.estrellas_actuales ?? 0) === 1 ? '' : 's'} para tu próximo premio`
            : '¡Ya puedes canjear tu premio!'}
        </p>
      </div>

      {/* Progress */}
      <div className="bg-inkSoft border border-ember/10 rounded-2xl p-4 mb-5">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-paper/60">{next ? <>Camino a <b className="text-ember">{next.icon} {next.name}</b></> : 'Nivel máximo alcanzado'}</span>
          <span className="text-paper/60"><b className="text-paper">{customer.points}</b>{next ? ` / ${next.min}` : ''}</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-wine to-ember transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Rewards */}
      <div className="flex justify-between items-center mb-3 mt-6">
        <h3 className="font-head font-semibold text-sm">Canjea tus puntos</h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {rewards.map((r) => {
          const unlocked = customer.points >= r.cost_points
          return (
            <div key={r.id} className={`bg-inkSoft border rounded-2xl p-3 flex flex-col gap-2 ${unlocked ? 'border-ember/40' : 'border-white/5'}`}>
              <div className="text-xl">{r.icon}</div>
              <div className="font-head font-semibold text-xs">{r.name}</div>
              <div className="font-mono text-ember text-[11px]">{r.cost_points.toLocaleString('es-CL')} pts</div>
              <button
                disabled={!unlocked || redeeming === r.id}
                onClick={() => redeem(r)}
                className={`text-[11px] font-head font-semibold py-1.5 rounded-lg ${
                  unlocked ? 'bg-gradient-to-br from-ember to-emberDark text-ink' : 'bg-white/5 text-paper/30'
                }`}
              >
                {unlocked ? (redeeming === r.id ? 'Canjeando…' : 'Canjear') : `Faltan ${r.cost_points - customer.points}`}
              </button>
            </div>
          )
        })}
      </div>

      {/* History */}
      <h3 className="font-head font-semibold text-sm mt-6 mb-3">Historial</h3>
      <div className="flex flex-col">
        {history.map((h) => (
          <div key={h.id} className="flex justify-between items-center py-2.5 border-b border-white/5 text-xs">
            <div>
              <div className="text-paper/85 capitalize">{h.reason}</div>
              <div className="text-paper/35 text-[10px] mt-0.5">{new Date(h.created_at).toLocaleDateString('es-CL')}</div>
            </div>
            <div className={`font-mono ${h.points > 0 ? 'text-ember' : 'text-wineSoft'}`}>{h.points > 0 ? '+' : ''}{h.points}</div>
          </div>
        ))}
        {history.length === 0 && <p className="text-xs text-paper/35 py-3">Aún no tienes movimientos.</p>}
      </div>

      <div className="text-center mt-8 pb-2 text-[11px] text-paper/35">
        Varo's · +56 9 9923 5368 · contacto@varos.cl
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-inkSoft border border-ember/40 rounded-2xl px-5 py-3 text-xs shadow-glow z-50">
          🎉 Canjeaste <b className="text-ember">{toast}</b>. Muéstraselo al garzón.
        </div>
      )}
    </div>
  )
}
