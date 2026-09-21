// SOLO DESARROLLO. Simula las RPC de comandas en memoria (persistidas en
// localStorage para que Mozo y Cocina, en pestañas distintas, vean lo mismo)
// para poder probar las pantallas en el navegador sin base de datos.
//
// Se importa únicamente detrás de `import.meta.env.DEV` (ver comandasApi.js),
// así que no entra al build de producción.
//
// La barra (/barra?demo=1) ve la MISMA base pero solo los ítems de barra y con su
// estado propio (estado_barra), igual que add_barra.sql: marcar "Listo" ahí no
// toca lo de cocina.
//
// Uso:  /cocina?demo=1            comandas de ejemplo
//       /cocina?demo=1&denso=1    además, una columna con 6+ comandas (modo denso)
//       /cocina?demo=1&reset=1    vuelve a sembrar los datos (usalo si la base guardada es anterior a la barra)
//       /cocina?demo=1&offline_after=15   a los 15 s las consultas fallan como sin internet
//       código de cocina: cualquiera, salvo "mal" (simula código inválido)
// Para probar Mozo con la misma base falsa:  /mozo?demo=1  (con un garzón guardado
// en localStorage; ningún pedido llega a la base real).

const CLAVE = 'varos_demo_comandas_db'
const MIN = 60000

let secuencia = 0
const uid = () => `demo-${Date.now().toString(36)}-${(++secuencia).toString(36)}`

function it(cant, nombre, extra = {}) {
  return { id: uid(), cant, nombre, comentario: '', menus: null, estacion: 'cocina', ...extra }
}

function semilla(denso) {
  const ahora = Date.now()
  // `barra` = { estado, min } opcional: el estado propio de la barra. Sin él, la
  // barra parte en 'nuevo' desde que se creó la comanda.
  const c = (mesa, sector, garzon, estado, minCreado, minEstado, items, barra) => ({
    id: uid(),
    mesa,
    sector,
    garzon,
    estado,
    creado_ms: ahora - minCreado * MIN,
    estado_ms: ahora - minEstado * MIN,
    estado_barra: barra?.estado ?? 'nuevo',
    estado_barra_ms: ahora - (barra?.min ?? minCreado) * MIN,
    cierre: null,
    items
  })
  const bar = (cant, nombre, extra = {}) => it(cant, nombre, { estacion: 'barra', ...extra })
  const lista = [
    c('4', 'Carpa', 'Gustavo', 'nuevo', 3, 3, [
      it(2, 'Lomo vetado a lo pobre', { comentario: 'uno sin huevo' }),
      it(1, 'Ensalada de Papas Mayo'),
      bar(2, 'Mojito', { comentario: 'sin azúcar' })
    ]),
    c('7', 'Carpa', 'Gustavo', 'nuevo', 11, 11, [
      it(2, 'Menú del Día', {
        menus: [
          { entrada: 'Ensalada chilena', principal: 'Pastel de choclo', postre: 'Flan' },
          { entrada: 'Ensalada chilena', principal: 'Cazuela de vacuno', postre: 'Fruta de la estación' }
        ],
        comentario: 'sin palta'
      })
    ]),
    c('2', 'Andino', 'Marcela', 'preparando', 16, 6, [
      it(1, 'Tomahawk 1 kg', { comentario: 'punto medio' }),
      it(1, 'Papas fritas'),
      it(1, 'Arroz al olivo'),
      bar(2, 'Cerveza Kunstmann'),
      bar(1, 'Bebida 500 cc', { comentario: 'sin hielo' })
    ], { estado: 'preparando', min: 4 }),
    c('9', 'Carpa', 'Marcela', 'preparando', 27, 14, [
      it(3, 'Salmón a la plancha', { comentario: 'ALERGIA: sin mariscos' }),
      bar(1, 'Pisco Sour')
    ]),
    // Cocina ya entregó; la barra todavía no: los dos estados son independientes.
    c('12', 'Carpa', 'Gustavo', 'listo', 21, 1, [it(2, 'Empanadas de pino'), bar(2, 'Vino tinto copa')], { estado: 'nuevo', min: 21 }),
    c('3', 'Terraza', 'Marcela', 'listo', 34, 6, [it(1, 'Ceviche de reineta')]),
    // Solo bebidas: en cocina NO aparecen.
    c('6', 'Andino', 'Marcela', 'nuevo', 2, 2, [bar(2, 'Jugo natural de piña'), bar(1, 'Agua mineral sin gas')]),
    c('1', 'Terraza', 'Gustavo', 'nuevo', 19, 19, [bar(3, 'Piscola', { comentario: 'con Mistral 35' }), bar(1, 'Sour de maracuyá')], { estado: 'preparando', min: 8 }),
    c('10', 'Carpa', 'Marcela', 'nuevo', 30, 30, [bar(2, 'Café americano')], { estado: 'listo', min: 1 })
  ]
  if (denso) {
    for (const [i, mesa] of ['1', '5', '6', '8', '10', '11'].entries()) {
      lista.push(
        c(mesa, 'Carpa', i % 2 ? 'Gustavo' : 'Marcela', 'nuevo', 1 + i * 2, 1 + i * 2, [
          it(1 + (i % 3), ['Lomo liso', 'Pollo grillado', 'Pastel de jaiba'][i % 3]),
          ...(i % 2 ? [] : [bar(1, 'Jugo natural')])
        ])
      )
    }
  }
  return lista
}

