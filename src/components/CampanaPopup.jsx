import { useEffect, useState } from 'react'
import BotonOro from './BotonOro.jsx'

// Popup de las campañas del admin. Aparece encima de todo apenas el cliente
// entra al Club.
//
// Antes tenía un 📣 como ancla visual y el botón en ámbar. El emoji es el tic
// más reconocible de interfaz generada, y el ámbar es el color de la app, no el
// de la marca: en la pantalla más señorial del cliente competía con el oro.
// Ahora el ancla es el emblema real y el botón es el mismo dorado del resto.
//
// La entrada existe porque esto se planta sobre toda la pantalla sin que nadie
// lo pidió: sin transición, el salto es brusco. 200 ms, solo opacidad y escala
// desde 0.95 — nunca desde 0, que nada en el mundo real aparece de la nada.
export default function CampanaPopup({ campanas }) {
  const [indice, setIndice] = useState(0)
  const [cerrado, setCerrado] = useState(false)
  const [visible, setVisible] = useState(false)

  const hayCampana = !cerrado && campanas.length > 0 && indice < campanas.length

  useEffect(() => {
    if (!hayCampana) return
    // Un frame de margen para que el navegador pinte el estado inicial y la
    // transición tenga desde dónde salir.
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [hayCampana])

  if (!hayCampana) return null

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
      className={`fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center px-6 transition-opacity duration-200 ease-salida ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={siguienteOCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="campana-titulo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xs rounded-[26px] border-2 border-gold bg-inkSoft px-6 pt-5 pb-6 text-center shadow-[0_0_60px_rgba(227,179,65,0.45)] transition-[opacity,transform] duration-200 ease-salida motion-reduce:transition-opacity ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <img src="/logo-varos.png" alt="" aria-hidden="true" className="w-12 h-12 mx-auto mb-3" />

        <p className="font-head text-[10px] tracking-[0.28em] uppercase text-gold/70 mb-1.5">Novedades del club</p>
        <p id="campana-titulo" className="font-serif text-2xl text-paper leading-tight mb-2">
          {campana.title}
        </p>
        <p className="text-paper/70 text-sm leading-relaxed mb-5">{campana.message}</p>

        <BotonOro onClick={siguienteOCerrar} className="py-3">
          {quedan > 0 ? `Ver la siguiente (${quedan})` : 'Entendido'}
        </BotonOro>
      </div>
    </div>
  )
}
