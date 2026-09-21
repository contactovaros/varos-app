import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Avisa por push a un garzón cuando cocina marca un plato "Listo".
//
// Dos formas de autorizar la llamada (no es un JWT de Supabase Auth como en
// send-push.mjs, porque quien llama no es un admin logueado):
//  1. Sistema anterior — la llama el Worker de varos-kds, server a server, con
//     una clave compartida fija en `Authorization: Bearer`. NOTIFICAR_GARZON_KEY
//     tanto acá (Netlify) como en el Worker (wrangler secret) tienen que ser el
//     mismo valor. Se mantiene mientras el Worker siga vivo.
//  2. Sistema nuevo (comandas en Supabase) — la llama la pantalla /cocina desde
//     el navegador, con el código de cocina en el cuerpo (`codigo_cocina`), que
//     se compara acá contra pos_config.codigo_cocina con la clave de servicio.
//     El navegador nunca conoce NOTIFICAR_GARZON_KEY.
// Cuando se retire el Worker, NOTIFICAR_GARZON_KEY deja de ser necesaria.
const REQUERIDAS = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
]

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Comparación en tiempo constante (las longitudes distintas ya delatan, pero no el contenido).
function iguales(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length === y.length && timingSafeEqual(x, y)
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const faltantes = REQUERIDAS.filter((k) => !process.env[k])
  if (faltantes.length) {
    return jsonResponse(
      { error: `Faltan variables de entorno en Netlify: ${faltantes.join(', ')}` },
      500
    )
  }

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { garzon, mesa, sector, estacion, codigo_cocina: codigoCocina, codigo_barra: codigoBarra } = await req.json().catch(() => ({}))

  const clave = (req.headers.get('authorization') || '').replace('Bearer ', '')
  let autorizado = !!process.env.NOTIFICAR_GARZON_KEY && iguales(clave, process.env.NOTIFICAR_GARZON_KEY)
  // Cada estación tiene su propio código y no se mezclan: el aviso de la barra
  // solo lo autoriza `codigo_barra`, el de la cocina solo `codigo_cocina`.
  const esBarraLlamada = estacion === 'barra'
  const codigoRecibido = esBarraLlamada ? codigoBarra : codigoCocina
  if (!autorizado && codigoRecibido) {
    const { data: cfg } = await supabaseAdmin
      .from('pos_config')
      .select('valor')
      .eq('clave', esBarraLlamada ? 'codigo_barra' : 'codigo_cocina')
      .maybeSingle()
    autorizado = !!cfg?.valor && iguales(codigoRecibido, cfg.valor)
  }
  if (!autorizado) {
    return jsonResponse({ error: 'No autorizado' }, 401)
  }

  if (!garzon || !mesa) return jsonResponse({ error: 'Falta garzon o mesa' }, 400)

  webpush.setVapidDetails(
    'mailto:contacto@varos.cl',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  // El nombre del garzón viaja como texto libre desde el KDS (así vienen las
  // comandas, tanto del bridge del PHP como del piloto de /mozo) — hay que
  // resolverlo contra garzones.nombre, sin importar mayúsculas.
  const { data: garzonRow } = await supabaseAdmin
    .from('garzones')
    .select('id')
    .ilike('nombre', garzon.trim())
    .maybeSingle()
  if (!garzonRow) return jsonResponse({ enviados: 0, motivo: 'garzón no encontrado' }, 200)

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('garzon_push_subscriptions')
    .select('*')
    .eq('garzon_id', garzonRow.id)
  if (subsError) return jsonResponse({ error: subsError.message }, 500)

  // Con comandas por estación (2026-09-21) la barra avisa aparte de la cocina:
  // "Bebidas listas" vs "Pedido listo". Sin `estacion` (el Worker anterior no la
  // manda) el texto es el de siempre.
  const esBarra = estacion === 'barra'
  const payload = JSON.stringify({
    title: esBarra ? 'Bebidas listas' : 'Pedido listo',
    body: esBarra
      ? `Las bebidas de la mesa ${mesa}${sector ? ' · ' + sector : ''} están listas para retirar`
      : `Mesa ${mesa}${sector ? ' · ' + sector : ''} está lista para retirar`,
    url: '/mozo'
  })

  const resultados = await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabaseAdmin.from('garzon_push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
          throw err
        })
    )
  )

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length
  return jsonResponse({ enviados, total: subs?.length ?? 0 }, 200)
}
