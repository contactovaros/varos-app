// Lógica de puntos y niveles — misma fuente de verdad que usan
// la vista de cliente, el checkout y el panel admin.

export const TIERS = [
  { name: 'Bronce', min: 0, icon: '🥉', multiplier: 1.0 },
  { name: 'Plata', min: 800, icon: '🥈', multiplier: 1.2 },
  { name: 'Oro', min: 1800, icon: '🥇', multiplier: 1.5 },
  { name: 'Diamante', min: 3500, icon: '💎', multiplier: 2.0 }
]

export function tierForPoints(points) {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0]
}

export function nextTier(points) {
  return TIERS.find((t) => t.min > points) ?? null
}

export function progressToNextTier(points) {
  const current = tierForPoints(points)
  const next = nextTier(points)
  if (!next) return { pct: 100, current, next: null }
  const span = next.min - current.min
  const pct = Math.min(100, Math.round(((points - current.min) / span) * 100))
  return { pct, current, next }
}

// $1.000 CLP = 10 puntos por defecto (configurable vía points_rules.clp_per_point)
export function pointsForPurchase(totalClp, clpPerPoint = 100, multiplier = 1) {
  return Math.floor((totalClp / clpPerPoint) * multiplier)
}
