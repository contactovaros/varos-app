import { useState } from 'react'

// Popup grande y llamativo para las campañas/notificaciones del admin.
// Aparece encima de todo apenas el cliente entra al Club, no como texto
// perdido más abajo en la pantalla.
export default function CampanaPopup({ campanas }) {
  const [indice, setIndice] = useState(0)
  const [cerrado, setCerrado] = useState(false)

  if (cerrado || !campanas.length || indice >= campanas.length) return null

  const campana = campanas[indice]
  const quedan = campanas.length - indice - 1

  function siguienteOCerrar() {
    if (quedan > 0) {
      setIndice((i) => i + 1)
    } else {
      setCerrado(true)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
      onClick={siguienteOCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-[26px] border-[3px] border-gold bg-inkSoft p-6 text-center shadow-[0_0_50px_rgba(227,179,65,0.5)]"
      >
        <div className="text-4xl mb-2">📣</div>
        <p className="font-head font-bold text-xl text-gold mb-2">{campana.title}</p>
        <p className="text-paper/85 text-sm leading-relaxed mb-5">{campana.message}</p>
        <button
          onClick={siguienteOCerrar}
          className="w-full py-3 rounded-2xl font-head font-bold bg-gradient-to-br from-ember to-emberDark text-ink"
        >
          {quedan > 0 ? `Siguiente (${quedan} más)` : '¡Genial!'}
        </button>
      </div>
    </div>
  )
}
