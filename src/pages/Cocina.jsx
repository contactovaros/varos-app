import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cocinaEstado,
  cocinaMarcar,
  barraEstado,
  barraMarcar,
  notificarGarzon,
  esModoDemo
} from '../lib/comandasApi.js'
import { useSistemaComandas, nombreSistema } from '../components/SistemaComandas.jsx'

// Pantalla de cocina (/cocina, con ?tv=1 para la TV: solo mirar).
//
// La MISMA pantalla sirve a la barra (/barra): la prop `estacion` ('cocina' por
// defecto | 'barra') elige el par de RPC, el título y los textos. La barra tiene
// estado propio en la base (add_barra.sql), así que marcar "Listo" acá no toca lo
// de cocina. Ver varos-pos/DECISIONES.md, "Pantalla de barra (/barra)".
//
// PORTA el comportamiento ya probado de la pantalla del Worker varos-kds
// (PAGE_KDS en varos-kds/worker.js); no es un rediseño. La usa el cocinero bajo
// presión: manda la legibilidad y la velocidad de lectura, por eso conserva la
// paleta y la tipografía de la pantalla original (no los tokens del club).
// Ver varos-pos/DECISIONES.md, "Comandas y pantalla de cocina en Supabase".
//
// Acceso: SIN sesión de admin. Entra con un CÓDIGO de cocina propio, validado
// por las funciones de base (cocina_estado / cocina_marcar), guardado en el
// localStorage de la tablet igual que Mozo guarda el código de garzón. Ese
// código solo permite leer comandas de cocina y marcar estados.
//
// Consumo: consulta cada ~8 s mandando la `version` que ya vio; si nada cambió
// la respuesta es mínima y no se vuelve a pintar el tablero.

// Cada estación tiene su PROPIO código de acceso (cocina: pos_config.codigo_cocina;
// barra: pos_config.codigo_barra) y todo su estado local va aparte, para que
// código, comandas ocultas, pestaña y sonido de una pantalla no se mezclen con los
// de la otra en el mismo aparato.

const ESTACIONES = {
  cocina: {
    titulo: 'COCINA',
    nombreCodigo: 'Código de cocina',
    errorCodigo: 'Código de cocina inválido', // mensaje de la base
    avisoCodigo: 'El código de cocina cambió o ya no es válido. Escribilo de nuevo.',
    ayudaCodigo: 'Pedile el código a quien administra el sistema.',
    codigoKey: 'varos_cocina_codigo',
    lugar: 'la cocina', // "NO SE PUDO LEER LA COCINA"
    ruta: '/cocina',
    unidad: 'platos',
    voz: 'Entrando comanda',
    estado: cocinaEstado,
    marcar: cocinaMarcar,
    ocultasKey: 'varos_cocina_ocultas',
    tabKey: 'varos_cocina_tab',
    sonidoKey: 'varos_cocina_sonido',
    avisoAnterior: 'usá la pantalla de cocina de siempre.'
  },
  barra: {
    titulo: 'BARRA',
    nombreCodigo: 'Código de la barra',
    errorCodigo: 'Código de barra inválido', // mensaje de la base
    avisoCodigo: 'El código de la barra cambió o ya no es válido. Escribilo de nuevo.',
    ayudaCodigo: 'Pedile el código de la barra a quien administra el sistema.',
    codigoKey: 'varos_barra_codigo',
    lugar: 'la barra',
    ruta: '/barra',
    unidad: 'bebidas',
    voz: 'Entrando comanda de barra',
    estado: barraEstado,
    marcar: barraMarcar,
    ocultasKey: 'varos_barra_ocultas',
    tabKey: 'varos_barra_tab',
    sonidoKey: 'varos_barra_sonido',
    avisoAnterior: 'por ahora las bebidas se siguen viendo en el sistema anterior.'
  }
}

// Cuánto rato se queda una comanda "Listo" visible antes de ocultarse sola
// (tiempo para que el garzón la vea sin que el cocinero toque nada). El botón
// ✕ la oculta antes.
const AUTO_HIDE_LISTO_MIN = 2
// Desde esta cantidad de comandas en UNA columna, esa columna pasa sola a modo
// compacto (el texto de los platos no se achica).
const UMBRAL_DENSO = 6
const POLL_MS = 8000
// Refresca minutos y el ocultado automático de "Listo" aunque no haya cambios.
const RELOJ_MS = 15000

