// Load TV series from TMDB into Supabase
// Sources: trending, top rated, popular, and platform-specific (Netflix, HBO, etc.)
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

const TMDB_KEY = process.env.TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || ''

if (!TMDB_KEY) { console.error('Missing TMDB_API_KEY'); process.exit(1) }
if (!SUPA_KEY) { console.error('Missing SUPABASE_SECRET_KEY'); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))

let tmdbCalls = 0
async function tmdb(path) {
  tmdbCalls++
  if (tmdbCalls % 30 === 0) await sleep(1100)
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`
  const res = await fetch(url)
  if (res.status === 429) {
    console.log('  Rate limited, waiting 10s...')
    await sleep(10000)
    return tmdb(path)
  }
  if (!res.ok) return null
  return res.json()
}

async function supaUpsert(table, rows) {
  const res = await fetch(`${SUPA_URL}/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error(`  Upsert ${table} failed: ${res.status} ${txt}`)
    return []
  }
  return res.json()
}

function getCertification(contentRatings) {
  const results = contentRatings?.results || []
  for (const country of ['CL', 'US']) {
    const entry = results.find(r => r.iso_3166_1 === country)
    if (entry?.rating) return entry.rating
  }
  return null
}

// ============================================================
// Fetch series from multiple TMDB sources
// ============================================================
async function fetchSeriesIds() {
  const allIds = new Set()

  // 1. Trending (week) — 5 pages = ~100 series
  console.log('Fetching trending series...')
  for (let p = 1; p <= 5; p++) {
    const data = await tmdb(`/trending/tv/week?page=${p}&language=es-CL`)
    if (data?.results) data.results.forEach(s => allIds.add(s.id))
  }
  console.log(`  Trending: ${allIds.size} series`)

  // 2. Top rated — 20 pages = ~400 series
  console.log('Fetching top rated series...')
  for (let p = 1; p <= 20; p++) {
    const data = await tmdb(`/tv/top_rated?page=${p}&language=es-CL`)
    if (data?.results) data.results.forEach(s => allIds.add(s.id))
  }
  console.log(`  + Top rated: ${allIds.size} series`)

  // 3. Popular — 30 pages = ~600 series
  console.log('Fetching popular series...')
  for (let p = 1; p <= 30; p++) {
    const data = await tmdb(`/tv/popular?page=${p}&language=es-CL`)
    if (data?.results) data.results.forEach(s => allIds.add(s.id))
  }
  console.log(`  + Popular: ${allIds.size} series`)

  // 4. Discover by platform (Chile watch providers)
  // Netflix=8, Disney+=337, HBO=384/1899, Prime=119/9, Apple=350/2, Paramount=531
  const platforms = [
    { name: 'Netflix', ids: '8' },
    { name: 'Disney+', ids: '337' },
    { name: 'HBO Max', ids: '384|1899' },
    { name: 'Amazon Prime', ids: '119|9|10' },
    { name: 'Apple TV+', ids: '350|2' },
    { name: 'Paramount+', ids: '531' },
    { name: 'Crunchyroll', ids: '283|1968' },
  ]

  for (const platform of platforms) {
    console.log(`Fetching series from ${platform.name}...`)
    for (const providerId of platform.ids.split('|')) {
      for (let p = 1; p <= 15; p++) {
        const data = await tmdb(`/discover/tv?with_watch_providers=${providerId}&watch_region=CL&page=${p}&language=es-CL&sort_by=vote_count.desc`)
        if (!data?.results || data.results.length === 0) break
        data.results.forEach(s => allIds.add(s.id))
      }
    }
    console.log(`  + ${platform.name}: ${allIds.size} total`)
  }

  // 5. On the air (airing now) — 5 pages
  console.log('Fetching on the air...')
  for (let p = 1; p <= 5; p++) {
    const data = await tmdb(`/tv/on_the_air?page=${p}&language=es-CL`)
    if (data?.results) data.results.forEach(s => allIds.add(s.id))
  }
  console.log(`  + On the air: ${allIds.size} total`)

  // 6. Airing today — 3 pages
  console.log('Fetching airing today...')
  for (let p = 1; p <= 3; p++) {
    const data = await tmdb(`/tv/airing_today?page=${p}&language=es-CL`)
    if (data?.results) data.results.forEach(s => allIds.add(s.id))
  }
  console.log(`  + Airing today: ${allIds.size} total`)

  return [...allIds]
}

