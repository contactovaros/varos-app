import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// OJO: estas variables tienen que estar cargadas en el dashboard de Netlify
// (Site configuration → Environment variables). El archivo .env del repo NO
// sirve acá: Vite lo lee al construir el frontend, pero las funciones corren
// aparte y solo ven las variables del dashboard.
const REQUERIDAS = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
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

  webpush.setVapidDetails(
    'mailto:contacto@varos.cl',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return jsonResponse({ error: 'No autorizado' }, 401)

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData?.user) return jsonResponse({ error: 'No autorizado' }, 401)

  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!admin) return jsonResponse({ error: 'Solo administradores' }, 403)

  const { title, body, customerId } = await req.json()
  if (!title || !body) return jsonResponse({ error: 'Falta título o mensaje' }, 400)

  let query = supabaseAdmin.from('push_subscriptions').select('*')
  if (customerId) query = query.eq('customer_id', customerId)
  const { data: subs, error: subsError } = await query
  if (subsError) return jsonResponse({ error: subsError.message }, 500)

  const payload = JSON.stringify({ title, body, url: '/club' })

  const resultados = await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
          throw err
        })
    )
  )

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length

  return jsonResponse({ enviados, total: subs?.length ?? 0 }, 200)
}