const COLUMNAS = ['nuevo', 'preparando', 'listo']
const ESTADO_TXT = { nuevo: 'NUEVA', preparando: 'EN PREPARACIÓN', listo: 'LISTA' }
const COLUMNA_TXT = { nuevo: 'NUEVAS', preparando: 'EN PREPARACIÓN', listo: 'LISTAS PARA RETIRAR' }
const TAB_TXT = { nuevo: 'NUEVAS', preparando: 'PREPARANDO', listo: 'LISTAS' }

function leer(clave, porDefecto = null) {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}
function guardar(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch {
    // localStorage lleno o bloqueado: la pantalla sigue funcionando en memoria
  }
}

function edadClase(min) {
  return min >= 25 ? 'rojo' : min >= 15 ? 'naranja' : min >= 10 ? 'amarillo' : 'verde'
}

const hhmmss = (ts) =>
  new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Desglose del Menú del Día: agrupa por curso, con conteo (2× Flan).
const CURSOS = [
  ['entrada', 'Entradas'],
  ['principal', 'Principales'],
  ['guarnicion', 'Guarniciones'],
  ['postre', 'Postres']
]
function DesgloseMenu({ menus }) {
  const filas = []
  for (const [k, titulo] of CURSOS) {
    const cuenta = new Map()
    for (const m of menus) {
      const v = String(m?.[k] ?? '').trim()
      if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1)
    }
    if (cuenta.size) {
      filas.push(
        <div className="mc" key={k}>
          <b>{titulo}:</b> {[...cuenta].map(([n, q]) => (q > 1 ? `${q}× ${n}` : n)).join(', ')}
        </div>
      )
    }
  }
  const notas = menus.map((m) => m?.nota).filter(Boolean)
  if (notas.length) {
    filas.push(
      <div className="mc c" key="notas">
        {notas.join(' · ')}
      </div>
    )
  }
  return <div className="menu">{filas}</div>
}

function Tarjeta({ c, edad, marcando, onMarcar, onOcultar }) {
  const btn = (estado, etiqueta, clase) => (
    <button
      className={c.estado === estado ? `on ${clase}` : ''}
      disabled={marcando}
      onClick={() => onMarcar(c, estado)}
    >
      {etiqueta}
    </button>
  )
  return (
    <div className={`card s-${c.estado} e-${edadClase(edad)}`}>
      <div className="top">
        <span className="mesa">
          <b className="mesa-lbl">Mesa</b> {c.mesa}
          {c.sector ? <span className="sector"> · {c.sector}</span> : null}
        </span>
        <span className="garzon">{c.garzon}</span>
        <span className={`age ${edad >= 25 ? 'bad' : edad >= 15 ? 'warn' : ''}`}>{edad} min</span>
        {c.estado === 'listo' && (
          <button className="hide1" title="Ocultar de la vista" onClick={() => onOcultar(c.id)}>
            ✕
          </button>
        )}
      </div>
      <div className="items">
        <div className="estado">{ESTADO_TXT[c.estado] || c.estado}</div>
        {(c.items || []).map((it) => {
          const conMenu = Array.isArray(it.menus) && it.menus.length > 0
          return (
            <div className={`it${conMenu ? ' it-menu' : ''}`} key={it.id}>
              <span className="q">{it.cant}</span>
              <span className="n">
                {String(it.nombre || '').replace(/^[+*\s]+/, '')}
                {it.comentario ? <span className="c">{it.comentario}</span> : null}
                {conMenu ? <DesgloseMenu menus={it.menus} /> : null}
              </span>
            </div>
          )
        })}
      </div>
      <div className="act">
        {btn('nuevo', 'Nuevo', '')}
        {btn('preparando', 'Preparando', 'prep')}
        {btn('listo', 'Listo', '')}
      </div>
    </div>
  )
}

