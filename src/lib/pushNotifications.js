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

// Estado de las notificaciones para esta cuenta en este navegador. Devuelve uno de:
//
//   'no-soportado' — el navegador no puede recibir push (típico: iPhone fuera de
//                    la pantalla de inicio).
//   'activa'       — el navegador está suscrito Y la suscripción está guardada.
//   'inactiva'     — falta alguna de las dos. Incluye el caso de que el endpoint
//                    esté guardado a nombre de OTRA cuenta: un endpoint pertenece
//                    al navegador, así que al entrar con otra cuenta en el mismo
//                    aparato, esta deja de tenerlo (y RLS no se lo deja ver).
//   'desconocida'  — no se pudo comprobar (sesión a medio cargar, red caída).
//
// La distinción entre 'inactiva' y 'desconocida' importa: antes cualquier fallo
// de la consulta se mostraba como "no está activo", afirmando algo que no
// sabíamos. Activar es idempotente, así que ante la duda igual ofrecemos el
// botón — pero sin dar por hecho que está apagado.
export async function estadoNotificaciones() {
  if (!pushSoportado()) return 'no-soportado'

  try {
    const registro = await navigator.serviceWorker.ready
    const sub = await registro.pushManager.getSubscription()
    if (!sub) return 'inactiva'

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint')
      .eq('endpoint', sub.toJSON().endpoint)
      .maybeSingle()

    if (error) {
      console.warn('[push] no se pudo comprobar la suscripción', error)
      return 'desconocida'
    }
    return data ? 'activa' : 'inactiva'
  } catch (e) {
    console.warn('[push] no se pudo comprobar la suscripción', e)
    return 'desconocida'
  }
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
