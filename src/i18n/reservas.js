import { useCallback, useEffect, useState } from 'react'

// i18n mínimo y sin librería para el flujo público de /reservas.
// Solo español e inglés (ver DECISIONES.md · "Carta e idioma en el flujo de
// reserva"): EN es el único segundo idioma que el personal sostiene por
// WhatsApp al confirmar la mesa. El resto de la app queda en español.
//
// `t('clave')` cae al español si falta la traducción, así que se puede ir
// completando el inglés de a poco sin romper la pantalla.

export const IDIOMAS = ['es', 'en']

export const DICCIONARIO = {
  es: {
    // Pie de contacto
    pie_dudas: '¿Dudas con tu reserva? ',
    pie_whatsapp: 'Escríbenos por WhatsApp',

    // Título y bajadas del flujo
    titulo: 'RESERVA TU MESA',
    sub_filtros: 'Cuéntanos cuándo, cuántos son y cómo contactarte.',
    sub_plano: 'Elige tu mesa y confirma.',

    cargando: 'Cargando…',

    // Pantalla "reservas en pausa"
    pausa_titulo: 'Reservas online, muy pronto',
    pausa_texto:
      'Estamos afinando el sistema de reservas por internet. Por ahora reservá tu mesa por WhatsApp y te confirmamos a la brevedad.',
    pausa_boton: 'Reservar por WhatsApp',
    horario_corto: 'Martes a domingo · 12:30 a 16:30 hrs',

    // Pantalla "reserva confirmada"
    ok_titulo: '¡Reserva confirmada!',
    ok_resumen_personas: '{label} · {n} personas',
    ok_resumen_fecha: '{fecha} · {hora} hrs',
    ok_reserva_n: 'Reserva N° ',
    ok_contacto: 'El restaurante recibirá tu solicitud y te contactará al {telefono} para confirmarla.',

    // Menú del Día + carta
    menuDia_titulo: 'Menú del Día',
    menuDia_bajada: 'Martes a domingo · $15.900',
    menuDia_hoy: 'Consultá los platos de hoy en la carta',
    verCarta: 'Ver la carta',

    // Paso "filtros"
    atencion_horario: 'Atención martes a domingo, de {inicio} a {fin} hrs.',
    label_fecha: 'Fecha',
    label_hora: 'Hora',
    label_personas: 'Personas',
    label_zona: 'Zona',
    err_lunes: 'Los lunes el restaurante está cerrado. Elige otro día.',
    err_almuerzo: 'Por ahora la reserva online solo está disponible en horario de almuerzo ({inicio} a {fin}).',
    err_telefono: 'Revisa el teléfono — incluye el código de área, ej. +56 9 1234 5678.',
    err_telefono_confirm: 'Revisa el teléfono — debe incluir código de área, ej. +56 9 1234 5678.',
    nota_almuerzo: 'Reserva online solo de almuerzo por ahora. ¿Cena? Escríbenos por WhatsApp.',
    aria_quitar_persona: 'Quitar una persona',
    aria_agregar_persona: 'Agregar una persona',
    err_zona: 'Elige una sala para ver el plano y las mesas disponibles.',
    sin_salas: 'Hoy no hay salas disponibles para reserva online — escríbenos por WhatsApp.',
    label_nombre: 'Nombre',
    ph_nombre: 'Tu nombre completo',
    label_telefono: 'Teléfono de contacto',
    ph_telefono: '+56 9 ...',
    label_email: 'Correo (te llega la confirmación ahí)',
    ph_email: 'tucorreo@ejemplo.com',
    label_alergias: '¿Alguna alergia o intolerancia alimentaria? (opcional)',
    ph_alergias: 'Ej: alergia a los mariscos, intolerancia al gluten...',
    btn_ver_plano: 'VER PLANO Y MESAS DISPONIBLES',
    btn_buscando: 'BUSCANDO MESAS…',

    // Paso "plano"
    volver_datos: '← Volver a mis datos',
    aviso_reservada: 'Esta mesa acaba de ser reservada. Por favor elige otra mesa disponible.',
    leyenda_disponible: 'Disponible',
    leyenda_reservada: 'Reservada',
    leyenda_seleccionada: 'Seleccionada',
    aria_plano: 'Plano de {sala}, elige una mesa',
    estado_reservada: 'reservada',
    estado_seleccionada: 'seleccionada',
    estado_disponible: 'disponible',
    mesa_no_disponible: '{etiqueta}, no disponible',
    combo_intro: 'Ninguna mesa sola alcanza para {n} personas — combinación recomendada:',
    combo_capacidad: 'Capacidad {n} · {fecha} {hora}',
    combo_usar: 'Usar esta combinación',
    combo_elegida: 'Elegida ✓',
    combo_sin: 'No encontramos mesas ni combinaciones disponibles para {n} personas a esa hora. Prueba otro horario.',
    toca_mesa: 'Toca una mesa disponible',
    mesa_resumen: '{etiqueta} · {n} personas',
    reserva_a_nombre: 'Reserva a nombre de',
    mesa_retenida: 'Tu mesa queda retenida por {n} minutos.',
    btn_confirmar: 'CONFIRMAR RESERVA',
    btn_enviando: 'ENVIANDO…',
    toca_mesa_confirmar: 'Toca una mesa disponible en el plano para confirmar tu reserva.',
    err_registrar: 'No pudimos registrar tu reserva. Inténtalo de nuevo o escríbenos por WhatsApp.',

    // Nombres de sala (solo para mostrar — el valor interno sigue en español)
    sala_comedor: 'Comedor Exterior',
    sala_salon: 'Comedor Principal',
    sala_terraza: 'Terraza',

    // Selector de idioma
    idioma_es: 'ES',
    idioma_en: 'EN',
  },

  en: {
    pie_dudas: 'Questions about your booking? ',
    pie_whatsapp: 'Message us on WhatsApp',

    titulo: 'BOOK YOUR TABLE',
    sub_filtros: 'Tell us when, how many of you, and how to reach you.',
    sub_plano: 'Pick your table and confirm.',

    cargando: 'Loading…',

    pausa_titulo: 'Online booking, coming soon',
    pausa_texto:
      "We're still fine-tuning online booking. For now, book your table on WhatsApp and we'll confirm shortly.",
    pausa_boton: 'Book on WhatsApp',
    horario_corto: 'Tuesday to Sunday · 12:30–16:30',

    ok_titulo: 'Booking received!',
    ok_resumen_personas: '{label} · {n} guests',
    ok_resumen_fecha: '{fecha} · {hora}',
    ok_reserva_n: 'Booking No. ',
    ok_contacto: 'The restaurant will get your request and contact you at {telefono} to confirm it.',

    menuDia_titulo: 'Menu of the Day',
    menuDia_bajada: 'Tuesday to Sunday · $15,900',
    menuDia_hoy: "See today's dishes in the full menu",
    verCarta: 'View the menu',

    atencion_horario: 'Open Tuesday to Sunday, {inicio}–{fin}.',
    label_fecha: 'Date',
    label_hora: 'Time',
    label_personas: 'Guests',
    label_zona: 'Area',
    err_lunes: "We're closed on Mondays. Please pick another day.",
    err_almuerzo: 'For now, online booking is only available for lunch ({inicio}–{fin}).',
    err_telefono: 'Check the phone number — include the area code, e.g. +56 9 1234 5678.',
    err_telefono_confirm: 'Check the phone number — it must include the area code, e.g. +56 9 1234 5678.',
    nota_almuerzo: 'Online booking is lunch-only for now. Dinner? Message us on WhatsApp.',
    aria_quitar_persona: 'Remove one guest',
    aria_agregar_persona: 'Add one guest',
    err_zona: 'Choose an area to see the floor plan and available tables.',
    sin_salas: 'No areas are open for online booking today — message us on WhatsApp.',
    label_nombre: 'Name',
    ph_nombre: 'Your full name',
    label_telefono: 'Contact phone',
    ph_telefono: '+56 9 ...',
    label_email: 'Email (your confirmation goes there)',
    ph_email: 'you@example.com',
    label_alergias: 'Any food allergies or intolerances? (optional)',
    ph_alergias: 'E.g. shellfish allergy, gluten intolerance...',
    btn_ver_plano: 'SEE FLOOR PLAN & TABLES',
    btn_buscando: 'FINDING TABLES…',

    volver_datos: '← Back to my details',
    aviso_reservada: 'This table was just booked. Please choose another available table.',
    leyenda_disponible: 'Available',
    leyenda_reservada: 'Booked',
    leyenda_seleccionada: 'Selected',
    aria_plano: 'Floor plan of {sala}, pick a table',
    estado_reservada: 'booked',
    estado_seleccionada: 'selected',
    estado_disponible: 'available',
    mesa_no_disponible: '{etiqueta}, unavailable',
    combo_intro: 'No single table fits {n} guests — recommended combination:',
    combo_capacidad: 'Seats {n} · {fecha} {hora}',
    combo_usar: 'Use this combination',
    combo_elegida: 'Selected ✓',
    combo_sin: "We couldn't find any tables or combinations for {n} guests at that time. Try another time.",
    toca_mesa: 'Tap an available table',
    mesa_resumen: '{etiqueta} · {n} guests',
    reserva_a_nombre: 'Booking for',
    mesa_retenida: 'Your table is held for {n} minutes.',
    btn_confirmar: 'CONFIRM BOOKING',
    btn_enviando: 'SENDING…',
    toca_mesa_confirmar: 'Tap an available table on the plan to confirm your booking.',
    err_registrar: "We couldn't save your booking. Try again or message us on WhatsApp.",

    sala_comedor: 'Outdoor Dining',
    sala_salon: 'Main Dining Room',
    sala_terraza: 'Terrace',

    idioma_es: 'ES',
    idioma_en: 'EN',
  },
}

