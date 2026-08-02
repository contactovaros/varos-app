import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function CompletarPerfil() {
  const { session, completeProfile } = useAuth()
  const [nombre, setNombre] = useState(session?.user?.user_metadata?.full_name || '')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre || !fecha) return
    setSaving(true)
    await completeProfile({ full_name: nombre, birthday: fecha })
    setSaving(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-paper px-6">
      <h1 className="font-display text-3xl text-ember mb-1">¡Bienvenido a Varo's!</h1>
      <p className="text-paper/60 text-sm mb-8 text-center max-w-xs">
        Solo un paso más para crear tu tarjeta de fidelización.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <label className="text-xs text-paper/50">Nombre completo</label>
        <input
          type="text"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-inkSoft border border-white/10 text-paper outline-none focus:border-ember"
        />

        <label className="text-xs text-paper/50 mt-2">Fecha de nacimiento</label>
        <input
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-inkSoft border border-white/10 text-paper outline-none focus:border-ember"
        />

        <button
          type="submit"
          disabled={saving}
          className="w-full mt-4 py-3 rounded-xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Crear mi tarjeta Varo\'s'}
        </button>
      </form>
    </div>
  )
}
