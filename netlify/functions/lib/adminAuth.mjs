// Portero de las funciones que gastan plata.
//
// Las funciones viejas (`aviso-reserva-nueva`) son públicas a propósito: el
// cliente reserva sin login. Estas dos no: cada llamada consume tokens de la
// API de Anthropic, así que un endpoint abierto es una factura abierta. El
// frontend manda el access token de Supabase del admin en
// `Authorization: Bearer <token>` y acá se valida contra la service role.
//
// OJO: estas variables tienen que estar cargadas en el dashboard de Netlify
// (Site configuration → Environment variables). El .env del repo NO sirve
// acá: Vite lo lee al construir el frontend, pero las funciones corren en
// otro entorno y solo ven las del dashboard.

import { createClient } from '@supabase/supabase-js'

const REQUERIDAS = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}

// Devuelve las variables de entorno que faltan, para responder QUÉ falta en
// vez de reventar con un 502 opaco al importar el módulo.
export function faltanVariables(extra = []) {
  return [...REQUERIDAS, ...extra].filter((k) => !process.env[k])
}

export function respuestaFaltanVariables(faltantes) {
  return jsonResponse(
    { error: `Faltan variables de entorno en Netlify: ${faltantes.join(', ')}` },
    500
  )
}

/**
 * Valida el Bearer token y que el usuario sea admin.
 *
 * Devuelve `{ error: Response }` si hay que cortar, o `{ supabase, user }` si
 * pasó. El llamador hace: `if (auth.error) return auth.error`.
 *
 * Los mensajes de error son deliberadamente pobres: no distinguen "token
 * vencido" de "token inventado" ni confirman si un user_id existe.
 */
export async function requireAdmin(req, extrasRequeridas = []) {
  const faltantes = faltanVariables(extrasRequeridas)
  if (faltantes.length) return { error: respuestaFaltanVariables(faltantes) }

  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return { error: jsonResponse({ error: 'No autorizado' }, 401) }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { error: jsonResponse({ error: 'No autorizado' }, 401) }

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (adminError) {
    console.error('adminAuth: no se pudo consultar la tabla admins', adminError)
    return { error: jsonResponse({ error: 'No se pudo verificar el permiso' }, 500) }
  }
  if (!admin) return { error: jsonResponse({ error: 'Solo administradores' }, 403) }

  return { supabase, user: data.user }
}
