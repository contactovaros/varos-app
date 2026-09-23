// Traduce platos de menu_items a en/pt/it/zh y guarda el resultado en la
// columna `traducciones` (supabase/add_traducciones_menu.sql).
//
// POST { ids: [uuid, ...] }  (máx. 4 por llamada: las funciones de Netlify
// cortan a los 10 s, así que el front manda de a pocos platos).
// Solo admins (cada llamada gasta tokens). Salta los platos cuya huella ya
// coincide con la guardada, salvo { forzar: true }.
//
// Menú del Día: su descripción cambia a diario, así que no se traduce como
// texto sino que se traduce cada plato listado ("* Ceviche Tradicional") y se
// guarda en `traducciones.platos`, que /carta2 usa línea por línea.

import { createHash } from 'node:crypto'
import { requireAdmin, jsonResponse } from './lib/adminAuth.mjs'
import { clienteClaude, faltaClave, MENSAJE_SIN_CLAVE, textoDeRespuesta, errorLegible } from './lib/claude.mjs'

const MODELO_TRADUCCION = 'claude-haiku-4-5-20251001'
const IDIOMAS = ['en', 'pt', 'it', 'zh']
const MAX_IDS = 4

const huella = (name, description) =>
  createHash('sha1').update(`${name ?? ''}\u0000${description ?? ''}`).digest('hex').slice(0, 12)

const esMenuDelDia = (item) =>
  String(item.category || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim() === 'MENU DEL DIA'

// Platos de la descripción diaria: "* Plato" y lo que sigue a "Postre:".
function platosDelMenu(descripcion) {
  const nombres = new Set()
  for (const linea of String(descripcion || '').split('\n')) {
    const t = linea.trim()
    const viñeta = t.match(/^\*\s*(.+)$/)
    if (viñeta) nombres.add(viñeta[1].trim())
    const postre = t.match(/^postres?:\s*(.+)$/i)
    if (postre) nombres.add(postre[1].trim())
  }
  return [...nombres]
}

const PROMPT = `Eres traductor de la carta de Varo's, restaurante de Arica, Chile (cocina peruana/chilena/internacional y coctelería).
Traduce a inglés (en), portugués de Brasil (pt), italiano (it) y chino simplificado (zh).
Reglas: nombres propios, marcas y clásicos reconocibles (Pisco Sour, Ceviche, Causa Limeña, Mojito, Aperol, Spritz, viñas, licores, cervezas) NO se traducen; en zh se dejan en alfabeto latino. Traduce los nombres genéricos de platos y las descripciones de forma natural y fiel, sin agregar información ni marketing; conserva números, grados y saltos de línea. Descripción vacía => "" en todos los idiomas. En zh usa nombres comprensibles, sin pinyin.
Responde SOLO un JSON válido, sin texto extra ni bloques de código, con esta forma exacta:
{"items":{"<id>":{"en":{"n":"","d":""},"pt":{...},"it":{...},"zh":{...}}},"platos":{"<plato en español>":{"en":"","pt":"","it":"","zh":""}}}
"items" lleva una entrada por cada id recibido (n = nombre, d = descripción). "platos" solo para los nombres de la lista "platos" (puede ir vacío).`

function extraerJson(texto) {
  const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(limpio)
}

export default async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405)

  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  if (faltaClave()) return jsonResponse({ error: MENSAJE_SIN_CLAVE }, 500)

  let ids
  let forzar
  try {
    ;({ ids, forzar } = await req.json())
  } catch {
    return jsonResponse({ error: 'Body inválido' }, 400)
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || ids.some((i) => typeof i !== 'string')) {
    return jsonResponse({ error: `Mandá entre 1 y ${MAX_IDS} ids` }, 400)
  }

  const { data: items, error } = await auth.supabase
    .from('menu_items')
    .select('id, name, description, category, traducciones')
    .in('id', ids)
  if (error) {
    console.error('traducir-carta: error leyendo menu_items', error)
    return jsonResponse({ error: 'No se pudieron leer los platos (¿corrió add_traducciones_menu.sql?).' }, 500)
  }

  const pendientes = []
  for (const it of items ?? []) {
    const menu = esMenuDelDia(it)
    // Para el Menú del Día la fuente traducible es el nombre + la lista de platos.
    const fuente = menu ? huella(it.name, platosDelMenu(it.description).join('|')) : huella(it.name, it.description)
    if (!forzar && it.traducciones?.fuente === fuente) continue
    pendientes.push({ it, menu, fuente })
  }
  if (pendientes.length === 0) return jsonResponse({ traducidos: 0, salteados: ids.length })

  const entrada = {
    items: pendientes.map(({ it, menu }) => ({ id: it.id, nombre: it.name, descripcion: menu ? '' : it.description ?? '' })),
    platos: [...new Set(pendientes.filter((p) => p.menu).flatMap((p) => platosDelMenu(p.it.description)))]
  }

  const anthropic = clienteClaude()
  let resultado
  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO_TRADUCCION,
      max_tokens: 4000,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(entrada) }]
    })
    resultado = extraerJson(textoDeRespuesta(respuesta))
  } catch (e) {
    console.error('traducir-carta: fallo la traducción', e)
    if (e instanceof SyntaxError) return jsonResponse({ error: 'La IA devolvió una respuesta ilegible. Probá de nuevo.' }, 502)
    const { mensaje, status } = errorLegible(e)
    return jsonResponse({ error: mensaje }, status)
  }

  let traducidos = 0
  for (const { it, menu, fuente } of pendientes) {
    const t = resultado?.items?.[it.id]
    if (!t || !IDIOMAS.every((l) => typeof t[l]?.n === 'string')) continue
    const traducciones = { fuente }
    for (const l of IDIOMAS) traducciones[l] = { n: t[l].n, d: menu ? '' : t[l].d ?? '' }
    if (menu) {
      const platos = {}
      for (const nombre of platosDelMenu(it.description)) {
        if (resultado?.platos?.[nombre]) platos[nombre] = resultado.platos[nombre]
      }
      traducciones.platos = platos
    }
    const { error: errUpd } = await auth.supabase.from('menu_items').update({ traducciones }).eq('id', it.id)
    if (errUpd) console.error('traducir-carta: no se pudo guardar', it.id, errUpd)
    else traducidos++
  }

  return jsonResponse({ traducidos, salteados: ids.length - pendientes.length })
}
