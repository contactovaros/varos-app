// Acción principal de las pantallas de cara al cliente.
//
// Por qué oro y no ámbar: la marca de Varo's es dorada (el logo es script de
// oro sobre damasco). El ámbar `ember` es el color de la app — sirve para el
// panel de administración, pero en la pantalla que ve un desconocido antes de
// decidir si viene, competía con la identidad. Además el socio llega desde
// /club tocando un botón dorado: aterrizar en botones naranjas delataba que
// las pantallas se habían diseñado por separado.
//
// El relleno no es plano: es una rampa bronce → dorado → dorado claro → dorado
// → bronce. Eso es lo que hace que el ojo lea metal y no mostaza. Mismo
// tratamiento que el CTA de /club, de donde salió.
//
// Sobre el movimiento: solo hay feedback de presión. Nada de barridos de luz
// acá — el haz de /club es una invitación permanente que se ve de a una; tres
// botones destellando dentro de un mismo flujo se leen baratos. La contención
// es lo que hace que se sienta caro.

const BASE =
  'relative w-full py-4 rounded-2xl font-head font-bold tracking-wide text-center ' +
  'text-ink bg-[linear-gradient(135deg,#C08A2E_0%,#E3B341_38%,#F0D284_50%,#E3B341_62%,#C08A2E_100%)] ' +
  'shadow-glowGold ' +
  // En celular no hay hover: sin esto, tocar el botón no devuelve ninguna
  // señal física y la pantalla se siente congelada mientras vuela la consulta.
  'transition-[transform,opacity,box-shadow] duration-150 ease-salida ' +
  'active:scale-[0.97] motion-reduce:active:scale-100 ' +
  'disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

export default function BotonOro({
  children,
  cargando = false,
  textoCargando = 'Un momento…',
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <button {...props} disabled={disabled || cargando} className={`${BASE} ${className}`}>
      {cargando ? textoCargando : children}
    </button>
  )
}
