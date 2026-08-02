import { useAuth } from '../context/AuthContext.jsx'

export default function Login({ redirectPath = '/' }) {
  const { signInWithGoogle } = useAuth()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-paper px-6">
      <h1 className="font-display text-4xl mb-2 text-ember">Varo's</h1>
      <p className="text-paper/60 mb-10 text-center text-sm max-w-xs">
        Ingresa con tu cuenta de Google para empezar a acumular estrellas en tu Club Varo's.
      </p>

      <button
        onClick={() => signInWithGoogle(redirectPath)}
        className="flex items-center gap-3 bg-white text-black font-semibold px-6 py-3 rounded-full hover:bg-gray-100 transition"
      >
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3c-7.7 0-14.4 4.3-17.7 10.7z"/>
          <path fill="#4CAF50" d="M24 45c5.4 0 10.3-1.8 14-4.9l-6.5-5.5c-2 1.4-4.6 2.4-7.5 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.5 40.6 16.2 45 24 45z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.5 5.5C41.7 36 45 30.5 45 24c0-1.4-.1-2.7-.4-3.5z"/>
        </svg>
        Continuar con Google
      </button>
    </div>
  )
}
