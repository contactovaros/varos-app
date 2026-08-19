import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext.jsx'

function Seccion({ titulo, subtitulo, children }) {
  return (
    <details className="group bg-inkSoft border border-white/5 rounded-2xl mb-4">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div>
          <div className="font-head font-semibold text-sm">{titulo}</div>
          {subtitulo && <div className="text-[11px] text-paper/40 mt-0.5">{subtitulo}</div>}
        </div>
        <span className="text-ember text-sm shrink-0 transition-transform duration-200 group-open:rotate-180">▾</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

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
  const [newPromo, setNewPromo] = useState({ title: '', message: '', target_customer_id: '', enviarPush: false })
  const [enviandoPush, setEnviandoPush] = useState(false)
  const [pushResultado, setPushResultado] = useState('')
  const [savingDish, setSavingDish] = useState(false)
  const [locationAlerts, setLocationAlerts] = useState([])
  const [newAlert, setNewAlert] = useState({ titulo: '', mensaje: '', lat: '', lng: '' })

  async function loadAll() {
    const [c, r, rd, mi, pr, promo, premio, alerts] = await Promise.all([
      supabase.from('customers').select('*').order('points', { ascending: false }).limit(30),
      supabase.from('rewards').select('*').order('cost_points'),
      supabase.from('redemptions').select('*, customers(full_name), rewards(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('menu_items').select('*').order('category'),
      supabase.from('points_rules').select('*').eq('id', 1).single(),
      supabase.from('promotions').select('*').order('starts_at', { ascending: false }).limit(10),
      supabase.from('config_recompensa_estrellas').select('*').eq('id', 1).single(),
      supabase.from('location_alerts').select('*').order('created_at', { ascending: false })
    ])
    setCustomers(c.data ?? [])
    setRewards(r.data ?? [])
    setRedemptions(rd.data ?? [])
    setMenuItems(mi.data ?? [])
    setRule(pr.data?.clp_per_point ?? 100)
    setPromotions(promo.data ?? [])
    setPremioEstrellas(premio.data?.producto ?? '')
    setPremioVisible(premio.data?.visible ?? true)
    setLocationAlerts(alerts.data ?? [])
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

  async function eliminarCliente(c) {
    const escrito = window.prompt(
      `Esto borrará PERMANENTEMENTE a "${c.full_name}" y todo su historial (visitas, estrellas, canjes, pedidos).\n\nEscribe su nombre completo exactamente para confirmar:`
    )
    if (escrito === null) return
    if (escrito.trim() !== c.full_name) {
      alert('El nombre no coincide. No se eliminó al cliente.')
      return
    }
    if (!window.confirm(`Última confirmación: ¿eliminar a "${c.full_name}" para siempre?`)) return

    const { error } = await supabase.rpc('admin_delete_customer', { p_customer_id: c.id })
    if (error) {
      alert('No se pudo eliminar al cliente: ' + error.message)
      return
    }
    setCustomers((prev) => prev.filter((x) => x.id !== c.id))
  }

  async function agregarEstrella(c) {
    const { data, error } = await supabase.rpc('admin_add_star', { p_customer_id: c.id })
    if (error) {
      alert('No se pudo agregar la estrella: ' + error.message)
      return
    }
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: data.estrellas } : x)))
    if (data.gano_premio) {
      alert(`🎉 ${c.full_name} llegó a 5 estrellas y ganó: ${data.producto}`)
    }
  }

  async function quitarEstrella(c) {
    const actual = c.estrellas_actuales ?? 0
    if (actual <= 0) return
    const nuevo = actual - 1
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: nuevo } : x)))
    const { error } = await supabase.from('customers').update({ estrellas_actuales: nuevo }).eq('id', c.id)
    if (error) {
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, estrellas_actuales: actual } : x)))
      alert('No se pudo quitar la estrella.')
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
    const payload = {
      title: newPromo.title,
      message: newPromo.message,
      target_customer_id: newPromo.target_customer_id || null
    }
    const { data, error } = await supabase.from('promotions').insert(payload).select().single()
    if (!error && data) {
      setPromotions((prev) => [data, ...prev])
      if (newPromo.enviarPush) {
        await enviarPushCampana(newPromo.title, newPromo.message, newPromo.target_customer_id || null)
      }
      setNewPromo({ title: '', message: '', target_customer_id: '', enviarPush: false })
    }
  }

  async function enviarPushCampana(title, body, customerId) {
    setEnviandoPush(true)
    setPushResultado('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title, body, customerId })
      })
      // La función puede caerse antes de responder JSON (ej. un crash del runtime
      // devuelve el stack en texto plano), así que leemos como texto y luego
      // intentamos parsear — si no, mostramos el cuerpo crudo con el status.
      const texto = await res.text()
      let json = null
      try {
        json = JSON.parse(texto)
      } catch {
        // se queda en null: el cuerpo no era JSON
      }
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status} — ${texto.slice(0, 300)}`)
      }
      setPushResultado(`🔔 Enviado a ${json.enviados} de ${json.total} dispositivos suscritos.`)
    } catch (e) {
      console.error('[push] fallo el envío', e)
      setPushResultado('⚠️ ' + e.message)
    } finally {
      setEnviandoPush(false)
    }
  }

  async function togglePromo(id, active) {
    setPromotions((prev) => prev.map((p) => (p.id === id ? { ...p, active: !active } : p)))
    await supabase.from('promotions').update({ active: !active }).eq('id', id)
  }

  async function deletePromo(id) {
    if (!window.confirm('¿Eliminar esta campaña/notificación?')) return
    setPromotions((prev) => prev.filter((p) => p.id !== id))
    await supabase.from('promotions').delete().eq('id', id)
  }

  async function addLocationAlert() {
    if (!newAlert.titulo || !newAlert.mensaje || !newAlert.lat || !newAlert.lng) return
    const { data, error } = await supabase
      .from('location_alerts')
      .insert({
        titulo: newAlert.titulo,
        mensaje: newAlert.mensaje,
        lat: Number(newAlert.lat),
        lng: Number(newAlert.lng)
      })
      .select()
      .single()
    if (!error && data) {
      setLocationAlerts((prev) => [data, ...prev])
      setNewAlert({ titulo: '', mensaje: '', lat: '', lng: '' })
    }
  }

  async function updateAlertField(id, field, value) {
    setLocationAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
    await supabase.from('location_alerts').update({ [field]: value }).eq('id', id)
  }

  function toggleAlertDia(alert, dia) {
    const actuales = alert.dias_semana ?? []
    const nuevos = actuales.includes(dia) ? actuales.filter((d) => d !== dia) : [...actuales, dia].sort()
    updateAlertField(alert.id, 'dias_semana', nuevos)
  }

  async function deleteLocationAlert(id) {
    if (!window.confirm('¿Eliminar esta alerta de cercanía?')) return
    setLocationAlerts((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('location_alerts').delete().eq('id', id)
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

      <Link
        to="/admin/mesa-trabajo"
        className="flex items-center justify-between bg-inkSoft border border-ember/20 rounded-2xl p-4 mb-3"
      >
        <div>
          <div className="font-head font-semibold text-sm">🗂️ Mesa de trabajo</div>
          <div className="text-[11px] text-paper/45 mt-0.5">
            Reservas del día junto al plano — toca una mesa reservada para ver el cliente y escribirle por WhatsApp
          </div>
        </div>
        <span className="text-ember text-lg">→</span>
      </Link>

      <Link
        to="/admin/mesas"
        className="flex items-center justify-between bg-inkSoft border border-ember/20 rounded-2xl p-4 mb-3"
      >
        <div>
          <div className="font-head font-semibold text-sm">🥂 Editar planos y mesas</div>
          <div className="text-[11px] text-paper/45 mt-0.5">
            Comedor Exterior, Comedor Principal y Terraza — mover, agrandar y bloquear mesas
          </div>
        </div>
        <span className="text-ember text-lg">→</span>
      </Link>

      <Link
        to="/admin/resenas"
        className="flex items-center justify-between bg-inkSoft border border-ember/20 rounded-2xl p-4 mb-6"
      >
        <div>
          <div className="font-head font-semibold text-sm">⭐ Reseñas de Google</div>
          <div className="text-[11px] text-paper/45 mt-0.5">
            Puntaje y reseñas de Varo's Restaurant & Eventos
          </div>
        </div>
        <span className="text-ember text-lg">→</span>
      </Link>

      {/* ---- QR DE CHECK-IN DEL LOCAL (nuevo) ---- */}
      <Seccion titulo="📱 QR de bienvenida del local">
        <div className="flex flex-col items-center text-center gap-3">
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
      </Seccion>

      {/* ---- PREMIO DE 5 ESTRELLAS (nuevo) ---- */}
      <Seccion titulo="🎁 Premio por 5 estrellas">
        <div className="flex flex-col gap-2">
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
      </Seccion>

      {/* ---- CLIENTES Y SU PREMIO POR ESTRELLAS (nuevo) ---- */}
      <Seccion titulo="⭐ Clientes — premio al llegar a 5 estrellas" subtitulo={`${customers.length} clientes`}>
        {customers.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex justify-between items-center gap-2">
              <div>
                <div className="text-paper">{c.full_name}</div>
                <div className="text-paper/40 text-[10px]">{c.estrellas_actuales ?? 0} de 5 ⭐</div>
              </div>
              <span className="text-ember text-[11px] text-right max-w-[110px]">
                {premioEstrellas ? `Ganaría: ${premioEstrellas}` : 'Sin premio configurado'}
              </span>
            </div>
            <div className="flex justify-end items-center gap-1.5">
              <button
                onClick={() => quitarEstrella(c)}
                disabled={(c.estrellas_actuales ?? 0) <= 0}
                className="w-6 h-6 rounded-md border border-white/10 text-paper/60 disabled:opacity-30"
              >
                −
              </button>
              <button
                onClick={() => agregarEstrella(c)}
                className="w-6 h-6 rounded-md border border-ember/40 text-ember"
              >
                +
              </button>
              <button
                onClick={() => eliminarCliente(c)}
                className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs py-2">Sin clientes registrados aún.</p>}
      </Seccion>

      {/* ---- MENÚ (nuevo) ---- */}
      <Seccion titulo="🍽️ Menú del restaurante" subtitulo={`${menuItems.length} platos`}>
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
      </Seccion>

      {/* ---- CAMPAÑAS / NOTIFICACIONES (nuevo) ---- */}
      <Seccion titulo="📣 Campañas y notificaciones" subtitulo={`${promotions.length} campañas`}>
        <p className="text-[11px] text-paper/45 mb-2">
          Escribe un título y un mensaje, elige a quién va dirigido, y aparecerá dentro de la app del cliente en su Club Varo's.
        </p>
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
          <select
            value={newPromo.target_customer_id}
            onChange={(e) => setNewPromo({ ...newPromo, target_customer_id: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          >
            <option value="">Todos los clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[11px] text-paper/60 px-1">
            <input
              type="checkbox"
              checked={newPromo.enviarPush}
              onChange={(e) => setNewPromo({ ...newPromo, enviarPush: e.target.checked })}
            />
            🔔 Enviar también como notificación push (a quienes las activaron)
          </label>
          <button
            onClick={addPromo}
            disabled={enviandoPush}
            className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink disabled:opacity-50"
          >
            {enviandoPush ? 'Enviando push…' : '+ Enviar campaña'}
          </button>
          {pushResultado && <p className="text-[11px] text-paper/50">{pushResultado}</p>}
        </div>
        {promotions.map((p) => (
          <div key={p.id} className="flex justify-between items-center gap-2 py-2 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex-1">
              <div className="text-paper">{p.title}</div>
              <div className="text-paper/40 text-[10px]">{p.message}</div>
              <div className="text-ember/70 text-[10px] mt-0.5">
                {p.target_customer_id ? (customers.find((c) => c.id === p.target_customer_id)?.full_name ?? 'Cliente eliminado') : 'Todos los clientes'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => togglePromo(p.id, p.active)}
                className={`px-2 py-1 rounded-md text-[10px] border whitespace-nowrap ${p.active ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
              >
                {p.active ? 'Activa' : 'Inactiva'}
              </button>
              <button onClick={() => deletePromo(p.id)} className="px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {promotions.length === 0 && <p className="text-paper/35 text-xs">Sin campañas creadas.</p>}
      </Seccion>

      {/* ---- ALERTAS POR CERCANÍA / GPS (nuevo) ---- */}
      <Seccion titulo="📍 Alertas por cercanía (GPS)" subtitulo={`${locationAlerts.length} alertas`}>
        <p className="text-[11px] text-paper/45 mb-3">
          Un mensaje distinto según en qué coordenada esté el cliente. Ojo: NO es una notificación push del celular
          (eso requiere una app nativa) — es un aviso que aparece dentro de la app cuando el cliente la tiene abierta
          y su GPS lo ubica cerca de ese punto, en el día y horario que configures.
        </p>
        <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/5">
          <input
            placeholder="Título (ej. Publicidad zona 3)"
            value={newAlert.titulo}
            onChange={(e) => setNewAlert({ ...newAlert, titulo: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <input
            placeholder="Mensaje para el cliente"
            value={newAlert.mensaje}
            onChange={(e) => setNewAlert({ ...newAlert, mensaje: e.target.value })}
            className="bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <input
              placeholder="Latitud (ej. -18.489485)"
              value={newAlert.lat}
              onChange={(e) => setNewAlert({ ...newAlert, lat: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
            />
            <input
              placeholder="Longitud (ej. -70.285883)"
              value={newAlert.lng}
              onChange={(e) => setNewAlert({ ...newAlert, lng: e.target.value })}
              className="flex-1 bg-ink border border-white/10 rounded-lg px-3 py-2 text-xs font-mono"
            />
          </div>
          <button onClick={addLocationAlert} className="py-2.5 rounded-lg font-head font-semibold text-xs bg-gradient-to-br from-ember to-emberDark text-ink">
            + Agregar coordenada
          </button>
        </div>

        {locationAlerts.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 py-3 border-b border-white/5 last:border-b-0 text-xs">
            <div className="flex justify-between items-start gap-2">
              <input
                defaultValue={a.titulo}
                onBlur={(e) => e.target.value !== a.titulo && updateAlertField(a.id, 'titulo', e.target.value)}
                className="flex-1 bg-ink border border-white/10 rounded-lg px-2 py-1.5 text-paper font-head font-semibold"
              />
              <button
                onClick={() => updateAlertField(a.id, 'activo', !a.activo)}
                className={`px-2 py-1 rounded-md text-[10px] border whitespace-nowrap ${a.activo ? 'border-ember/40 text-ember' : 'border-white/10 text-paper/40'}`}
              >
                {a.activo ? 'Activa' : 'Inactiva'}
              </button>
            </div>
            <textarea
              defaultValue={a.mensaje}
              onBlur={(e) => e.target.value !== a.mensaje && updateAlertField(a.id, 'mensaje', e.target.value)}
              className="bg-ink border border-white/10 rounded-lg px-2 py-1.5 text-paper/70 resize-none"
              rows={2}
            />
            <div className="text-paper/35 text-[10px] font-mono">
              📍 {a.lat}, {a.lng} — radio {a.radio_metros} m
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((letra, dia) => (
                <button
                  key={dia}
                  onClick={() => toggleAlertDia(a, dia)}
                  className={`w-6 h-6 rounded-md border text-[10px] ${
                    (a.dias_semana ?? []).includes(dia) || !a.dias_semana?.length
                      ? 'border-ember/40 text-ember'
                      : 'border-white/10 text-paper/30'
                  }`}
                  title={(a.dias_semana ?? []).length === 0 ? 'Todos los días (toca para elegir días específicos)' : undefined}
                >
                  {letra}
                </button>
              ))}
              <span className="text-paper/30 text-[10px] ml-1">{(a.dias_semana ?? []).length === 0 ? 'todos los días' : 'días marcados'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-paper/40 text-[10px]">Desde</span>
              <input
                type="time"
                defaultValue={a.hora_inicio ?? ''}
                onBlur={(e) => updateAlertField(a.id, 'hora_inicio', e.target.value || null)}
                className="bg-ink border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono"
              />
              <span className="text-paper/40 text-[10px]">hasta</span>
              <input
                type="time"
                defaultValue={a.hora_fin ?? ''}
                onBlur={(e) => updateAlertField(a.id, 'hora_fin', e.target.value || null)}
                className="bg-ink border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono"
              />
              <button onClick={() => deleteLocationAlert(a.id)} className="ml-auto px-2 py-1 rounded-md border border-wine/40 text-wineSoft text-[10px] whitespace-nowrap">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {locationAlerts.length === 0 && <p className="text-paper/35 text-xs">Sin alertas configuradas.</p>}
      </Seccion>

      <Seccion titulo="💰 Regla de puntos" subtitulo={`Cada ${rule} CLP = 1 punto`}>
        <div className="flex items-center gap-2 text-xs">
          <span>Cada</span>
          <input type="number" value={rule} onChange={(e) => updateRule(Number(e.target.value))} className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember" />
          <span>CLP = 1 punto</span>
        </div>
      </Seccion>

      <Seccion titulo="🏆 Recompensas" subtitulo={`${rewards.length} recompensas`}>
        <p className="text-[11px] text-paper/40 mb-2">Elige qué recompensas ven tus clientes en "Canjea tus puntos".</p>
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
      </Seccion>

      <Seccion titulo="📊 Ranking de clientes">
        {customers.slice(0, 8).map((c, i) => (
          <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span><span className="font-mono text-ember mr-2">{i + 1}</span>{c.full_name}</span>
            <span className="font-mono">{c.points}</span>
          </div>
        ))}
        {customers.length === 0 && <p className="text-paper/35 text-xs">Sin datos aún.</p>}
      </Seccion>

      <Seccion titulo="😴 Clientes inactivos (+30 días)" subtitulo={`${inactive.length} clientes`}>
        {inactive.map((c) => (
          <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{c.full_name}</span>
            <span className="font-mono text-wineSoft bg-wine/20 px-2 py-0.5 rounded-full">
              {Math.floor((now - new Date(c.last_visit_at).getTime()) / 86400000)} días
            </span>
          </div>
        ))}
        {inactive.length === 0 && <p className="text-paper/35 text-xs">No hay clientes inactivos por ahora.</p>}
      </Seccion>

      <Seccion titulo="🧾 Historial de canjes" subtitulo={`${redemptions.length} canjes`}>
        {redemptions.map((r) => (
          <div key={r.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
            <span>{r.customers?.full_name} — {r.rewards?.name}</span>
            <span className="font-mono text-wineSoft">-{r.points_spent}</span>
          </div>
        ))}
        {redemptions.length === 0 && <p className="text-paper/35 text-xs">Sin canjes todavía.</p>}
      </Seccion>
    </div>
  )
}
