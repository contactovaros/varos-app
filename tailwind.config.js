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
        glow: '0 0 24px rgba(255,122,26,0.35)'
      }
    }
  },
  plugins: []
}
