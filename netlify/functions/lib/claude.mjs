// Cliente de la API de Anthropic, compartido por las funciones del consultor
// de reseñas.
//
// La clave vive SOLO en las variables de entorno de Netlify
// (Site configuration → Environment variables → ANTHROPIC_API_KEY, marcada
// como "Contains secret values"). Nunca en el .env del repo, que está
// versionado en git.
//
// Dos cosas que ya costaron tiempo y no hay que "mejorar":
//   - El modelo es `claude-sonnet-5`, sin sufijo de fecha. Se eligió sobre
//     Opus por costo (un tercio) para un uso diario de preguntas sueltas,
//     donde el caché de prompt no llega a amortizar la diferencia de precio.
//   - No existe `budget_tokens`: fue removido y devuelve 400. Para controlar
//     cuánto piensa el modelo se usa `output_config.effort`.

import Anthropic from '@anthropic-ai/sdk'

export const MODELO = 'claude-sonnet-5'

/** null si falta la clave; el llamador responde con `respuestaSinClave()`. */
export function clienteClaude() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
}

export function faltaClave() {
  return !process.env.ANTHROPIC_API_KEY
}

export const MENSAJE_SIN_CLAVE =
  'Falta configurar la clave de la IA en Netlify: agregá la variable ANTHROPIC_API_KEY en Site configuration → Environment variables y volvé a desplegar el sitio.'

/** Junta los bloques de texto de la respuesta, ignorando thinking y tool_use. */
export function textoDeRespuesta(mensaje) {
  return (mensaje?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

/**
 * Traduce el error del SDK a algo que el admin pueda leer. El error crudo va
 * a los logs de Netlify, nunca al navegador: puede traer fragmentos del
 * prompt o de la clave.
 */
export function errorLegible(e) {
  if (e instanceof Anthropic.RateLimitError) {
    return { mensaje: 'La IA está recibiendo demasiadas consultas ahora mismo. Esperá un minuto y probá de nuevo.', status: 429 }
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return { mensaje: 'La clave de la IA no es válida o fue revocada. Revisá ANTHROPIC_API_KEY en las variables de Netlify.', status: 502 }
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return { mensaje: 'La IA tardó demasiado en responder. Probá con menos texto o volvé a intentar.', status: 504 }
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { mensaje: 'No se pudo conectar con la IA. Probá de nuevo en un momento.', status: 502 }
  }
  if (e instanceof Anthropic.APIError) {
    if (e.status === 400) {
      return { mensaje: 'La IA rechazó el pedido por su tamaño o su formato. Probá pegando menos reseñas por vez.', status: 400 }
    }
    if (e.status >= 500) {
      return { mensaje: 'La IA está con problemas del lado de Anthropic. Probá de nuevo en unos minutos.', status: 502 }
    }
    return { mensaje: 'La IA devolvió un error inesperado. Quedó anotado en los logs de Netlify.', status: 502 }
  }
  return { mensaje: 'Hubo un problema inesperado procesando la consulta.', status: 500 }
}
