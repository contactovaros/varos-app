/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ember: '#FF7A1A',
        emberDark: '#E85D04',
        wine: '#7A1620',
        wineSoft: '#A8283A',
        ink: '#15100D',
        inkSoft: '#221A16',
        paper: '#FFF8F1',
        paperDim: '#F2E9DE',
        bronze: '#B5732A',
        silver: '#9AA1A9',
        gold: '#E3B341',
        diamond: '#6FD4D9'
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        head: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        // Serif elegante reservado para el sistema de reservas (Reservas.jsx):
        // "display" (Bebas Neue) sigue siendo la fuente del resto de la app.
        serif: ['"Playfair Display"', 'Georgia', 'serif']
      },
      boxShadow: {
        glow: '0 0 24px rgba(255,122,26,0.35)',
        // Resplandor dorado del CTA de marca. Más contenido que `glow`: el oro
        // sobre casi negro ya se lee como fuente de luz, no necesita halo ancho.
        glowGold: '0 0 24px rgba(227,179,65,0.35)'
      },
      // Las curvas del navegador son demasiado flojas para que un movimiento
      // corto se sienta intencional. Estas dos son las únicas que usa la app.
      transitionTimingFunction: {
        salida: 'cubic-bezier(0.23, 1, 0.32, 1)',
        mover: 'cubic-bezier(0.77, 0, 0.175, 1)'
      },
      keyframes: {
        // Haz de luz que cruza una superficie dorada. El barrido ocupa solo el
        // primer tercio del ciclo y el resto es descanso: un destello continuo
        // se lee barato, uno cada varios segundos se lee como reflejo sobre
        // metal. El skew lo vuelve diagonal, que es como pega la luz de verdad.
        haz: {
          '0%': { transform: 'translateX(-220%) skewX(-18deg)' },
          '34%, 100%': { transform: 'translateX(420%) skewX(-18deg)' }
        }
      },
      animation: {
        haz: 'haz 5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
      }
    }
  },
  plugins: []
}
