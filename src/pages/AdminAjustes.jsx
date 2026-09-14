import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAdminData } from '../context/AdminDataContext.jsx'

// Todo lo que antes vivía dentro del acordeón "⚙️ Ajustes" de Admin.jsx, hoy
// como página propia — se accede por nav igual que Caja o Garzones, ya no
// hace falta desplegarla. Un solo scroll largo con sub-encabezados, sin
// acordeón envolvente (cada bloque conservó el suyo).
export default function AdminAjustes() {
  const { isAdmin, loading: authLoading } = useAuth()
  const {
    checkinUrl,
    setCheckinUrl,
    premioEstrellas,
    setPremioEstrellas,
    premioVisible,
    savingPremio,
    guardarPremioEstrellas,
    toggleVisiblePremio,
    promotions,
    newPromo,
    setNewPromo,
    enviandoPush,
    pushResultado,
    addPromo,
    togglePromo,
    deletePromo,
    customers,
    locationAlerts,
    newAlert,
    setNewAlert,
    addLocationAlert,
    updateAlertField,
    toggleAlertDia,
    deleteLocationAlert,
    rule,
    updateRule,
    rewards,
    updateRewardCost,
    toggleReward,
    inactive,
    now
  } = useAdminData()

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
    <div className="px-4 pt-8 pb-10 lg:px-6">
      <h1 className="font-head text-2xl font-semibold mb-6">Ajustes</h1>

      <div className="flex flex-col gap-6">
        {/* QR de bienvenida del local */}
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">QR de bienvenida del local</div>
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
        </div>

        {/* Premio por 5 estrellas: único sub-encabezado en gold — sigue
            tratado como la misma familia que la tarjeta gold de premios
            pendientes en la portada de /admin. */}
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold/70 mb-3">Premio por 5 estrellas</div>
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
        </div>

        {/* Campañas y notificaciones */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Campañas y notificaciones</span>
            <span className="font-mono text-[10px] text-paper/35">{promotions.length}</span>
          </div>
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
        </div>

        {/* Alertas por cercanía (GPS) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Alertas por cercanía (GPS)</span>
            <span className="font-mono text-[10px] text-paper/35">{locationAlerts.length}</span>
          </div>
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
        </div>

        {/* Regla de puntos */}
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">Regla de puntos — cada {rule} CLP = 1 punto</div>
          <div className="flex items-center gap-2 text-xs">
            <span>Cada</span>
            <input type="number" value={rule} onChange={(e) => updateRule(Number(e.target.value))} className="w-20 bg-ink border border-white/10 rounded-lg px-2 py-1.5 font-mono text-ember" />
            <span>CLP = 1 punto</span>
          </div>
        </div>

        {/* Recompensas */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Recompensas</span>
            <span className="font-mono text-[10px] text-paper/35">{rewards.length}</span>
          </div>
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
        </div>

        {/* Ranking de clientes */}
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35 mb-3">Ranking de clientes</div>
          {customers.slice(0, 8).map((c, i) => (
            <div key={c.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0 text-xs">
              <span><span className="font-mono text-ember mr-2">{i + 1}</span>{c.full_name}</span>
              <span className="font-mono">{c.points}</span>
            </div>
          ))}
          {customers.length === 0 && <p className="text-paper/35 text-xs">Sin datos aún.</p>}
        </div>

        {/* Clientes inactivos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper/35">Clientes inactivos (+30 días)</span>
            <span className="inline-block text-[10px] font-mono text-ember/90 bg-ember/10 border border-ember/20 rounded-full px-2 py-0.5">
              {inactive.length} clientes
            </span>
          </div>
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
      </div>
    </div>
  )
}
