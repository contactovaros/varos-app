// Llamadas a las funciones serverless que exigen ser admin.
//
// Esas funciones no son públicas (cada consulta gasta tokens de una API paga),
// así que esperan el access token de Supabase en el header. Se lee en cada
// llamada y no se guarda en una variable de módulo: la sesión se refresca sola
// y un token cacheado se vuelve viejo justo cuando el dueño deja la pantalla
// abierta un rato, que es exactamente cómo se usa esto.

import { supabase } from './supabase'

async function cabeceras() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Se cerró la sesión. Volvé a entrar para seguir.')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

/** POST que devuelve JSON. Tira Error con el mensaje del backend si falla. */
export async function postJson(funcion, body) {
  const res = await fetch(`/.netlify/functions/${funcion}`, {
    method: 'POST',
    headers: await cabeceras(),
    body: JSON.stringify(body)
  })

  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(datos.error || `La función respondió ${res.status}`)
  return datos
}

/**
 * POST que devuelve texto en streaming: llama a `onTexto` con cada pedazo que
 * va llegando. Se usa para la respuesta del consultor, que tarda más de los 10
 * segundos que Netlify le da a una función normal.
 */
export async function postStream(funcion, body, onTexto) {
  const res = await fetch(`/.netlify/functions/${funcion}`, {
    method: 'POST',
    headers: await cabeceras(),
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(detalle || `La función respondió ${res.status}`)
  }

  // Sin body legible (navegador viejo o proxy que buffea): se lee de una,
  // el usuario ve la respuesta entera de golpe en vez de nada.
  if (!res.body?.getReader) {
    onTexto(await res.text())
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onTexto(decoder.decode(value, { stream: true }))
  }
}
