#!/usr/bin/env node
// Carga en menu_items.traducciones las traducciones ya revisadas de
// src/data/carta_traducciones.json, para que el botón "Traducir carta" del
// admin no vuelva a gastar IA en platos que ya están traducidos.
// Correr UNA vez, después de pegar supabase/add_traducciones_menu.sql.
//
//   node scripts/sembrar-traducciones.mjs          (usa .env: SUPABASE_SERVICE_ROLE_KEY)
//
// La huella (`fuente`) se calcula igual que en netlify/functions/traducir-carta.mjs.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const URL_BASE = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mmxnnfaifguywcvbtznp.supabase.co').replace(/\/$/, '')
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!CLAVE) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY (cargá el .env: set -a; source .env; set +a).')
  process.exit(1)
}
const cab = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' }

const huella = (name, description) =>
  createHash('sha1').update(`${name ?? ''}\u0000${description ?? ''}`).digest('hex').slice(0, 12)
const esMenuDelDia = (c) =>
  String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim() === 'MENU DEL DIA'
function platosDelMenu(descripcion) {
  const nombres = new Set()
  for (const linea of String(descripcion || '').split('\n')) {
    const t = linea.trim()
    const v = t.match(/^\*\s*(.+)$/)
    if (v) nombres.add(v[1].trim())
    const p = t.match(/^postres?:\s*(.+)$/i)
    if (p) nombres.add(p[1].trim())
  }
  return [...nombres]
}

const estatico = JSON.parse(await readFile(path.join(aqui, '..', 'src', 'data', 'carta_traducciones.json'), 'utf8'))
const res = await fetch(`${URL_BASE}/rest/v1/menu_items?select=id,name,description,category,traducciones`, { headers: cab })
if (!res.ok) {
  console.error('No se pudo leer menu_items:', res.status, await res.text())
  process.exit(1)
}
const items = await res.json()

let sembrados = 0
let saltados = 0
for (const it of items) {
  const t = estatico[it.name]
  if (!t || it.traducciones) {
    saltados++
    continue
  }
  const menu = esMenuDelDia(it.category)
  const traducciones = {
    fuente: menu ? huella(it.name, platosDelMenu(it.description).join('|')) : huella(it.name, it.description)
  }
  for (const l of ['en', 'pt', 'it', 'zh']) traducciones[l] = { n: t[l].n, d: menu ? '' : t[l].d }
  if (menu) {
    traducciones.platos = {}
    for (const nombre of platosDelMenu(it.description)) {
      const p = estatico[nombre]
      if (p) traducciones.platos[nombre] = { en: p.en.n, pt: p.pt.n, it: p.it.n, zh: p.zh.n }
    }
  }
  const r = await fetch(`${URL_BASE}/rest/v1/menu_items?id=eq.${it.id}`, {
    method: 'PATCH',
    headers: cab,
    body: JSON.stringify({ traducciones })
  })
  if (r.ok) sembrados++
  else console.error('Falló', it.name, r.status, await r.text())
}
console.log(`Sembrados: ${sembrados} · sin traducción previa o ya cargados: ${saltados}`)
