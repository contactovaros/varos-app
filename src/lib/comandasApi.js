import { supabase } from './supabase'

// Capa fina sobre las RPC de comandas (supabase/add_comandas.sql). Ver
// varos-pos/DECISIONES.md, "Comandas y pantalla de cocina en Supabase".
//
// Reglas de esta capa:
//  * Cada función devuelve lo que devuelve la RPC (id, JSON) o LANZA un Error
//    con el mensaje de la base ("Código de cocina inválido", etc.). Los errores
//    de la base traen `e.pg` (código de Postgres/PostgREST); los de red y los de
//    tiempo agotado no lo traen y llevan `e.red = true`.
//  * Nunca se encadena .select() a una escritura anónima: las RPC ya devuelven
//    lo necesario.
//  * Las ESCRITURAS no llevan timeout a propósito: si el cliente se rinde antes
//    que el servidor, el reintento del garzón duplicaría el pedido o el cobro.
//    Las lecturas sí lo llevan, para que un polling colgado no se quede
//    esperando para siempre.

const TIMEOUT_LECTURA_MS = 12000
const TIMEOUT_INTERRUPTOR_MS = 4000

// Cada cuánto las pantallas vuelven a preguntar por el interruptor.
export const REVISAR_INTERRUPTOR_MS = 60000

// Modo demo: SOLO en desarrollo. `import.meta.env.DEV` es false en el build de
// producción, así que toda esta rama (y comandasDemo.js) se elimina del bundle.
function demoActivo() {
  if (!import.meta.env.DEV) return false
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('demo') === '1') sessionStorage.setItem('varos_demo_comandas', '1')
    if (q.get('demo') === '0') sessionStorage.removeItem('varos_demo_comandas')
    return sessionStorage.getItem('varos_demo_comandas') === '1'
  } catch {
    return false
  }
}
export function esModoDemo() {
  return demoActivo()
}
async function demo() {
  // La condición constante hace que Rollup descarte el import (y con él todo
  // comandasDemo.js) del build de producción.
  return import.meta.env.DEV ? (await import('./comandasDemo.js')).default : null
}

function conTimeout(promesa, ms) {
  let t
  const limite = new Promise((_, rechazar) => {
    t = setTimeout(() => {
      const e = new Error('Tiempo de espera agotado')
      e.red = true
      rechazar(e)
    }, ms)
  })
  return Promise.race([Promise.resolve(promesa), limite]).finally(() => clearTimeout(t))
}

// Ejecuta una RPC y normaliza el error.
async function rpc(nombre, args, { timeoutMs = 0 } = {}) {
  let respuesta
  try {
    const llamada = supabase.rpc(nombre, args)
    respuesta = timeoutMs > 0 ? await conTimeout(llamada, timeoutMs) : await llamada
  } catch (err) {
    if (err?.red) throw err
    const e = new Error(err?.message || 'Sin conexión')
    e.red = true
    throw e
  }
  const { data, error } = respuesta
  if (error) {
    const e = new Error(error.message || 'Error desconocido')
    e.pg = error.code || ''
    e.red = !error.code
    throw e
  }
  return data
}

// ---------------------------------------------------------------------------
// Interruptor: ¿comandas en el Worker (sistema anterior) o en Supabase?
// ---------------------------------------------------------------------------
// Cualquier error, timeout o función inexistente (la migración todavía no está
// pegada en producción) devuelve 'worker': el comportamiento por defecto tiene
// que ser EXACTAMENTE el de hoy.
//
// Se cachea el valor. Una consulta que FALLA nunca pisa un valor ya confirmado
// (una caída de red no debe simular que el interruptor se movió).
let interruptor = { valor: null, confirmado: false, enVuelo: null }

async function consultarInterruptor() {
  try {
    const data = await rpc('comandas_backend', undefined, { timeoutMs: TIMEOUT_INTERRUPTOR_MS })
    if (data === 'supabase' || data === 'worker') return data
    return null
  } catch {
    return null
  }
}

// Vuelve a preguntar a la base (una sola consulta a la vez) y actualiza el cache.
export function rechequearComandasBackend() {
  if (demoActivo()) return Promise.resolve('supabase')
  if (interruptor.enVuelo) return interruptor.enVuelo
  interruptor.enVuelo = consultarInterruptor()
    .then((valor) => {
      if (valor) {
        interruptor.valor = valor
        interruptor.confirmado = true
      } else if (interruptor.valor === null) {
        interruptor.valor = 'worker'
      }
      return interruptor.valor
    })
    .finally(() => {
      interruptor.enVuelo = null
    })
  return interruptor.enVuelo
}

// Valor cacheado; solo consulta la primera vez.
export function comandasBackend() {
  if (demoActivo()) return Promise.resolve('supabase')
  if (interruptor.valor !== null) return Promise.resolve(interruptor.valor)
  return rechequearComandasBackend()
}