// ============================================================
// Fetch full details and enrich each series
// ============================================================
async function enrichSeries(tmdbId) {
  const [detailsEs, detailsEn, credits, keywords, images, videos, contentRatings] = await Promise.all([
    tmdb(`/tv/${tmdbId}?language=es-CL`),
    tmdb(`/tv/${tmdbId}?language=en-US`),
    tmdb(`/tv/${tmdbId}/credits?language=en-US`),
    tmdb(`/tv/${tmdbId}/keywords`),
    tmdb(`/tv/${tmdbId}/images?include_image_language=en,null`),
    tmdb(`/tv/${tmdbId}/videos?language=en-US`),
    tmdb(`/tv/${tmdbId}/content_ratings`),
  ])

  if (!detailsEs) return null

  // --- series table ---
  const logos = images?.logos || []
  const trailers = (videos?.results || []).filter(v => v.type === 'Trailer' && v.site === 'YouTube')
  const anyVideo = trailers[0] || (videos?.results || []).find(v => v.site === 'YouTube')
  const networks = (detailsEs.networks || []).map(n => n.name)
  const originCountry = detailsEs.origin_country || []

  // Episode runtime: TMDB returns array, take first or average
  const runtimes = detailsEs.episode_run_time || []
  const episodeRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null

  const seriesData = {
    tmdb_id: tmdbId,
    titulo: detailsEs.name || detailsEn?.name || 'Sin título',
    titulo_ingles: detailsEn?.name || null,
    anio_inicio: detailsEs.first_air_date ? parseInt(detailsEs.first_air_date.substring(0, 4)) : null,
    anio_fin: detailsEs.last_air_date && detailsEs.status === 'Ended' ? parseInt(detailsEs.last_air_date.substring(0, 4)) : null,
    nota_imdb: detailsEs.vote_average > 0 && detailsEs.vote_count > 50 ? Math.round(detailsEs.vote_average * 10) / 10 : null,
    num_temporadas: detailsEs.number_of_seasons || null,
    num_episodios: detailsEs.number_of_episodes || null,
    estado: detailsEs.status || null,
    poster_path: detailsEs.poster_path || null,
    backdrop_path: detailsEs.backdrop_path || null,
    logo_path: logos.length > 0 ? logos[0].file_path : null,
    youtube_trailer_key: anyVideo?.key || null,
    imdb_id: detailsEn?.external_ids?.imdb_id || null,
    episode_runtime: episodeRuntime,
    certification: getCertification(contentRatings),
    tagline: detailsEs.tagline || detailsEn?.tagline || null,
    networks: networks.length > 0 ? networks : null,
    origin_country: originCountry.length > 0 ? originCountry : null,
  }

  // --- enriquecimiento_series ---
  const crew = credits?.crew || []
  const cast = credits?.cast || []
  const createdBy = (detailsEs.created_by || []).map(c => c.name)

  // For TV, "director" = created_by / showrunner. Fallback to credited directors
  const directors = createdBy.length > 0
    ? createdBy
    : crew.filter(c => c.job === 'Director' || c.job === 'Executive Producer').slice(0, 3).map(c => c.name)

  const actores = cast.slice(0, 5).map(c => c.name)
  const compositores = crew.filter(c => c.job === 'Original Music Composer' || c.job === 'Music' || c.job === 'Theme Song Performance').map(c => c.name)
  const castJson = cast.slice(0, 15).map(c => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
  }))
  const kws = (keywords?.results || []).map(k => k.name)
  const generos = (detailsEs.genres || []).map(g => g.name)
  const sinopsis = detailsEs.overview || detailsEn?.overview || null

  const enrichData = {
    sinopsis_chilensis: sinopsis,
    director: directors.join(', ') || null,
    actores: actores.length > 0 ? actores : null,
    compositor: compositores.join(', ') || null,
    generos: generos.length > 0 ? generos : null,
    keywords: kws.length > 0 ? kws : null,
    cast_json: castJson.length > 0 ? castJson : null,
  }

  return { seriesData, enrichData }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('='.repeat(70))
  console.log('  CARGA DE SERIES DESDE TMDB')
  console.log('='.repeat(70))

  // Check existing series in DB
  const existingRes = await fetch(`${SUPA_URL}/series?select=tmdb_id&limit=10000`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  })
  const existing = new Set((await existingRes.json()).map(s => s.tmdb_id))
  console.log(`Series ya en DB: ${existing.size}`)

  // Fetch all series IDs from TMDB
  const allIds = await fetchSeriesIds()
  const newIds = allIds.filter(id => !existing.has(id))
  console.log(`\nTotal IDs de TMDB: ${allIds.length}`)
  console.log(`Nuevas (no en DB): ${newIds.length}`)

  // Process in order
  const stats = { ok: 0, fail: 0 }
  const BATCH_SIZE = 50
  let seriesBatch = []
  let enrichBatch = []

  for (let i = 0; i < newIds.length; i++) {
    const tmdbId = newIds[i]
    const pct = ((i + 1) / newIds.length * 100).toFixed(0)

    try {
      const result = await enrichSeries(tmdbId)
      if (!result) {
        stats.fail++
        continue
      }

      seriesBatch.push(result.seriesData)
      enrichBatch.push(result.enrichData)
      stats.ok++

      // Upsert in batches
      if (seriesBatch.length >= BATCH_SIZE || i === newIds.length - 1) {
        // Insert series
        const inserted = await supaUpsert('series', seriesBatch)

        // Insert enrichment with serie_id
        if (inserted.length > 0) {
          const enrichRows = inserted.map((s, idx) => ({
            serie_id: s.id,
            ...enrichBatch[idx],
          }))
          await supaUpsert('enriquecimiento_series', enrichRows)
        }

        console.log(`[${i + 1}/${newIds.length} ${pct}%] Batch upserted: ${seriesBatch.length} series (total ok: ${stats.ok})`)
        seriesBatch = []
        enrichBatch = []
      }

    } catch (err) {
      console.error(`  Error tmdb:${tmdbId}: ${err.message}`)
      stats.fail++
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('  RESULTADO FINAL')
  console.log('='.repeat(70))
  console.log(`  Series nuevas cargadas: ${stats.ok}`)
  console.log(`  Fallidas:               ${stats.fail}`)
  console.log(`  Total en DB ahora:      ${existing.size + stats.ok}`)
  console.log(`  Calls TMDB:             ${tmdbCalls}`)
  console.log('='.repeat(70))
}

main().catch(e => { console.error(e); process.exit(1) })
