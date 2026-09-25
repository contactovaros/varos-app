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
- Corrige letras, no palabras: NUNCA agregues, quites, cambies ni reordenes palabras. "Papa huancaina" debe quedar "Papa huancaína" (solo la tilde), no "Papa a la huancaína".
- No traduzcas, resumas ni reescribas. Conserva EXACTAMENTE los saltos de línea, los "*" o "-" de viñetas, los números, precios, grados (40º) y emojis.
- Mayúsculas: la primera letra de cada nombre, línea o frase va en mayúscula. Si el texto usa Title Case en los nombres de platos ("Costillar de Cerdo con Arroz Chaufa") o va todo en MAYÚSCULAS a propósito, conserva ese estilo; solo arregla mayúsculas raras dentro de una palabra ("GUata" -> "Guata", "cEviche" -> "Ceviche").
- Tildes y eñes: repónlas cuando falten (aji -> ají, seleccion -> Selección, Niño). Corrige faltas evidentes (aroz -> arroz, cebice -> ceviche). Espacios dobles o sobrantes y puntuación mal puesta también.
- Términos gastronómicos peruanos/chilenos/internacionales y marcas en su forma correcta: huancaína, chaufa, puttanesca, ají, guata, pisco sour, Bauzá, Kunstmann, Aperol, Chardonnay.
- Si el texto ya está bien, devuélvelo idéntico.
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
