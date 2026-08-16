export function chairPositions(mesa) {
  const chairs = []
  const n = mesa.capacidad
  if (mesa.tipo === 'round') {
    const radius = mesa.ancho / 2 + 26
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2
      chairs.push({ x: Math.cos(ang) * radius, y: Math.sin(ang) * radius, rot: (ang * 180) / Math.PI + 90 })
    }
  } else {
    // Hasta 2 sillas en las cabeceras (arriba/abajo) y el resto repartido
    // en los dos lados largos.
    const headCount = Math.min(2, n)
    const remaining = n - headCount
    const left = Math.ceil(remaining / 2)
    const right = remaining - left
    const margin = 28
    const usable = mesa.alto - margin * 2

    if (headCount >= 1) chairs.push({ x: 0, y: -(mesa.alto / 2 + 26), rot: 0 })
    if (headCount >= 2) chairs.push({ x: 0, y: mesa.alto / 2 + 26, rot: 180 })

    for (let i = 0; i < left; i++) {
      const t = left === 1 ? 0.5 : i / (left - 1)
      chairs.push({ x: -(mesa.ancho / 2 + 26), y: -mesa.alto / 2 + margin + t * usable, rot: -90 })
    }
    for (let i = 0; i < right; i++) {
      const t = right === 1 ? 0.5 : i / (right - 1)
      chairs.push({ x: mesa.ancho / 2 + 26, y: -mesa.alto / 2 + margin + t * usable, rot: 90 })
    }
  }
  return chairs
}
