import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

// Mesas reales del POS (numeración por sector) que usa /mozo para armar el
// selector de mesa — ver varos-pos/DECISIONES.md y supabase/add_pos_mesas.sql.
// Distinta de public.mesas/mesas_salon/mesas_terraza (esas son el plano de
// reservas del Club Varo's, con x/y/capacidad — un mundo aparte).
//
// El equipo del restaurante carga acá su propia numeración real por sector
// (Bar, Carpa, Andino, Chic, Jardín, o los que tengan) — Claude no la
// inventa.

export default function AdminMesasPos() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [mesas, setMesas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [sectorNuevo, setSectorNuevo] = useState('')
  const [numeroNuevo, setNumeroNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  // Qué sectores están desplegados — colapsados por defecto, mismo criterio
  // que /mozo (con varios sectores cargados, mostrar todo abierto obliga a
  // scrollear de más).
  const [sectoresAbiertos, setSectoresAbiertos] = useState(() => new Set())
  function toggleSector(sector) {
    setSectoresAbiertos((prev) => {
      const next = new Set(prev)
      next.has(sector) ? next.delete(sector) : next.add(sector)
      return next
    })
  }

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase
      .from('pos_mesas')
      .select('*')
      .order('sector', { ascending: true })
      .order('orden', { ascending: true, nullsFirst: false })
      // numero NO se ordena en la base (es texto, "7B" tiene que poder existir) —
      // el orden numérico real (1,2,3…13, no 1,10,11…2,3) se hace client-side
      // más abajo con localeCompare, igual que en Mozo.jsx.
    if (error) {
      setError(error.message)
      setMesas([])
    } else {
      setMesas(data ?? [])
    }
    setCargando(false)
  }

  useEffect(() => {
    if (isAdmin) cargar()
  }, [isAdmin])

  // Sectores ya usados, para sugerir en vez de que cada quien tipee distinto
  // (ej. "Bar" vs "bar" vs "BAR" — ver duplicarSector más abajo).
  const sectoresExistentes = useMemo(() => {
    const vistos = new Set()
    const list = []
    for (const m of mesas) {
      if (!vistos.has(m.sector)) {
        vistos.add(m.sector)
        list.push(m.sector)
      }
    }
    return list
  }, [mesas])

  const grupos = useMemo(() => {
    const porSector = {}
    for (const m of mesas) {
      if (!porSector[m.sector]) porSector[m.sector] = []
      porSector[m.sector].push(m)
    }
    for (const lista of Object.values(porSector)) {
      lista.sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }))
    }
    return Object.entries(porSector)
  }, [mesas])

  async function agregarMesa() {
    const sector = sectorNuevo.trim()
    const numero = numeroNuevo.trim()
    if (!sector || !numero) return
    setCreando(true)
    setError('')
    const { data, error } = await supabase
      .from('pos_mesas')
      .insert({ sector, numero })
      .select()
      .single()
    setCreando(false)
    if (error) {
      setError('No se pudo agregar la mesa: ' + error.message)
      return
    }
    setMesas((prev) => [...prev, data])
    setSectoresAbiertos((prev) => new Set(prev).add(sector))
    setNumeroNuevo('')
    // el sector se deja tal cual para seguir cargando varias mesas seguidas del mismo sector
  }

  async function toggleActiva(m) {
    const nuevoValor = !m.activa
    setMesas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activa: nuevoValor } : x)))
    const { error } = await supabase.from('pos_mesas').update({ activa: nuevoValor }).eq('id', m.id)
    if (error) {
      setMesas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activa: m.activa } : x)))
      alert('No se pudo cambiar el estado de la mesa.')
    }
  }

  async function borrarMesa(m) {
    if (!confirm(`¿Borrar la mesa ${m.numero} de ${m.sector}?`)) return
    setMesas((prev) => prev.filter((x) => x.id !== m.id))
    const { error } = await supabase.from('pos_mesas').delete().eq('id', m.id)
    if (error) {
      alert('No se pudo borrar la mesa.')
      cargar()
    }
  }

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

  return (
    <div className="px-4 pt-8 pb-10">
      <header className="mb-5">
        <div className="font-mono text-[10px] tracking-[0.3em] text-gold uppercase">Varo's · Gestión</div>
        <h1 className="font-head text-2xl font-semibold">Mesas del POS</h1>
        <p className="text-paper/40 text-xs mt-1 leading-relaxed">
          {cargando ? 'Cargando…' : `${mesas.length} mesas cargadas`} · esta es la numeración que ve el garzón en
          /mozo al elegir mesa — cargala tal cual es en el local
        </p>
        {error && <p className="text-rose-400 text-[11px] mt-1 leading-relaxed">{error}</p>}
      </header>

      {/* ---- Alta de mesa nueva ---- */}
      <div className="bg-inkSoft border border-gold/25 rounded-2xl p-4 mb-4">
        <div className="flex gap-2 mb-2">
          <input
            value={sectorNuevo}
            onChange={(e) => setSectorNuevo(e.target.value)}
            placeholder="Sector (ej: Bar, Carpa, Andino…)"
            list="sectores-existentes"
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2.5 text-sm"
          />
          <datalist id="sectores-existentes">
            {sectoresExistentes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="flex gap-2">
          <input
            value={numeroNuevo}
            onChange={(e) => setNumeroNuevo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregarMesa()}
            placeholder="N° de mesa (ej: 1)"
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2.5 text-sm"
          />
          <button
            onClick={agregarMesa}
            disabled={creando || !sectorNuevo.trim() || !numeroNuevo.trim()}
            className="shrink-0 px-4 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-gold to-bronze text-ink disabled:opacity-40"
          >
            {creando ? 'Agregando…' : '+ Agregar'}
          </button>
        </div>
        <p className="text-[10.5px] text-paper/35 mt-2 leading-relaxed">
          El sector queda escrito tal cual lo tipees — usá siempre el mismo texto exacto para el mismo sector
          (ej. no mezclar "Carpa" con "carpa").
        </p>
      </div>

      {/* ---- Lista agrupada por sector, desplegable ---- */}
      {grupos.map(([sector, mesasDelSector]) => {
        const abierto = sectoresAbiertos.has(sector)
        const activas = mesasDelSector.filter((m) => m.activa).length
        return (
        <div key={sector} className="mb-2.5 border-b border-white/5 pb-2.5 last:border-b-0">
          <button onClick={() => toggleSector(sector)} className="w-full flex items-center justify-between py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-paper/60">{sector}</span>
            <span className="flex items-center gap-2">
              <span className="text-[10px] text-paper/35">
                {activas}/{mesasDelSector.length} activas
              </span>
              <span className={`text-gold text-xs transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
            </span>
          </button>
          {abierto && (
          <div className="flex flex-col mt-1">
            {mesasDelSector.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
                <div className={`text-sm font-medium ${m.activa ? 'text-paper' : 'text-paper/30 line-through'}`}>
                  Mesa {m.numero}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActiva(m)}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium whitespace-nowrap ${
                      m.activa ? 'border-gold/40 text-gold' : 'border-white/10 text-paper/40'
                    }`}
                  >
                    {m.activa ? 'Activa' : 'Inactiva'}
                  </button>
                  <button onClick={() => borrarMesa(m)} className="text-paper/35 text-xs underline">
                    borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        )
      })}
      {!cargando && grupos.length === 0 && (
        <p className="text-paper/35 text-xs py-4">
          Todavía no cargaste ninguna mesa — usá el formulario de arriba. Empezá por un sector y sus mesas, después
          seguí con el próximo.
        </p>
      )}
    </div>
  )
}