// Reemplaza {clave} por params[clave]. Si falta la traducción en el idioma
// pedido, cae al español; si falta también ahí, devuelve la propia clave.
export function traducir(idioma, clave, params) {
  const dict = DICCIONARIO[idioma] || DICCIONARIO.es
  let texto = dict[clave] ?? DICCIONARIO.es[clave] ?? clave
  if (params) {
    for (const k of Object.keys(params)) {
      texto = texto.split(`{${k}}`).join(String(params[k]))
    }
  }
  return texto
}

const CLAVE_LS = 'varos_idioma'

function idiomaInicial() {
  try {
    const desdeUrl = new URLSearchParams(window.location.search).get('lang')
    if (IDIOMAS.includes(desdeUrl)) return desdeUrl
    const desdeLS = window.localStorage.getItem(CLAVE_LS)
    if (IDIOMAS.includes(desdeLS)) return desdeLS
  } catch {
    /* SSR / storage bloqueado: default español */
  }
  return 'es'
}

// Hook del selector de idioma del flujo de reservas.
// Lee de ?lang= → localStorage → 'es', persiste al cambiar y expone t().
export function useIdioma() {
  const [idioma, setIdiomaState] = useState(idiomaInicial)

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_LS, idioma)
    } catch {
      /* storage bloqueado: no se persiste, no es crítico */
    }
  }, [idioma])

  const setIdioma = useCallback((valor) => {
    setIdiomaState(IDIOMAS.includes(valor) ? valor : 'es')
  }, [])

  const t = useCallback((clave, params) => traducir(idioma, clave, params), [idioma])

  return { idioma, setIdioma, t }
}
