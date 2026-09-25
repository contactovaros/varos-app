import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Historial de caja: lo cobrado en cualquier período, no solo hoy (pedido del
// usuario, 2026-09-25: "creo que solo guarda lo del día"). `pos_cobros`
// siempre guardó todo; lo que faltaba era poder mirarlo.
//
// Los días se cortan a medianoche de Chile, no de UTC. Antes "hoy" se armaba
// con toISOString(), que es UTC: después de las 21:00 (UTC-3) el día ya había
// cambiado y los cobros de la noche desaparecían del resumen del turno.

const MEDIOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }

const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mesAnterior', label: 'Mes anterior' },
  { id: 'rango', label: 'Elegir fechas' }
]

const COLUMNAS = 'id, mesa, sector, garzon, items, total, medio_pago, cobrado_por, created_at'

function clp(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function inicioDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function masDias(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

// 'yyyy-mm-dd' como medianoche local (new Date('yyyy-mm-dd') la toma en UTC).
function desdeISO(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function aISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Rango [ini, fin) en hora local.
function rangoDe(periodo, desde, hasta) {
  const hoy = inicioDia(new Date())
  switch (periodo) {
    case 'ayer':
      return [masDias(hoy, -1), hoy]
    case 'semana': {
      const lunes = masDias(hoy, -((hoy.getDay() + 6) % 7))
      return [lunes, masDias(hoy, 1)]
    }
    case 'mes':
      return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), masDias(hoy, 1)]
    case 'mesAnterior':
      return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 1)]
    case 'rango': {
      if (!desde || !hasta) return null
      const a = desdeISO(desde)
      const b = desdeISO(hasta)
      return a <= b ? [a, masDias(b, 1)] : [b, masDias(a, 1)]
    }
    default:
      return [hoy, masDias(hoy, 1)]
  }
}

// Supabase devuelve como mucho 1000 filas por consulta: un mes de caja puede
// pasar eso, así que se pide en páginas.
async function traerCobros(ini, fin) {
  const filas = []
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await supabase
      .from('pos_cobros')
      .select(COLUMNAS)
      .gte('created_at', ini.toISOString())
      .lt('created_at', fin.toISOString())
      .order('created_at', { ascending: false })
      .range(desde, desde + paso - 1)
    if (error) throw error
    filas.push(...(data ?? []))
    if (!data || data.length < paso) break
  }
  return filas
}

function descargarCSV(cobros, nombre) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const filas = [['Fecha', 'Hora', 'Mesa', 'Sector', 'Garzón', 'Medio de pago', 'Total', 'Cobró']]
  for (const c of [...cobros].reverse()) {
    const d = new Date(c.created_at)
    filas.push([aISO(d), hora(c.created_at), c.mesa, c.sector, c.garzon || '', MEDIOS[c.medio_pago] || c.medio_pago, Math.round(c.total), c.cobrado_por || ''])
  }
  // Punto y coma y BOM: así Excel en español lo abre en columnas y con tildes.
  const csv = '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

function IconoImpresora() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9V3.5h10V9" />
      <rect x="3.5" y="9" width="17" height="8" rx="1.5" />
      <path d="M7 14h10v6.5H7z" />
    </svg>
  )
}

function FilaCobro({ c, onImprimir }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="text-paper">
          Mesa {c.mesa} · {c.sector}
        </div>
        <div className="text-paper/55 text-[11px] truncate">
          {hora(c.created_at)} · {c.garzon || 'sin garzón'} · cobró {c.cobrado_por}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <div className="text-gold font-medium tabular-nums">{clp(c.total)}</div>
          <div className="text-paper/55 text-[11px]">{MEDIOS[c.medio_pago] || c.medio_pago}</div>
        </div>
        <button
          type="button"
          onClick={() => onImprimir(c)}
          aria-label={`Imprimir boleta de la mesa ${c.mesa}`}
          className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-paper/60 hover:text-gold hover:bg-paper/5"
        >
          <IconoImpresora />
        </button>
      </div>
    </li>
  )
}

