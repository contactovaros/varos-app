import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  VIEWBOX, PPM, SPECS, sanear, svgDefs, svgShell, svgItem, svgLabel,
  setRecinto, extraerConfig
} from '../lib/planoTerraza.js'
import { construirFlujo, svgFlujo, PASOS, C } from '../lib/flujoOperativo.js'

// Vista animada del funcionamiento del local, sobre el MISMO plano de
// /admin/plano. La capa de flujo no guarda nada ni modifica el layout: lee los
// items publicados y deriva de ellos dónde se para cada persona. Si el plano
// todavía no está publicado (o no hay fila en la base), cae a la distribución
// por defecto del código para que la pantalla siempre muestre algo.

const ROLES = [
  ['Clientes', C.cliente],
  ['Cocina', C.cocina],
  ['Coctelería', C.barra],
  ['Caja', C.caja]
]

export default function PlanoFlujo() {
  const { id } = useParams()
  const [plano, setPlano] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [zoom, setZoom] = useState(0.85)
  const [velocidad, setVelocidad] = useState(1.6)
  const [corriendo, setCorriendo] = useState(true)
  const [show, setShow] = useState({ labels: false, dims: false, grid: false })
  const [capa, setCapa] = useState({ lineas: false, hitos: true, rotulos: true, ambiente: true })
  const svgRef = useRef(null)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      const { data } = await supabase
        .from('planos')
        .select('nombre, ancho, largo, datos, publicado, actualizado_en')
        .eq('id', id)
        .maybeSingle()
      if (cancelado) return
      setPlano(data || null)
      setCargando(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [id])

  // `sanear([])` devuelve la distribución por defecto, así que esto funciona
  // igual con plano guardado, con plano vacío o sin fila en la base. El recinto
  // se fija primero: cada comedor tiene el suyo y todo lo demás se mide contra él.
  const items = useMemo(() => {
    if (!plano) return sanear([])
    const cfg = extraerConfig(plano.datos)
    setRecinto({ ancho: plano.ancho, largo: plano.largo, corte: cfg.corte })
    return sanear(cfg.items)
  }, [plano])
  const flujo = useMemo(() => construirFlujo(items), [items])

  const markup = useMemo(() => {
    const puertas = items.filter((i) => SPECS[i.type] && SPECS[i.type].kind === 'puerta')
    const base = svgDefs() + svgShell(show, puertas, items) + items.map(svgItem).join('') +
      items.map((i) => svgLabel(i, show)).join('')
    return base + svgFlujo(flujo, { ...capa, velocidad })
  }, [items, flujo, show, capa, velocidad])

  // El play/pausa lo maneja el propio SVG: SMIL tiene reloj propio, no hace
  // falta re-renderizar nada.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    if (corriendo) el.unpauseAnimations()
    else el.pauseAnimations()
  }, [corriendo, markup])

  // Exporta la escena tal cual se está viendo, como .svg que se abre solo en
  // cualquier navegador: la animación SMIL viaja adentro del archivo, así que
  // se puede mandar por WhatsApp o proyectar sin la app.
  function exportar() {
    const el = svgRef.current
    if (!el) return
    const doc = `<?xml version="1.0" encoding="UTF-8"?>
` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}" ` +
      `width="${Math.round(VIEWBOX.w * PPM)}" height="${Math.round(VIEWBOX.h * PPM)}">` +
      `<style>text{font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif}</style>` +
      `<rect x="${VIEWBOX.x}" y="${VIEWBOX.y}" width="${VIEWBOX.w}" height="${VIEWBOX.h}" fill="#1B1410"/>` +
      el.innerHTML + `</svg>`
    const url = URL.createObjectURL(new Blob([doc], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `flujo-${id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-xs text-paper/40">
        Cargando plano…
      </div>
    )
  }

  const fecha = plano && plano.actualizado_en
    ? new Date(plano.actualizado_en).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-ink px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember">
            Varo's · Flujo operativo
          </div>
          <h1 className="mt-1 font-head text-2xl font-semibold text-paper">
            {plano ? plano.nombre : 'Terraza Parque Centenario'} — el local en servicio
          </h1>
          <p className="mt-1 font-mono text-[11px] text-paper/40">
            Misma planta de 9,00 × 24,00 m{fecha ? ` · actualizada ${fecha}` : ''} · nadie movió un mueble
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/55">
            El recorrido completo, de la puerta a la mesa, sobre la distribución real.
            Las personas, la cola y los caminos no están dibujados a mano: se calculan
            del plano, esquivando cada mesón y cada mesa. Si movés algo en{' '}
            <Link to="/admin/plano" className="text-ember underline decoration-ember/40 underline-offset-2">
              el editor
            </Link>, esta escena se reacomoda sola.
          </p>
          {!plano && (
            <p className="mt-3 inline-block rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] text-gold">
              Mostrando la distribución por defecto: este plano todavía no está publicado.
            </p>
          )}
          {plano && !plano.publicado && (
            <p className="mt-3 inline-block rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] text-gold">
              Borrador — solo visible para ti. Publicalo desde /admin/plano para compartir el enlace.
            </p>
          )}
        </header>

        {flujo.avisos.map((a) => (
          <p key={a} className="mb-4 max-w-3xl rounded-xl border-l-2 border-ember/60 bg-ember/5 px-4 py-3 text-[13px] leading-relaxed text-paper/70">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember">Circulación</span>
            <br />{a}
          </p>
        ))}

        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            onClick={() => setCorriendo((v) => !v)}
            className="rounded-lg border border-ember/50 bg-ember/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ember transition hover:bg-ember/20"
          >
            {corriendo ? '❚❚ Pausar' : '▶ Reanudar'}
          </button>

          <label className="flex min-w-[150px] flex-1 items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/35">Ritmo</span>
            <input
              type="range" min="0.4" max="3" step="0.1" value={velocidad}
              onChange={(e) => setVelocidad(parseFloat(e.target.value))}
              className="flex-1 accent-ember"
            />
            <span className="w-9 text-right font-mono text-[10px] text-paper/40">{velocidad.toFixed(1)}×</span>
          </label>

          <label className="flex min-w-[150px] flex-1 items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/35">Zoom</span>
            <input
              type="range" min="0.4" max="1.9" step="0.05" value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-ember"
            />
            <span className="w-9 text-right font-mono text-[10px] text-paper/40">{Math.round(zoom * 100)}%</span>
          </label>

          <button
            onClick={exportar}
            className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60 transition hover:border-ember hover:text-ember"
          >
            Exportar .svg
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          {[
            ['lineas', 'Líneas de flujo', capa, setCapa],
            ['ambiente', 'Luz y servicio', capa, setCapa],
            ['hitos', 'Pasos numerados', capa, setCapa],
            ['rotulos', 'Rótulos de estación', capa, setCapa],
            ['labels', 'Rótulos del plano', show, setShow],
            ['dims', 'Cotas', show, setShow]
          ].map(([k, txt, estado, set]) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5 text-[11px] text-paper/55">
              <input
                type="checkbox" checked={estado[k]} className="accent-ember"
                onChange={(e) => set({ ...estado, [k]: e.target.checked })}
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
            className="block"
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">Quién es quién</div>
            <ul className="mt-3 space-y-2">
              {ROLES.map(([txt, color]) => (
                <li key={txt} className="flex items-center gap-2.5 text-[13px] text-paper/65">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  {txt}
                </li>
              ))}
              <li className="flex items-center gap-2.5 pt-1 text-[13px] text-paper/45">
                <span className="h-[2px] w-6 shrink-0 rounded" style={{ background: C.prod }} />
                Flujo de producción
              </li>
              <li className="flex items-center gap-2.5 text-[13px] text-paper/45">
                <span className="h-[2px] w-6 shrink-0 rounded" style={{ background: C.cliente }} />
                Flujo del cliente
              </li>
            </ul>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/35">El recorrido</div>
            <ol className="mt-3 space-y-2.5">
              {PASOS.map(([n, titulo, txt]) => (
                <li key={n} className="flex gap-3 text-[13px] leading-snug">
                  <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-paper/20 font-mono text-[10px] text-paper/55">
                    {n}
                  </span>
                  <span className="text-paper/65">
                    <span className="font-semibold text-paper/85">{titulo}.</span> {txt}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className="mt-8 max-w-2xl border-l-2 border-white/10 pl-4 text-[12px] leading-relaxed text-paper/35">
          Cocina y coctelería trabajan en paralelo sobre la misma comanda, y el pedido
          cambia de manos en el pase: el personal queda de un lado, el cliente del otro.
          Ese es el único punto donde los dos flujos se tocan.
        </p>
      </div>
    </div>
  )
}
