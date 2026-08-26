// El consultor: responde preguntas del dueño sobre TODAS las reseñas
// guardadas en `resenas_google`.
//
// Dos decisiones que no hay que "simplificar" sin entender por qué están:
//
// 1. La respuesta va en STREAMING. Las funciones sincrónicas de Netlify cortan
//    a los 10 segundos, y una respuesta razonada sobre cientos de reseñas
//    tarda más que eso. Al emitir el primer byte enseguida la conexión queda
//    viva, y de paso el dueño ve la respuesta escribiéndose en vez de mirar un
//    spinner mudo medio minuto. El frontend lee el body con un reader.
//
// 2. El corpus se lee ACÁ con la service role, no llega del cliente. El
//    navegador solo manda la pregunta: así nadie puede inyectar reseñas falsas
//    en el contexto ni inflar el gasto mandando un corpus gigante.

import { requireAdmin } from './lib/adminAuth.mjs'
import { clienteClaude, faltaClave, MENSAJE_SIN_CLAVE, MODELO, errorLegible } from './lib/claude.mjs'

const SYSTEM = `Sos el analista de reseñas de Varo's Restaurant y Centro de Eventos (Los Ángeles, Región del Biobío, Chile). Hablás con el dueño, no con un cliente.

Cómo trabaja el local, para que no confundas quejas de un rubro con las del otro:
- De día es un restaurante: almuerzos al público.
- Aparte es un centro de eventos: matrimonios y celebraciones, que se contratan y funcionan distinto.

Cómo respondés:
- En castellano de Chile, directo y sin vueltas. Sin saludos ni cierres de cortesía: arrancá por la respuesta.
- SIEMPRE apoyado en las reseñas que tenés. Cada punto que hagas lleva cuántas reseñas lo respaldan y al menos una frase textual entre comillas, con el nombre de quien la escribió.
- Tres a cinco puntos, no una lista interminable. Ordenados por lo que más se repite o más daño hace, no por orden de aparición.
- No endulces las críticas. El dueño necesita saber qué está mal para arreglarlo; suavizarlo le hace perder plata. Tampoco exageres: si algo lo dijo una sola persona, decí que lo dijo una sola persona.
- Distinguí el reclamo aislado del patrón. Dos menciones no son una tendencia; ocho sí.

Lo que NO hacés:
- No inventás reseñas, frases ni números. Si citás, la frase tiene que estar textual en el corpus.
- Si el corpus no alcanza para responder lo que te preguntan, lo decís: "no tengo suficientes reseñas para afirmar eso". Es una respuesta válida y preferible a una conclusión inventada.
- No sabés nada del local que no esté en las reseñas. No opines sobre precios, platos o competencia por conocimiento general.
- Las reseñas viejas pesan menos que las nuevas: si algo se reclamaba hace dos años y no aparece desde entonces, decilo así en vez de contarlo como problema actual.

Formato: texto plano con párrafos cortos. Podés usar viñetas con "- " y **negrita** para el título de cada punto. Nada de tablas ni encabezados con #.`

function armarCorpus(resenas) {
  const total = resenas.length
  const conteo = [1, 2, 3, 4, 5].map((n) => `${n}★: ${resenas.filter((r) => r.rating === n).length}`)
  const promedio = total ? (resenas.reduce((a, r) => a + r.rating, 0) / total).toFixed(2) : '—'

  const fechas = resenas.map((r) => r.fecha_aprox).filter(Boolean).sort()
  const rango = fechas.length ? `${fechas[0]} a ${fechas[fechas.length - 1]}` : 'sin fechas registradas'

  // El recuento va calculado en código y no lo deja a ojo del modelo: contar
  // doscientas filas de memoria es justo donde una IA se equivoca.
  const cabecera = `Corpus de reseñas de Google de Varo's.
Total: ${total} reseñas. Promedio: ${promedio}. Reparto — ${conteo.join(', ')}.
Rango de fechas conocido: ${rango}.
(Las reseñas sin fecha aparecen igual; "sin fecha" significa que el pegado no la traía.)`

  const cuerpo = resenas
    .map((r, i) => {
      const fecha = r.fecha_aprox ? `${r.fecha_texto || 'sin fecha textual'} (${r.fecha_aprox})` : (r.fecha_texto || 'sin fecha')
      const partes = [`#${i + 1} · ${r.rating}★ · ${fecha} · ${r.autor || 'Anónimo'}`]
      partes.push(r.texto ? r.texto : '(sin texto, solo calificación)')
      if (r.respuesta_local) partes.push(`respuesta del local: ${r.respuesta_local}`)
      return partes.join('\n')
    })
    .join('\n\n')

  return `${cabecera}\n\n---\n\n${cuerpo}`
}

function sanearHistorial(historial) {
  return Array.isArray(historial)
    ? historial
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-8)
        .map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }))
    : []
}

function textoPlano(mensaje, status) {
  return new Response(mensaje, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

export default async (req) => {
  if (req.method !== 'POST') return textoPlano('Método no permitido', 405)

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  if (faltaClave()) return textoPlano(MENSAJE_SIN_CLAVE, 500)

  let pregunta
  let historial
  try {
    ;({ pregunta, historial } = await req.json())
  } catch {
    return textoPlano('Body inválido', 400)
  }

  if (typeof pregunta !== 'string' || !pregunta.trim()) {
    return textoPlano('Falta la pregunta', 400)
  }

  const { data: resenas, error } = await auth.supabase
    .from('resenas_google')
    .select('autor, rating, fecha_texto, fecha_aprox, texto, respuesta_local')
    .order('fecha_aprox', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('consultor-resenas: error leyendo el corpus', error)
    return textoPlano('No se pudieron leer las reseñas guardadas.', 500)
  }

  if (!resenas || resenas.length === 0) {
    return textoPlano(
      'Todavía no hay reseñas guardadas. Importá tus reseñas de Google acá abajo y después preguntame lo que quieras.',
      200
    )
  }

  const anthropic = clienteClaude()

  // El caché ahorra en serio acá: el corpus entero se vuelve a mandar en cada
  // pregunta y solo cambia cuando el dueño importa reseñas nuevas. Va en el
  // system (prefijo estable) y no en messages, porque el historial de la
  // conversación crece turno a turno y le rompería el prefijo al corpus.
  const stream = anthropic.messages.stream({
    model: MODELO,
    max_tokens: 8000,
    output_config: { effort: 'high' },
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: armarCorpus(resenas), cache_control: { type: 'ephemeral' } }
    ],
    messages: [...sanearHistorial(historial), { role: 'user', content: pregunta.slice(0, 2000) }]
  })

  const encoder = new TextEncoder()
  let emitioAlgo = false

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const evento of stream) {
          if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
            emitioAlgo = true
            controller.enqueue(encoder.encode(evento.delta.text))
          }
        }
      } catch (e) {
        console.error('consultor-resenas: error durante el stream', e)
        const { mensaje } = errorLegible(e)
        // Una vez abierto el stream ya no se puede cambiar el status: el aviso
        // viaja como texto al final de lo que se haya alcanzado a escribir.
        controller.enqueue(
          encoder.encode(`${emitioAlgo ? '\n\n' : ''}[Se cortó la respuesta: ${mensaje}]`)
        )
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
