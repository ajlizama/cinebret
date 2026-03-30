// Internal similar movies algorithm - no AI, pure feature matching
// Uses: keywords, genres, director, decade, IMDB range, mood, certification

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

// Normalize genre for comparison
const GENRE_NORM = {
  'Acción': 'accion', 'Action': 'accion', 'Aventura': 'aventura', 'Adventure': 'aventura',
  'Animación': 'animacion', 'Animation': 'animacion', 'Comedia': 'comedia', 'Comedy': 'comedia',
  'Crimen': 'crimen', 'Crime': 'crimen', 'Documental': 'documental', 'Documentary': 'documental',
  'Drama': 'drama', 'Fantasía': 'fantasia', 'Fantasy': 'fantasia', 'Familia': 'familia', 'Family': 'familia',
  'Guerra': 'guerra', 'War': 'guerra', 'Historia': 'historia', 'History': 'historia',
  'Misterio': 'misterio', 'Mystery': 'misterio', 'Música': 'musica', 'Music': 'musica',
  'Romance': 'romance', 'Ciencia ficción': 'scifi', 'Ciencia Ficción': 'scifi', 'Science Fiction': 'scifi',
  'Thriller': 'thriller', 'Terror': 'terror', 'Horror': 'terror', 'Western': 'western',
  'Biografía': 'biografia', 'Biography': 'biografia',
}
const normGenre = g => GENRE_NORM[g] || g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

