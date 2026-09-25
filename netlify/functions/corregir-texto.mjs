// Corrector ortográfico para nombres y descripciones de preparaciones.
//
// POST { texto: string } -> { corregido: string, cambio: boolean }
// Solo admins (gasta tokens). Corrige ortografía, tildes, mayúsculas y
// espacios; NO reescribe, traduce ni agrega información. Devuelve el texto
// completo para que el front lo muestre y permita deshacer.

import { requireAdmin, jsonResponse } from './lib/adminAuth.mjs'
import { clienteClaude, faltaClave, MENSAJE_SIN_CLAVE, textoDeRespuesta, errorLegible } from './lib/claude.mjs'

const MODELO_CORRECCION = 'claude-haiku-4-5-20251001'
const MAX_CARACTERES = 4000

const PROMPT = `Eres corrector ortográfico de la carta de Varo's, un restaurante de Arica, Chile (cocina peruana, chilena e internacional, y coctelería).
Recibes un nombre de preparación o una descripción. Devuelve el mismo texto con SOLO estas correcciones: ortografía, tildes, mayúsculas/minúsculas evidentes, espacios sobrantes y signos de puntuación mal puestos.
Reglas estrictas:
- No reescribas, no cambies el orden, no traduzcas, no resumas, no agregues ni quites ingredientes ni información.
- Conserva EXACTAMENTE los saltos de línea, los "*" o "-" de viñetas, los números, precios, grados (40º) y emojis.
- Respeta nombres propios, marcas y términos gastronómicos peruanos/chilenos/internacionales, escribiéndolos en su forma correcta: huancaína, chaufa, tallarines a la puttanesca, ají, guata, pisco sour, Kunstmann, Aperol, chardonnay, etc.
- Si el texto ya está bien, devuélvelo idéntico.
- Si un nombre va en MAYÚSCULAS a propósito (ej. "SOUR PISCO"), conserva las mayúsculas y solo corrige tildes y letras mal escritas.
Responde SOLO con el texto corregido, sin comillas, sin comentarios ni explicaciones.`

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  if (faltaClave()) return jsonResponse({ error: MENSAJE_SIN_CLAVE }, 500)

  let texto
  try {
    ;({ texto } = await req.json())
  } catch {
    return jsonResponse({ error: 'Body inválido' }, 400)
  }
  if (typeof texto !== 'string' || !texto.trim()) return jsonResponse({ error: 'No hay texto para corregir' }, 400)
  if (texto.length > MAX_CARACTERES) return jsonResponse({ error: 'El texto es demasiado largo' }, 400)

  try {
    const respuesta = await clienteClaude().messages.create({
      model: MODELO_CORRECCION,
      max_tokens: 2000,
      temperature: 0,
      system: PROMPT,
      messages: [{ role: 'user', content: texto }]
    })
    const corregido = textoDeRespuesta(respuesta)
    // Red de seguridad: si la IA devolvió algo vacío o desproporcionado, no se toca el texto.
    if (!corregido || corregido.length > texto.length * 1.5 + 20 || corregido.length < texto.length * 0.5 - 20) {
      return jsonResponse({ corregido: texto, cambio: false })
    }
    return jsonResponse({ corregido, cambio: corregido !== texto })
  } catch (e) {
    console.error('corregir-texto: falló la corrección', e)
    const { mensaje, status } = errorLegible(e)
    return jsonResponse({ error: mensaje }, status)
  }
}
