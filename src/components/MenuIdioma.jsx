import { useEffect, useRef, useState } from 'react'

const NOMBRES = { es: 'Español', en: 'English', pt: 'Português', it: 'Italiano', zh: '中文' }

// Botón desplegable de idioma (globo + código). Más evidente que el texto
// "ES · EN" de la reserva: en la carta el cliente tiene que verlo a la primera.
export default function MenuIdioma({ idioma, setIdioma, idiomas }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierto])

  return (
    <div ref={raiz} className="absolute top-4 right-4 z-20 font-head">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Idioma / Language"
        className="flex items-center gap-2 rounded-full border border-gold/50 bg-ink/80 px-3.5 py-2 text-gold text-xs font-semibold tracking-[0.12em] hover:bg-gold/10 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" />
        </svg>
        {idioma.toUpperCase()}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      {abierto && (
        <ul role="listbox" className="absolute right-0 mt-2 min-w-[9.5rem] overflow-hidden rounded-xl border border-white/10 bg-inkSoft shadow-lg">
          {idiomas.map((l) => (
            <li key={l} role="option" aria-selected={l === idioma}>
              <button
                type="button"
                onClick={() => {
                  setIdioma(l)
                  setAbierto(false)
                }}
                className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/5 ${
                  l === idioma ? 'text-gold' : 'text-paper/75'
                }`}
              >
                {NOMBRES[l] ?? l}
                <span className="text-[10px] tracking-[0.12em] opacity-60">{l.toUpperCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
