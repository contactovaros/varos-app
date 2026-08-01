import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function MostrarQR() {
  const { isAdmin, loading } = useAuth()
  const navigate = useNavigate()
  const checkinUrl = `${window.location.origin}/checkin`

  if (loading) return null

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <p className="text-sm text-paper/50">Esta pantalla es solo para el equipo de Varo's.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-ink">
      <h1 className="font-display text-3xl text-ember mb-1">Varo's</h1>
      <p className="text-paper/60 text-sm mb-8">Escanea para registrar tu visita y ganar una estrella ⭐</p>

      <div className="bg-white p-6 rounded-3xl shadow-glow">
        <QRCodeSVG value={checkinUrl} size={260} />
      </div>

      <p className="text-paper/40 text-xs mt-8 max-w-xs">
        Cliente: abre la cámara de tu celular y apunta a este código
      </p>

      <button
        onClick={() => navigate('/admin')}
        className="mt-10 text-xs text-paper/30 underline"
      >
        Volver al Panel Admin
      </button>
    </div>
  )
}