async function main() {
  console.log('Fetching all movies...')
  const movies = await fetchAll('peliculas', 'select=id,tmdb_id,titulo,titulo_ingles,anio,nota_imdb,categoria,certification')
  console.log(`Found ${movies.length} movies`)

  console.log('Fetching enrichment data...')
  const enrichments = await fetchAll('enriquecimiento', 'select=pelicula_id,director,generos,keywords,compositor')

  // Build enrichment map
  const enrMap = {}
  enrichments.forEach(e => { enrMap[e.pelicula_id] = e })

  // Build movie profiles
  const profiles = movies.map(m => {
    const enr = enrMap[m.id] || {}
    const genres = (enr.generos || []).map(normGenre)
    const keywords = (enr.keywords || []).map(k => k.toLowerCase())
    const directors = (enr.director || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    const compositor = (enr.compositor || '').toLowerCase().trim()
    const decade = m.anio ? Math.floor(m.anio / 10) * 10 : null
    const imdb = m.nota_imdb || 0

    return {
      id: m.id,
      tmdb_id: m.tmdb_id,
      titulo: m.titulo_ingles || m.titulo,
      anio: m.anio,
      imdb,
      categoria: m.categoria,
      certification: m.certification,
      genres,
      keywords,
      directors,
      compositor,
      decade,
    }
  })

  console.log(`Built ${profiles.length} profiles`)

  // Build keyword IDF (inverse document frequency) - rare keywords are more valuable
  const keywordDocCount = {}
  const totalDocs = profiles.length
  profiles.forEach(p => {
    const uniqueKws = new Set(p.keywords)
    uniqueKws.forEach(k => { keywordDocCount[k] = (keywordDocCount[k] || 0) + 1 })
  })
  // IDF: log(totalDocs / docCount) - capped between 1 and 10
  const keywordIdf = {}
  for (const [kw, count] of Object.entries(keywordDocCount)) {
    keywordIdf[kw] = Math.min(10, Math.max(1, Math.log(totalDocs / count)))
  }
  console.log(`Keyword IDF built. Most common: "${Object.entries(keywordDocCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,c])=>`${k}(${c})`).join(', ')}"`)
  console.log(`Most rare (in 2+ movies): "${Object.entries(keywordDocCount).filter(([,c])=>c>=2).sort((a,b)=>a[1]-b[1]).slice(0,5).map(([k,c])=>`${k}(${c})`).join(', ')}"`)

  // Similarity function
  function similarity(a, b) {
    if (a.id === b.id) return -1 // exclude self

    let score = 0

    // 1. KEYWORDS with TF-IDF weighting (40% weight)
    // Rare shared keywords (like "prison" in only 5 movies) score much higher
    // than common ones (like "based on novel or book" in 200 movies)
    if (a.keywords.length > 0 && b.keywords.length > 0) {
      const shared = a.keywords.filter(k => b.keywords.includes(k))
      if (shared.length > 0) {
        // Sum IDF weights of shared keywords (rare = high weight)
        const idfSum = shared.reduce((sum, k) => sum + (keywordIdf[k] || 1), 0)
        // Normalize by max possible IDF sum
        const maxIdf = Math.max(a.keywords.length, b.keywords.length) * 5 // avg IDF ~5
        const keywordScore = Math.min(40, (idfSum / maxIdf) * 40)
        // Bonus for many rare shared keywords
        const rareShared = shared.filter(k => (keywordDocCount[k] || 999) < 30).length
        const bonus = rareShared >= 4 ? 15 : rareShared >= 2 ? 8 : 0
        score += keywordScore + bonus
      }
    }

    // 2. GENRES (25% weight)
    if (a.genres.length > 0 && b.genres.length > 0) {
      const shared = a.genres.filter(g => b.genres.includes(g))
      if (shared.length > 0) {
        // More shared genres = higher score, with diminishing returns
        const genreRatio = shared.length / Math.max(a.genres.length, b.genres.length)
        score += genreRatio * 25
        // Exact genre match bonus
        if (shared.length >= 2) score += 5
      }
    }

    // 3. DIRECTOR (15% weight)
    // Same director is a very strong signal
    const sharedDirectors = a.directors.filter(d => b.directors.some(bd => bd.includes(d) || d.includes(bd)))
    if (sharedDirectors.length > 0) {
      score += 15
    }

    // 4. COMPOSITOR (5% weight)
    // Same composer suggests similar tone/feel
    if (a.compositor && b.compositor && a.compositor === b.compositor && a.compositor !== 'unknown') {
      score += 5
    }

    // 5. DECADE/ERA (5% weight)
    // Movies from the same era share aesthetic sensibilities
    if (a.decade && b.decade) {
      const decadeDiff = Math.abs(a.decade - b.decade)
      if (decadeDiff === 0) score += 5
      else if (decadeDiff === 10) score += 2
    }

    // 6. IMDB RANGE (5% weight)
    // Similar quality level
    if (a.imdb > 0 && b.imdb > 0) {
      const diff = Math.abs(a.imdb - b.imdb)
      if (diff <= 0.5) score += 5
      else if (diff <= 1.0) score += 3
      else if (diff <= 1.5) score += 1
    }

    // 7. MOOD/CATEGORY (5% weight)
    if (a.categoria && b.categoria && a.categoria === b.categoria) {
      score += 5
    }

    // 8. CERTIFICATION (bonus for same audience)
    if (a.certification && b.certification && a.certification === b.certification) {
      score += 2
    }

    // PENALTY: Very different IMDB scores suggest different quality tiers
    if (a.imdb > 0 && b.imdb > 0 && Math.abs(a.imdb - b.imdb) > 3) {
      score -= 5
    }

    return score
  }

  // Fetch trending from TMDB
  console.log('Fetching trending from TMDB...')
  const tmdbKey = process.env.TMDB_API_KEY
  let trendingTmdbIds = new Set()
  if (tmdbKey) {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&page=${page}`)
      const data = await res.json()
      ;(data.results || []).forEach(m => trendingTmdbIds.add(m.id))
    }
  }
  console.log(`Trending: ${trendingTmdbIds.size} movies`)

  // Select target movies: top 200 by IMDB + all trending in our DB
  const sorted = [...profiles].filter(p => p.imdb > 0).sort((a, b) => b.imdb - a.imdb)
  const top200 = sorted // ALL movies, not just 200
  const trendingInDb = profiles.filter(p => p.tmdb_id && trendingTmdbIds.has(p.tmdb_id))

  const targetSet = new Set()
  const targets = []
  for (const p of [...top200, ...trendingInDb]) {
    if (!targetSet.has(p.id)) {
      targetSet.add(p.id)
      targets.push(p)
    }
  }
  console.log(`\nProcessing ${targets.length} target movies (top 200 IMDB + trending)...\n`)

  // Calculate similar movies for each target
  let updated = 0
  let skipped = 0
  const sampleResults = []

  for (const target of targets) {
    // Score all other movies
    const scores = profiles
      .map(other => ({ id: other.id, titulo: other.titulo, anio: other.anio, imdb: other.imdb, score: similarity(target, other) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)

    if (scores.length < 3) {
      skipped++
      continue
    }

    // Store as tmdb_ids (the app reads similar_ids as tmdb_ids)
    const similarTmdbIds = scores
      .map(s => profiles.find(p => p.id === s.id)?.tmdb_id)
      .filter(Boolean)

    // Save first 5 as sample for console output
    if (sampleResults.length < 25) {
      sampleResults.push({
        movie: `${target.titulo} (${target.anio}) [${target.imdb}]`,
        genres: target.genres.join(', '),
        keywords: target.keywords.slice(0, 5).join(', '),
        similar: scores.slice(0, 10).map(s => `${s.titulo} (${s.anio}) [${s.imdb}] score:${s.score.toFixed(1)}`),
      })
    }

    // Upsert to Supabase
    const res = await fetch(`${SUPA_URL}/rest/v1/enriquecimiento?pelicula_id=eq.${target.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ similar_ids: similarTmdbIds }),
    })

    if (res.status === 204) updated++
    else {
      // Maybe no enriquecimiento row yet
      const res2 = await fetch(`${SUPA_URL}/rest/v1/enriquecimiento`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ pelicula_id: target.id, similar_ids: similarTmdbIds }),
      })
      if (res2.ok) updated++
    }

    if (updated % 50 === 0 && updated > 0) {
      console.log(`  Progress: ${updated}/${targets.length}...`)
    }
  }

  // Print sample results
  console.log('\n══════════════════════════════════════════')
  console.log('  SAMPLE RESULTS — Check quality')
  console.log('══════════════════════════════════════════\n')

  for (const sample of sampleResults) {
    console.log(`▸ ${sample.movie}`)
    console.log(`  Genres: ${sample.genres}`)
    console.log(`  Keywords: ${sample.keywords}`)
    console.log(`  Similar:`)
    sample.similar.forEach((s, i) => console.log(`    ${i + 1}. ${s}`))
    console.log()
  }

  console.log(`\nDone! Updated ${updated} movies, skipped ${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
