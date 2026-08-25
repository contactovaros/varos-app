import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import {
  SPECS, REQUERIDOS, COMPLEMENTARIOS, PALETA_AGREGAR, VIEWBOX, PPM, MEDIDAS, CON_SILLAS,
  layoutInicial, layoutVacio, sanear, clampItem, halfExtents, rotar, snap, contar, crearItem,
  svgDefs, svgShell, svgItem, svgLabel, svgSeleccion, MUROS, pegarPuertaA, ajustarPuerta,
  setRecinto, recintoActual, extraerConfig, empaquetar, inventario, fmt, sillasDe, fogonesDe
} from '../lib/planoTerraza.js'

const PLANO_ID = 'terraza-centenario'

// Kinds de proporción fija: ancho y largo se mueven juntos (las mesas
// redondas porque la medida es un diámetro, la silla porque es cuadrada).
const REDONDAS = ['mesa', 'mesaR', 'silla']

// Un plano nuevo necesita un id de texto. Se arma del nombre para que la URL
// pública (/plano/<id>) se lea, con un sufijo corto que evita choques.
function idDesdeNombre(nombre) {
  const base = (nombre || 'comedor')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'comedor'
  return base + '-' + Math.random().toString(36).slice(2, 6)
}

export default function AdminPlano() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [items, setItems] = useState(() => layoutInicial())
  const [selId, setSelId] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [show, setShow] = useState({ labels: true, dims: true, grid: false })

  // El recinto es editable: ancho, largo y dónde corta la cocina (0 = sin cocina).
  const [recinto, setRecintoState] = useState(() => recintoActual())
  const [planoId, setPlanoId] = useState(PLANO_ID)
  const [planos, setPlanos] = useState([])
  const [nombre, setNombre] = useState('Terraza Parque Centenario')
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', ancho: 8, largo: 12 })
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)

  const [publicado, setPublicado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [confirmandoReset, setConfirmandoReset] = useState(false)

  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const histRef = useRef([])

  const sel = items.find((i) => i.id === selId) || null

  // ------------------------------------------------------------ carga
  // La lista de planos: puede haber más de un comedor, cada uno con su recinto.
  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false
    supabase.from('planos').select('id, nombre, ancho, largo, publicado').order('nombre')
      .then(({ data, error: e }) => {
        if (cancelado || e || !data) return
        setPlanos(data)
      })
    return () => { cancelado = true }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false

    async function cargar() {
      setCargando(true)
      const { data, error: e } = await supabase
        .from('planos')
        .select('nombre, ancho, largo, datos, publicado')
        .eq('id', planoId)
        .maybeSingle()

      if (cancelado) return
      if (e) {
        // Si la tabla todavía no existe, se sigue editando en memoria.
        setError('No se pudo leer el plano guardado: ' + e.message)
      } else if (data) {
        // Primero el recinto: sanear() encierra cada objeto dentro de él, así
        // que si se hiciera al revés todo quedaría acotado al recinto anterior.
        const cfg = extraerConfig(data.datos)
        setRecintoState(setRecinto({ ancho: data.ancho, largo: data.largo, corte: cfg.corte }))
        setItems(sanear(cfg.items, planoId === PLANO_ID ? layoutInicial : layoutVacio))
        setNombre(data.nombre || 'Comedor')
        setPublicado(!!data.publicado)
        setSelId(null)
        histRef.current = []
        setSucio(false)
      }
      setCargando(false)
    }

    cargar()
    return () => { cancelado = true }
  }, [isAdmin, planoId])

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sucio])

  function mostrarAviso(txt) {
    setAviso(txt)
    setTimeout(() => setAviso(null), 2600)
  }

  function guardarHistorial() {
    histRef.current.push(JSON.stringify(items))
    if (histRef.current.length > 60) histRef.current.shift()
  }

  function aplicar(nuevos) {
    setItems(nuevos)
    setSucio(true)
  }

  function deshacer() {
    const prev = histRef.current.pop()
    if (!prev) return
    const arr = JSON.parse(prev)
    setItems(arr)
    setSucio(true)
    if (!arr.some((i) => i.id === selId)) setSelId(null)
  }

  // ------------------------------------------------------------ guardar
  // Una sola escritura para guardar y para publicar: el recinto y el layout
  // viajan siempre juntos, así el plano publicado nunca queda con las medidas
  // de una versión y los muebles de otra.
  async function escribir(valorPublicado) {
    setGuardando(true)
    setError(null)
    const { error: e } = await supabase.from('planos').upsert({
      id: planoId,
      nombre,
      ancho: recinto.ancho,
      largo: recinto.largo,
      datos: empaquetar(items, recinto.corte),
      publicado: valorPublicado
    })
    setGuardando(false)
    if (e) return e
    setSucio(false)
    setPlanos((ps) => ps.map((p) => (p.id === planoId
      ? { ...p, nombre, ancho: recinto.ancho, largo: recinto.largo, publicado: valorPublicado }
      : p)))
    return null
  }

  async function guardar() {
    const e = await escribir(publicado)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    mostrarAviso('Plano guardado')
  }

  async function cambiarPublicacion(valor) {
    const e = await escribir(valor)
    if (e) { setError('No se pudo cambiar la publicación: ' + e.message); return }
    setPublicado(valor)
    mostrarAviso(valor ? 'Plano publicado' : 'Plano despublicado — vuelve a ser privado')
  }

  // ------------------------------------------------------------ recinto
  // Cambiar el recinto puede dejar objetos fuera: se vuelven a encerrar todos.
  function cambiarRecinto(parcial) {
    guardarHistorial()
    const next = setRecinto({ ...recinto, ...parcial })
    setRecintoState(next)
    aplicar(items.map((i) => clampItem({ ...i })))
  }

  // ------------------------------------------------------------ varios planos
  function cambiarDePlano(id) {
    if (id === planoId) return
    if (sucio && !window.confirm('Tienes cambios sin guardar en este plano. ¿Cambiar igual y perderlos?')) return
    setSucio(false)
    setPlanoId(id)
  }

  async function crearPlano() {
    const nom = nuevo.nombre.trim()
    if (!nom) { mostrarAviso('Ponle un nombre al comedor'); return }
    const id = idDesdeNombre(nom)
    const med = setRecinto({ ancho: nuevo.ancho, largo: nuevo.largo, corte: 0 })
    const base = layoutVacio()
    setGuardando(true)
    setError(null)
    const { error: e } = await supabase.from('planos').insert({
      id,
      nombre: nom,
      ancho: med.ancho,
      largo: med.largo,
      datos: empaquetar(base, med.corte),
      publicado: false
    })
    setGuardando(false)
    if (e) {
      // Si falla, el recinto ya se movió: se vuelve al del plano actual.
      setRecinto(recinto)
      setError('No se pudo crear el plano: ' + e.message)
      return
    }
    setPlanos((ps) => [...ps, { id, nombre: nom, ancho: med.ancho, largo: med.largo, publicado: false }]
      .sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setCreando(false)
    setNuevo({ nombre: '', ancho: 8, largo: 12 })
    setSucio(false)
    setPlanoId(id)
    mostrarAviso('Comedor creado — ahora dibújalo')
  }

  async function borrarPlano() {
    if (planos.length <= 1) { mostrarAviso('Es el único plano: no se puede borrar'); return }
    if (!confirmandoBorrar) {
      setConfirmandoBorrar(true)
      setTimeout(() => setConfirmandoBorrar(false), 3200)
      return
    }
    setConfirmandoBorrar(false)
    setGuardando(true)
    const { error: e } = await supabase.from('planos').delete().eq('id', planoId)
    setGuardando(false)
    if (e) { setError('No se pudo eliminar: ' + e.message); return }
    const quedan = planos.filter((p) => p.id !== planoId)
    setPlanos(quedan)
    setSucio(false)
    setPlanoId(quedan[0].id)
    mostrarAviso('Plano eliminado')
  }

  // ------------------------------------------------------------ interacción
  function aMetros(e) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = pt.matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  function onPointerDown(e) {
    const handle = e.target.closest && e.target.closest('[data-handle]')
    const nodo = e.target.closest && e.target.closest('[data-id]')

    if (handle && sel) {
      e.preventDefault()
      svgRef.current.setPointerCapture(e.pointerId)
      guardarHistorial()
      dragRef.current = {
        mode: handle.dataset.handle,
        id: sel.id,
        start: aMetros(e),
        o: { ...sel },
        c: parseInt(handle.dataset.c || '0', 10)
      }
      return
    }
    if (nodo) {
      e.preventDefault()
      const it = items.find((i) => i.id === nodo.dataset.id)
      if (!it) return
      setSelId(it.id)
      svgRef.current.setPointerCapture(e.pointerId)
      guardarHistorial()
      dragRef.current = { mode: 'move', id: it.id, start: aMetros(e), o: { ...it } }
      return
    }
    if (selId) setSelId(null)
  }

  function onPointerMove(e) {
    const d = dragRef.current
    if (!d) return
    const p = aMetros(e)
    const o = d.o
    const paso = e.altKey ? 0.01 : 0.05

    aplicar(items.map((it) => {
      if (it.id !== d.id) return it
      const n = { ...it }

      if (d.mode === 'move') {
        const destino = { x: snap(o.x + (p.x - d.start.x), paso), y: snap(o.y + (p.y - d.start.y), paso) }
        if (SPECS[it.type].kind === 'puerta') return pegarPuertaA(n, destino)
        n.x = destino.x
        n.y = destino.y
      } else if (d.mode === 'rot') {
        const a0 = Math.atan2(d.start.y - o.y, d.start.x - o.x)
        const a1 = Math.atan2(p.y - o.y, p.x - o.x)
        let deg = o.rot + ((a1 - a0) * 180) / Math.PI
        if (!e.altKey) deg = Math.round(deg / 15) * 15
        n.rot = ((deg % 360) + 360) % 360
      } else if (d.mode === 'rz') {
        const [sx, sy] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][d.c]
        const aw = rotar({ x: (-sx * o.w) / 2, y: (-sy * o.h) / 2 }, o.rot)
        const ancla = { x: o.x + aw.x, y: o.y + aw.y }
        const dl = rotar({ x: p.x - ancla.x, y: p.y - ancla.y }, -o.rot)
        let nw = Math.max(0.25, snap(sx * dl.x, paso))
        let nh = Math.max(0.25, snap(sy * dl.y, paso))
        if (REDONDAS.includes(SPECS[it.type].kind) || e.shiftKey) {
          const k = Math.max(nw / o.w, nh / o.h)
          nw = Math.max(0.25, o.w * k)
          nh = Math.max(0.25, o.h * k)
        }
        n.w = nw
        n.h = nh
        const cl = rotar({ x: (sx * nw) / 2, y: (sy * nh) / 2 }, o.rot)
        n.x = ancla.x + cl.x
        n.y = ancla.y + cl.y
        // En una puerta la esquina solo ensancha el vano; el corrimiento se
        // recalcula para que crezca desde el borde que se está arrastrando.
        if (SPECS[it.type].kind === 'puerta') {
          n.corrimiento = MUROS[n.muro].eje === 'h' ? n.x : n.y
          return ajustarPuerta(n)
        }
      }
      return clampItem(n)
    }))
  }

  function onPointerUp(e) {
    if (!dragRef.current) return
    dragRef.current = null
    try { svgRef.current.releasePointerCapture(e.pointerId) } catch (_) { /* noop */ }
  }

  // Teclado: mover, girar, duplicar, eliminar.
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer(); return }
      if (!sel) return
      const s = e.shiftKey ? 0.25 : 0.05
      const esPuerta = SPECS[sel.type].kind === 'puerta'
      const mover = (dx, dy) => {
        guardarHistorial()
        aplicar(items.map((i) => {
          if (i.id !== sel.id) return i
          // Una puerta no se mueve en x/y: se corre a lo largo de su muro.
          // Sin esto las flechas no harían nada, porque ajustarPuerta vuelve a
          // derivar x/y desde (muro, corrimiento) y pisaría el desplazamiento.
          if (esPuerta) {
            const avance = MUROS[i.muro].eje === 'h' ? dx : dy
            return ajustarPuerta({ ...i, corrimiento: i.corrimiento + avance })
          }
          return clampItem({ ...i, x: i.x + dx, y: i.y + dy })
        }))
      }
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); mover(-s, 0); break
        case 'ArrowRight': e.preventDefault(); mover(s, 0); break
        case 'ArrowUp': e.preventDefault(); mover(0, -s); break
        case 'ArrowDown': e.preventDefault(); mover(0, s); break
        case 'r': case 'R': {
          e.preventDefault()
          guardarHistorial()
          aplicar(items.map((i) => {
            if (i.id !== sel.id) return i
            // En una puerta el giro lo manda el muro, así que R invierte la mano.
            if (esPuerta) return ajustarPuerta({ ...i, mano: i.mano === 1 ? -1 : 1 })
            return clampItem({ ...i, rot: (i.rot + (e.shiftKey ? -15 : 15) + 360) % 360 })
          }))
          break
        }
        case 'Delete': case 'Backspace': e.preventDefault(); eliminar(); break
        case 'Escape': setSelId(null); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function agregar(type) {
    guardarHistorial()
    const it = crearItem(items, type)
    aplicar([...items, it])
    setSelId(it.id)
  }

  function eliminar() {
    if (!sel) return
    // Un plano sin ninguna entrada no es un plano: se impide borrar el último.
    if (SPECS[sel.type].kind === 'puerta' && puertas.length <= 1) {
      mostrarAviso('El plano necesita al menos un acceso')
      return
    }
    guardarHistorial()
    aplicar(items.filter((i) => i.id !== sel.id))
    setSelId(null)
  }

  function duplicar() {
    if (!sel) return
    guardarHistorial()
    const copia = clampItem({ ...sel, id: 'e' + Date.now().toString(36), x: sel.x + 0.45, y: sel.y + 0.45 })
    aplicar([...items, copia])
    setSelId(copia.id)
  }

  // Las puertas se editan por sus propios campos (muro, corrimiento, hojas):
  // x/y/rot salen de ahí, no al revés.
  function editarPuerta(cambios) {
    guardarHistorial()
    aplicar(items.map((i) => {
      if (i.id !== sel.id) return i
      const n = { ...i, ...cambios }
      if (cambios.w !== undefined && Number.isNaN(cambios.w)) return i
      if (cambios.corrimiento !== undefined && Number.isNaN(cambios.corrimiento)) return i
      return ajustarPuerta(n)
    }))
  }

  function editarSel(campo, valor) {
    guardarHistorial()
    aplicar(items.map((i) => {
      if (i.id !== sel.id) return i
      const n = { ...i }
      if (campo === 'label') { n.label = valor; return n }
      const v = parseFloat(valor)
      if (Number.isNaN(v)) return i
      // Sillas y fogones son enteros; cambiar las sillas cambia el lugar que
      // ocupa el conjunto, así que hay que volver a encerrarlo.
      if (campo === 'sillas') { n.sillas = Math.max(0, Math.min(24, Math.round(v))); return clampItem(n) }
      if (campo === 'fogones') { n.fogones = Math.max(1, Math.min(6, Math.round(v))); return n }
      if (campo === 'w' && REDONDAS.includes(SPECS[i.type].kind)) { n.w = Math.max(0.3, v); n.h = n.w }
      else if (campo === 'w' || campo === 'h') n[campo] = Math.max(0.25, v)
      else n[campo] = v
      return clampItem(n)
    }))
  }

  // ------------------------------------------------------------ dibujo
  const puertas = useMemo(() => items.filter((i) => SPECS[i.type].kind === 'puerta'), [items])
  const markup = useMemo(
    () => svgDefs() + svgShell(show, puertas, items) + items.map(svgItem).join('') +
      items.map((i) => svgLabel(i, show)).join('') + svgSeleccion(sel),
    [items, puertas, show, sel, recinto]
  )

  const urlPublica = typeof window !== 'undefined'
    ? `${window.location.origin}/plano/${planoId}`
    : ''

  // ------------------------------------------------------------ render
  if (authLoading) return null

  if (!isAdmin) {
    return (
      <div className="px-6 pt-24 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h2 className="font-head text-lg font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm text-paper/50">Esta sección es solo para administradores de Varo's.</p>
      </div>
    )
  }

  const faltantes = REQUERIDOS.filter((r) => contar(items, r.req) !== r.n)

  return (
    <div className="px-4 pt-8 pb-10">
      <div className="mb-5">
        <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's · Arquitectura</div>
        <h1 className="font-head text-2xl font-semibold">{nombre}</h1>
        <p className="text-[11px] text-paper/45 mt-1">
          Recinto de {fmt(recinto.ancho)} × {fmt(recinto.largo)} m · {fmt(recinto.ancho * recinto.largo)} m²
          {recinto.corte > 0 ? ` · cocina hasta los ${fmt(recinto.corte)} m` : ' · sin zona de cocina'}
        </p>
      </div>

      {/* qué comedor se está dibujando */}
      <div className="mb-5 rounded-2xl border border-white/5 bg-inkSoft p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">Comedor</div>
        <div className="flex flex-wrap gap-1.5">
          {planos.map((p) => (
            <button
              key={p.id}
              onClick={() => cambiarDePlano(p.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                p.id === planoId
                  ? 'border-ember bg-ember/10 text-ember'
                  : 'border-white/10 text-paper/60 hover:border-silver'
              }`}
            >
              {p.nombre}
              <span className="ml-1.5 font-mono text-[9px] text-paper/35">
                {fmt(p.ancho)}×{fmt(p.largo)}
              </span>
            </button>
          ))}
          <button
            onClick={() => setCreando(!creando)}
            className="rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-[11px] text-paper/50 hover:border-ember hover:text-ember"
          >
            + Nuevo comedor
          </button>
        </div>

        {creando && (
          <div className="mt-3 rounded-xl border border-white/10 bg-ink p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-paper/35">Nombre</span>
                <input
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  placeholder="Comedor principal"
                  className="w-full rounded-lg border border-white/10 bg-inkSoft px-2 py-1.5 text-xs text-paper focus:border-ember focus:outline-none"
                />
              </label>
              <Campo label="Ancho (m)" step="0.5" value={String(nuevo.ancho)} onChange={(v) => setNuevo({ ...nuevo, ancho: parseFloat(v) || 8 })} />
              <Campo label="Largo (m)" step="0.5" value={String(nuevo.largo)} onChange={(v) => setNuevo({ ...nuevo, largo: parseFloat(v) || 12 })} />
            </div>
            <div className="mt-2 flex gap-2">
              <BtnChico onClick={crearPlano}>Crear vacío</BtnChico>
              <BtnChico onClick={() => setCreando(false)}>Cancelar</BtnChico>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-paper/35">
              Nace con un solo acceso y sin muebles. Las medidas se pueden cambiar después.
            </p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-paper/35">Nombre de este plano</span>
            <input
              key={planoId}
              defaultValue={nombre}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== nombre) { setNombre(v); setSucio(true) } }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className="w-full rounded-lg border border-white/10 bg-ink px-2 py-1.5 text-xs text-paper focus:border-ember focus:outline-none"
            />
          </label>
        </div>
        {planos.length > 1 && (
          <button
            onClick={borrarPlano}
            className="mt-2 text-[10px] text-paper/35 underline underline-offset-2 hover:text-wineSoft"
          >
            {confirmandoBorrar ? '¿Seguro? Se borra este plano entero' : 'Eliminar este plano'}
          </button>
        )}
      </div>

      {/* medidas del recinto */}
      <div className="mb-5 rounded-2xl border border-white/5 bg-inkSoft p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">Medidas del recinto</div>
        <div className="grid grid-cols-3 gap-2">
          <Campo
            label="Ancho (m)" step="0.5" value={recinto.ancho.toFixed(2)}
            onChange={(v) => cambiarRecinto({ ancho: v })}
          />
          <Campo
            label="Largo (m)" step="0.5" value={recinto.largo.toFixed(2)}
            onChange={(v) => cambiarRecinto({ largo: v })}
          />
          <Campo
            label="Corte cocina (m)" step="0.5" value={recinto.corte.toFixed(2)}
            onChange={(v) => cambiarRecinto({ corte: v })}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[[6, 8], [8, 12], [9, 24], [10, 15], [12, 20]].map(([a, l]) => (
            <button
              key={a + 'x' + l}
              onClick={() => cambiarRecinto({ ancho: a, largo: l })}
              className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[10px] text-paper/50 hover:border-ember hover:text-ember"
            >
              {a} × {l}
            </button>
          ))}
          <button
            onClick={() => cambiarRecinto({ corte: recinto.corte > 0 ? 0 : Math.min(6.9, recinto.largo / 3) })}
            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-paper/50 hover:border-ember hover:text-ember"
          >
            {recinto.corte > 0 ? 'Quitar zona de cocina' : 'Agregar zona de cocina'}
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-paper/35">
          Entre {MEDIDAS.min} y {MEDIDAS.max} m por lado. Al achicar el recinto, lo que quede
          afuera se vuelve a meter adentro solo — nada se pierde, pero conviene revisarlo.
          El corte separa cocina de salón; en 0 el plano es un comedor entero.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-wineSoft/40 bg-wine/20 px-3 py-2 text-xs text-paper/80">
          {error}
        </div>
      )}

      {/* estado de publicación */}
      <div className="mb-5 rounded-2xl border border-white/5 bg-inkSoft p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${publicado ? 'bg-diamond' : 'bg-silver/50'}`} />
              <span className="font-head text-sm font-semibold">
                {publicado ? 'Publicado' : 'Privado — solo lo ves tú'}
              </span>
            </div>
            <p className="text-[11px] text-paper/45 mt-1">
              {publicado
                ? 'Cualquiera con el enlace puede verlo, sin iniciar sesión.'
                : 'Nadie más puede abrirlo, ni siquiera con el enlace directo.'}
            </p>
          </div>
          <button
            onClick={() => cambiarPublicacion(!publicado)}
            disabled={guardando}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              publicado
                ? 'border border-white/10 text-paper/70 hover:border-silver'
                : 'bg-ember text-ink hover:bg-emberDark'
            } disabled:opacity-40`}
          >
            {publicado ? 'Despublicar' : 'Publicar'}
          </button>
        </div>

        {publicado && (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-ink px-2 py-1.5 font-mono text-[10px] text-paper/60">
              {urlPublica}
            </code>
            <button
              onClick={() => { navigator.clipboard?.writeText(urlPublica); mostrarAviso('Enlace copiado') }}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-paper/70 hover:border-ember hover:text-ember"
            >
              Copiar
            </button>
          </div>
        )}
      </div>

      {/* el mismo plano, en movimiento */}
      <Link
        to={`/plano/${PLANO_ID}/flujo`}
        className="mb-5 block rounded-2xl border border-white/5 bg-inkSoft p-4 transition hover:border-ember/50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-head text-sm font-semibold">Ver el local en servicio</div>
            <p className="mt-1 text-[11px] leading-relaxed text-paper/45">
              La misma planta, animada: cocineros, bartenders, la caja y el recorrido del
              cliente de la puerta a la mesa. Se calcula de este layout — no toca ni un mueble.
            </p>
          </div>
          <span className="shrink-0 font-mono text-lg text-ember">&rarr;</span>
        </div>
      </Link>

      {/* guardar */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={guardar}
          disabled={guardando || !sucio}
          className="flex-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-emberDark disabled:opacity-30"
        >
          {guardando ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Todo guardado'}
        </button>
        <button
          onClick={deshacer}
          className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-paper/70 hover:border-ember hover:text-ember"
        >
          Deshacer
        </button>
      </div>

      {cargando && <p className="mb-3 text-xs text-paper/40">Cargando plano guardado…</p>}

      <div className="lg:flex lg:items-start lg:gap-6">
        {/* ------------------------------------------------ plano */}
        <div className="lg:flex-1 lg:min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <input
              type="range" min="0.45" max="1.9" step="0.05" value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-ember"
              aria-label="Zoom"
            />
            <span className="w-10 text-right font-mono text-[10px] text-paper/40">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-paper/60">
            {[['labels', 'Rótulos'], ['dims', 'Cotas'], ['grid', 'Grilla']].map(([k, txt]) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox" checked={show[k]} className="accent-ember"
                  onChange={(e) => setShow({ ...show, [k]: e.target.checked })}
                />
                {txt}
              </label>
            ))}
          </div>

          <div className="overflow-auto rounded-2xl border border-white/5 bg-[#1B1410] p-2">
            <svg
              ref={svgRef}
              viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
              width={Math.round(VIEWBOX.w * PPM * zoom)}
              height={Math.round(VIEWBOX.h * PPM * zoom)}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="block [&_.pl-item]:cursor-move [&_.pl-item]:touch-none [&_.pl-handle]:touch-none [&_.pl-handle]:cursor-pointer"
              dangerouslySetInnerHTML={{ __html: markup }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-paper/35">
            Arrastra para mover · manija superior para girar · esquinas para cambiar la medida ·
            flechas para empujar · <span className="font-mono">R</span> gira 15° ·
            <span className="font-mono"> Supr</span> elimina · <span className="font-mono">Ctrl+Z</span> deshace.
            Nada puede salir del rectángulo.
          </p>
        </div>

        {/* ------------------------------------------------ panel */}
        <div className="mt-6 lg:mt-0 lg:w-80 lg:shrink-0">
          {/* selección */}
          <Bloque titulo="Selección">
            {!sel ? (
              <p className="text-xs leading-relaxed text-paper/40">
                Ningún elemento seleccionado. Toca una mesa o un equipo del plano para editarlo.
              </p>
            ) : (
              <>
                <div className="mb-3 font-head text-sm font-semibold">{sel.label}</div>

                {SPECS[sel.type].kind === 'puerta' ? (
                  <div key={sel.id} className="space-y-2">
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-paper/35">Muro</span>
                      <select
                        value={sel.muro}
                        onChange={(e) => editarPuerta({ muro: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-ink px-2 py-1.5 text-xs text-paper focus:border-ember focus:outline-none"
                      >
                        {Object.keys(MUROS).map((m) => (
                          <option key={m} value={m}>{MUROS[m].nombre}</option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Campo label="Ancho vano (m)" value={sel.w.toFixed(2)} onChange={(v) => editarPuerta({ w: parseFloat(v) })} />
                      <Campo label="Corrimiento (m)" value={sel.corrimiento.toFixed(2)} onChange={(v) => editarPuerta({ corrimiento: parseFloat(v) })} />
                      <Campo label="Rótulo" tipo="text" value={sel.label} onChange={(v) => editarPuerta({ label: v })} />
                    </div>
                    <div className="flex gap-2">
                      <BtnChico onClick={() => editarPuerta({ hojas: sel.hojas === 2 ? 1 : 2 })}>
                        {sel.hojas === 2 ? 'Pasar a una hoja' : 'Pasar a doble hoja'}
                      </BtnChico>
                      {sel.hojas === 1 && (
                        <BtnChico onClick={() => editarPuerta({ mano: sel.mano === 1 ? -1 : 1 })}>Cambiar mano</BtnChico>
                      )}
                    </div>
                    <p className="text-[10px] leading-relaxed text-paper/35">
                      Arrastra la puerta para deslizarla por el muro — si la llevas cerca de otro muro, salta a ese.
                    </p>
                    <div className="flex gap-2">
                      <BtnChico onClick={eliminar} peligro>Eliminar acceso</BtnChico>
                    </div>
                  </div>
                ) : (
                <>
                <div key={sel.id} className="grid grid-cols-2 gap-2">
                  <Campo label="X (m)" value={sel.x.toFixed(2)} onChange={(v) => editarSel('x', v)} />
                  <Campo label="Y (m)" value={sel.y.toFixed(2)} onChange={(v) => editarSel('y', v)} />
                  <Campo
                    label={SPECS[sel.type].kind === 'mesa' ? 'Ø conjunto (m)' : SPECS[sel.type].kind === 'mesaR' ? 'Ø mesa (m)' : 'Ancho (m)'}
                    value={sel.w.toFixed(2)} onChange={(v) => editarSel('w', v)}
                  />
                  <Campo
                    label="Largo (m)" value={sel.h.toFixed(2)}
                    disabled={REDONDAS.includes(SPECS[sel.type].kind)}
                    onChange={(v) => editarSel('h', v)}
                  />
                  <Campo label="Giro (°)" step="15" value={String(Math.round(sel.rot))} onChange={(v) => editarSel('rot', v)} />
                  <Campo label="Rótulo" tipo="text" value={sel.label} onChange={(v) => editarSel('label', v)} />
                  {CON_SILLAS.includes(SPECS[sel.type].kind) && (
                    <Campo
                      label={SPECS[sel.type].kind === 'barra' ? 'Taburetes' : 'Sillas'}
                      step="1"
                      value={String(sillasDe(sel))}
                      onChange={(v) => editarSel('sillas', v)}
                    />
                  )}
                  {SPECS[sel.type].kind === 'cocina' && (
                    <Campo label="Fogones (1-6)" step="1" value={String(fogonesDe(sel))} onChange={(v) => editarSel('fogones', v)} />
                  )}
                </div>
                {SPECS[sel.type].kind === 'cocina' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        onClick={() => editarSel('fogones', String(n))}
                        className={`rounded-lg border px-2 py-1 font-mono text-[10px] transition ${
                          fogonesDe(sel) === n ? 'border-ember text-ember' : 'border-white/10 text-paper/50 hover:border-silver'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <BtnChico onClick={duplicar}>Duplicar</BtnChico>
                  <BtnChico onClick={() => editarSel('rot', String((sel.rot + 90) % 360))}>Girar 90°</BtnChico>
                  <BtnChico onClick={eliminar} peligro>Eliminar</BtnChico>
                </div>
                </>
                )}
              </>
            )}
          </Bloque>

          {/* agregar */}
          <Bloque titulo="Agregar">
            {PALETA_AGREGAR.map((g) => (
              <div key={g.cat} className="mb-3 last:mb-0">
                <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-paper/35">{g.cat}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {g.list.map(([type, nombre, dim]) => (
                    <button
                      key={type}
                      onClick={() => agregar(type)}
                      className="rounded-lg border border-white/10 bg-ink px-2 py-1.5 text-left transition hover:border-ember"
                    >
                      <span className="block text-[11px] font-semibold leading-tight">{nombre}</span>
                      <span className="block font-mono text-[9px] text-paper/35">{dim}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Bloque>

          {/* lo que hay puesto */}
          <Bloque titulo="Inventario">
            <table className="w-full text-xs">
              <tbody>
                <tr className="text-ember">
                  <td className="py-1 font-semibold">Sillas en total</td>
                  <td className="w-14 py-1 text-right font-mono tabular-nums">{contar(items, 'silla')}</td>
                </tr>
                {inventario(items).map((r) => (
                  <tr key={r.type}>
                    <td className="py-1">{r.name}</td>
                    <td className="w-14 py-1 text-right font-mono tabular-nums text-paper/60">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-paper/40">
              Las sillas cuentan tanto las sueltas como las que rodean cada mesa o barra.
            </p>
          </Bloque>

          {/* programa pedido — sólo aplica al encargo de la terraza */}
          {planoId === PLANO_ID && (
          <Bloque titulo="Programa pedido">
            <table className="w-full text-xs">
              <tbody>
                {REQUERIDOS.map((r) => {
                  const c = contar(items, r.req)
                  const mal = c !== r.n
                  return (
                    <tr key={r.req} className={mal ? 'text-wineSoft' : ''}>
                      <td className="py-1">{r.name}</td>
                      <td className="w-14 py-1 text-right font-mono tabular-nums text-paper/60">{c} / {r.n}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={2} className="pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-paper/35">
                    Complementarios
                  </td>
                </tr>
                {COMPLEMENTARIOS.map((r) => (
                  <tr key={r.req}>
                    <td className="py-1">{r.name}</td>
                    <td className="w-14 py-1 text-right font-mono tabular-nums text-paper/60">{contar(items, r.req)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-paper/40">
              {faltantes.length
                ? 'La planta ya no coincide con el programa pedido — revisa las líneas marcadas.'
                : 'Las cantidades coinciden exactamente con el programa solicitado.'}
            </p>
          </Bloque>
          )}

          <Bloque titulo="Empezar de nuevo">
            <button
              onClick={() => {
                if (!confirmandoReset) {
                  setConfirmandoReset(true)
                  setTimeout(() => setConfirmandoReset(false), 3200)
                  return
                }
                setConfirmandoReset(false)
                guardarHistorial()
                if (planoId === PLANO_ID) {
                  // La distribución original está dibujada para 9 × 24: se
                  // restituye el recinto junto con los muebles.
                  setRecintoState(setRecinto({ ancho: 9, largo: 24, corte: 6.9 }))
                  aplicar(layoutInicial())
                } else {
                  aplicar(layoutVacio())
                }
                setSelId(null)
              }}
              className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-paper/60 hover:border-wineSoft hover:text-wineSoft"
            >
              {confirmandoReset
                ? '¿Seguro? Se pierden tus cambios'
                : planoId === PLANO_ID ? 'Restablecer distribución original' : 'Vaciar este plano'}
            </button>
          </Bloque>
        </div>
      </div>

      {aviso && (
        <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-paper px-3 py-2 font-mono text-[11px] text-ink shadow-glow">
          {aviso}
        </div>
      )}
    </div>
  )
}

function Bloque({ titulo, children }) {
  return (
    <section className="mb-4 rounded-2xl border border-white/5 bg-inkSoft p-4">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">{titulo}</h2>
      {children}
    </section>
  )
}

// El valor se confirma al salir del campo (o con Enter), no en cada tecla: así
// escribir "12" no dispara un reposicionamiento intermedio en "1".
function Campo({ label, value, onChange, tipo = 'number', step = '0.05', disabled }) {
  const esNum = tipo === 'number'
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-paper/35">{label}</span>
      <input
        type={tipo}
        step={esNum ? step : undefined}
        defaultValue={value}
        key={esNum ? value : 'txt'}
        disabled={disabled}
        onBlur={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-full rounded-lg border border-white/10 bg-ink px-2 py-1.5 font-mono text-xs text-paper focus:border-ember focus:outline-none disabled:opacity-30"
      />
    </label>
  )
}

function BtnChico({ children, onClick, peligro }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition ${
        peligro
          ? 'border-white/10 text-paper/70 hover:border-wineSoft hover:text-wineSoft'
          : 'border-white/10 text-paper/70 hover:border-ember hover:text-ember'
      }`}
    >
      {children}
    </button>
  )
}
