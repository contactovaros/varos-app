import { useEffect, useState } from 'react'
import { comandasBackend, rechequearComandasBackend, REVISAR_INTERRUPTOR_MS } from '../lib/comandasApi.js'

// Con qué sistema de comandas trabaja esta pantalla (Worker = "anterior",
// Supabase = "nuevo") y aviso si el interruptor cambió mientras estaba abierta.
//
// Por qué existe: el interruptor se lee al cargar. Un celular con Mozo abierto
// de antes del cambio seguiría mandando pedidos al sistema equivocado sin que
// nadie lo note. Cada ~60 s se vuelve a preguntar; si cambió, se pide recargar.
//
// `backend` es el valor con el que la pantalla CARGÓ (null mientras se
// consulta); las lecturas y escrituras de la pantalla se rigen por ese valor,
// no por el nuevo, hasta que se recargue.
export function useSistemaComandas() {
  const [backend, setBackend] = useState(null)
  const [actual, setActual] = useState(null)

  useEffect(() => {
    let vivo = true
    comandasBackend().then((v) => {
      if (!vivo) return
      setBackend(v)
      setActual(v)
    })
    const id = setInterval(() => {
      rechequearComandasBackend().then((v) => {
        if (vivo) setActual(v)
      })
    }, REVISAR_INTERRUPTOR_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])

  return { backend, cambio: backend !== null && actual !== null && actual !== backend }
}

export function nombreSistema(backend) {
  return backend === 'supabase' ? 'Sistema nuevo' : 'Sistema anterior'
}

// Insignia discreta para el encabezado.
export function InsigniaSistema({ backend, className = '' }) {
  if (!backend) return null
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] tracking-wide uppercase ${
        backend === 'supabase' ? 'text-diamond/70' : 'text-paper/35'
      } ${className}`}
      title={backend === 'supabase' ? 'Los pedidos van al sistema nuevo (Supabase)' : 'Los pedidos van al sistema anterior (Worker)'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${backend === 'supabase' ? 'bg-diamond' : 'bg-paper/30'}`} aria-hidden="true" />
      {nombreSistema(backend)}
    </span>
  )
}

// Barra fija, imposible de no ver, cuando el interruptor cambió.
export function AvisoRecargar({ cambio }) {
  if (!cambio) return null
  return (
    <div role="alert" className="fixed top-0 left-0 right-0 z-[70] bg-wine text-paper px-4 py-3 shadow-lg">
      <div className="max-w-md mx-auto flex items-center gap-3">
        <p className="flex-1 text-[12.5px] leading-snug font-semibold">
          El sistema de pedidos cambió. Recargá la página antes de seguir: si no, los pedidos pueden ir al sistema equivocado.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-paper text-ink font-head font-bold text-[12.5px] px-3.5 py-2"
        >
          Recargar
        </button>
      </div>
    </div>
  )
}
