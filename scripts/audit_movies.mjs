// Audit: find movies with incomplete data — paginated fetch
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {}

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || ''

// Paginated fetch — gets ALL rows
async function supaAll(table, query = '') {
  const PAGE = 1000
  let all = []
  let offset = 0
  while (true) {
    const sep = query ? '&' : ''
    const url = `${SUPA_URL}/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`
    const res = await fetch(url, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
      },
    })
    if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`)
    const rows = await res.json()
    all = all.concat(rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

console.log('Cargando datos...')

// Fetch all tables in parallel
const [peliculas, enriquecimiento, watchProviders, catalogos] = await Promise.all([
  supaAll('peliculas', 'select=*&order=nota_imdb.desc.nullsfirst'),
  supaAll('enriquecimiento', 'select=*'),
  supaAll('watch_providers', 'select=pelicula_id,platform_key,provider_type'),
  supaAll('catalogos', 'select=pelicula_id,plataforma,activo&activo=eq.true'),
])

console.log(`Peliculas: ${peliculas.length}, Enriquecimiento: ${enriquecimiento.length}, Watch providers: ${watchProviders.length}, Catalogos activos: ${catalogos.length}`)

// Index enrichment by pelicula_id
const enrichById = {}
for (const e of enriquecimiento) enrichById[e.pelicula_id] = e

// Index watch providers by pelicula_id
const wpById = {}
for (const wp of watchProviders) {
  if (!wpById[wp.pelicula_id]) wpById[wp.pelicula_id] = []
  wpById[wp.pelicula_id].push(wp)
}

// Index catalogos activos by pelicula_id
const catById = {}
for (const c of catalogos) {
  if (!catById[c.pelicula_id]) catById[c.pelicula_id] = []
  catById[c.pelicula_id].push(c)
}

// A movie has platforms if it has watch_providers OR active catalogos
function hasPlataformas(id) {
  return (wpById[id] && wpById[id].length > 0) || (catById[id] && catById[id].length > 0)
}

// Define which fields to audit
const FIELDS = [
  // From peliculas table
  { key: 'nota_imdb',          label: 'IMDB',          check: (p) => p.nota_imdb != null && p.nota_imdb > 0 },
  { key: 'categoria',          label: 'Categoría',     check: (p) => !!p.categoria },
  { key: 'poster_path',        label: 'Poster',        check: (p) => !!p.poster_path },
  { key: 'backdrop_path',      label: 'Backdrop',      check: (p) => !!p.backdrop_path },
  { key: 'logo_path',          label: 'Logo',          check: (p) => !!p.logo_path },
  { key: 'youtube_trailer_key',label: 'Trailer',       check: (p) => !!p.youtube_trailer_key },
  { key: 'imdb_id',            label: 'IMDB ID',       check: (p) => !!p.imdb_id },
  { key: 'tmdb_id',            label: 'TMDB ID',       check: (p) => p.tmdb_id != null },
  { key: 'runtime',            label: 'Duración',      check: (p) => p.runtime != null && p.runtime > 0 },
  { key: 'certification',      label: 'Certificación', check: (p) => !!p.certification },
  { key: 'tagline',            label: 'Tagline',       check: (p) => !!p.tagline },
  { key: 'titulo_ingles',      label: 'Título EN',     check: (p) => !!p.titulo_ingles },
  { key: 'anio',               label: 'Año',           check: (p) => p.anio != null },
  // From enriquecimiento table
  { key: 'sinopsis',     label: 'Sinopsis IA',  check: (p, e) => e && !!e.sinopsis_chilensis },
  { key: 'director',     label: 'Director',     check: (p, e) => e && !!e.director },
  { key: 'actores',      label: 'Actores',      check: (p, e) => e && e.actores && (Array.isArray(e.actores) ? e.actores.length > 0 : !!e.actores) },
  { key: 'compositor',   label: 'Compositor',   check: (p, e) => e && !!e.compositor },
  { key: 'generos',      label: 'Géneros',      check: (p, e) => e && Array.isArray(e.generos) && e.generos.length > 0 },
  { key: 'keywords',     label: 'Keywords',     check: (p, e) => e && Array.isArray(e.keywords) && e.keywords.length > 0 },
  { key: 'cast_json',    label: 'Cast JSON',    check: (p, e) => e && Array.isArray(e.cast_json) && e.cast_json.length > 0 },
  { key: 'similar_ids',  label: 'Similares',    check: (p, e) => e && Array.isArray(e.similar_ids) && e.similar_ids.length > 0 },
  { key: 'review_autor', label: 'Review Bret',  check: (p, e) => e && !!e.review_autor },
  { key: 'plataformas',  label: 'Plataformas',  check: (p) => hasPlataformas(p.id) },
]

const TOTAL_FIELDS = FIELDS.length

// Audit each movie
const results = peliculas.map(p => {
  const e = enrichById[p.id]
  const missing = []
  let complete = 0

  for (const f of FIELDS) {
    if (f.check(p, e)) {
      complete++
    } else {
      missing.push(f.label)
    }
  }

  return {
    titulo: p.titulo,
    anio: p.anio,
    nota_imdb: p.nota_imdb,
    complete,
    total: TOTAL_FIELDS,
    pct: Math.round((complete / TOTAL_FIELDS) * 100),
    missing,
    hasEnrichment: !!e,
  }
})

// Sort: incomplete first, then by IMDB desc
results.sort((a, b) => {
  if (a.pct !== b.pct) return a.pct - b.pct
  return (b.nota_imdb || 0) - (a.nota_imdb || 0)
})

// === PRINT REPORT ===

console.log('\n' + '='.repeat(90))
console.log('  AUDITORÍA DE PELÍCULAS - CINEBRET')
console.log('='.repeat(90))
console.log(`  Total películas: ${peliculas.length}`)
console.log(`  Con enriquecimiento: ${enriquecimiento.length}`)
console.log(`  Watch providers rows: ${watchProviders.length}`)
console.log(`  Catalogos activos rows: ${catalogos.length}`)
console.log(`  Campos auditados: ${TOTAL_FIELDS}`)

// Global stats per field
console.log('\n' + '-'.repeat(90))
console.log('  COMPLETITUD POR CAMPO')
console.log('-'.repeat(90))

const fieldStats = FIELDS.map(f => {
  const count = peliculas.filter(p => {
    const e = enrichById[p.id]
    return f.check(p, e)
  }).length
  return { label: f.label, count, pct: Math.round((count / peliculas.length) * 100) }
}).sort((a, b) => a.pct - b.pct)

for (const fs of fieldStats) {
  const bar = '█'.repeat(Math.round(fs.pct / 2.5)) + '░'.repeat(40 - Math.round(fs.pct / 2.5))
  console.log(`  ${fs.label.padEnd(15)} ${bar} ${String(fs.count).padStart(4)}/${peliculas.length} (${String(fs.pct).padStart(2)}%)`)
}

// Distribution summary
console.log('\n' + '-'.repeat(90))
console.log('  DISTRIBUCIÓN DE COMPLETITUD')
console.log('-'.repeat(90))

const buckets = [
  { label: '90-100%', min: 90, max: 100 },
  { label: '70-89%',  min: 70, max: 89 },
  { label: '50-69%',  min: 50, max: 69 },
  { label: '30-49%',  min: 30, max: 49 },
  { label: '0-29%',   min: 0,  max: 29 },
]
for (const b of buckets) {
  const count = results.filter(r => r.pct >= b.min && r.pct <= b.max).length
  const bar = '█'.repeat(Math.round((count / peliculas.length) * 50))
  console.log(`  ${b.label.padEnd(10)} ${bar} ${count} películas`)
}

// Top 50 most incomplete (with highest IMDB)
console.log('\n' + '-'.repeat(90))
console.log('  TOP 50 PELÍCULAS MÁS INCOMPLETAS (priorizadas por nota IMDB)')
console.log('-'.repeat(90))

// Re-sort: least complete first, within same %, highest IMDB first
const top50 = results.filter(r => r.missing.length > 0).slice(0, 50)

for (const r of top50) {
  const imdb = r.nota_imdb ? r.nota_imdb.toFixed(1) : 'N/A'
  const bar = '█'.repeat(Math.round(r.pct / 5)) + '░'.repeat(20 - Math.round(r.pct / 5))
  console.log(`  ${bar} ${String(r.pct).padStart(2)}% | ⭐${imdb.padEnd(4)} | ${r.titulo} (${r.anio || '?'})`)
  console.log(`  ${''.padEnd(26)} Faltan: ${r.missing.join(', ')}`)
}

// Perfect movies
const perfect = results.filter(r => r.missing.length === 0)
console.log('\n' + '-'.repeat(90))
console.log(`  PELÍCULAS 100% COMPLETAS: ${perfect.length}`)
console.log('-'.repeat(90))
if (perfect.length > 0) {
  for (const r of perfect) {
    console.log(`  ⭐${(r.nota_imdb || 0).toFixed(1)} | ${r.titulo} (${r.anio})`)
  }
} else {
  console.log('  Ninguna película tiene todos los campos completos.')
}

// Summary of what's most needed
console.log('\n' + '='.repeat(90))
console.log('  RESUMEN PRIORIDADES')
console.log('='.repeat(90))
for (const fs of fieldStats) {
  const faltantes = peliculas.length - fs.count
  if (faltantes > 0) {
    console.log(`  ${fs.label.padEnd(15)} → ${faltantes} películas sin este dato`)
  }
}
console.log('='.repeat(90) + '\n')
