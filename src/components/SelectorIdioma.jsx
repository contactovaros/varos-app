// Selector de idioma del flujo público /reservas. Texto, no banderas:
// "ES · EN" con el idioma activo en dorado. Va en la esquina superior
// izquierda de las tres pantallas del flujo (pausa, formulario, confirmación),
// posicionado absoluto sobre el contenedor raíz — discreto, sin tapar el Header
// que está centrado.

export default function SelectorIdioma({ idioma, setIdioma, idiomas = ['es', 'en'] }) {
  return (
    <div className="absolute top-2 left-2 z-20 flex items-center font-head text-xs tracking-[0.15em]">
      {idiomas.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="text-gold/25" aria-hidden="true">·</span>}
          <button
            type="button"
            onClick={() => setIdioma(l)}
            aria-pressed={idioma === l}
            className={`min-w-[36px] min-h-[36px] px-1.5 transition-colors duration-150 ${
              idioma === l ? 'text-gold' : 'text-paper/60 hover:text-paper/80'
            }`}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}
