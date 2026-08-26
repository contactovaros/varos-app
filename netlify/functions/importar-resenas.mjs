// Convierte un pegado crudo del Perfil de Empresa de Google en reseñas
// estructuradas. NO guarda nada: devuelve el JSON y el frontend muestra una
// vista previa antes de escribir en `resenas_google` con la sesión del admin.
//
// Por qué recibe un LOTE y no el pegado entero: las funciones de Netlify
// cortan a los 10 segundos. Parsear varias decenas de reseñas de una es una
// llamada larga — se pasa de largo seguro. El frontend parte el texto
// (partirEnLotes en src/lib/resenas.js) y llama una vez por lote.
//
// Por qué va en STREAMING (y no solo por lotes): incluso un lote solo puede
// tardar más de 10 segundos en generarse. Una función de Netlify que devuelve
// un stream no se mide contra ese límite de la misma forma — mientras la
// conexión siga mandando datos, sigue viva. Por eso se manda cada pedacito
// del JSON de la herramienta a medida que el modelo lo va generando (delta a
// delta), y recién el frontend arma el JSON completo cuando termina de
// recibirlo (ver postStream + analizar() en ImportadorResenas.jsx).
//
// El parseo va por `strict tool use` en vez de pedir "devolveme un JSON":
// el modelo no puede salirse del esquema, así que no hay que adivinar si la
// respuesta viene envuelta en ```json ni reparar comillas a mano — lo único
// que hay que reensamblar es el streaming de los pedazos.

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
- Las estrellas pueden venir como "★★★★★", "5 estrellas", "Calificación: 4", un número suelto arriba del texto, o repetidas como la palabra "star" varias veces seguidas ("starstarstarstarstar" es 5 estrellas: así queda el ícono de Google cuando se copia como texto plano, contá cuántas veces se repite "star"). Si no podés determinarlas con seguridad, omití esa reseña entera en vez de inventar un número.
- Una reseña sin cuerpo (solo estrellas) es válida: dejá el texto vacío.
- Si aparece la respuesta del dueño (suele venir como "Respuesta del propietario"), va en respuesta_local y NO se mezcla con el texto de la reseña.
- fecha_aprox: hoy es ${hoyISO}. "hace 2 meses" son dos meses antes de hoy; "hace un año", un año. Usá el día 15 del mes cuando solo se conoce el mes, para no fingir precisión. Si no hay pista de fecha, dejalo vacío.
- No inventes reseñas que no estén en el texto. Si el pegado no tiene ninguna, devolvé la lista vacía.`
}

function textoPlano(mensaje, status) {
  return new Response(mensaje, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  if (faltaClave()) return textoPlano(JSON.stringify({ error: MENSAJE_SIN_CLAVE }), 200)

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

  const stream = anthropic.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    // Tarea mecánica de transcripción: no necesita pensar mucho, y bajar el
    // esfuerzo la hace más barata y más rápida.
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: instrucciones(hoyISO), cache_control: { type: 'ephemeral' } }
    ],
    tools: [HERRAMIENTA],
    tool_choice: { type: 'tool', name: 'registrar_resenas' },
    messages: [{ role: 'user', content: `Texto pegado:\n\n${texto}` }]
  })

  const encoder = new TextEncoder()
  let emitioAlgo = false

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const evento of stream) {
          // El input de la herramienta llega de a pedazos de texto JSON
          // (input_json_delta) a medida que el modelo lo genera. Como
          // `tool_choice` fuerza una sola herramienta, no hace falta
          // distinguir bloques: se concatenan todos en orden.
          if (evento.type === 'content_block_delta' && evento.delta?.type === 'input_json_delta') {
            emitioAlgo = true
            controller.enqueue(encoder.encode(evento.delta.partial_json))
          }
        }
      } catch (e) {
        console.error('importar-resenas: error durante el stream', e)
        // Si todavía no se mandó nada, se puede mandar un JSON de error
        // limpio: el frontend distingue `{ error }` de `{ resenas }`. Si ya
        // se había empezado a mandar el JSON de las reseñas, agregar texto acá
        // lo rompería (dejaría de ser JSON válido) — en ese caso el frontend
        // detecta el fallo al no poder parsear y pide reintentar con menos
        // texto, que es lo más honesto que se puede hacer sin poder avisar
        // a mitad de una respuesta ya empezada.
        if (!emitioAlgo) {
          const { mensaje } = errorLegible(e)
          controller.enqueue(encoder.encode(JSON.stringify({ error: mensaje })))
        }
      } finally {
        controller.close()
      }
    }
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
