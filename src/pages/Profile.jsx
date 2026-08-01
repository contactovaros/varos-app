import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

export default function Profile() {
  const { customer, signOut, refreshCustomer } = useAuth()
  const [name, setName] = useState(customer?.full_name ?? '')
  const [birthday, setBirthday] = useState(customer?.birthday ?? '')
  const [saving, setSaving] = useState(false)

  if (!customer) return null

  async function save() {
    setSaving(true)
    await supabase.from('customers').update({ full_name: name, birthday: birthday || null }).eq('id', customer.id)
    await refreshCustomer()
    setSaving(false)
  }

  return (
    <div className="px-4 pt-8">
      <div className="text-center mb-6">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
        <h1 className="font-display text-4xl">Tu perfil</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-paper/50 block mb-1.5">Nombre completo</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-inkSoft border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-ember/50" />
        </div>
        <div>
          <label className="text-xs text-paper/50 block mb-1.5">Cumpleaños</label>
          <input type="date" value={birthday ?? ''} onChange={(e) => setBirthday(e.target.value)} className="w-full bg-inkSoft border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-ember/50" />
        </div>
        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl font-head font-semibold text-sm bg-gradient-to-br from-ember to-wine shadow-glow">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button onClick={signOut} className="w-full py-3 rounded-xl font-head font-semibold text-sm border border-white/10 text-paper/60">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
