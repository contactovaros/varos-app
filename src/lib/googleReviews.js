const FIELD_MASK = 'id,displayName,rating,userRatingCount,reviews,googleMapsUri'

// Places API (New) — Place Details. Requiere una API key restringida por
// dominio (HTTP referrer) en Google Cloud Console; ver guía en AdminResenas.jsx.
export async function fetchPlaceReviews(placeId) {
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('Falta VITE_GOOGLE_PLACES_API_KEY en .env')
  if (!placeId) throw new Error('Falta el Place ID de este local')

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK
    }
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Places respondió ${res.status}${body ? `: ${body}` : ''}`)
  }

  return res.json()
}
