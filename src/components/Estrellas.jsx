// Las cinco estrellas de una reseña. Vive acá porque la usan tanto la ficha
// pública de Google como la vista previa del importador.
export default function Estrellas({ valor, className = 'text-sm' }) {
  const llenas = Math.round(valor || 0)
  return (
    <span className={`text-gold tracking-wide shrink-0 ${className}`} aria-label={`${valor ?? 0} de 5 estrellas`}>
      {'★'.repeat(llenas)}
      <span className="text-paper/15">{'★'.repeat(Math.max(0, 5 - llenas))}</span>
    </span>
  )
}
