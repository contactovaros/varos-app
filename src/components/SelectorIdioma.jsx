// Selector de idioma del flujo público /reservas. Texto, no banderas:
// "ES · EN" con el idioma activo en dorado. Va en la esquina superior
// izquierda de las tres pantallas del flujo (pausa, formulario, confirmación),
// posicionado absoluto sobre el contenedor raíz — discreto, sin tapar el Header
// que está centrado.

export default function SelectorIdioma({ idioma, setIdioma }) {
  return (
    <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 font-head text-[11px] tracking-[0.15em]">
      {['es', 'en'].map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gold/25" aria-hidden="true">·</span>}
          <button
            type="button"
            onClick={() => setIdioma(l)}
            aria-pressed={idioma === l}
            className={`transition-colors duration-150 ${
              idioma === l ? 'text-gold' : 'text-paper/35 hover:text-paper/60'
            }`}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}
