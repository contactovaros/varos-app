import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [customers, setCustomers] = useState([])
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [promotions, setPromotions] = useState([])
  const [rule, setRule] = useState(100)
  const [premioEstrellas, setPremioEstrellas] = useState('')
  const [premioVisible, setPremioVisible] = useState(true)
  const [savingPremio, setSavingPremio] = useState(false)
  const [checkinUrl, setCheckinUrl] = useState(`${window.location.origin}/checkin`)
  const [newDish, setNewDish] = useState({ name: '', description: '', price_clp: '', category: 'Platos principales' })
  const [newPromo, setNewPromo] = useState({ title: '', message: '' })
  const [savingDish, setSavingDish] = useState(false)

  async function loadAll() {
    const [c, r, rd, mi, pr, promo, premio] = await Promise.all([
      supabase.from('customers').select('*').order('points', { ascending: false }).limit(30),
      supabase.from('rewards').select('*').order('cost_points'),
      supabase.from('redemptions').select('*, customers(full_name), rewards(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('menu_items').select('*').order('category'),
      supabase.from('points_rules').select('*').eq('id', 1).single(),
      supabase.from('promotions').select('*').order('starts_at', { ascending: false }).limit(10),
      supabase.from('config_recompensa_estrellas').select('*').eq('id', 1).single()
    ])
    setCustomers(c.data ?? [])
    setRewards(r.data ?? [])
    setRedemptions(rd.data ?? [])
    setMenuItems(mi.data ?? [])
    setRule(pr.data?.clp_per_point ?? 100)
    setPromotions(promo.data ?? [])
    setPremioEstrellas(premio.data?.producto ?? '')
    setPremioVisible(premio.data?.visible ?? true)
  }

  useEffect(() => {
    if (isAdmin) loadAll()
  }, [isAdmin])

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

  const now = Date.now()
  const inactive = customers.filter((c) => c.last_visit_at && now - new Date(c.last_visit_at).getTime() > 30 * 86400000)

  async function updateRewardCost(id, cost) {
    setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, cost_points: cost } : r)))
    await supabase.from('rewards').update({ cost_points: cost }).eq('id', id)
  }

  async function toggleReward(id, active) {
    setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, active: !active } : r)))
    await supabase.from('rewards').update({ active: !active }).eq('id', id)
  }

  async function guardarPremioEstrellas() {
    if (!premioEstrellas) return
    setSavingPremio(true)
    const { data, error } = await supabase
      .from('config_recompensa_estrellas')
      .update({ producto: premioEstrellas })
      .eq('id', 1)
      .select()
    setSavingPremio(false)
    if (error || !data?.length) {
      alert('No se pudo guardar el premio. Puede faltar el permiso de escritura (RLS) en Supabase para la tabla config_recompensa_estrellas.')
    }
  }

  async function toggleVisiblePremio() {
    const nuevoValor = !premioVisible
    setPremioVisible(nuevoValor)
    const { data, error } = await supabase
      .from('config_recompensa_estrellas')
      .update({ visible: nuevoValor })
      .eq('id', 1)
      .select()
    if (error || !data?.length) {
      setPremioVisible(!nuevoValor)
      alert('No se pudo cambiar la visibilidad del premio.')
    }
  }

  async function updateRule(value) {
    setRule(value)
    await supabase.from('points_rules').update({ clp_per_point: value }).eq('id', 1)
  }

  async function addDish() {
    if (!newDish.name || !newDish.price_clp) return
    setSavingDish(true)
    const { data, error } = await supabase
      .from('menu_items')
      .insert({ ...newDish, price_clp: Number(newDish.price_clp) })
      .select()
      .single()
    if (!error && data) {
      setMenuItems((prev) => [...prev, data])
      setNewDish({ name: '', description: '', price_clp: '', category: 'Platos principales' })
    }
    setSavingDish(false)
  }

  async function toggleDish(id, available) {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, available: !available } : m)))
    await supabase.from('menu_items').update({ available: !available }).eq('id', id)
  }

  async function updateDishPrice(id, price_clp) {
    setMenuItems((prev) => prev.map((m) => (m.id === id ? { ...m, price_clp } : m)))
    await supabase.from('menu_items').update({ price_clp }).eq('id', id)
  }

  async function deleteDish(id) {
    setMenuItems((prev) => prev.filter((m) => m.id !== id))
    await supabase.from('menu_items').delete().eq('id', id)
  }

  async function addPromo() {
    if (!newPromo.title || !newPromo.message) return
    const { data, error } = await supabase.from('promotions').insert(newPromo).select().single()
    if (!error && data) {
      setPromotions((prev) => [data, ...prev])
      setNewPromo({ title: '', message: '' })
    }
  }

  async function togglePromo(id, active) {
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, active: !active } : p)))
    await supabase.from('promotions').update({ active: !active }).eq('id', id)
  }

  function exportCSV() {
    const rows = [
      ['Cliente', 'N° socio', 'Nivel', 'Puntos', 'Última visita'],
      ...customers.map((c) => [c.full_name, c.member_number, c.tier, c.points, c.last_visit_at ?? ''])
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'club-varos-estadisticas.csv'
    link.click()
  }

  return (
    <div className="px-4 pt-8 pb-10">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase">Varo's</div>
          <h1 className="font-head text-2xl font-semibold">Panel admin</h1>
        </div>
        <button onClick={exportCSV} className="font-head text-xs font-semibold px-3 py-2 rounded-lg border border-ember/30 bg-ember/10 text-ember">
          ⬇ Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
          <div className="text-[11px] text-paper/50 mb-1">Socios</div>
          <div className="font-display text-3xl">{customers.length}</div>
        </div>
        <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
          <div className="text-[11px] text-paper/50 mb-1">Canjes registrados</div>
          <div className="font-display text-3xl text-ember">{redemptions.length}</div>
        </div>
      </div>

      {/* ---- QR DE CHECK-IN DEL LOCAL (nuevo) ---- */}
      <h3 className="font-head font-semibold text-sm mb-2">QR de bienvenida del local</h3>
      <div className="bg-inkSoft border border-ember/20 rounded-2xl p-4 mb-6 flex flex-col items-center text-center gap-3">
        <p className="text-xs text-paper/55 max-w-xs">
          Imprime este código y ponlo en tus mesas o en la entrada. Cada cliente lo escanea con la cámara
          de su celular, entra con su email y su visita queda registrada automáticamente (+1 estrella ⭐).
        </p>
        <div className="bg-white p-3 rounded-xl">
          <QRCodeSVG value={checkinUrl} size={160} />
        </div>
        <input
          value={checkinUrl}
          onChange={(e) => setCheckinUrl(e.target.value)}
          className="w-full bg-ink border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono text-center"
        />
        <p className="text-[10px] text-paper/35">
          Ahora mismo apunta a tu dirección local — cuando publiques la app (paso 6 del README), reemplaza este texto
          por tu URL final (ej. https://club.varos.cl/checkin) antes de imprimir el QR definitivo.
        </p>
      </div>

      {/* ---- PREMIO DE 5 ESTRELLAS (nuevo) ---- */}
      <h3 className="font-head font-semibold text-sm mb-2">Premio por 5 estrellas</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6 flex flex-col gap-2">
        <p className="text-[11px] text-paper/45">
          Lo que gana el cliente al completar sus 5 visitas. Se muestra en su ticket ganador.
        </p>
        <div className="flex gap-2">
          <input
            value={premioEstrellas}
            onChange={(e) => setPremioEstrellas(e.target.value)}
            placeholder="Ej: Postre a elección"
            className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <button
            onClick={guardarPremioEstrellas}
            disabled={savingPremio}
            className="px-4 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
          >
            {savingPremio ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={toggleVisiblePremio}
            className={`px-3 rounded-lg font-head font-semibold text-xs border whitespace-nowrap ${premioVisible ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
          >
            {premioVisible ? 'Visible' : 'No visible'}
          </button>
        </div>
        <p className="text-[10px] text-paper/35">
          {premioVisible
            ? 'El cliente ve el nombre del premio en su ticket ganador.'
            : 'El cliente NO ve el nombre del premio — solo el garzón sabrá cuál es.'}
        </p>
      </div>

      {/* ---- CLIENTES Y SU PREMIO POR ESTRELLAS (nuevo) ---- */}
      <h3 className="font-head font-semibold text-sm mb-2">Clientes — premio al llegar a 5 estrellas</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
        {customers.map((c) => (
          <div key={c.id} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div>
              <div className="text-paper">{c.full_name}</div>
              <div className="text-paper/40 text-[10px]">{c.estrellas_actuales ?? 0} de 5 ⭐</div>
            </div>
            <span className="text-ember text-[11px] text-right max-w-[140px]">
              {premioEstrellas ? `Ganaría: ${premioEstrellas}` : 'Sin premio configurado'}
            </span>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs py-2">Sin clientes registrados aún.</p>}
      </div>

      {/* ---- MENÚ (nuevo) ---- */}
      <h3 className="font-head font-semibold text-sm mb-2">Menú del restaurante</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-3">
        <div className="flex flex-col gap-2 mb-3">
          <input
            placeholder="Nombre del plato"
            value={newDish.name}
            onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <input
            placeholder="Descripción"
            value={newDish.description}
            onChange={(e) => setNewDish({ ...newDish, description: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Precio CLP"
              value={newDish.price_clp}
              onChange={(e) => setNewDish({ ...newDish, price_clp: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <select
              value={newDish.category}
              onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
            >
              <option>Entradas</option>
              <option>Platos principales</option>
              <option>Postres</option>
              <option>Bebidas</option>
            </select>
          </div>
          <button
            onClick={addDish}
            disabled={savingDish}
            className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink"
          >
            {savingDish ? 'Agregando…' : '+ Agregar plato al menú'}
          </button>
        </div>

        <div className="flex flex-col">
          {menuItems.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
              <div className="flex-1">
                <div className={m.available ? 'text-paper' : 'text-paper/30 line-through'}>{m.name}</div>
                <div className="text-paper/35 text-[10px]">{m.category}</div>
              </div>
              <input
                type="number"
                value={m.price_clp}
                onChange={(e) => updateDishPrice(m.id, Number(e.target.value))}
                className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
              />
              <button onClick={() => toggleDish(m.id, m.available)} className="px-2 py-1 rounded-md border border-white/10 text-[10px]">
                {m.available ? 'Ocultar' : 'Mostrar'}
              </button>
              <button onClick={() => deleteDish(m.id)} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px]">
                Eliminar
              </button>
            </div>
          ))}
          {menuItems.length === 0 && <p className="text-paper/35 text-xs py-2">Aún no has agregado platos — usa el formulario de arriba.</p>}
        </div>
      </div>

      {/* ---- PROMOCIONES (nuevo) ---- */}
      <h3 className="font-head font-semibold text-sm mb-2 mt-6">Promociones</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
        <div className="flex flex-col gap-2 mb-3">
          <input
            placeholder="Título (ej. 2x1 en pisco sour)"
            value={newPromo.title}
            onChange={(e) => setNewPromo({ ...newPromo, title: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <input
            placeholder="Mensaje para el cliente"
            value={newPromo.message}
            onChange={(e) => setNewPromo({ ...newPromo, message: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <button onClick={addPromo} className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink">
            + Crear promoción
          </button>
        </div>
        {promotions.map((p) => (
          <div key={p.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div>
              <div className="text-paper">{p.title}</div>
              <div className="text-paper/40 text-[10px]">{p.message}</div>
            </div>
            <button
              onClick={() => togglePromo(p.id, p.active)}
              className={`px-2 py-1 rounded-md text-[10px] border ${p.active ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
            >
              {p.active ? 'Activa' : 'Inactiva'}
            </button>
          </div>
        ))}
        {promotions.length === 0 && <p className="text-paper/35 text-xs">Sin promociones creadas.</p>}
      </div>

      <h3 className="font-head font-semibold text-sm mb-2">Regla de puntos</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6 flex items-center gap-2 text-xs">
        <span>Cada</span>
        <input type="number" value={rule} onChange={(e) => updateRule(Number(e.target.value))} className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember" />
        <span>CLP = 1 punto</span>
      </div>

      <h3 className="font-head font-semibold text-sm mb-2">Recompensas</h3>
      <p className="text-[11px] text-paper/40 mb-2">Elige qué recompensas ven tus clientes en "Canjea tus puntos".</p>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
        {rewards.map((r) => (
          <div key={r.id} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span className={r.active ? 'text-paper' : 'text-paper/30 line-through'}>{r.icon} {r.name}</span>
            <input
              type="number"
              value={r.cost_points}
              onChange={(e) => updateRewardCost(r.id, Number(e.target.value))}
              className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember"
            />
            <button
              onClick={() => toggleReward(r.id, r.active)}
              className={`px-2 py-1.5 rounded-md border text-[10px] whitespace-nowrap ${r.active ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
            >
              {r.active ? 'Visible' : 'Oculta'}
            </button>
          </div>
        ))}
        {rewards.length === 0 && <p className="text-paper/35 text-xs py-2">Aún no tienes recompensas creadas.</p>}
      </div>

      <h3 className="font-head font-semibold text-sm mb-2">Ranking de clientes</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
        {customers.slice(0, 8).map((c, i) => (
          <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span><span className="font-mono text-ember mr-2">{i + 1}</span>{c.full_name}</span>
            <span className="font-mono">{c.points}</span>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs">Sin datos aún.</p>}
      </div>

      <h3 className="font-head font-semibold text-sm mb-2">Clientes inactivos (+30 días)</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4 mb-6">
        {inactive.map((c) => (
          <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{c.full_name}</span>
            <span className="font-mono text-wineSoft bg-wine/20 px-2 py-0.5 rounded-full">
              {Math.floor((now - new Date(c.last_visit_at).getTime()) / 86400000)} días
            </span>
          </div>
        ))}
        {inactive.length === 0 && <p className="text-paper/35 text-xs">No hay clientes inactivos por ahora.</p>}
      </div>

      <h3 className="font-head font-semibold text-sm mb-2">Historial de canjes</h3>
      <div className="bg-inkSoft border border-white/5 rounded-2xl p-4">
        {redemptions.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{r.customers?.full_name} — {r.rewards?.name}</span>
            <span className="font-mono text-wineSoft">-{r.points_spent}</span>
          </div>
        ))}
        {redemptions.length === 0 && <p className="text-paper/35 text-xs">Sin canjes todavía.</p>}
      </div>
    </div>
  )
}
