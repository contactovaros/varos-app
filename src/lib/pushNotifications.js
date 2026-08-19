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

export async function notificacionesActivas() {
  if (!pushSoportado()) return false
  const registro = await navigator.serviceWorker.ready
  const sub = await registro.pushManager.getSubscription()
  return !!sub
}

export async function activarNotificaciones(customerId) {
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

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      customer_id: customerId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error

  return sub
}
