// Internal similar series algorithm — same logic as similar_movies.mjs
// Uses: keywords, genres, creator, decade, IMDB range, certification
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

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY
const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }

async function fetchAll(table, params) {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}&offset=${offset}&limit=1000`, { headers })
    const data = await res.json()
    if (!data.length) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

const GENRE_NORM = {
  'Acción': 'accion', 'Action': 'accion', 'Action & Adventure': 'accion',
  'Aventura': 'aventura', 'Adventure': 'aventura',
  'Animación': 'animacion', 'Animation': 'animacion',
  'Comedia': 'comedia', 'Comedy': 'comedia',
  'Crimen': 'crimen', 'Crime': 'crimen',
  'Documental': 'documental', 'Documentary': 'documental',
  'Drama': 'drama',
  'Fantasía': 'fantasia', 'Fantasy': 'fantasia',
  'Familia': 'familia', 'Family': 'familia',
  'Guerra': 'guerra', 'War': 'guerra', 'War & Politics': 'guerra',
  'Historia': 'historia', 'History': 'historia',
  'Misterio': 'misterio', 'Mystery': 'misterio',
  'Música': 'musica', 'Music': 'musica',
  'Romance': 'romance',
  'Ciencia ficción': 'scifi', 'Sci-Fi & Fantasy': 'scifi', 'Science Fiction': 'scifi',
  'Thriller': 'thriller',
  'Terror': 'terror', 'Horror': 'terror',
  'Western': 'western',
  'Reality': 'reality', 'Talk': 'talk', 'News': 'news', 'Soap': 'soap', 'Kids': 'kids',
}
const normGenre = g => GENRE_NORM[g] || g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

async function main() {
  console.log('Fetching all series...')
  const series = await fetchAll('series', 'select=id,tmdb_id,titulo,titulo_ingles,anio_inicio,nota_imdb,categoria,certification')
  console.log(`Found ${series.length} series`)

  console.log('Fetching enrichment data...')
  const enrichments = await fetchAll('enriquecimiento_series', 'select=serie_id,director,generos,keywords,compositor')

  const enrMap = {}
  enrichments.forEach(e => { enrMap[e.serie_id] = e })

  const profiles = series.map(s => {
    const enr = enrMap[s.id] || {}
    const genres = (enr.generos || []).map(normGenre)
    const keywords = (enr.keywords || []).map(k => k.toLowerCase())
    const directors = (enr.director || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const compositor = (enr.compositor || '').toLowerCase().trim()
    const decade = s.anio_inicio ? Math.floor(s.anio_inicio / 10) * 10 : null
    const imdb = s.nota_imdb || 0

    return {
      id: s.id, tmdb_id: s.tmdb_id,
      titulo: s.titulo_ingles || s.titulo,
      anio: s.anio_inicio, imdb,
      categoria: s.categoria, certification: s.certification,
      genres, keywords, directors, compositor, decade,
    }
  })

  console.log(`Built ${profiles.length} profiles`)

  // Keyword IDF
  const keywordDocCount = {}
  profiles.forEach(p => {
    new Set(p.keywords).forEach(k => { keywordDocCount[k] = (keywordDocCount[k] || 0) + 1 })
  })
  const keywordIdf = {}
  for (const [kw, count] of Object.entries(keywordDocCount)) {
    keywordIdf[kw] = Math.min(10, Math.max(1, Math.log(profiles.length / count)))
  }

  function similarity(a, b) {
    if (a.id === b.id) return -1
    let score = 0

    // Keywords (40%)
    if (a.keywords.length > 0 && b.keywords.length > 0) {
      const shared = a.keywords.filter(k => b.keywords.includes(k))
      if (shared.length > 0) {
        const idfSum = shared.reduce((sum, k) => sum + (keywordIdf[k] || 1), 0)
        const maxIdf = Math.max(a.keywords.length, b.keywords.length) * 5
        score += Math.min(40, (idfSum / maxIdf) * 40)
        const rareShared = shared.filter(k => (keywordDocCount[k] || 999) < 30).length
        score += rareShared >= 4 ? 15 : rareShared >= 2 ? 8 : 0
      }
    }

    // Genres (25%)
    if (a.genres.length > 0 && b.genres.length > 0) {
      const shared = a.genres.filter(g => b.genres.includes(g))
      if (shared.length > 0) {
        score += (shared.length / Math.max(a.genres.length, b.genres.length)) * 25
        if (shared.length >= 2) score += 5
      }
    }

    // Creator/Showrunner (15%)
    const sharedDirs = a.directors.filter(d => b.directors.some(bd => bd.includes(d) || d.includes(bd)))
    if (sharedDirs.length > 0) score += 15

    // Compositor (5%)
    if (a.compositor && b.compositor && a.compositor === b.compositor && a.compositor !== 'unknown') score += 5

    // Decade (5%)
    if (a.decade && b.decade) {
      const diff = Math.abs(a.decade - b.decade)
      if (diff === 0) score += 5
      else if (diff === 10) score += 2
    }

    // IMDB range (5%)
    if (a.imdb > 0 && b.imdb > 0) {
      const diff = Math.abs(a.imdb - b.imdb)
      if (diff <= 0.5) score += 5
      else if (diff <= 1.0) score += 3
      else if (diff <= 1.5) score += 1
    }

    // Category (5%)
    if (a.categoria && b.categoria && a.categoria === b.categoria) score += 5

    // Certification bonus
    if (a.certification && b.certification && a.certification === b.certification) score += 2

    // Penalty for very different quality
    if (a.imdb > 0 && b.imdb > 0 && Math.abs(a.imdb - b.imdb) > 3) score -= 5

    // PENALTY: animation vs live action mismatch
    const aIsAnimation = a.genres.includes('animacion') || a.genres.includes('kids')
    const bIsAnimation = b.genres.includes('animacion') || b.genres.includes('kids')
    if (aIsAnimation !== bIsAnimation) score -= 15

    return score
  }

  // Process all series
  console.log(`\nCalculating similarities for ${profiles.length} series...`)
  let updated = 0

  for (const target of profiles) {
    const scores = profiles
      .map(other => ({ id: other.id, tmdb_id: other.tmdb_id, score: similarity(target, other) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)

    if (scores.length < 3) continue

    const similarTmdbIds = scores.map(s => s.tmdb_id).filter(Boolean)

    const res = await fetch(`${SUPA_URL}/rest/v1/enriquecimiento_series?serie_id=eq.${target.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ similar_ids: similarTmdbIds }),
    })

    if (res.status === 204) updated++
    if (updated % 100 === 0 && updated > 0) console.log(`  Progress: ${updated}/${profiles.length}...`)
  }

  console.log(`\nDone! Updated ${updated} series with similar_ids`)
}

main().catch(e => { console.error(e); process.exit(1) })
