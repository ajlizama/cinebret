// Audit: completitud de series en Supabase
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

async function supaAll(table, query = '') {
  const PAGE = 1000
  let all = [], offset = 0
  while (true) {
    const sep = query ? '&' : ''
    const res = await fetch(`${SUPA_URL}/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status}`)
    const rows = await res.json()
    all = all.concat(rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

console.log('Cargando datos...')
const [series, enrichments, wp] = await Promise.all([
  supaAll('series', 'select=*'),
  supaAll('enriquecimiento_series', 'select=*'),
  supaAll('watch_providers_series', 'select=serie_id,platform_key'),
])

const enrichById = {}
for (const e of enrichments) enrichById[e.serie_id] = e
const wpById = {}
for (const w of wp) { if (!wpById[w.serie_id]) wpById[w.serie_id] = []; wpById[w.serie_id].push(w) }

const FIELDS = [
  { label: 'IMDB',          check: (s) => s.nota_imdb != null && s.nota_imdb > 0 },
  { label: 'Poster',        check: (s) => !!s.poster_path },
  { label: 'Backdrop',      check: (s) => !!s.backdrop_path },
  { label: 'Logo',          check: (s) => !!s.logo_path },
  { label: 'Trailer',       check: (s) => !!s.youtube_trailer_key },
  { label: 'IMDB ID',       check: (s) => !!s.imdb_id },
  { label: 'TMDB ID',       check: (s) => s.tmdb_id != null },
  { label: 'Duración ep.',  check: (s) => s.episode_runtime != null && s.episode_runtime > 0 },
  { label: 'Certificación', check: (s) => !!s.certification },
  { label: 'Tagline',       check: (s) => !!s.tagline },
  { label: 'Año inicio',    check: (s) => s.anio_inicio != null },
  { label: 'Temporadas',    check: (s) => s.num_temporadas != null },
  { label: 'Estado',        check: (s) => !!s.estado },
  { label: 'Networks',      check: (s) => Array.isArray(s.networks) && s.networks.length > 0 },
  { label: 'Sinopsis',      check: (s, e) => e && !!e.sinopsis_chilensis },
  { label: 'Creador',       check: (s, e) => e && !!e.director },
  { label: 'Actores',       check: (s, e) => e && Array.isArray(e.actores) && e.actores.length > 0 },
  { label: 'Compositor',    check: (s, e) => e && !!e.compositor },
  { label: 'Géneros',       check: (s, e) => e && Array.isArray(e.generos) && e.generos.length > 0 },
  { label: 'Keywords',      check: (s, e) => e && Array.isArray(e.keywords) && e.keywords.length > 0 },
  { label: 'Cast JSON',     check: (s, e) => e && Array.isArray(e.cast_json) && e.cast_json.length > 0 },
  { label: 'Similares',     check: (s, e) => e && Array.isArray(e.similar_ids) && e.similar_ids.length > 0 },
  { label: 'Plataformas',   check: (s) => wpById[s.id] && wpById[s.id].length > 0 },
]

const TOTAL = FIELDS.length

console.log('\n' + '='.repeat(90))
console.log('  AUDITORÍA DE SERIES - CINEBRET')
console.log('='.repeat(90))
console.log(`  Total series: ${series.length}`)
console.log(`  Con enriquecimiento: ${enrichments.length}`)
console.log(`  Watch providers rows: ${wp.length}`)
console.log(`  Campos auditados: ${TOTAL}`)

// Field stats
console.log('\n' + '-'.repeat(90))
console.log('  COMPLETITUD POR CAMPO')
console.log('-'.repeat(90))

const fieldStats = FIELDS.map(f => {
  const count = series.filter(s => f.check(s, enrichById[s.id])).length
  return { label: f.label, count, pct: Math.round((count / series.length) * 100) }
}).sort((a, b) => a.pct - b.pct)

for (const fs of fieldStats) {
  const bar = '█'.repeat(Math.round(fs.pct / 2.5)) + '░'.repeat(40 - Math.round(fs.pct / 2.5))
  console.log(`  ${fs.label.padEnd(15)} ${bar} ${String(fs.count).padStart(4)}/${series.length} (${String(fs.pct).padStart(2)}%)`)
}

// Distribution
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

const results = series.map(s => {
  const e = enrichById[s.id]
  let complete = 0
  const missing = []
  for (const f of FIELDS) {
    if (f.check(s, e)) complete++
    else missing.push(f.label)
  }
  return { titulo: s.titulo, anio: s.anio_inicio, nota_imdb: s.nota_imdb, pct: Math.round((complete / TOTAL) * 100), missing }
})

for (const b of buckets) {
  const count = results.filter(r => r.pct >= b.min && r.pct <= b.max).length
  const bar = '█'.repeat(Math.round((count / series.length) * 50))
  console.log(`  ${b.label.padEnd(10)} ${bar} ${count} series`)
}

// Summary
console.log('\n' + '-'.repeat(90))
console.log('  RESUMEN PRIORIDADES')
console.log('-'.repeat(90))
for (const fs of fieldStats) {
  const faltantes = series.length - fs.count
  if (faltantes > 0) console.log(`  ${fs.label.padEnd(15)} → ${faltantes} series sin este dato`)
}
console.log('='.repeat(90))