// ---------------------------------------------------------------------------
// Garzón (Mozo) — se autoriza con el código de garzón
// ---------------------------------------------------------------------------

// items: [{ cant, nombre, comentario, menus?, estacion: 'cocina' | 'barra' }] -> id de la comanda
export async function crearOAgregarComanda({ codigo, mesa, sector, items }) {
  if (demoActivo()) return (await demo()).crearOAgregarComanda({ codigo, mesa, sector, items })
  return rpc('crear_o_agregar_comanda', {
    p_codigo: codigo,
    p_mesa: String(mesa),
    p_sector: sector ?? '',
    p_items: items
  })
}

// items: [{ id: <comanda_items.id>, cant: <int >= 0> }]. Solo los ítems
// mencionados cambian; cant = 0 quita el ítem y si no queda ninguno, cancela.
// `codigo` null = sesión de admin (Caja). -> { ok, id, cancelada, cambios }
export async function editarItemsComanda({ codigo, comandaId, items }) {
  if (demoActivo()) return (await demo()).editarItemsComanda({ codigo, comandaId, items })
  return rpc('editar_items_comanda', {
    p_codigo: codigo ?? null,
    p_comanda_id: comandaId,
    p_items: items
  })
}

// Comandas abiertas con TODOS los ítems (bar incluido). `version` = la última
// que vio el cliente: si no cambió, responde { version, sin_cambios: true }.
// `codigo` null = sesión de admin (Caja).
// -> { version, ahora, comandas: [{ id, mesa, sector, garzon, hora, estado, creado_at,
//      estado_at, min_estado, min_creado, items: [{ id, cant, nombre, comentario, menus, estacion }] }] }
export async function comandasAbiertas({ codigo, version } = {}) {
  if (demoActivo()) return (await demo()).comandasAbiertas({ codigo, version })
  return rpc('comandas_abiertas', { p_codigo: codigo ?? null, p_version: version ?? null }, { timeoutMs: TIMEOUT_LECTURA_MS })
}

// Cobrar y cerrar la mesa en UNA transacción. `codigo` null = sesión de admin
// (Caja). -> id del cobro (uuid)
export async function cerrarMesaYCobrar({ codigo, mesa, sector, items, total, medioPago }) {
  if (demoActivo()) return (await demo()).cerrarMesaYCobrar({ codigo, mesa, sector, items, total, medioPago })
  return rpc('cerrar_mesa_y_cobrar', {
    p_codigo: codigo ?? null,
    p_mesa: String(mesa),
    p_sector: sector ?? '',
    p_items: items,
    p_total: total,
    p_medio_pago: medioPago
  })
}

// ---------------------------------------------------------------------------
// Cocina — se autoriza con el código de cocina
// ---------------------------------------------------------------------------

// Solo ítems de cocina (la barra no aparece). Misma forma que comandasAbiertas.
export async function cocinaEstado({ codigoCocina, version } = {}) {
  if (demoActivo()) return (await demo()).cocinaEstado({ codigoCocina, version })
  return rpc('cocina_estado', { p_codigo_cocina: codigoCocina, p_version: version ?? null }, { timeoutMs: TIMEOUT_LECTURA_MS })
}

// estado: 'nuevo' | 'preparando' | 'listo'.
// -> { ok, id, estado, cambio, avisar, garzon, mesa, sector }
export async function cocinaMarcar({ codigoCocina, comandaId, estado }) {
  if (demoActivo()) return (await demo()).cocinaMarcar({ codigoCocina, comandaId, estado })
  return rpc('cocina_marcar', { p_codigo_cocina: codigoCocina, p_comanda_id: comandaId, p_estado: estado })
}

// Ranking de preparaciones. desde/hasta: 'YYYY-MM-DD' (null = hoy, hora de Chile).
// -> { desde, hasta, ranking: [{ nombre, unidades }] }
export async function estadisticasCocina({ codigoCocina, desde, hasta } = {}) {
  if (demoActivo()) return { desde, hasta, ranking: [] }
  return rpc(
    'estadisticas_cocina',
    { p_codigo_cocina: codigoCocina, p_desde: desde ?? null, p_hasta: hasta ?? null },
    { timeoutMs: TIMEOUT_LECTURA_MS }
  )
}

// Aviso push al garzón cuando cocina marca "listo". Best-effort: NUNCA lanza
// (un aviso que falla no debe impedir el marcado). El código de cocina viaja en
// el cuerpo; la función de Netlify lo valida contra la base.
export async function notificarGarzon({ codigoCocina, garzon, mesa, sector }) {
  if (demoActivo()) return false
  try {
    const res = await fetch('/.netlify/functions/notificar-garzon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_cocina: codigoCocina, garzon, mesa, sector })
    })
    return res.ok
  } catch {
    return false
  }
}
