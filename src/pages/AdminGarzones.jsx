import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase'

// Registro de garzones — candado de /mozo (ver varos-pos/DECISIONES.md,
// "Reemplazo de Comandas"). /mozo era un link completamente abierto: quien
// lo tuviera podía mandar pedidos reales a cocina. Acá se registra a cada
// garzón real; el código que se genera es lo único que /mozo pide para
// entrar (sin Google, sin contraseña — decisión explícita del usuario).
//
// Depende de la migración `garzones` + RPCs `crear_garzon` /
// `desactivar_garzon` / `validar_codigo_garzon` en Supabase.

export default function AdminGarzones() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [garzones, setGarzones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const [ultimoCreado, setUltimoCreado] = useState(null) // { nombre, codigo } — para mostrarlo grande recién creado

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('garzones').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setGarzones([])
    } else {
      setGarzones(data ?? [])
    }
    setCargando(false)
  }

  useEffect(() => {
    if (isAdmin) cargar()
  }, [isAdmin])

  async function crearGarzon() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setCreando(true)
    setError('')
    const { data, error } = await supabase.rpc('crear_garzon', { p_nombre: nombre })
    setCreando(false)
    if (error) {
      setError('No se pudo crear el garzón: ' + error.message)
      return
    }
    setGarzones((prev) => [data, ...prev])
    setUltimoCreado({ nombre: data.nombre, codigo: data.codigo })
    setNombreNuevo('')
  }

  async function toggleActivo(g) {
    const nuevoValor = !g.activo
    setGarzones((prev) => prev.map((x) => (x.id === g.id ? { ...x, activo: nuevoValor } : x)))
    const { error } = await supabase.rpc('desactivar_garzon', { p_id: g.id, p_activo: nuevoValor })
    if (error) {
      setGarzones((prev) => prev.map((x) => (x.id === g.id ? { ...x, activo: g.activo } : x)))
      alert('No se pudo cambiar el estado del garzón.')
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
        <h1 className="font-head text-2xl font-semibold">Garzones</h1>
        <p className="text-paper/40 text-xs mt-1 leading-relaxed">
          {cargando ? 'Cargando…' : `${garzones.length} garzones registrados`} · el código es lo único que piden
          para entrar a /mozo
        </p>
        {error && <p className="text-rose-400 text-[11px] mt-1 leading-relaxed">{error}</p>}
      </header>

      {/* ---- Alta de garzón nuevo ---- */}
      <div className="bg-inkSoft border border-gold/25 rounded-2xl p-4 mb-4">
        <div className="flex gap-2">
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && crearGarzon()}
            placeholder="Nombre del garzón"
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2.5 text-sm"
          />
          <button
            onClick={crearGarzon}
            disabled={creando || !nombreNuevo.trim()}
            className="shrink-0 px-4 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-gold to-bronze text-ink disabled:opacity-40"
          >
            {creando ? 'Creando…' : '+ Registrar'}
          </button>
        </div>

        {ultimoCreado && (
          <div className="mt-3 bg-ink border border-gold/40 rounded-xl p-4 text-center">
            <div className="text-[11px] text-paper/50 mb-1">
              Código para <span className="text-paper">{ultimoCreado.nombre}</span> — pásaselo para que lo escriba
              una vez en su celular
            </div>
            <div className="font-mono text-3xl font-bold tracking-[0.3em] text-gold">{ultimoCreado.codigo}</div>
          </div>
        )}
      </div>

      {/* ---- Lista de garzones ---- */}
      <div className="flex flex-col">
        {garzones.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-b-0">
            <div className="min-w-0">
              <div className={`text-sm font-medium truncate ${g.activo ? 'text-paper' : 'text-paper/30 line-through'}`}>
                {g.nombre}
              </div>
              <div className="font-mono text-[13px] tracking-[0.2em] text-gold/80 mt-0.5">{g.codigo}</div>
            </div>
            <button
              onClick={() => toggleActivo(g)}
              className={`shrink-0 px-3 py-1.5 rounded-lg border text-[11px] font-medium whitespace-nowrap ${
                g.activo ? 'border-gold/40 text-gold' : 'border-white/10 text-paper/40'
              }`}
            >
              {g.activo ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        ))}
        {!cargando && garzones.length === 0 && (
          <p className="text-paper/35 text-xs py-4">Aún no registraste ningún garzón — usa el formulario de arriba.</p>
        )}
      </div>
    </div>
  )
}
