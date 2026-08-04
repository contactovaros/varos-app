import { QRCodeSVG } from 'qrcode.react'

export function Ornamento() {
  return (
    <div className="flex items-center gap-2 justify-center my-2">
      <span className="h-px w-10 bg-gold/50" />
      <span className="text-gold text-[10px]">✦</span>
      <span className="h-px w-10 bg-gold/50" />
    </div>
  )
}

function formatearCumpleanos(fecha) {
  if (!fecha) return null
  return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}

// Muestra el QR solo cuando falta 1 o 2 visitas para el premio: el garzón lo usa
// para identificar al cliente que está por completar su tarjeta.
export default function TarjetaFidelidad({ customer, estrellas, mensaje }) {
  const primerNombre = customer.full_name?.split(' ')[0] ?? ''
  const cumpleanos = formatearCumpleanos(customer.birthday)
  const mostrarQR = estrellas === 3 || estrellas === 4

  return (
    <>
      <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1">Varo's</div>
      <h1 className="font-head text-3xl text-ink font-semibold mb-1">Hola, {primerNombre}</h1>
      <p className="text-wineSoft font-medium mb-1">Tu tarjeta de fidelización</p>
      <Ornamento />

      <div className="w-full max-w-xs rounded-[26px] border-2 border-gold/70 bg-inkSoft p-1.5 mt-4 shadow-glow">
        <div className="rounded-[20px] border border-gold/30 p-6 text-center">
          <div className="font-display text-2xl text-gold leading-tight">Varo's</div>
          <Ornamento />

          <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden border-2 border-gold/50 bg-ink flex items-center justify-center">
            {customer.avatar_url ? (
              <img src={customer.avatar_url} alt={customer.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-head font-bold text-2xl text-gold">{customer.full_name?.[0]}</span>
            )}
          </div>
          <div className="font-head font-semibold text-lg text-paper mb-1">{customer.full_name}</div>
          {cumpleanos && <p className="text-paper/50 text-xs mb-2">🎂 {cumpleanos}</p>}

          <div className="flex gap-1.5 justify-center mb-3 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`text-3xl ${i < estrellas ? 'text-gold' : 'text-gold/20'}`}>
                {i < estrellas ? '★' : '☆'}
              </span>
            ))}
          </div>
          <p className="text-paper text-sm mb-1">{estrellas} de 5 visitas</p>

          {mensaje && (
            <div className="border-t border-gold/20 pt-4 mt-3">
              <p className="text-paper/85 text-[15px] leading-relaxed">{mensaje}</p>
            </div>
          )}

          {mostrarQR && (
            <div className="bg-paper p-3 rounded-2xl border-2 border-gold/60 inline-block mt-4">
              <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={130} />
            </div>
          )}

          <div className="border-t border-gold/20 mt-5 pt-3 text-[10px] text-gold/50 tracking-wide">
            +56 9 9923 5368 · contacto@varos.cl
          </div>
        </div>
      </div>
    </>
  )
}
