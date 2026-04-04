// Daily gap checker — fills missing data from TMDB for movies and series
// Designed to run in GitHub Actions daily after scraping
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

if (!TMDB_KEY || !SUPA_KEY) { console.error('Missing keys'); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
let tmdbCalls = 0

async function tmdb(path) {
  tmdbCalls++
  if (tmdbCalls % 35 === 0) await sleep(1100)
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

async function supaUpsert(table, data) {
  const res = await fetch(`${SUPA_URL}/${table}`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data),
  })
  return res.ok
}

const PROVIDER_MAP = {
  8: 'netflix', 337: 'disney_plus', 384: 'hbo_max', 1899: 'hbo_max',
  119: 'amazon_prime', 9: 'amazon_prime', 10: 'amazon_prime',
  350: 'apple_tv', 2: 'apple_tv', 531: 'paramount_plus', 11: 'mubi',
  283: 'crunchyroll', 1968: 'crunchyroll',
}

function getCertification(releaseDates) {
  for (const country of ['CL', 'US']) {
    const entry = (releaseDates?.results || []).find(r => r.iso_3166_1 === country)
    if (entry) for (const rd of entry.release_dates) if (rd.certification) return rd.certification
  }
  return null
}

async function main() {
  console.log('='.repeat(60))
  console.log('  DAILY GAP CHECK — ' + new Date().toISOString().split('T')[0])
  console.log('='.repeat(60))

  const stats = { watchProviders: 0, enriched: 0, seriesWP: 0, seriesEnriched: 0 }

  // ═══════════════════════════════════════════════════
  // 1. MOVIES — Watch Providers gaps
  // ═══════════════════════════════════════════════════
  console.log('\n--- 1. Movie Watch Providers ---')
  const moviesWithTmdb = await supaAll('peliculas', 'select=id,tmdb_id&tmdb_id=not.is.null')
  const existingWP = await supaAll('watch_providers', 'select=pelicula_id')
  const moviesWithWP = new Set(existingWP.map(w => w.pelicula_id))
  const moviesNeedWP = moviesWithTmdb.filter(m => !moviesWithWP.has(m.id))
  console.log(`  Movies without watch providers: ${moviesNeedWP.length}`)

  for (const movie of moviesNeedWP) {
    const data = await tmdb(`/movie/${movie.tmdb_id}/watch/providers`)
    const cl = data?.results?.CL
    if (cl) {
      for (const type of ['flatrate', 'rent', 'buy']) {
        for (const p of (cl[type] || [])) {
          if (PROVIDER_MAP[p.provider_id]) {
            await supaUpsert('watch_providers', {
              pelicula_id: movie.id, tmdb_id: movie.tmdb_id, provider_id: p.provider_id,
              provider_name: p.provider_name, provider_type: type,
              platform_key: PROVIDER_MAP[p.provider_id], logo_path: p.logo_path || '', tmdb_link: cl.link || '',
            })
            stats.watchProviders++
          }
        }
      }
    }
  }
  console.log(`  Added ${stats.watchProviders} provider rows`)

  // ═══════════════════════════════════════════════════
  // 2. MOVIES — Enrichment gaps
  // ═══════════════════════════════════════════════════
  console.log('\n--- 2. Movie Enrichment Gaps ---')
  const allMovies = await supaAll('peliculas', 'select=id,tmdb_id,nota_imdb,poster_path,backdrop_path,logo_path,youtube_trailer_key,imdb_id,runtime,certification,tagline')
  const allEnr = await supaAll('enriquecimiento', 'select=pelicula_id,director,actores,generos,keywords,cast_json,sinopsis_chilensis')
  const enrMap = new Map(allEnr.map(e => [e.pelicula_id, e]))

  const needsEnrich = allMovies.filter(m => {
    if (!m.tmdb_id) return false
    const e = enrMap.get(m.id)
    return !m.nota_imdb || !m.poster_path || !m.youtube_trailer_key || !m.imdb_id || !m.runtime ||
      !e || !e.director || !e.generos?.length || !e.keywords?.length || !e.cast_json?.length || !e.sinopsis_chilensis
  })
  console.log(`  Movies with gaps: ${needsEnrich.length}`)

  for (const movie of needsEnrich.slice(0, 200)) { // cap at 200 per run
    const [detEs, detEn, credits, kw, imgs, vids, rd] = await Promise.all([
      tmdb(`/movie/${movie.tmdb_id}?language=es-CL`),
      tmdb(`/movie/${movie.tmdb_id}?language=en-US`),
      tmdb(`/movie/${movie.tmdb_id}/credits?language=en-US`),
      tmdb(`/movie/${movie.tmdb_id}/keywords`),
      tmdb(`/movie/${movie.tmdb_id}/images?include_image_language=en,null`),
      tmdb(`/movie/${movie.tmdb_id}/videos?language=en-US`),
      tmdb(`/movie/${movie.tmdb_id}/release_dates`),
    ])
    if (!detEs) continue

    // Update peliculas
    const pelUpdate = {}
    if (!movie.nota_imdb && detEs.vote_average > 0 && detEs.vote_count > 100) pelUpdate.nota_imdb = Math.round(detEs.vote_average * 10) / 10
    if (!movie.poster_path && detEs.poster_path) pelUpdate.poster_path = detEs.poster_path
    if (!movie.backdrop_path && detEs.backdrop_path) pelUpdate.backdrop_path = detEs.backdrop_path
    if (!movie.runtime && detEs.runtime > 0) pelUpdate.runtime = detEs.runtime
    if (!movie.imdb_id && detEs.imdb_id) pelUpdate.imdb_id = detEs.imdb_id
    if (!movie.tagline) { const tag = detEs.tagline || detEn?.tagline; if (tag) pelUpdate.tagline = tag }
    if (!movie.certification && rd) { const cert = getCertification(rd); if (cert) pelUpdate.certification = cert }
    if (!movie.logo_path && imgs?.logos?.length > 0) pelUpdate.logo_path = imgs.logos[0].file_path
    if (!movie.youtube_trailer_key && vids) {
      const vid = (vids.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || (vids.results || []).find(v => v.site === 'YouTube')
      if (vid) pelUpdate.youtube_trailer_key = vid.key
    }
    if (Object.keys(pelUpdate).length > 0) await supaPatch('peliculas', `id=eq.${movie.id}`, pelUpdate)

    // Update enrichment
    const e = enrMap.get(movie.id)
    const enrUpdate = {}
    const crew = credits?.crew || []
    const cast = credits?.cast || []
    if (!e?.director) { const dirs = crew.filter(c => c.job === 'Director').map(c => c.name); if (dirs.length) enrUpdate.director = dirs.join(', ') }
    if (!e?.actores || (Array.isArray(e.actores) && e.actores.length === 0)) { const actors = cast.slice(0, 5).map(c => c.name); if (actors.length) enrUpdate.actores = actors.join(', ') }
    if (!e?.generos || e.generos.length === 0) { const g = (detEs.genres || []).map(g => g.name); if (g.length) enrUpdate.generos = g }
    if (!e?.keywords || e.keywords.length === 0) { const k = (kw?.keywords || []).map(k => k.name); if (k.length) enrUpdate.keywords = k }
    if (!e?.cast_json || e.cast_json.length === 0) { const cj = cast.slice(0, 15).map(c => ({ name: c.name, character: c.character, profile_path: c.profile_path })); if (cj.length) enrUpdate.cast_json = cj }
    if (!e?.sinopsis_chilensis) { const sin = detEs.overview || detEn?.overview; if (sin) enrUpdate.sinopsis_chilensis = sin }

    if (Object.keys(enrUpdate).length > 0) {
      if (e) await supaPatch('enriquecimiento', `pelicula_id=eq.${movie.id}`, enrUpdate)
      else await supaUpsert('enriquecimiento', { pelicula_id: movie.id, ...enrUpdate })
      stats.enriched++
    }
  }
  console.log(`  Enriched ${stats.enriched} movies`)

  // ═══════════════════════════════════════════════════
  // 3. SERIES — Watch Providers gaps
  // ═══════════════════════════════════════════════════
  console.log('\n--- 3. Series Watch Providers ---')
  const seriesWithTmdb = await supaAll('series', 'select=id,tmdb_id&tmdb_id=not.is.null')
  const existingSWP = await supaAll('watch_providers_series', 'select=serie_id')
  const seriesWithWP = new Set(existingSWP.map(w => w.serie_id))
  const seriesNeedWP = seriesWithTmdb.filter(s => !seriesWithWP.has(s.id))
  console.log(`  Series without watch providers: ${seriesNeedWP.length}`)

  for (const serie of seriesNeedWP) {
    const data = await tmdb(`/tv/${serie.tmdb_id}/watch/providers`)
    const cl = data?.results?.CL
    if (cl) {
      for (const type of ['flatrate', 'rent', 'buy']) {
        for (const p of (cl[type] || [])) {
          if (PROVIDER_MAP[p.provider_id]) {
            await supaUpsert('watch_providers_series', {
              serie_id: serie.id, tmdb_id: serie.tmdb_id, provider_id: p.provider_id,
              provider_name: p.provider_name, provider_type: type,
              platform_key: PROVIDER_MAP[p.provider_id], logo_path: p.logo_path || '', tmdb_link: cl.link || '',
            })
            stats.seriesWP++
          }
        }
      }
    }
  }
  console.log(`  Added ${stats.seriesWP} series provider rows`)

  // ═══════════════════════════════════════════════════
  // 4. SERIES — Enrichment gaps
  // ═══════════════════════════════════════════════════
  console.log('\n--- 4. Series Enrichment Gaps ---')
  const allSeries = await supaAll('series', 'select=id,tmdb_id,nota_imdb,poster_path,youtube_trailer_key,imdb_id')
  const allSerEnr = await supaAll('enriquecimiento_series', 'select=serie_id,director,generos,keywords,cast_json,sinopsis_chilensis')
  const serEnrMap = new Map(allSerEnr.map(e => [e.serie_id, e]))

  const seriesNeedEnrich = allSeries.filter(s => {
    if (!s.tmdb_id) return false
    const e = serEnrMap.get(s.id)
    return !s.nota_imdb || !s.poster_path || !s.youtube_trailer_key || !s.imdb_id ||
      !e || !e.director || !e.generos?.length || !e.keywords?.length || !e.sinopsis_chilensis
  })
  console.log(`  Series with gaps: ${seriesNeedEnrich.length}`)

  for (const serie of seriesNeedEnrich.slice(0, 100)) {
    const [detEs, detEn, credits, kw, vids, ext] = await Promise.all([
      tmdb(`/tv/${serie.tmdb_id}?language=es-CL`),
      tmdb(`/tv/${serie.tmdb_id}?language=en-US`),
      tmdb(`/tv/${serie.tmdb_id}/credits?language=en-US`),
      tmdb(`/tv/${serie.tmdb_id}/keywords`),
      tmdb(`/tv/${serie.tmdb_id}/videos?language=en-US`),
      tmdb(`/tv/${serie.tmdb_id}/external_ids`),
    ])
    if (!detEs) continue

    const serUpdate = {}
    if (!serie.nota_imdb && detEs.vote_average > 0 && detEs.vote_count > 50) serUpdate.nota_imdb = Math.round(detEs.vote_average * 10) / 10
    if (!serie.poster_path && detEs.poster_path) serUpdate.poster_path = detEs.poster_path
    if (!serie.imdb_id && ext?.imdb_id) serUpdate.imdb_id = ext.imdb_id
    if (!serie.youtube_trailer_key && vids) {
      const vid = (vids.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube') || (vids.results || []).find(v => v.site === 'YouTube')
      if (vid) serUpdate.youtube_trailer_key = vid.key
    }
    if (Object.keys(serUpdate).length > 0) await supaPatch('series', `id=eq.${serie.id}`, serUpdate)

    const e = serEnrMap.get(serie.id)
    const enrUpdate = {}
    const crew = credits?.crew || []
    const cast = credits?.cast || []
    const createdBy = (detEs.created_by || []).map(c => c.name)
    if (!e?.director) { const dirs = createdBy.length > 0 ? createdBy : crew.filter(c => c.job === 'Director').slice(0, 3).map(c => c.name); if (dirs.length) enrUpdate.director = dirs.join(', ') }
    if (!e?.generos || e.generos.length === 0) { const g = (detEs.genres || []).map(g => g.name); if (g.length) enrUpdate.generos = g }
    if (!e?.keywords || e.keywords.length === 0) { const k = (kw?.results || []).map(k => k.name); if (k.length) enrUpdate.keywords = k }
    if (!e?.sinopsis_chilensis) { const sin = detEs.overview || detEn?.overview; if (sin) enrUpdate.sinopsis_chilensis = sin }

    if (Object.keys(enrUpdate).length > 0) {
      if (e) await supaPatch('enriquecimiento_series', `serie_id=eq.${serie.id}`, enrUpdate)
      else await supaUpsert('enriquecimiento_series', { serie_id: serie.id, ...enrUpdate })
      stats.seriesEnriched++
    }
  }
  console.log(`  Enriched ${stats.seriesEnriched} series`)

  // ═══════════════════════════════════════════════════
  // 5. RE-CHECK existing watch providers (update stale ones)
  // ═══════════════════════════════════════════════════
  console.log('\n--- 5. Re-check recent movies providers ---')
  // Re-check movies added in last 7 days or with nota_imdb >= 7 and no flatrate
  const recentMovies = await supaAll('peliculas', 'select=id,tmdb_id&tmdb_id=not.is.null&nota_imdb=gte.7&order=nota_imdb.desc&limit=500')
  const recentWP = await supaAll('watch_providers', 'select=pelicula_id&provider_type=eq.flatrate')
  const hasFlat = new Set(recentWP.map(w => w.pelicula_id))
  const recheck = recentMovies.filter(m => !hasFlat.has(m.id)).slice(0, 100)
  console.log(`  High-rated movies without flatrate: ${recheck.length}`)

  let recheckFound = 0
  for (const movie of recheck) {
    const data = await tmdb(`/movie/${movie.tmdb_id}/watch/providers`)
    const cl = data?.results?.CL
    if (cl?.flatrate) {
      for (const p of cl.flatrate) {
        if (PROVIDER_MAP[p.provider_id]) {
          await supaUpsert('watch_providers', {
            pelicula_id: movie.id, tmdb_id: movie.tmdb_id, provider_id: p.provider_id,
            provider_name: p.provider_name, provider_type: 'flatrate',
            platform_key: PROVIDER_MAP[p.provider_id], logo_path: p.logo_path || '', tmdb_link: cl.link || '',
          })
          recheckFound++
        }
      }
    }
  }
  console.log(`  Found ${recheckFound} new flatrate providers`)

  console.log('\n' + '='.repeat(60))
  console.log('  DONE — TMDB calls:', tmdbCalls)
  console.log('  Movies: WP +' + stats.watchProviders + ', enriched +' + stats.enriched)
  console.log('  Series: WP +' + stats.seriesWP + ', enriched +' + stats.seriesEnriched)
  console.log('  Recheck: +' + recheckFound + ' flatrate')
  console.log('='.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })
