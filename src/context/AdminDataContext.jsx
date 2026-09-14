import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext.jsx'

// Estado y handlers que antes vivían enteros dentro de Admin.jsx. Ahora los
// necesitan varias páginas a la vez (ej. `customers` lo consumen Clientes,
// Ajustes-Ranking y Ajustes-Inactivos), así que se cargan una sola vez acá y
// cada página pide con useAdminData() solo lo que le toca. Ningún RPC ni
// columna cambia — es 100% mover el "dónde vive el estado".
const AdminDataContext = createContext(null)

export function useAdminData() {
  const ctx = useContext(AdminDataContext)
  if (!ctx) {
    throw new Error('useAdminData() se llamó fuera de <AdminDataProvider>. Revisa que la página esté anidada bajo /admin.')
  }
  return ctx
}

export function AdminDataProvider({ children }) {
  const { isAdmin } = useAuth()
  const [customers, setCustomers] = useState([])
  const [rewards, setRewards] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [promotions, setPromotions] = useState([])
  const [rule, setRule] = useState(100)
  const [premiosGanados, setPremiosGanados] = useState([])
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
    const [c, r, rd, mi, pr, promo, premio, alerts, ganados] = await Promise.all([
      supabase.from('customers').select('*').order('points', { ascending: false }).limit(30),
      supabase.from('rewards').select('*').order('cost_points'),
      supabase.from('redemptions').select('*, customers(full_name), rewards(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('menu_items').select('*').order('category'),
      supabase.from('points_rules').select('*').eq('id', 1).single(),
      supabase.from('promotions').select('*').order('starts_at', { ascending: false }).limit(10),
      supabase.from('config_recompensa_estrellas').select('*').eq('id', 1).single(),
      supabase.from('location_alerts').select('*').order('created_at', { ascending: false }),
      // Premios de 5 estrellas, los pendientes primero. Sin esto la tabla se
      // escribía sola y nadie podía verla: el aviso de que alguien ganó vivía
      // solo en la pantalla del check-in y se perdía al cerrarla.
      supabase
        .from('premios_ganados')
        .select('*, customers(full_name, member_number)')
        .order('canjeado')
        .order('fecha_ganado', { ascending: false })
        .limit(50)
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
    setPremiosGanados(ganados.data ?? [])
  }

  useEffect(() => {
    if (isAdmin) loadAll()
  }, [isAdmin])

  async function entregarPremio(premio) {
    const nombre = premio.customers?.full_name ?? 'este cliente'
    if (!window.confirm(`¿Confirmas que le entregaste "${premio.producto}" a ${nombre}?`)) return
    const { data, error } = await supabase.rpc('admin_entregar_premio', { p_premio_id: premio.id })
    if (error) {
      alert('No se pudo marcar la entrega: ' + error.message)
      return
    }
    if (data === false) {
      alert('Ese premio ya figuraba como entregado.')
    }
    setPremiosGanados((prev) =>
      prev.map((p) => (p.id === premio.id ? { ...p, canjeado: true, fecha_canjeado: new Date().toISOString() } : p))
    )
  }

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

  const now = Date.now()
  const inactive = customers.filter((c) => c.last_visit_at && now - new Date(c.last_visit_at).getTime() > 30 * 86400000)
  const pendientes = premiosGanados.filter((p) => !p.canjeado)

  const value = {
    // datos
    customers,
    rewards,
    redemptions,
    menuItems,
    promotions,
    rule,
    premiosGanados,
    premioEstrellas,
    premioVisible,
    savingPremio,
    checkinUrl,
    setCheckinUrl,
    newDish,
    setNewDish,
    newPromo,
    setNewPromo,
    enviandoPush,
    pushResultado,
    savingDish,
    locationAlerts,
    newAlert,
    setNewAlert,
    setPremioEstrellas,
    // derivados
    now,
    inactive,
    pendientes,
    // handlers
    loadAll,
    entregarPremio,
    updateRewardCost,
    toggleReward,
    guardarPremioEstrellas,
    toggleVisiblePremio,
    eliminarCliente,
    agregarEstrella,
    quitarEstrella,
    updateRule,
    addDish,
    toggleDish,
    updateDishPrice,
    deleteDish,
    addPromo,
    enviarPushCampana,
    togglePromo,
    deletePromo,
    addLocationAlert,
    updateAlertField,
    toggleAlertDia,
    deleteLocationAlert,
    exportCSV
  }

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}
