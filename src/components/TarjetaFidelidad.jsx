import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

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

function mensajeFaltan(restantes, premioTexto) {
  const visita = restantes === 1 ? 'estrella' : 'estrellas'
  return `Te falta${restantes === 1 ? '' : 'n'} ${restantes} ${visita} para: ${premioTexto}`
}

function IconoInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function IconoFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94z" />
    </svg>
  )
}

function IconoWhatsApp() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.41-1.42a9.87 9.87 0 0 0 4.63 1.18h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.26.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.21.84.86-3.13-.2-.32a8.18 8.18 0 0 1-1.26-4.36c0-4.55 3.7-8.18 8.32-8.18zm-4.6 4.3c-.16 0-.42.06-.64.31-.22.25-.85.83-.85 2.02s.87 2.34.99 2.5c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.15.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.44-1.34-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42z" />
    </svg>
  )
}

// Ícono genérico mientras se agrega el logo real de Varo's (pendiente de recibir el archivo).
function IconoSitioWeb() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconoResena() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function BotonRedSocial({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gold/50 text-gold"
    >
      {children}
    </a>
  )
}

// Muestra el QR solo cuando falta 1 o 2 visitas para el premio: el garzón lo usa
// para identificar al cliente que está por completar su tarjeta.
export default function TarjetaFidelidad({ customer, estrellas, mensaje }) {
  const [premio, setPremio] = useState(null)

  useEffect(() => {
    supabase
      .from('config_recompensa_estrellas')
      .select('producto, visible')
      .eq('id', 1)
      .single()
      .then(({ data }) => setPremio(data))
  }, [])

  const primerNombre = customer.full_name?.split(' ')[0] ?? ''
  const cumpleanos = formatearCumpleanos(customer.birthday)
  const mostrarQR = estrellas === 3 || estrellas === 4
  const restantes = 5 - estrellas
  const premioTexto = premio?.producto ? (premio.visible ? premio.producto : 'tu premio sorpresa 🎁') : null
  const mensajePremio = restantes > 0 && premioTexto ? mensajeFaltan(restantes, premioTexto) : null

  return (
    <>
      <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1">Varo's</div>
      <h1 className="font-head text-3xl text-paper font-semibold mb-1">Hola, {primerNombre}</h1>
      <p className="text-wineSoft font-medium mb-1">Tu tarjeta de fidelización</p>
      <Ornamento />

      <div className="w-full max-w-xs rounded-[26px] border-[3px] border-gold bg-inkSoft p-1.5 mt-4 shadow-[0_0_30px_rgba(227,179,65,0.35)]">
        <div className="rounded-[20px] border border-gold/40 p-6 text-center">
          <div className="font-display text-2xl text-gold leading-tight">Varo's</div>
          <Ornamento />

          <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden border-2 border-gold/50 bg-ink flex items-center justify-center">
            {customer.avatar_url ? (
              <img src={customer.avatar_url} alt={customer.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-head font-bold text-2xl text-gold">{customer.full_name?.[0]}</span>
            )}
          </div>
          <div className="font-head font-semibold text-xl text-paper mb-1">{customer.full_name}</div>
          {cumpleanos && <p className="text-paper/50 text-sm mb-2">🎂 {cumpleanos}</p>}

          <div className="flex gap-1.5 justify-center mb-3 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`text-3xl ${i < estrellas ? 'text-gold' : 'text-gold/20'}`}>
                {i < estrellas ? '★' : '☆'}
              </span>
            ))}
          </div>
          <p className="text-paper text-base mb-1">{estrellas} de 5 visitas</p>
          {mensajePremio && <p className="text-gold/80 text-sm mb-2">{mensajePremio}</p>}

          {mensaje && (
            <div className="border-t border-gold/20 pt-4 mt-3">
              <p className="text-paper/85 text-base leading-relaxed">{mensaje}</p>
            </div>
          )}

          {mostrarQR && (
            <div className="bg-paper p-3 rounded-2xl border-2 border-gold/60 inline-block mt-4">
              <QRCodeSVG value={`VAROS-CLUB-${customer.member_number}`} size={130} />
            </div>
          )}

          <div className="border-t border-gold/20 mt-5 pt-3 text-sm text-gold/50 tracking-wide">
            contacto@varos.cl
          </div>

          <div className="flex items-center justify-center gap-2 mt-3">
            <BotonRedSocial href="https://www.instagram.com/varosrestaurant/?hl=es" label="Síguenos en Instagram">
              <IconoInstagram />
            </BotonRedSocial>
            <BotonRedSocial href="https://www.facebook.com/varosrestaurant" label="Síguenos en Facebook">
              <IconoFacebook />
            </BotonRedSocial>
            <BotonRedSocial href="https://varos.cl/" label="Visita nuestro sitio web">
              <IconoSitioWeb />
            </BotonRedSocial>
            <BotonRedSocial href="https://wa.me/56999235368" label="Escríbenos por WhatsApp">
              <IconoWhatsApp />
            </BotonRedSocial>
            <BotonRedSocial href="https://g.page/r/CfTLjMLhcWvCEBM/review" label="Déjanos tu reseña">
              <IconoResena />
            </BotonRedSocial>
          </div>
        </div>
      </div>
    </>
  )
}
