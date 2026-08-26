// Utilidades del corpus de reseñas de Google que vive en la tabla
// `resenas_google`. Todo lo de acá es puro: sin fetch, sin React, para que la
// huella de dedupe se pueda razonar (y testear) sin levantar la app.

// Minúsculas, sin tildes, espacios colapsados. Es la base de la huella: dos
// pegados del mismo bloque de Google tienen que producir exactamente lo mismo
// aunque cambien mayúsculas o los saltos de línea del copiado.
export function normalizarTexto(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Clave de dedupe: autor + rating + los primeros 80 caracteres del texto.
// 80 alcanza para distinguir dos reseñas distintas del mismo autor y es corto
// como para que un recorte del final (o una respuesta del local agregada
// después) no genere una fila duplicada.
export function huellaResena(resena) {
  const autor = normalizarTexto(resena?.autor)
  const rating = String(resena?.rating ?? '')
  const texto = normalizarTexto(resena?.texto).slice(0, 80)
  return [autor, rating, texto].join('|')
}

// Solo aceptamos ratings enteros de 1 a 5: la columna tiene el check y una
// fila inválida haría fallar el upsert entero.
export function ratingValido(valor) {
  const n = Number(valor)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null
}

// La IA a veces devuelve la fecha vacía o en formato libre; la columna es
// `date` y un string vacío revienta el insert.
export function fechaISOValida(valor) {
  const s = String(valor ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Normaliza una reseña cruda (venga de la IA o de un formulario) a la forma
// exacta de la tabla, con su huella ya calculada. Devuelve null si no es
// aprovechable.
export function aFilaResena(resena, origen = 'pegado') {
  const rating = ratingValido(resena?.rating)
  const autor = String(resena?.autor ?? '').trim()
  const texto = String(resena?.texto ?? '').trim()
  if (!rating || (!autor && !texto)) return null
  return {
    autor: autor || 'Anónimo',
    rating,
    fecha_texto: String(resena?.fecha_texto ?? '').trim() || null,
    fecha_aprox: fechaISOValida(resena?.fecha_aprox),
    texto: texto || null,
    respuesta_local: String(resena?.respuesta_local ?? '').trim() || null,
    origen,
    huella: huellaResena({ autor, rating, texto })
  }
}

// Saca los repetidos dentro del mismo pegado (Google a veces repite la misma
// reseña arriba como "destacada"), quedándose con la primera aparición.
export function dedupePorHuella(filas) {
  const vistas = new Set()
  return filas.filter((f) => {
    if (vistas.has(f.huella)) return false
    vistas.add(f.huella)
    return true
  })
}

export function promedioRating(resenas) {
  const valores = (resenas ?? []).map((r) => Number(r?.rating)).filter((n) => Number.isFinite(n))
  if (valores.length === 0) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

// 4.6 -> "4,6". En Chile el separador decimal es la coma.
export function formatPromedio(valor) {
  return valor == null ? '—' : valor.toFixed(1).replace('.', ',')
}

// "2024-03-08" -> "marzo 2024". Se parsea a mano para que no se corra un día
// por zona horaria (new Date('2024-03-08') es UTC).
export function mesAnio(iso) {
  if (!fechaISOValida(iso)) return null
  const [a, m] = iso.split('-').map(Number)
  const fecha = new Date(a, m - 1, 1)
  return fecha.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
}

// Parte el pegado en bloques para mandarlos de a uno a la función de import.
//
// No es una optimización: las funciones sincrónicas de Netlify cortan a los 10
// segundos, y parsear doscientas reseñas de un saque se pasa de largo seguro.
// De paso, mandar de a lotes deja mostrar progreso real en vez de un spinner.
//
// Corta preferentemente en línea en blanco (que es como Google separa una
// reseña de la siguiente) y solo cae en el corte duro si un bloque solo ya se
// pasa del tamaño. Si igual quedara una reseña partida al medio, la peor
// consecuencia es que esa entrada salga mal en la vista previa, donde se ve
// antes de guardar.
export function partirEnLotes(texto, maxChars = 9000) {
  const limpio = String(texto ?? '').trim()
  if (!limpio) return []
  if (limpio.length <= maxChars) return [limpio]

  const bloques = limpio.split(/\n\s*\n/)
  const lotes = []
  let actual = ''

  for (const bloque of bloques) {
    if (actual && actual.length + bloque.length + 2 > maxChars) {
      lotes.push(actual)
      actual = ''
    }
    // Un solo bloque más grande que el máximo (pegado sin líneas en blanco):
    // se parte a lo bruto, no hay mejor punto de corte disponible.
    if (bloque.length > maxChars) {
      if (actual) {
        lotes.push(actual)
        actual = ''
      }
      for (let i = 0; i < bloque.length; i += maxChars) {
        lotes.push(bloque.slice(i, i + maxChars))
      }
      continue
    }
    actual = actual ? `${actual}\n\n${bloque}` : bloque
  }

  if (actual) lotes.push(actual)
  return lotes
}

export function recortar(texto, largo = 160) {
  const s = String(texto ?? '').trim()
  return s.length > largo ? `${s.slice(0, largo).trimEnd()}…` : s
}
