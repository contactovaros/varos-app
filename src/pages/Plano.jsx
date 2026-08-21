import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  VIEWBOX, PPM, SPECS, sanear, svgDefs, svgShell, svgItem, svgLabel
} from '../lib/planoTerraza.js'

// Vista pública de un plano publicado. No pide sesión: la RLS de `public.planos`
// solo devuelve filas con publicado = true a quien no es admin, así que si el
// plano está en borrador esta pantalla simplemente no lo encuentra.
export default function Plano() {
  const { id } = useParams()
  const [plano, setPlano] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [show, setShow] = useState({ labels: true, dims: true, grid: false })

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      const { data } = await supabase
        .from('planos')
        .select('nombre, datos, publicado, actualizado_en')
        .eq('id', id)
        .maybeSingle()
      if (cancelado) return
      setPlano(data || null)
      setCargando(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [id])

  const markup = useMemo(() => {
    if (!plano) return ''
    const items = sanear(plano.datos)
    const puertas = items.filter((i) => SPECS[i.type].kind === 'puerta')
    return svgDefs() + svgShell(show, puertas) + items.map(svgItem).join('') +
      items.map((i) => svgLabel(i, show)).join('')
  }, [plano, show])

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-xs text-paper/40">
        Cargando plano…
      </div>
    )
  }

  if (!plano) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-8 text-center">
        <h1 className="font-head text-lg font-semibold text-paper">Plano no disponible</h1>
        <p className="mt-2 max-w-xs text-sm text-paper/45">
          Este plano no existe o todavía no fue publicado.
        </p>
      </div>
    )
  }

  const fecha = plano.actualizado_en
    ? new Date(plano.actualizado_en).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-ink px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember">Varo's · Arquitectura</div>
          <h1 className="mt-1 font-head text-2xl font-semibold text-paper">{plano.nombre}</h1>
          <p className="mt-1 font-mono text-[11px] text-paper/40">
            Planta general · 9,00 × 24,00 m · 216 m²{fecha ? ` · actualizado ${fecha}` : ''}
          </p>
          {!plano.publicado && (
            <p className="mt-3 inline-block rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] text-gold">
              Borrador — solo visible para ti. Publícalo desde /admin/plano para compartirlo.
            </p>
          )}
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="flex min-w-[180px] flex-1 items-center gap-3">
            <input
              type="range" min="0.45" max="1.9" step="0.05" value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-ember" aria-label="Zoom"
            />
            <span className="w-10 text-right font-mono text-[10px] text-paper/40">{Math.round(zoom * 100)}%</span>
          </div>
          {[['labels', 'Rótulos'], ['dims', 'Cotas']].map(([k, txt]) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5 text-[11px] text-paper/60">
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
            viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
            width={Math.round(VIEWBOX.w * PPM * zoom)}
            height={Math.round(VIEWBOX.h * PPM * zoom)}
            className="block"
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        </div>
      </div>
    </div>
  )
}
