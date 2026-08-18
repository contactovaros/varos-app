// Helpers de WhatsApp compartidos entre AdminReservas.jsx y
// PanelReservasDia.jsx (ninguna de las dos importa de la otra para el
// mensaje de confirmación, para no crear una dependencia circular con lo
// que PanelReservasDia.jsx ya importa de AdminReservas.jsx).

export function whatsappHref(telefono, mensaje) {
  const digits = (telefono || '').replace(/\D/g, '')
  const conCodigo = digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits
  const base = `https://wa.me/${conCodigo}`
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base
}

// Reemplaza el correo automático de "reserva confirmada" — el administrador
// la manda a mano por WhatsApp, con este texto ya armado.
export function mensajeConfirmacionReserva(r) {
  const [y, m, d] = r.fecha.split('-')
  const hora = r.hora?.slice(0, 5)
  return (
    `Restaurante Varo's confirma que tu reserva ya fue realizada ✅\n\n` +
    `Nombre: ${r.nombre}\n` +
    `Fecha: ${d}/${m}/${y}\n` +
    `Hora: ${hora} hrs\n` +
    `Mesa: ${r.mesa_label}\n` +
    `Personas: ${r.personas}` +
    `\n\n¡Te esperamos!`
  )
}
