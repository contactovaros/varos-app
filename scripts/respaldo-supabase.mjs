#!/usr/bin/env node
// Respaldo de los DATOS de Supabase (todas las tablas del esquema public).
//
// Uso:
//   node scripts/respaldo-supabase.mjs                 respalda todas las tablas
//   node scripts/respaldo-supabase.mjs --tablas a,b    solo esas (útil para probar)
//
// Variables de entorno:
//   SUPABASE_SERVICE_ROLE_KEY   obligatoria. Sin ella RLS oculta las tablas de
//                               socios, reservas y premios y el respaldo saldría vacío.
//   SUPABASE_URL                opcional; por defecto la del proyecto de Varo's.
//   RESPALDO_DIR                opcional; por defecto ...\BRAINKITCHEN\respaldos-varos
//                               (dentro de OneDrive, así queda también en la nube).
//   RESPALDO_CONSERVAR          opcional; cuántos respaldos guardar (default 12).
//
// Qué NO cubre: la estructura (tablas, policies, funciones como register_visit) ni
// los usuarios de auth.users. La estructura vive en supabase/*.sql; las funciones que
// se crearon solo en Postgres requieren pg_dump (ver README de respaldos).

import { mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const URL_BASE = (process.env.SUPABASE_URL || 'https://mmxnnfaifguywcvbtznp.supabase.co').replace(/\/$/, '')
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RAIZ = process.env.RESPALDO_DIR || path.resolve(aqui, '..', '..', 'respaldos-varos')
const CONSERVAR = Number(process.env.RESPALDO_CONSERVAR || 12)
const PAGINA = 1000

if (!CLAVE) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY. Sin ella el respaldo saldría vacío por RLS.')
  process.exit(1)
}

const cabeceras = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` }

async function listarTablas() {
  const i = process.argv.indexOf('--tablas')
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1].split(',').map((s) => s.trim())
  const r = await fetch(`${URL_BASE}/rest/v1/`, { headers: cabeceras })
  if (!r.ok) throw new Error(`No pude listar las tablas (HTTP ${r.status}). ¿La clave es la service_role?`)
  const api = await r.json()
  return Object.keys(api.paths || {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .sort()
}

async function bajarTabla(tabla) {
  const filas = []
  let esperado = null
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(`${URL_BASE}/rest/v1/${encodeURIComponent(tabla)}?select=*`, {
      headers: { ...cabeceras, Range: `${desde}-${desde + PAGINA - 1}`, Prefer: 'count=exact' },
    })
    if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const lote = await r.json()
    filas.push(...lote)
    const total = r.headers.get('content-range')?.split('/')[1]
    if (total && total !== '*') esperado = Number(total)
    if (lote.length < PAGINA) break
  }
  // Verificación: lo bajado tiene que coincidir con lo que la base dice que hay.
  if (esperado !== null && esperado !== filas.length) {
    throw new Error(`Se bajaron ${filas.length} filas pero la base reporta ${esperado}`)
  }
  return filas
}

const ahora = new Date()
const pad = (n) => String(n).padStart(2, '0')
const sello = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}`
const destino = path.join(RAIZ, sello)

const tablas = await listarTablas()
await mkdir(destino, { recursive: true })
console.log(`Respaldando ${tablas.length} tablas en ${destino}\n`)

const resumen = {}
const fallas = []
for (const tabla of tablas) {
  try {
    const filas = await bajarTabla(tabla)
    await writeFile(path.join(destino, `${tabla}.json`), JSON.stringify(filas, null, 1))
    resumen[tabla] = filas.length
    console.log(`  ok    ${tabla.padEnd(32)} ${filas.length} filas`)
  } catch (e) {
    fallas.push(tabla)
    resumen[tabla] = `ERROR: ${e.message}`
    console.log(`  FALLA ${tabla.padEnd(32)} ${e.message}`)
  }
}

await writeFile(
  path.join(destino, '_resumen.json'),
  JSON.stringify({ fecha: ahora.toISOString(), proyecto: URL_BASE, tablas: resumen, fallas }, null, 2),
)

// Rotación: se conservan los N respaldos más nuevos (los nombres ordenan por fecha).
const carpetas = (await readdir(RAIZ, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name))
  .map((d) => d.name)
  .sort()
for (const vieja of carpetas.slice(0, Math.max(0, carpetas.length - CONSERVAR))) {
  await rm(path.join(RAIZ, vieja), { recursive: true, force: true })
  console.log(`  (borrado respaldo antiguo ${vieja})`)
}

console.log(`\n${tablas.length - fallas.length}/${tablas.length} tablas respaldadas.`)
if (fallas.length) {
  console.error(`Fallaron: ${fallas.join(', ')}`)
  process.exit(2)
}
