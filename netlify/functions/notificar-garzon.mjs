import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Avisa por push a un garzón cuando cocina marca un plato "Listo".
//
// La llama el Worker de varos-kds (server a server), no un admin logueado
// desde el navegador — por eso la autorización acá NO es un JWT de Supabase
// Auth como en send-push.mjs, es una clave compartida fija. Ver
// varos-kds/worker.js (handleMark / handleMarkPedidoNuevo) para quién la
// llama, y NOTIFICAR_GARZON_KEY tanto acá (Netlify) como en el Worker
// (wrangler secret) tienen que ser el mismo valor.
const REQUERIDAS = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NOTIFICAR_GARZON_KEY'
]

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
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

  const clave = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (clave !== process.env.NOTIFICAR_GARZON_KEY) {
    return jsonResponse({ error: 'No autorizado' }, 401)
  }

  const { garzon, mesa, sector } = await req.json().catch(() => ({}))
  if (!garzon || !mesa) return jsonResponse({ error: 'Falta garzon o mesa' }, 400)

  webpush.setVapidDetails(
    'mailto:contacto@varos.cl',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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

  const payload = JSON.stringify({
    title: 'Pedido listo',
    body: `Mesa ${mesa}${sector ? ' · ' + sector : ''} está lista para retirar`,
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
