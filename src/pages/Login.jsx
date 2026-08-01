import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login({ redirectPath = '/' }) {
  const { signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | enviando | enviado | error

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('enviando')
    const { error } = await signInWithEmail(email, redirectPath)
    setStatus(error ? 'error' : 'enviado')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-paper px-6">
      <h1 className="font-display text-4xl mb-2 text-ember">Varo's</h1>
      <p className="text-paper/60 mb-8 text-center text-sm">
        Ingresa tu correo y te enviamos un enlace para entrar a tu Club Varo's — sin contraseña.
      </p>

      {status === 'enviado' ? (
        <div className="text-center max-w-xs">
          <div className="text-4xl mb-3">📩</div>
          <p className="font-head font-semibold mb-1">¡Listo! Revisa tu correo</p>
          <p className="text-sm text-paper/50">
            Te enviamos un enlace a <b>{email}</b>. Ábrelo desde este mismo celular para iniciar sesión.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-inkSoft border border-white/10 text-paper placeholder-paper/30 outline-none focus:border-ember"
          />
          <button
            type="submit"
            disabled={status === 'enviando'}
            className="w-full py-3 rounded-xl font-head font-bold bg-gradient-to-br from-ember to-wine shadow-glow disabled:opacity-50"
          >
            {status === 'enviando' ? 'Enviando…' : 'Enviar enlace de acceso'}
          </button>
          {status === 'error' && (
            <p className="text-sm text-wineSoft text-center">
              Hubo un problema al enviar el enlace. Intenta de nuevo.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