let yaReseteado = false // ?reset=1 vale una sola vez por carga de página

function leer() {
  const q = new URLSearchParams(window.location.search)
  try {
    if (q.get('reset') === '1' && !yaReseteado) {
      yaReseteado = true
      localStorage.removeItem(CLAVE)
    }
    const raw = localStorage.getItem(CLAVE)
    if (raw) return JSON.parse(raw)
  } catch {
    // se resiembra
  }
  const db = { version: 1, comandas: semilla(q.get('denso') === '1'), cobros: [] }
  guardar(db)
  return db
}

function guardar(db) {
  db.version += 1
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db))
  } catch {
    // ignorado en demo
  }
}

const abiertas = (db) => db.comandas.filter((c) => !c.cierre)
const err = (msg) => Object.assign(new Error(msg), { pg: 'P0001', red: false })

// `estacion`: null = todo (Mozo/Caja) | 'cocina' | 'barra'. La barra usa su
// estado propio; las demás vistas usan el de cocina.
function comandaJson(c, estacion) {
  const ahora = Date.now()
  const esBarra = estacion === 'barra'
  const estadoVista = esBarra ? (c.estado_barra ?? 'nuevo') : c.estado
  const estadoMs = esBarra ? (c.estado_barra_ms ?? c.creado_ms) : c.estado_ms
  return {
    id: c.id,
    mesa: c.mesa,
    sector: c.sector,
    garzon: c.garzon,
    hora: new Date(c.creado_ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
    estado: estadoVista,
    creado_at: new Date(c.creado_ms).toISOString(),
    estado_at: new Date(estadoMs).toISOString(),
    min_estado: Math.max(0, Math.floor((ahora - estadoMs) / MIN)),
    min_creado: Math.max(0, Math.floor((ahora - c.creado_ms) / MIN)),
    items: c.items.filter((i) => !estacion || i.estacion === estacion)
  }
}

function estado(db, estacion, versionCliente) {
  // La versión cambia también al pasar los minutos? No: igual que la real, solo con escrituras.
  const version = `demo:${db.version}:${abiertas(db).length}`
  if (versionCliente && versionCliente === version) return { version, sin_cambios: true }
  const comandas = abiertas(db)
    .filter((c) => !estacion || c.items.some((i) => i.estacion === estacion))
    .sort((a, b) => a.creado_ms - b.creado_ms)
    .map((c) => comandaJson(c, estacion))
  return { version, ahora: new Date().toISOString(), comandas }
}

const inicio = Date.now()

async function espera() {
  await new Promise((r) => setTimeout(r, 120))
  // Simula una caída de red pasados N segundos (para probar la barra roja).
  const n = Number(new URLSearchParams(window.location.search).get('offline_after'))
  if (n > 0 && Date.now() - inicio > n * 1000) {
    throw Object.assign(new Error('Failed to fetch'), { red: true })
  }
}

const demo = {
  async comandasAbiertas({ codigo, version }) {
    await espera()
    void codigo
    return estado(leer(), null, version)
  },

  async cocinaEstado({ codigoCocina, version }) {
    await espera()
    if (!codigoCocina || codigoCocina === 'mal') throw err('Código de cocina inválido')
    return estado(leer(), 'cocina', version)
  },

  async cocinaMarcar({ codigoCocina, comandaId, estado: nuevo }) {
    await espera()
    if (!codigoCocina || codigoCocina === 'mal') throw err('Código de cocina inválido')
    const db = leer()
    const c = abiertas(db).find((x) => x.id === comandaId)
    if (!c) throw err('Comanda no encontrada o ya cerrada')
    const cambio = c.estado !== nuevo
    if (cambio) {
      c.estado = nuevo
      c.estado_ms = Date.now()
      guardar(db)
    }
    return { ok: true, id: c.id, estado: c.estado, cambio, avisar: cambio && nuevo === 'listo', garzon: c.garzon, mesa: c.mesa, sector: c.sector }
  },

  async barraEstado({ codigoCocina, version }) {
    await espera()
    if (!codigoCocina || codigoCocina === 'mal') throw err('Código de cocina inválido')
    return estado(leer(), 'barra', version)
  },

  // Igual que cocinaMarcar pero sobre el estado PROPIO de la barra.
  async barraMarcar({ codigoCocina, comandaId, estado: nuevo }) {
    await espera()
    if (!codigoCocina || codigoCocina === 'mal') throw err('Código de cocina inválido')
    const db = leer()
    const c = abiertas(db).find((x) => x.id === comandaId)
    if (!c) throw err('Comanda no encontrada o ya cerrada')
    if (!c.items.some((i) => i.estacion === 'barra')) throw err('La comanda no tiene ítems de barra')
    const actual = c.estado_barra ?? 'nuevo'
    const cambio = actual !== nuevo
    if (cambio) {
      c.estado_barra = nuevo
      c.estado_barra_ms = Date.now()
      guardar(db)
    }
    return { ok: true, id: c.id, estado: c.estado_barra ?? 'nuevo', cambio, avisar: cambio && nuevo === 'listo', garzon: c.garzon, mesa: c.mesa, sector: c.sector, estacion: 'barra' }
  },

  async crearOAgregarComanda({ codigo, mesa, sector, items }) {
    await espera()
    if (!codigo) throw err('Código de garzón inválido')
    const db = leer()
    let c = abiertas(db).find((x) => x.mesa === String(mesa) && x.sector === sector)
    if (!c) {
      c = { id: uid(), mesa: String(mesa), sector, garzon: 'Demo', estado: 'nuevo', creado_ms: Date.now(), estado_ms: Date.now(), estado_barra: 'nuevo', estado_barra_ms: Date.now(), cierre: null, items: [] }
      db.comandas.push(c)
    }
    const nuevos = items.map((x) => ({ id: uid(), cant: x.cant, nombre: x.nombre, comentario: x.comentario || '', menus: x.menus || null, estacion: x.estacion === 'barra' || /aperitivo|cocktail|mojito|sour|pisco/i.test(`${x.nombre} ${x.categoria || ''}`) ? 'barra' : 'cocina' }))
    // Como add_barra.sql: agregar ítems reinicia SOLO el estado de su estación.
    if (nuevos.some((i) => i.estacion === 'cocina')) {
      c.estado = 'nuevo'
      c.estado_ms = Date.now()
    }
    if (nuevos.some((i) => i.estacion === 'barra')) {
      c.estado_barra = 'nuevo'
      c.estado_barra_ms = Date.now()
    }
    c.items.push(...nuevos)
    guardar(db)
    return c.id
  },

  async editarItemsComanda({ comandaId, items }) {
    await espera()
    const db = leer()
    const c = abiertas(db).find((x) => x.id === comandaId)
    if (!c) throw err('Comanda no encontrada o ya cerrada')
    let cambios = 0
    const tocadas = new Set() // estaciones afectadas
    for (const { id, cant } of items) {
      const i = c.items.find((x) => x.id === id)
      if (!i) throw err('Ítem no pertenece a la comanda')
      if (cant === 0) {
        c.items = c.items.filter((x) => x.id !== id)
        cambios++
        tocadas.add(i.estacion)
      } else if (cant !== i.cant) {
        i.cant = cant
        cambios++
        tocadas.add(i.estacion)
      }
    }
    if (c.items.length === 0) {
      c.cierre = 'cancelada'
      guardar(db)
      return { ok: true, id: c.id, cancelada: true, cambios }
    }
    if (tocadas.has('cocina')) {
      c.estado = 'nuevo'
      c.estado_ms = Date.now()
    }
    if (tocadas.has('barra')) {
      c.estado_barra = 'nuevo'
      c.estado_barra_ms = Date.now()
    }
    guardar(db)
    return { ok: true, id: c.id, cancelada: false, cambios }
  },

  async cerrarMesaYCobrar({ mesa, sector, items, total, medioPago }) {
    await espera()
    const db = leer()
    for (const c of abiertas(db)) {
      if (c.mesa === String(mesa) && c.sector === sector) c.cierre = 'cobrada'
    }
    const id = uid()
    db.cobros.push({ id, mesa, sector, items, total, medioPago })
    guardar(db)
    return id
  }
}

export default demo