export default function HistorialCaja({ onImprimir, recargar }) {
  const [periodo, setPeriodo] = useState('hoy')
  const hoyISO = aISO(new Date())
  const [desde, setDesde] = useState(hoyISO)
  const [hasta, setHasta] = useState(hoyISO)
  const [cobros, setCobros] = useState(null)
  const [error, setError] = useState('')
  const [diasAbiertos, setDiasAbiertos] = useState(() => new Set())

  const rango = useMemo(() => rangoDe(periodo, desde, hasta), [periodo, desde, hasta])

  useEffect(() => {
    if (!rango) return undefined
    let vigente = true
    setError('')
    setCobros(null)
    traerCobros(rango[0], rango[1])
      .then((filas) => vigente && setCobros(filas))
      .catch((e) => vigente && setError(e.message || 'No se pudo cargar el historial.'))
    return () => {
      vigente = false
    }
    // `recargar` cambia después de cada cobro: así el período que incluye hoy
    // se actualiza solo.
  }, [rango, recargar])

  const resumen = useMemo(() => {
    if (!cobros) return null
    let total = 0
    const porMedio = {}
    const porGarzon = {}
    const porDia = new Map()
    for (const c of cobros) {
      const monto = Number(c.total) || 0
      total += monto
      porMedio[c.medio_pago] = (porMedio[c.medio_pago] || 0) + monto
      const g = c.garzon || 'Sin garzón'
      porGarzon[g] = (porGarzon[g] || 0) + monto
      const dia = aISO(new Date(c.created_at))
      if (!porDia.has(dia)) porDia.set(dia, { total: 0, cobros: [] })
      const d = porDia.get(dia)
      d.total += monto
      d.cobros.push(c)
    }
    return {
      total,
      cantidad: cobros.length,
      promedio: cobros.length ? total / cobros.length : 0,
      porMedio: Object.entries(porMedio).sort((a, b) => b[1] - a[1]),
      porGarzon: Object.entries(porGarzon).sort((a, b) => b[1] - a[1]),
      porDia: [...porDia.entries()]
    }
  }, [cobros])

  const unSoloDia = resumen && resumen.porDia.length <= 1
  const maxDia = resumen ? Math.max(1, ...resumen.porDia.map(([, d]) => d.total)) : 1

  function toggleDia(dia) {
    setDiasAbiertos((prev) => {
      const next = new Set(prev)
      next.has(dia) ? next.delete(dia) : next.add(dia)
      return next
    })
  }

  const tituloPeriodo = PERIODOS.find((p) => p.id === periodo)?.label

  return (
    <section aria-labelledby="titulo-historial" className="bg-inkSoft border border-gold/25 rounded-2xl p-4 mb-4">
      <h2 id="titulo-historial" className="font-head text-[11px] font-semibold uppercase tracking-wider text-paper/60 mb-3">
        Historial de caja
      </h2>

      <div className="flex gap-1.5 flex-wrap mb-3" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={periodo === p.id}
            onClick={() => {
              setPeriodo(p.id)
              setDiasAbiertos(new Set())
            }}
            className={`px-3 py-1.5 rounded-full text-[11.5px] border transition-colors duration-150 ease-salida ${
              periodo === p.id ? 'border-gold text-gold bg-gold/10' : 'border-paper/20 text-paper/70 hover:border-paper/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'rango' && (
        <div className="flex gap-2 mb-3">
          <label className="flex-1 text-[11px] text-paper/60">
            Desde
            <input
              type="date"
              value={desde}
              max={hoyISO}
              onChange={(e) => setDesde(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-paper/25 px-2.5 py-2 text-paper text-xs"
            />
          </label>
          <label className="flex-1 text-[11px] text-paper/60">
            Hasta
            <input
              type="date"
              value={hasta}
              max={hoyISO}
              onChange={(e) => setHasta(e.target.value)}
              className="mt-1 w-full rounded-lg bg-ink border border-paper/25 px-2.5 py-2 text-paper text-xs"
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-[#F07C88]">
          {error}
        </p>
      )}
      {!error && !resumen && <p className="text-xs text-paper/55">Cargando…</p>}

      {resumen && resumen.cantidad === 0 && (
        <p className="text-xs text-paper/55">Sin cobros en este período.</p>
      )}

      {resumen && resumen.cantidad > 0 && (
        <>
          <div className="text-2xl font-head font-semibold text-gold tabular-nums">{clp(resumen.total)}</div>
          <div className="text-[11.5px] text-paper/60 mt-0.5">
            {resumen.cantidad} {resumen.cantidad === 1 ? 'mesa cobrada' : 'mesas cobradas'} · promedio {clp(resumen.promedio)}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 text-xs">
            <div>
              <dt className="text-[11px] text-paper/55 mb-1">Por medio de pago</dt>
              {resumen.porMedio.map(([m, monto]) => (
                <dd key={m} className="flex justify-between gap-2">
                  <span className="text-paper/80">{MEDIOS[m] || m}</span>
                  <span className="tabular-nums text-paper">{clp(monto)}</span>
                </dd>
              ))}
            </div>
            <div>
              <dt className="text-[11px] text-paper/55 mb-1">Por garzón</dt>
              {resumen.porGarzon.map(([g, monto]) => (
                <dd key={g} className="flex justify-between gap-2">
                  <span className="text-paper/80 truncate">{g}</span>
                  <span className="tabular-nums text-paper">{clp(monto)}</span>
                </dd>
              ))}
            </div>
          </dl>

          <div className="mt-4 pt-3 border-t border-paper/10">
            {unSoloDia ? (
              <ul className="divide-y divide-paper/5">
                {resumen.porDia[0][1].cobros.map((c) => (
                  <FilaCobro key={c.id} c={c} onImprimir={onImprimir} />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-paper/5">
                {resumen.porDia.map(([dia, d]) => {
                  const abierto = diasAbiertos.has(dia)
                  const fecha = desdeISO(dia).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <li key={dia} className="py-1.5">
                      <button
                        type="button"
                        aria-expanded={abierto}
                        onClick={() => toggleDia(dia)}
                        className="w-full flex items-center gap-3 py-1 text-xs text-left"
                      >
                        <span className="w-24 shrink-0 text-paper capitalize">{fecha}</span>
                        {/* Barra proporcional al día más alto del período. */}
                        <span className="flex-1 h-1.5 rounded-full bg-paper/5 overflow-hidden" aria-hidden="true">
                          <span className="block h-full rounded-full bg-gold/60" style={{ width: `${(d.total / maxDia) * 100}%` }} />
                        </span>
                        <span className="w-20 shrink-0 text-right tabular-nums text-gold">{clp(d.total)}</span>
                        <span className={`text-gold text-[10px] transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true">
                          ▾
                        </span>
                      </button>
                      {abierto && (
                        <ul className="mt-1 mb-1 pl-2 border-l border-gold/20 divide-y divide-paper/5">
                          {d.cobros.map((c) => (
                            <FilaCobro key={c.id} c={c} onImprimir={onImprimir} />
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => descargarCSV(cobros, `caja-${aISO(rango[0])}-a-${aISO(masDias(rango[1], -1))}.csv`)}
            className="mt-3 text-[11.5px] text-gold underline decoration-gold/40 py-1"
          >
            Descargar {tituloPeriodo?.toLowerCase()} en Excel (CSV)
          </button>
        </>
      )}
    </section>
  )
}
