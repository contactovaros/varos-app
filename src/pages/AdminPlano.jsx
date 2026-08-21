import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import {
  SPECS, REQUERIDOS, COMPLEMENTARIOS, PALETA_AGREGAR, VIEWBOX, PPM,
  layoutInicial, sanear, clampItem, halfExtents, rotar, snap, contar, crearItem,
  svgDefs, svgShell, svgItem, svgLabel, svgSeleccion, MUROS, pegarPuertaA, ajustarPuerta
} from '../lib/planoTerraza.js'

const PLANO_ID = 'terraza-centenario'

export default function AdminPlano() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [items, setItems] = useState(() => layoutInicial())
  const [selId, setSelId] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [show, setShow] = useState({ labels: true, dims: true, grid: false })

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
  useEffect(() => {
    if (!isAdmin) return
    let cancelado = false

    async function cargar() {
      setCargando(true)
      const { data, error: e } = await supabase
        .from('planos')
        .select('datos, publicado')
        .eq('id', PLANO_ID)
        .maybeSingle()

      if (cancelado) return
      if (e) {
        // Si la tabla todavía no existe, se sigue editando en memoria.
        setError('No se pudo leer el plano guardado: ' + e.message)
      } else if (data) {
        setItems(sanear(data.datos))
        setPublicado(!!data.publicado)
      }
      setCargando(false)
    }

    cargar()
    return () => { cancelado = true }
  }, [isAdmin])

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
  async function guardar() {
    setGuardando(true)
    setError(null)
    const { error: e } = await supabase.from('planos').upsert({
      id: PLANO_ID,
      nombre: 'Terraza Parque Centenario',
      ancho: 9,
      largo: 24,
      datos: items,
      publicado
    })
    setGuardando(false)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    setSucio(false)
    mostrarAviso('Plano guardado')
  }

  async function cambiarPublicacion(valor) {
    setGuardando(true)
    setError(null)
    // Publicar guarda también el estado actual del plano: no tendría sentido
    // publicar una versión distinta de la que el admin está viendo.
    const { error: e } = await supabase.from('planos').upsert({
      id: PLANO_ID,
      nombre: 'Terraza Parque Centenario',
      ancho: 9,
      largo: 24,
      datos: items,
      publicado: valor
    })
    setGuardando(false)
    if (e) { setError('No se pudo cambiar la publicación: ' + e.message); return }
    setPublicado(valor)
    setSucio(false)
    mostrarAviso(valor ? 'Plano publicado' : 'Plano despublicado — vuelve a ser privado')
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
        if (SPECS[it.type].kind === 'mesa' || e.shiftKey) {
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
      const mover = (dx, dy) => {
        guardarHistorial()
        aplicar(items.map((i) => (i.id === sel.id ? clampItem({ ...i, x: i.x + dx, y: i.y + dy }) : i)))
      }
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); mover(-s, 0); break
        case 'ArrowRight': e.preventDefault(); mover(s, 0); break
        case 'ArrowUp': e.preventDefault(); mover(0, -s); break
        case 'ArrowDown': e.preventDefault(); mover(0, s); break
        case 'r': case 'R': {
          e.preventDefault()
          guardarHistorial()
          aplicar(items.map((i) => (i.id === sel.id ? clampItem({ ...i, rot: (i.rot + (e.shiftKey ? -15 : 15) + 360) % 360 }) : i)))
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
      if (campo === 'w' && SPECS[i.type].kind === 'mesa') { n.w = Math.max(0.8, v); n.h = n.w }
      else if (campo === 'w' || campo === 'h') n[campo] = Math.max(0.25, v)
      else n[campo] = v
      return clampItem(n)
    }))
  }

  // ------------------------------------------------------------ dibujo
  const puertas = useMemo(() => items.filter((i) => SPECS[i.type].kind === 'puerta'), [items])
  const markup = useMemo(
    () => svgDefs() + svgShell(show, puertas) + items.map(svgItem).join('') +
      items.map((i) => svgLabel(i, show)).join('') + svgSeleccion(sel),
    [items, puertas, show, sel]
  )

  const urlPublica = typeof window !== 'undefined'
    ? `${window.location.origin}/plano/${PLANO_ID}`
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
        <h1 className="font-head text-2xl font-semibold">Plano de la terraza</h1>
        <p className="text-[11px] text-paper/45 mt-1">
          Recinto de 9,00 × 24,00 m · 216 m² · Parque Centenario
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
                    label={SPECS[sel.type].kind === 'mesa' ? 'Ø conjunto (m)' : 'Ancho (m)'}
                    value={sel.w.toFixed(2)} onChange={(v) => editarSel('w', v)}
                  />
                  <Campo
                    label="Largo (m)" value={sel.h.toFixed(2)}
                    disabled={SPECS[sel.type].kind === 'mesa'}
                    onChange={(v) => editarSel('h', v)}
                  />
                  <Campo label="Giro (°)" step="15" value={String(Math.round(sel.rot))} onChange={(v) => editarSel('rot', v)} />
                  <Campo label="Rótulo" tipo="text" value={sel.label} onChange={(v) => editarSel('label', v)} />
                </div>
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

          {/* programa */}
          <Bloque titulo="Programa">
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
            <button
              onClick={() => {
                if (!confirmandoReset) {
                  setConfirmandoReset(true)
                  setTimeout(() => setConfirmandoReset(false), 3200)
                  return
                }
                setConfirmandoReset(false)
                guardarHistorial()
                aplicar(layoutInicial())
                setSelId(null)
              }}
              className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-paper/60 hover:border-wineSoft hover:text-wineSoft"
            >
              {confirmandoReset ? '¿Seguro? Se pierden tus cambios' : 'Restablecer distribución original'}
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
