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

// Cada línea que manda el backend es un JSON: `{ delta }` con contenido real,
// `{ ping: true }` como latido cuando el modelo todavía no tiene nada que
// decir, o `{ error }` si algo falló. El latido existe porque streamear evita
// el límite de 10 segundos de las funciones de Netlify, pero no evita que
// otra capa de la infraestructura corte la conexión por "Inactivity Timeout"
// si pasa un rato sin que llegue ni un byte — típicamente mientras el modelo
// razona antes de escribir la primera palabra.
function procesarLineaNDJSON(linea, onTexto) {
  const limpia = linea.trim()
  if (!limpia) return
  let obj
  try {
    obj = JSON.parse(limpia)
  } catch {
    return // línea cortada a mitad de camino: no debería pasar, se ignora
  }
  if (obj.ping) return
  if (obj.error) throw new Error(obj.error)
  if (typeof obj.delta === 'string') onTexto(obj.delta)
}

/**
 * POST que devuelve un stream NDJSON: llama a `onTexto` con cada pedazo de
 * contenido real a medida que llega. Se usa para las dos funciones que
 * gastan más de los 10 segundos que Netlify le da a una función normal (el
 * consultor y el importador).
 */
export async function postStream(funcion, body, onTexto) {
  const res = await fetch(`/.netlify/functions/${funcion}`, {
    method: 'POST',
    headers: await cabeceras(),
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    // Los errores de validación (401/403/400/500 tempranos) vienen como JSON
    // `{ error }` igual que los del propio stream: se intenta extraer ese
    // mensaje antes de mostrar el texto crudo.
    let mensaje = detalle
    try {
      const obj = JSON.parse(detalle)
      if (obj?.error) mensaje = obj.error
    } catch {
      // no era JSON: se deja el texto tal cual llegó
    }
    throw new Error(mensaje || `La función respondió ${res.status}`)
  }

  // Sin body legible (navegador viejo o proxy que buffea): se lee de una.
  if (!res.body?.getReader) {
    const texto = await res.text()
    for (const linea of texto.split('\n')) procesarLineaNDJSON(linea, onTexto)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let corte
    while ((corte = buffer.indexOf('\n')) >= 0) {
      const linea = buffer.slice(0, corte)
      buffer = buffer.slice(corte + 1)
      procesarLineaNDJSON(linea, onTexto)
    }
  }
  if (buffer.trim()) procesarLineaNDJSON(buffer, onTexto)
}
