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
    const left = Math.ceil(n / 2)
    const right = n - left
    const margin = 28
    const usable = mesa.alto - margin * 2
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