// Las tres columnas. `memo`: solo se vuelve a pintar si cambian las comandas
// visibles (respuesta nueva, reloj o un botón), no con cada consulta sin cambios.
const Tablero = memo(function Tablero({ visibles, tab, marcando, onMarcar, onOcultar }) {
  const grupos = { nuevo: [], preparando: [], listo: [] }
  for (const v of visibles) (grupos[v.c.estado] || grupos.nuevo).push(v)
  return (
    <div className="board">
      {COLUMNAS.map((k) => (
        <div
          key={k}
          className={`col${tab !== k ? ' hide' : ''}${grupos[k].length >= UMBRAL_DENSO ? ' denso' : ''}`}
          data-c={k}
        >
          <div className="colh">
            {COLUMNA_TXT[k]} <span className="n">{grupos[k].length}</span>
          </div>
          <div className="colb">
            {grupos[k].length ? (
              grupos[k].map((v) => (
                <Tarjeta
                  key={v.c.id}
                  c={v.c}
                  edad={v.edad}
                  marcando={marcando.has(v.c.id)}
                  onMarcar={onMarcar}
                  onOcultar={onOcultar}
                />
              ))
            ) : (
              <div className="vacio">—</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
})

// "Entrando comanda" hablado (Web Speech API, sin archivo de audio): más claro
// entre el ruido de cocina que un bip. cancel() antes de hablar para que, si
// entran varias juntas, se escuche la última y no una cola atrasada.
function decirNuevaComanda(frase = 'Entrando comanda') {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(frase)
    u.lang = 'es-CL'
    window.speechSynthesis.speak(u)
  } catch {
    // sin voz en este navegador: la pantalla igual funciona
  }
}

function PantallaCocina({ estacion, codigo, tv, onCodigoInvalido }) {
  const est = ESTACIONES[estacion]
  const { ocultasKey, tabKey, sonidoKey } = est
  const codigoParam = estacion === 'barra' ? 'codigoBarra' : 'codigoCocina'
  const { backend, cambio } = useSistemaComandas()
  const [comandas, setComandas] = useState([])
  const [cargoAlgo, setCargoAlgo] = useState(false)
  const [offset, setOffset] = useState(0) // reloj del servidor − reloj de la tablet
  const [reloj, setReloj] = useState(() => Date.now())
  const [conexion, setConexion] = useState({ estado: 'espera', ultimo: 0, detalle: '' })
  const [ocultas, setOcultas] = useState(() => {
    try {
      return new Set(JSON.parse(leer(ocultasKey, '[]')))
    } catch {
      return new Set()
    }
  })
  const [marcando, setMarcando] = useState(() => new Set())
  const [mensaje, setMensaje] = useState('')
  const [sonidoOn, setSonidoOn] = useState(() => leer(sonidoKey) !== '0')
  const [tab, setTab] = useState(() => (COLUMNAS.includes(leer(tabKey)) ? leer(tabKey) : 'nuevo'))

  const versionRef = useRef(null)
  const enVueloRef = useRef(false)
  const vistasRef = useRef(new Set())
  const primeraCargaRef = useRef(true)
  const ocultasRef = useRef(ocultas)
  const sonidoRef = useRef(sonidoOn)
  ocultasRef.current = ocultas
  sonidoRef.current = sonidoOn

  const cargar = useCallback(
    async (forzar = false) => {
      if (enVueloRef.current) return
      enVueloRef.current = true
      try {
        const d = await est.estado({ [codigoParam]: codigo, version: forzar ? null : versionRef.current })
        setConexion({ estado: 'ok', ultimo: Date.now(), detalle: '' })
        versionRef.current = d.version
        // Nada cambió: no hay nada que volver a pintar.
        if (d.sin_cambios) return

        const lista = d.comandas || []
        const desfase = d.ahora ? Date.parse(d.ahora) - Date.now() : 0
        setOffset(Number.isFinite(desfase) ? desfase : 0)

        // Podar "ocultas" de comandas que ya no están (mesa cerrada): la lista
        // no crece para siempre.
        const idsFeed = new Set(lista.map((c) => String(c.id)))
        const conservadas = [...ocultasRef.current].filter((id) => idsFeed.has(id))
        if (conservadas.length !== ocultasRef.current.size) {
          const nuevas = new Set(conservadas)
          guardar(ocultasKey, JSON.stringify(conservadas))
          ocultasRef.current = nuevas
          setOcultas(nuevas)
        }

        // Sonido: comanda visible que no habíamos visto (o que volvió a "nuevo").
        const ahoraSrv = Date.now() + (Number.isFinite(desfase) ? desfase : 0)
        const visiblesIds = lista
          .filter((c) => !ocultasRef.current.has(String(c.id)))
          .filter(
            (c) =>
              !(c.estado === 'listo' && Math.floor((ahoraSrv - Date.parse(c.estado_at)) / 60000) >= AUTO_HIDE_LISTO_MIN)
          )
          .map((c) => String(c.id))
        if (!primeraCargaRef.current && sonidoRef.current && visiblesIds.some((id) => !vistasRef.current.has(id))) {
          decirNuevaComanda(est.voz)
        }
        vistasRef.current = new Set(visiblesIds)
        primeraCargaRef.current = false

        setReloj(Date.now())
        setComandas(lista)
        setCargoAlgo(true)
      } catch (e) {
        if (String(e?.message || '').includes(est.errorCodigo)) {
          onCodigoInvalido()
          return
        }
        // Error de red o del servidor: NO se borran las tarjetas, solo se marca
        // la pantalla en rojo.
        setConexion((prev) => ({
          estado: e?.red ? 'red' : 'error',
          ultimo: prev.ultimo,
          detalle: e?.message || ''
        }))
      } finally {
        enVueloRef.current = false
      }
    },
    [codigo, onCodigoInvalido, est, ocultasKey, codigoParam]
  )

  useEffect(() => {
    cargar(true)
    const id = setInterval(() => cargar(false), POLL_MS)
    const alVolver = () => {
      if (!document.hidden) cargar(false)
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  useEffect(() => {
    const id = setInterval(() => setReloj(Date.now()), RELOJ_MS)
    return () => clearInterval(id)
  }, [])

  // La TV nadie la toca: si el interruptor cambió, se recarga sola.
  useEffect(() => {
    if (tv && cambio) window.location.reload()
  }, [tv, cambio])

  const marcar = useCallback(
    async (c, estado) => {
      setMensaje('')
      setMarcando((prev) => new Set(prev).add(c.id))
      try {
        const r = await est.marcar({ [codigoParam]: codigo, comandaId: c.id, estado })
        // Aviso al garzón: best-effort, sin esperar. Un fallo no impide el marcado.
        if (r?.avisar) notificarGarzon({ codigoCocina: codigo, garzon: r.garzon, mesa: r.mesa, sector: r.sector, estacion })
      } catch (e) {
        if (String(e?.message || '').includes(est.errorCodigo)) {
          onCodigoInvalido()
          return
        }
        setMensaje(e?.red ? 'No se pudo marcar: sin conexión. Probá de nuevo.' : `No se pudo marcar: ${e.message}`)
      } finally {
        setMarcando((prev) => {
          const sig = new Set(prev)
          sig.delete(c.id)
          return sig
        })
        cargar(true)
      }
    },
    [codigo, cargar, onCodigoInvalido, est, estacion, codigoParam]
  )

  const ocultar = useCallback(
    (id) => {
      const nuevas = new Set(ocultasRef.current).add(String(id))
      ocultasRef.current = nuevas
      guardar(ocultasKey, JSON.stringify([...nuevas]))
      setOcultas(nuevas)
    },
    [ocultasKey]
  )

  // Comandas visibles con su edad. Más viejas arriba (las que más esperan), sin
  // las ocultas a mano y sin las "Listo" que ya pasaron su rato de gracia.
  const visibles = useMemo(() => {
    const ahoraSrv = reloj + offset
    const min = (iso) => Math.max(0, Math.floor((ahoraSrv - Date.parse(iso)) / 60000))
    return comandas
      .filter((c) => !ocultas.has(String(c.id)))
      .filter((c) => !(c.estado === 'listo' && min(c.estado_at) >= AUTO_HIDE_LISTO_MIN))
      .map((c) => ({ c, edad: min(c.creado_at) }))
      .sort((a, b) => b.edad - a.edad)
  }, [comandas, ocultas, reloj, offset])

  const platosPendientes = visibles
    .filter((v) => v.c.estado !== 'listo')
    .reduce((n, v) => n + (v.c.items || []).length, 0)

  const elegirTab = (t) => {
    setTab(t)
    guardar(tabKey, t)
  }
  const alternarSonido = () => {
    const sig = !sonidoOn
    setSonidoOn(sig)
    guardar(sonidoKey, sig ? '1' : '0')
    if (sig) decirNuevaComanda(est.voz)
  }

  const claseConx = conexion.estado === 'ok' ? 'verde' : conexion.estado === 'espera' ? 'amarillo' : 'rojo'
  const textoConx =
    conexion.estado === 'ok'
      ? `conectado · última ${hhmmss(conexion.ultimo)}`
      : conexion.estado === 'red'
        ? 'PANTALLA SIN INTERNET'
        : conexion.estado === 'error'
          ? 'ERROR DEL SERVIDOR'
          : 'conectando…'

  return (
    <div className={`kds${tv ? ' modo-tv' : ''}`}>
      <style>{CSS}</style>
      <header>
        <h1>{est.titulo}</h1>
        <span className={`conx ${claseConx}`}>
          <span className="d" />
          <span>{textoConx}</span>
        </span>
        <span className="kpi">
          <b>{visibles.length}</b> comandas · <b>{platosPendientes}</b> {est.unidad}
        </span>
        {backend && (
          <span className={`sis ${backend === 'supabase' ? 'nuevo' : 'anterior'}`}>{nombreSistema(backend)}</span>
        )}
        {import.meta.env.DEV && esModoDemo() && <span className="sis demo">DEMO · datos de ejemplo</span>}
        <button className="sp" onClick={alternarSonido}>
          Sonido: {sonidoOn ? 'sí' : 'no'}
        </button>
        <button className="hide-tv" onClick={() => decirNuevaComanda(est.voz)}>
          Probar
        </button>
        <a className="hbtn hide-tv" href={`${est.ruta}?tv=1`} target="_blank" rel="noopener noreferrer">
          Modo TV
        </a>
      </header>

      {conexion.estado === 'red' && <div id="alerta">ESTA PANTALLA NO TIENE INTERNET</div>}
      {conexion.estado === 'error' && (
        <div id="alerta">NO SE PUDO LEER {est.lugar.toUpperCase()}{conexion.detalle ? `: ${conexion.detalle}` : ''}</div>
      )}
      {cambio && !tv && (
        <div id="alerta" className="recargar">
          El sistema de pedidos cambió. Recargá esta página para seguir en el sistema correcto.{' '}
          <button onClick={() => window.location.reload()}>Recargar</button>
        </div>
      )}
      {backend === 'worker' && (
        <div id="banner">
          <b>Ojo:</b> hoy los pedidos siguen entrando por el <b>sistema anterior</b>. Esta pantalla lee el sistema nuevo y no va
          a mostrarlos: {est.avisoAnterior}
        </div>
      )}
      {mensaje && (
        <div id="banner">
          <b>{mensaje}</b>
        </div>
      )}

      <div className="tabs">
        {COLUMNAS.map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => elegirTab(k)}>
            {TAB_TXT[k]}
          </button>
        ))}
      </div>

      {!cargoAlgo && conexion.estado !== 'ok' && conexion.estado !== 'espera' ? (
        <div className="empty">Sin datos todavía. Se reintenta solo cada pocos segundos.</div>
      ) : (
        <Tablero visibles={visibles} tab={tab} marcando={marcando} onMarcar={marcar} onOcultar={ocultar} />
      )}
    </div>
  )
}

// Pantalla de candado: pide el código una sola vez por dispositivo. La TV lo
// escribe una vez y queda guardado.
function GateCocina({ estacion, aviso, onEntrar }) {
  const est = ESTACIONES[estacion]
  const codigoParam = estacion === 'barra' ? 'codigoBarra' : 'codigoCocina'
  const [codigo, setCodigo] = useState('')
  const [validando, setValidando] = useState(false)
  const [error, setError] = useState(aviso || '')

  async function entrar() {
    const limpio = codigo.trim()
    if (!limpio) return
    setValidando(true)
    setError('')
    try {
      await est.estado({ [codigoParam]: limpio, version: null })
      guardar(est.codigoKey, limpio)
      onEntrar(limpio)
    } catch (e) {
      const msg = String(e?.message || '')
      if (msg.includes(est.errorCodigo)) setError('Código incorrecto.')
      else if (e?.red && !e?.pg) setError('No se pudo conectar. Revisá el internet e intentá de nuevo.')
      else if (e?.pg === 'PGRST202') setError(`El sistema de ${estacion} todavía no está disponible. Avisá a quien administra el sistema.`)
      else setError(`No se pudo validar el código: ${msg}`)
    } finally {
      setValidando(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink text-paper flex items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="font-mono text-[10px] tracking-[0.22em] text-gold uppercase mb-1 text-center">Varo's · {estacion === 'barra' ? 'Barra' : 'Cocina'}</div>
        <h1 className="font-head text-xl font-semibold text-center mb-5">{est.nombreCodigo}</h1>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
          placeholder="Código"
          autoFocus
          className="w-full bg-inkSoft border border-white/10 rounded-xl px-4 py-3.5 text-center font-mono text-2xl tracking-[0.2em] outline-none placeholder:text-paper/25 placeholder:tracking-normal placeholder:text-base"
        />
        {error && <p className="text-rose-400 text-[12px] text-center mt-2.5 leading-relaxed">{error}</p>}
        <button
          onClick={entrar}
          disabled={validando || !codigo.trim()}
          className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-br from-gold to-bronze text-ink font-head font-bold text-[15px] disabled:opacity-35"
        >
          {validando ? 'Comprobando…' : 'Entrar'}
        </button>
        <p className="text-center text-paper/30 text-[11px] mt-4 leading-relaxed">
          {est.ayudaCodigo}
        </p>
      </div>
    </div>
  )
}

// `estacion`: 'cocina' (por defecto) o 'barra'. Cualquier otro valor cae en cocina.
export default function Cocina({ estacion: estacionProp = 'cocina' }) {
  const estacion = ESTACIONES[estacionProp] ? estacionProp : 'cocina'
  const tv = new URLSearchParams(window.location.search).get('tv') === '1'
  // En modo demo (solo desarrollo) se entra sin código.
  const est = ESTACIONES[estacion]
  const [codigo, setCodigo] = useState(() => leer(est.codigoKey) || (esModoDemo() ? 'demo' : null))
  const [aviso, setAviso] = useState('')

  const codigoInvalido = useCallback(() => {
    guardar(est.codigoKey, null)
    setAviso(est.avisoCodigo)
    setCodigo(null)
  }, [est])

  if (!codigo) return <GateCocina estacion={estacion} aviso={aviso} onEntrar={setCodigo} />
  // key: si se navega /cocina <-> /barra sin recargar, el estado no se arrastra.
  return <PantallaCocina key={estacion} estacion={estacion} codigo={codigo} tv={tv} onCodigoInvalido={codigoInvalido} />
}

// Estilos de la pantalla del Worker, portados tal cual y acotados a `.kds` para
// no afectar al resto de la app. (`body.modo-tv` pasó a `.kds.modo-tv`.)
const CSS = `
.kds{min-height:100vh;background:#0e0f13;color:#f2f2f2;font:16px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
.kds *{box-sizing:border-box}
.kds header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:9px 12px;background:#15171d;border-bottom:1px solid #262a33;flex-wrap:wrap;min-height:52px}
.kds header h1{font-size:15px;font-weight:800;letter-spacing:.03em}
.kds .conx{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;padding:6px 10px;border-radius:8px;background:#1c2733;color:#8fd5a6}
.kds .conx .d{width:9px;height:9px;border-radius:50%;background:#3ddc84}
.kds .conx.amarillo{background:#2e2712;color:#e6c15a}
.kds .conx.amarillo .d{background:#e0a83d}
.kds .conx.rojo{background:#3a1414;color:#ff9a9a}
.kds .conx.rojo .d{background:#e0483d;animation:kdspulso 1s infinite}
@keyframes kdspulso{50%{opacity:.35}}
.kds .kpi{font-size:12px;color:#9aa0ab}
.kds .kpi b{color:#e7ebf1}
.kds .sis{font-size:11px;font-weight:700;letter-spacing:.03em;padding:4px 8px;border-radius:6px;background:#23262f;color:#9aa0ab}
.kds .sis.nuevo{background:#12303a;color:#8fd5d9}
.kds .sis.demo{background:#2e2712;color:#e6c15a}
.kds header .sp{margin-left:auto}
.kds #alerta{background:#5a1010;color:#fff;font-weight:800;font-size:16px;text-align:center;padding:12px;letter-spacing:.02em}
.kds #alerta.recargar button{margin-left:8px;border:0;background:#fff;color:#5a1010;font:inherit;font-size:14px;font-weight:800;padding:6px 14px;border-radius:8px;cursor:pointer}
.kds #banner{background:#3a1414;color:#ffb3b3;border-bottom:1px solid #5a1f1f;padding:9px 14px;font-weight:700;font-size:14px}
.kds #banner b{color:#ff7a7a}

.kds .board{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px;align-items:start}
.kds .col{background:#121319;border:1px solid #23262f;border-radius:12px;display:flex;flex-direction:column;min-height:120px}
.kds .colh{position:sticky;top:52px;z-index:2;padding:8px 12px;font-size:13px;font-weight:800;letter-spacing:.05em;color:#aeb4bf;background:#171a20;border-bottom:1px solid #23262f;border-radius:12px 12px 0 0;display:flex;gap:8px;align-items:center}
.kds .col[data-c=nuevo] .colh{color:#e7ebf1}
.kds .col[data-c=preparando] .colh{color:#8fd0ef}
.kds .col[data-c=listo] .colh{color:#8fe0a6}
.kds .colh .n{margin-left:auto;background:#23262f;color:#e7ebf1;border-radius:99px;min-width:22px;text-align:center;padding:1px 7px;font-size:12px}
.kds .colb{padding:8px;display:flex;flex-direction:column;gap:7px}
.kds .colb .vacio{color:#5a6068;text-align:center;padding:24px 8px;font-size:13px}

/* Modo compacto automático: achica aire y encabezado de la tarjeta, pero el
   texto de los platos (.it) queda igual — es lo que el cocinero lee rápido. */
.kds .col.denso .colb{gap:4px}
.kds .col.denso .card .top{padding:6px 10px}
.kds .col.denso .card .mesa{font-size:16px}
.kds .col.denso .card .garzon{font-size:10.5px}
.kds .col.denso .card .age{font-size:12px}
.kds .col.denso .items{padding:4px 10px}
.kds .col.denso .it{padding:3px 0}
.kds .col.denso .menu{margin-top:2px}
.kds .col.denso .act button{padding:6px 6px;min-height:34px}
.kds .tabs{display:none;position:sticky;top:52px;z-index:4;background:#15171d;border-bottom:1px solid #262a33}
.kds .tabs button{flex:1;border:0;background:none;color:#8b93a1;font:inherit;font-weight:800;font-size:13px;letter-spacing:.03em;padding:12px 4px;border-bottom:3px solid transparent;cursor:pointer}
.kds .tabs button.on{color:#f2f2f2;border-bottom-color:#3ddc84}
@media(max-width:820px){
  .kds header{position:static}
  .kds .tabs{display:flex;top:0}
  .kds .board{grid-template-columns:1fr;padding:0}
  .kds .col{border:0;border-radius:0}
  .kds .col.hide{display:none}
  .kds .colh{display:none}
}

/* Modo TV: solo para mirar, nadie la toca — letra grande, sin botones de acción */
.kds.modo-tv .act,.kds.modo-tv .hide1,.kds.modo-tv .hide-tv,.kds.modo-tv .tabs{display:none}
.kds.modo-tv h1{font-size:20px}
.kds.modo-tv .conx{font-size:16px;padding:8px 14px}
.kds.modo-tv .kpi{font-size:16px}
.kds.modo-tv .sis{font-size:14px;padding:6px 10px}
.kds.modo-tv .colh{font-size:16px;padding:12px 14px}
.kds.modo-tv .card .mesa{font-size:30px}
.kds.modo-tv .card .mesa-lbl{font-size:15px}
.kds.modo-tv .card .sector{font-size:18px}
.kds.modo-tv .card .garzon{font-size:15px}
.kds.modo-tv .card .age{font-size:18px}
.kds.modo-tv .card .estado{font-size:13px;padding:4px 9px}
.kds.modo-tv .it{font-size:19px;padding:9px 0}
.kds.modo-tv .it .c{font-size:16px}
.kds.modo-tv .menu{font-size:16px}
@media(max-width:820px){
  .kds.modo-tv .board{grid-template-columns:repeat(3,1fr);padding:8px}
  .kds.modo-tv .col.hide{display:flex}
  .kds.modo-tv .col{border:1px solid #23262f;border-radius:12px}
  .kds.modo-tv .colh{display:flex}
}

.kds .card{background:#181b22;border:2px solid #2b3a2e;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.kds .card.e-verde{border-color:#2f7d4f}
.kds .card.e-amarillo{border-color:#c9a227}
.kds .card.e-naranja{border-color:#d97a1f}
.kds .card.e-rojo{border-color:#e0483d;box-shadow:0 0 0 1px #e0483d66}
.kds .card.s-listo{opacity:.45}
.kds .card .estado{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;padding:2px 7px;border-radius:5px;background:#2b2f38;color:#cbd2dc}
.kds .card.s-nuevo .estado{background:#3a4048;color:#e7ebf1}
.kds .card.s-preparando .estado{background:#1e3a4e;color:#8fd0ef}
.kds .card.s-listo .estado{background:#1e3a26;color:#8fe0a6}
.kds .card .top{display:flex;align-items:baseline;gap:8px;padding:8px 12px;background:#1e222b}
.kds .card .mesa{font-size:18px;font-weight:900;line-height:1}
.kds .card .mesa-lbl{font-size:10.5px;font-weight:700;color:#8b929e;letter-spacing:.03em;margin-right:2px}
.kds .card .sector{font-size:12.5px;font-weight:600;color:#8fd0ef}
.kds .card .garzon{font-size:11px;color:#8b929e}
.kds .card .age{margin-left:auto;font-size:13px;font-weight:800;color:#8b93a1}
.kds .card .age.warn{color:#e0a83d}
.kds .card .age.bad{color:#e0483d}
.kds .card .hide1{border:0;background:#262a33;color:#8b93a1;width:24px;height:24px;border-radius:7px;font-size:12px;cursor:pointer;flex-shrink:0}
.kds .card .hide1:active{background:#2c313c}
.kds .items{padding:6px 12px;flex:1}
.kds .it{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #21252e;font-size:14px}
.kds .it:last-child{border:0}
.kds .it .q{font-weight:900;color:#ffd88a;min-width:22px}
.kds .it .n{flex:1}
.kds .it .c{display:block;font-size:12.5px;font-weight:700;color:#ffcf70;margin-top:1px}
.kds .it-menu .n>b{color:#ffd88a}
.kds .menu{margin-top:3px;font-size:12.5px}
.kds .menu .mc{padding:1px 0}
.kds .menu .mc b{color:#9aa0ab;font-weight:600}
.kds .menu .mc.c{color:#ffb454}
.kds .act{display:flex;gap:1px;background:#262a33}
.kds .act button{flex:1;border:0;padding:9px 6px;font:inherit;font-weight:700;font-size:12.5px;color:#f2f2f2;background:#20242d;cursor:pointer;min-height:40px}
.kds .act button:active{background:#2c313c}
.kds .act button:disabled{opacity:.55}
.kds .act button.on{background:#3ddc84;color:#08120b}
.kds .act button.on.prep{background:#4b9fd6;color:#04121c}
.kds .empty{text-align:center;color:#6b7280;padding:60px 20px;font-size:18px}
.kds header button,.kds header a.hbtn{border:0;background:#20242d;color:#dfe3ea;font:inherit;font-size:12.5px;font-weight:700;padding:7px 11px;border-radius:8px;cursor:pointer;text-decoration:none}
.kds header button:active{background:#2c313c}
`
