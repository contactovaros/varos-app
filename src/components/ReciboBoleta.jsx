import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Boleta de impresión de 80mm, compartida entre /admin/caja y /mozo — antes
// vivía duplicada en AdminCaja.jsx; ahora que Mozo también imprime al cobrar
// (pedido del usuario, 2026-09-16: "el botón de cobrar debiese imprimir"),
// se centraliza acá para que las dos boletas no puedan divergir.
//
// Formato calcado de una boleta real de gestion.php (foto del usuario,
// 2026-09-16): encabezado del local, ID/Fecha/Cliente/Garzón/Mesa, "TICKET DE
// CONSUMO", detalle CANT/PRODUCTO/PRECIO, Sub Total + Propina sugerida (10%)
// + Total, y "GRACIAS POR SU PREFERENCIA" al pie.

export function formatMontoTicket(n) {
  return Math.round(n || 0).toLocaleString('es-CL')
}

export function formatFechaTicket(iso) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()} ${hh}:${min}`
}

// `cobro`: { id, mesa, sector, garzon, items: [{nombre, cant, precioUnit}],
// total, medioPagoLabel, created_at }
export default function ReciboBoleta({ cobro, onCerrar }) {
  // El alto de la hoja se fija con el alto real de la boleta. Antes la regla
  // era `@page { size: 80mm auto }`, que NO es CSS válido (el alto no admite
  // "auto"): Chrome la descartaba y usaba el largo por defecto del driver
  // (80 x 297 mm en la BIXOLON SRP-350III), así que salía ~20 cm de papel en
  // blanco por boleta. Se mide de nuevo justo antes de imprimir por si cambió.
  const estiloPagina = useRef(null)
  useEffect(() => {
    const ajustar = () => {
      const el = document.getElementById('recibo-boleta')
      if (!el || !estiloPagina.current) return
      const mm = Math.ceil((el.getBoundingClientRect().height * 25.4) / 96) + 2
      // La BIXOLON SRP-350III solo ofrece tres papeles en el driver: 80x3276,
      // 80x297 y A4. Una altura "a medida" no coincide con ninguno y Chrome cae
      // en el primero de la lista (80x3276 = 3,2 m de rollo corriendo). Pedir
      // 80x297 exacto hace que Chrome lo elija solo; el largo solo si la boleta
      // no cabe en 297 mm.
      const alto = mm <= 295 ? 297 : 3276
      estiloPagina.current.textContent = `@page { size: 80mm ${alto}mm; margin: 0; }`
    }
    ajustar()
    window.addEventListener('beforeprint', ajustar)
    return () => window.removeEventListener('beforeprint', ajustar)
  }, [])

  const items = cobro.items || []
  const subtotal = items.reduce((s, it) => s + (it.precioUnit != null ? it.precioUnit * it.cant : 0), 0)
  // No se guarda la propina como campo aparte (queda mezclada en `total`
  // tanto si cobra un admin como un garzón desde /mozo) — se reconstruye acá
  // como la diferencia contra la suma de los ítems. Si no hubo propina da
  // ~0 y la línea no se muestra.
  const propina = Math.round(cobro.total - subtotal)

  // Va en un portal directo en <body> para poder ocultar TODO lo demás al
  // imprimir con display:none. Con `visibility:hidden` la pantalla de detrás
  // (Caja, Mozo) seguía ocupando espacio y Chrome sacaba páginas en blanco.
  return createPortal(
    <div id="recibo-print" className="fixed inset-0 z-50 bg-ink/95 flex flex-col items-center justify-center px-4 print:static print:bg-white print:block print:px-0">
      <style ref={estiloPagina} />
      <style>{`
        @media print {
          body > *:not(#recibo-print) { display: none !important; }
          html, body { margin: 0; padding: 0; background: #fff; height: auto; }
          #recibo-boleta { width: 70mm; margin: 0 auto; }
        }
      `}</style>

      <div id="recibo-boleta" className="bg-white text-black w-[80mm] max-w-full p-3 font-mono text-[11px] leading-snug print:p-2">
        <div className="text-center mb-2">
          <div className="font-bold">Productora, Centro de Eventos & Restaurant</div>
          <div className="mt-1">Camino Azapa Km. 3.5 - Arica, Chile.</div>
          <div>+56 9 7813 2192</div>
          <div>contacto@varos.cl</div>
          <div>www.varos.cl</div>
        </div>
        <div className="border-t border-dashed border-black my-1.5" />
        <div>ID&nbsp;&nbsp;&nbsp;&nbsp;: {cobro.id ? String(cobro.id).slice(0, 8).toUpperCase() : '—'}</div>
        <div>Fecha : {formatFechaTicket(cobro.created_at)}</div>
        <div>Cliente:</div>
        <div>Garzón: {cobro.garzon || ''}</div>
        <div>Mesa&nbsp;&nbsp;: {cobro.sector} {cobro.mesa}</div>

        <div className="text-center font-bold my-2">TICKET DE CONSUMO</div>

        <div className="flex justify-between font-bold">
          <span>CANT PRODUCTO</span>
          <span>PRECIO</span>
        </div>
        <div className="border-t border-dashed border-black my-1" />
        {items.map((it, i) => (
          <div key={i} className="flex justify-between gap-2 py-0.5">
            <span>{it.cant} {it.nombre}</span>
            <span className="shrink-0 tabular-nums">
              {it.precioUnit != null ? formatMontoTicket(it.precioUnit * it.cant) : '—'}
            </span>
          </div>
        ))}

        <div className="my-2" />
        <div className="flex justify-between">
          <span>Sub Total:</span>
          <span className="tabular-nums">{formatMontoTicket(subtotal)}</span>
        </div>
        {propina > 0 && (
          <div className="flex justify-between">
            <span>Propina sugerida: (10%)</span>
            <span className="tabular-nums">{formatMontoTicket(propina)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[13px] mt-0.5">
          <span>Total:</span>
          <span className="tabular-nums">{formatMontoTicket(cobro.total)}</span>
        </div>

        <div className="mt-2">{cobro.medioPagoLabel}</div>
        <div className="text-center mt-3">GRACIAS POR SU PREFERENCIA</div>
      </div>

      <div className="flex gap-3 mt-4 print:hidden">
        <button onClick={onCerrar} className="px-4 py-2.5 rounded-lg border border-white/15 text-paper text-sm">
          Cerrar
        </button>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-br from-gold to-bronze text-ink font-semibold text-sm"
        >
          🖨️ Imprimir boleta
        </button>
      </div>
    </div>,
    document.body
  )
}
