// Enrich series with missing fields from TMDB — same logic as enrich_massive.mjs
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
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || ''

const sleep = ms => new Promise(r => setTimeout(r, ms))

let tmdbCalls = 0
async function tmdb(path) {
  tmdbCalls++
  if (tmdbCalls % 30 === 0) await sleep(1100)
  const res = await fetch(`https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`)
  if (res.status === 429) { await sleep(10000); return tmdb(path) }
  if (!res.ok) return null
  return res.json()
}

async function supaAll(table, query) {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${SUPA_URL}/${table}?${query}&limit=1000&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < 1000) break
    offset += 1000
  }
  return all
}

async function supaPatch(table, filter, data) {
  const res = await fetch(`${SUPA_URL}/${table}?${filter}`, {
    method: 'PATCH',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  })
  return res.ok
}

function getCertification(contentRatings) {
  const results = contentRatings?.results || []
  for (const country of ['CL', 'US']) {
    const entry = results.find(r => r.iso_3166_1 === country)
    if (entry?.rating) return entry.rating
  }
  return null
}

async function main() {
  console.log('='.repeat(70))
  console.log('  ENRIQUECIMIENTO DE SERIES')
  console.log('='.repeat(70))

  const [series, enrichments] = await Promise.all([
    supaAll('series', 'select=*'),
    supaAll('enriquecimiento_series', 'select=*'),
  ])
  console.log(`${series.length} series, ${enrichments.length} enriquecimientos`)

  const enrichById = {}
  for (const e of enrichments) enrichById[e.serie_id] = e

  // Find series with missing fields
  const needsWork = []
  for (const s of series) {
    if (!s.tmdb_id) continue
    const e = enrichById[s.id]
    const missing = []

    if (!s.nota_imdb) missing.push('nota_imdb')
    if (!s.poster_path) missing.push('poster')
    if (!s.backdrop_path) missing.push('backdrop')
    if (!s.logo_path) missing.push('logo')
    if (!s.youtube_trailer_key) missing.push('trailer')
    if (!s.imdb_id) missing.push('imdb_id')
    if (!s.episode_runtime) missing.push('runtime')
    if (!s.certification) missing.push('certification')
    if (!s.tagline) missing.push('tagline')
    if (!e || !e.sinopsis_chilensis) missing.push('sinopsis')
    if (!e || !e.director) missing.push('director')
    if (!e || !e.actores || (Array.isArray(e.actores) && e.actores.length === 0)) missing.push('actores')
    if (!e || !e.compositor) missing.push('compositor')
    if (!e || !Array.isArray(e.generos) || e.generos.length === 0) missing.push('generos')
    if (!e || !Array.isArray(e.keywords) || e.keywords.length === 0) missing.push('keywords')
    if (!e || !Array.isArray(e.cast_json) || e.cast_json.length === 0) missing.push('cast_json')

    if (missing.length > 0) needsWork.push({ s, e, missing })
  }

  needsWork.sort((a, b) => (b.s.nota_imdb || 0) - (a.s.nota_imdb || 0))
  console.log(`Series con campos faltantes: ${needsWork.length}`)

  // Field summary
  const fieldCount = {}
  for (const w of needsWork) for (const f of w.missing) fieldCount[f] = (fieldCount[f] || 0) + 1
  for (const [f, c] of Object.entries(fieldCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(f).padEnd(15)} ${c}`)
  }

  const stats = { ok: 0, partial: 0, fail: 0 }

  for (let i = 0; i < needsWork.length; i++) {
    const { s, e, missing } = needsWork[i]
    const pct = ((i + 1) / needsWork.length * 100).toFixed(0)

    const [detailsEs, detailsEn, credits, keywords, images, videos, contentRatings, externalIds] = await Promise.all([
      tmdb(`/tv/${s.tmdb_id}?language=es-CL`),
      tmdb(`/tv/${s.tmdb_id}?language=en-US`),
      tmdb(`/tv/${s.tmdb_id}/credits?language=en-US`),
      tmdb(`/tv/${s.tmdb_id}/keywords`),
      tmdb(`/tv/${s.tmdb_id}/images?include_image_language=en,null`),
      tmdb(`/tv/${s.tmdb_id}/videos?language=en-US`),
      tmdb(`/tv/${s.tmdb_id}/content_ratings`),
      tmdb(`/tv/${s.tmdb_id}/external_ids`),
    ])

    if (!detailsEs) { stats.fail++; continue }

    // Series table updates
    const serUpdate = {}
    let filled = 0

    if (missing.includes('nota_imdb') && detailsEs.vote_average > 0 && detailsEs.vote_count > 50) {
      serUpdate.nota_imdb = Math.round(detailsEs.vote_average * 10) / 10; filled++
    }
    if (missing.includes('poster') && detailsEs.poster_path) { serUpdate.poster_path = detailsEs.poster_path; filled++ }
    if (missing.includes('backdrop') && detailsEs.backdrop_path) { serUpdate.backdrop_path = detailsEs.backdrop_path; filled++ }
    if (missing.includes('runtime')) {
      const runtimes = detailsEs.episode_run_time || []
      if (runtimes.length > 0) { serUpdate.episode_runtime = Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length); filled++ }
    }
    if (missing.includes('tagline')) {
      const tag = detailsEs.tagline || detailsEn?.tagline
      if (tag) { serUpdate.tagline = tag; filled++ }
    }
    if (missing.includes('imdb_id') && externalIds?.imdb_id) { serUpdate.imdb_id = externalIds.imdb_id; filled++ }
    if (missing.includes('certification') && contentRatings) {
      const cert = getCertification(contentRatings)
      if (cert) { serUpdate.certification = cert; filled++ }
    }
    if (missing.includes('logo') && images) {
      const logos = images.logos || []
      if (logos.length > 0) { serUpdate.logo_path = logos[0].file_path; filled++ }
    }
    if (missing.includes('trailer') && videos) {
      const trailers = (videos.results || []).filter(v => v.type === 'Trailer' && v.site === 'YouTube')
      const any = trailers[0] || (videos.results || []).find(v => v.site === 'YouTube')
      if (any) { serUpdate.youtube_trailer_key = any.key; filled++ }
    }

    if (Object.keys(serUpdate).length > 0) await supaPatch('series', `id=eq.${s.id}`, serUpdate)

    // Enrichment updates
    const enrUpdate = {}

    if (credits) {
      const crew = credits.crew || []
      const cast = credits.cast || []
      const createdBy = (detailsEs.created_by || []).map(c => c.name)

      if (missing.includes('director')) {
        const dirs = createdBy.length > 0 ? createdBy : crew.filter(c => c.job === 'Director' || c.job === 'Executive Producer').slice(0, 3).map(c => c.name)
        if (dirs.length > 0) { enrUpdate.director = dirs.join(', '); filled++ }
      }
      if (missing.includes('actores')) {
        const actors = cast.slice(0, 5).map(c => c.name)
        if (actors.length > 0) { enrUpdate.actores = actors; filled++ }
      }
      if (missing.includes('compositor')) {
        const composers = crew.filter(c => c.job === 'Original Music Composer' || c.job === 'Music' || c.job === 'Theme Song Performance').map(c => c.name)
        if (composers.length > 0) { enrUpdate.compositor = composers.join(', '); filled++ }
      }
      if (missing.includes('cast_json')) {
        const castJson = cast.slice(0, 15).map(c => ({ name: c.name, character: c.character, profile_path: c.profile_path }))
        if (castJson.length > 0) { enrUpdate.cast_json = castJson; filled++ }
      }
    }

    if (missing.includes('generos') && detailsEs.genres) {
      const generos = detailsEs.genres.map(g => g.name)
      if (generos.length > 0) { enrUpdate.generos = generos; filled++ }
    }
    if (missing.includes('keywords') && keywords) {
      const kws = (keywords.results || []).map(k => k.name)
      if (kws.length > 0) { enrUpdate.keywords = kws; filled++ }
    }
    if (missing.includes('sinopsis')) {
      const sin = detailsEs.overview || detailsEn?.overview
      if (sin) { enrUpdate.sinopsis_chilensis = sin; filled++ }
    }

    if (Object.keys(enrUpdate).length > 0) {
      if (e) await supaPatch('enriquecimiento_series', `serie_id=eq.${s.id}`, enrUpdate)
    }

    if (filled === missing.length) stats.ok++
    else if (filled > 0) stats.partial++
    else stats.fail++

    if ((i + 1) % 100 === 0) console.log(`[${i + 1}/${needsWork.length} ${pct}%] ok:${stats.ok} partial:${stats.partial} fail:${stats.fail}`)
  }

  console.log('\n' + '='.repeat(70))
  console.log(`  Completas: ${stats.ok}, Parciales: ${stats.partial}, Sin datos: ${stats.fail}`)
  console.log(`  Calls TMDB: ${tmdbCalls}`)
  console.log('='.repeat(70))
}

main().catch(e => { console.error(e); process.exit(1) })
