import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// "Activas" significa dos cosas a la vez: que el navegador esté suscrito Y que
// esa suscripción esté guardada en Supabase. Si solo se cumple lo primero, el
// push nunca llegaría (el servidor no sabe a qué endpoint mandarlo), así que
// devolvemos false para que el cliente pueda reintentar desde el botón.
export async function notificacionesActivas() {
  if (!pushSoportado()) return false
  const registro = await navigator.serviceWorker.ready
  const sub = await registro.pushManager.getSubscription()
  if (!sub) return false

  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('endpoint', sub.toJSON().endpoint)
    .maybeSingle()

  return !!data
}

export async function activarNotificaciones() {
  if (!pushSoportado()) {
    throw new Error(
      'Este navegador no soporta notificaciones push. En iPhone, primero agrega Varo\'s Club a tu pantalla de inicio (compartir → "Agregar a inicio") y ábrela desde ahí.'
    )
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    throw new Error('No diste permiso de notificaciones — actívalo desde los ajustes de tu navegador.')
  }

  const registro = await navigator.serviceWorker.ready
  let sub = await registro.pushManager.getSubscription()
  if (!sub) {
    sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
    })
  }

  // El guardado va por RPC (security definer) en vez de un upsert directo: un
  // endpoint pertenece al navegador, no a la cuenta, y si ya estaba registrado
  // bajo otro usuario el upsert chocaba contra la policy de update. La función
  // lo reasigna al auth.uid() actual. Ver fix_guardar_suscripcion_push.sql.
  const json = sub.toJSON()
  const { error } = await supabase.rpc('guardar_suscripcion_push', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth
  })
  if (error) {
    console.error('[push] error al guardar la suscripción', error)
    throw error
  }

  return sub
}
