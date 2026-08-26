// Convierte un pegado crudo del Perfil de Empresa de Google en reseñas
// estructuradas. NO guarda nada: devuelve el JSON y el frontend muestra una
// vista previa antes de escribir en `resenas_google` con la sesión del admin.
//
// Por qué recibe un LOTE y no el pegado entero: las funciones sincrónicas de
// Netlify cortan a los 10 segundos. Parsear 200 reseñas de una es una llamada
// larga y una salida de decenas de miles de tokens — se pasa de largo seguro.
// El frontend parte el texto (partirEnLotes en src/lib/resenas.js) y llama
// una vez por lote, lo que además le permite mostrar progreso real.
//
// El parseo va por `strict tool use` en vez de pedir "devolveme un JSON":
// el modelo no puede salirse del esquema, así que no hay que adivinar si la
// respuesta viene envuelta en ```json ni reparar comillas a mano.

import { requireAdmin, jsonResponse } from './lib/adminAuth.mjs'
import { clienteClaude, faltaClave, MENSAJE_SIN_CLAVE, MODELO, errorLegible } from './lib/claude.mjs'

const MAX_CARACTERES_LOTE = 12_000

const HERRAMIENTA = {
  name: 'registrar_resenas',
  description: 'Registra las reseñas encontradas en el texto pegado por el usuario.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      resenas: {
        type: 'array',
        description: 'Una entrada por reseña encontrada, en el orden en que aparecen.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            autor: {
              type: 'string',
              description: 'Nombre de quien escribió la reseña. "Anónimo" si no aparece.'
            },
            rating: {
              type: 'integer',
              description: 'Estrellas de 1 a 5.'
            },
            fecha_texto: {
              type: 'string',
              description: 'La fecha tal cual la muestra Google ("hace 2 meses"). Vacío si no aparece.'
            },
            fecha_aprox: {
              type: 'string',
              description: 'La fecha estimada en formato YYYY-MM-DD, calculada contra la fecha de hoy. Vacío si no se puede estimar.'
            },
            texto: {
              type: 'string',
              description: 'El cuerpo de la reseña, textual. Vacío si la reseña es solo estrellas.'
            },
            respuesta_local: {
              type: 'string',
              description: 'La respuesta del dueño del local, si Google la muestra. Vacío si no hay.'
            }
          },
          required: ['autor', 'rating', 'fecha_texto', 'fecha_aprox', 'texto', 'respuesta_local']
        }
      }
    },
    required: ['resenas']
  }
}

function instrucciones(hoyISO) {
  return `Extraés reseñas de Google a partir del texto que el dueño de un restaurante copió y pegó desde su Perfil de Empresa. El pegado viene sucio: trae botones, contadores tipo "Local Guide · 24 reseñas · 12 fotos", "Me gusta", "Compartir", fotos sin texto y saltos de línea arbitrarios.

Reglas:
- Una entrada por reseña real. El ruido de la interfaz no es una reseña.
- Copiá el texto de la reseña TEXTUAL, sin corregir ortografía, sin resumir y sin traducir. Es la prueba que después se cita.
- Las estrellas pueden venir como "★★★★★", "5 estrellas", "Calificación: 4" o solo como un número suelto arriba del texto. Si no podés determinarlas con seguridad, omití esa reseña entera en vez de inventar un número.
- Una reseña sin cuerpo (solo estrellas) es válida: dejá el texto vacío.
- Si aparece la respuesta del dueño (suele venir como "Respuesta del propietario"), va en respuesta_local y NO se mezcla con el texto de la reseña.
- fecha_aprox: hoy es ${hoyISO}. "hace 2 meses" son dos meses antes de hoy; "hace un año", un año. Usá el día 15 del mes cuando solo se conoce el mes, para no fingir precisión. Si no hay pista de fecha, dejalo vacío.
- No inventes reseñas que no estén en el texto. Si el pegado no tiene ninguna, devolvé la lista vacía.`
}

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

  if (typeof texto !== 'string' || !texto.trim()) {
    return jsonResponse({ error: 'No llegó texto para importar' }, 400)
  }

  // El frontend ya parte en lotes; este techo es la red por si alguien llama
  // el endpoint a mano. Se rechaza en vez de truncar: truncar en silencio
  // haría desaparecer reseñas sin que nadie se entere.
  if (texto.length > MAX_CARACTERES_LOTE) {
    return jsonResponse(
      {
        error: `Este bloque es muy largo (${texto.length} caracteres). Pegá menos reseñas por vez: el máximo por lote es ${MAX_CARACTERES_LOTE}.`
      },
      413
    )
  }

  const anthropic = clienteClaude()
  const hoyISO = new Date().toISOString().slice(0, 10)

  try {
    const mensaje = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Tarea mecánica de transcripción: no necesita pensar mucho, y bajar el
      // esfuerzo la hace más barata y bastante más rápida (importa: hay 10
      // segundos de techo antes de que Netlify corte).
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: instrucciones(hoyISO), cache_control: { type: 'ephemeral' } }
      ],
      tools: [HERRAMIENTA],
      tool_choice: { type: 'tool', name: 'registrar_resenas' },
      messages: [{ role: 'user', content: `Texto pegado:\n\n${texto}` }]
    })

    const bloque = (mensaje.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === 'registrar_resenas'
    )

    if (!bloque) {
      console.error('importar-resenas: la IA no devolvió el bloque de herramienta', mensaje.stop_reason)
      return jsonResponse(
        { error: 'La IA no pudo leer este bloque de texto. Probá pegando un pedazo más chico.' },
        502
      )
    }

    // `strict: true` garantiza la forma, pero el input viene como JSON del
    // modelo: se lee siempre parseado, nunca por coincidencia de strings.
    const entrada = typeof bloque.input === 'string' ? JSON.parse(bloque.input) : bloque.input
    const resenas = Array.isArray(entrada?.resenas) ? entrada.resenas : []

    return jsonResponse({ resenas })
  } catch (e) {
    console.error('importar-resenas: error llamando a la IA', e)
    const { mensaje, status } = errorLegible(e)
    return jsonResponse({ error: mensaje }, status)
  }
}
