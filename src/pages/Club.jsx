import { useAuth } from '../context/AuthContext.jsx'

function Ornamento() {
  return (
    <div className="flex items-center gap-2 justify-center my-2">
      <span className="h-px w-10 bg-gold/50" />
      <span className="text-gold text-[10px]">✦</span>
      <span className="h-px w-10 bg-gold/50" />
    </div>
  )
}

export default function Club() {
  const { customer, signOut } = useAuth()

  if (!customer) {
    return <div className="pt-24 text-center text-sm text-paper/50">Cargando tu perfil del club…</div>
  }

  const estrellas = customer.estrellas_actuales ?? 0
  const primerNombre = customer.full_name?.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-10">
      <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1">Varo's</div>
      <h1 className="font-head text-3xl text-paper font-semibold mb-1">Hola, {primerNombre}</h1>
      <p className="text-wineSoft font-medium mb-1">Tu tarjeta de fidelización</p>
      <Ornamento />

      <div className="w-full max-w-xs rounded-[26px] border-2 border-gold/70 bg-inkSoft p-1.5 mt-4 shadow-glow">
        <div className="rounded-[20px] border border-gold/30 p-6 text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden border-2 border-gold/50 bg-ink flex items-center justify-center">
            {customer.avatar_url ? (
              <img src={customer.avatar_url} alt={customer.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-head font-bold text-2xl text-gold">{customer.full_name?.[0]}</span>
            )}
          </div>
          <div className="font-head font-semibold text-lg text-paper mb-1">{customer.full_name}</div>
          <Ornamento />

          <div className="flex gap-1.5 justify-center mb-2 mt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={`text-3xl ${i < estrellas ? 'text-gold' : 'text-gold/20'}`}>
                {i < estrellas ? '★' : '☆'}
              </span>
            ))}
          </div>
          <p className="text-paper/70 text-sm">{estrellas} de 5 visitas</p>
        </div>
      </div>

      <p className="text-center text-[10px] text-paper/30 mt-6">
        Varo's · +56 9 9923 5368 · contacto@varos.cl
      </p>

      <button
        onClick={signOut}
        className="mt-8 px-6 py-3 rounded-xl text-sm font-head font-semibold border border-white/10 text-paper/60"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
