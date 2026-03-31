// Massive enrichment: fill ALL missing fields from TMDB for every movie
// Respects rate limits, paginated fetches, resumes gracefully
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

// --- CLI args ---
// --dry-run: don't write to DB, just show what would happen
// --limit N: only process N movies
// --trailer-only: only fill trailers for IMDB>7 movies
// --fields-only: only fill specific fields (comma-separated)
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity
const TRAILER_ONLY = args.includes('--trailer-only')

const sleep = ms => new Promise(r => setTimeout(r, ms))

// --- Supabase helpers ---
async function supaAll(table, query = '') {
  const PAGE = 1000
  let all = [], offset = 0
  while (true) {
    const sep = query ? '&' : ''
    const res = await fetch(`${SUPA_URL}/${table}?${query}${sep}limit=${PAGE}&offset=${offset}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    })
    if (!res.ok) throw new Error(`supaAll ${table}: ${res.status}`)
    const rows = await res.json()
    all = all.concat(rows)
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return all
}

async function supaPatch(table, filter, data) {
  if (DRY_RUN) return true
  const res = await fetch(`${SUPA_URL}/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    console.error(`  PATCH ${table} failed: ${res.status} ${await res.text()}`)
    return false
  }
  return true
}

async function supaUpsert(table, data) {
  if (DRY_RUN) return true
  const res = await fetch(`${SUPA_URL}/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    console.error(`  UPSERT ${table} failed: ${res.status} ${await res.text()}`)
    return false
  }
  return true
}

// --- TMDB helpers ---
let tmdbCalls = 0
async function tmdb(path) {
  tmdbCalls++
  // Rate limit: ~40 calls/sec allowed, we'll do ~30
  if (tmdbCalls % 30 === 0) await sleep(1100)
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`
  const res = await fetch(url)
  if (res.status === 429) {
    console.log('  Rate limited, waiting 10s...')
    await sleep(10000)
    return tmdb(path) // retry
  }
  if (!res.ok) return null
  return res.json()
}

function getCertification(releaseDates) {
  const results = releaseDates?.results || []
  for (const country of ['CL', 'US']) {
    const entry = results.find(r => r.iso_3166_1 === country)
    if (entry) {
      for (const rd of entry.release_dates) {
        if (rd.certification) return rd.certification
      }
    }
  }
  return null
}

// --- TMDB Search for movies without tmdb_id ---
async function searchTmdb(titulo, tituloEn, anio) {
  // Try English title first (more reliable), then Spanish
  for (const q of [tituloEn, titulo].filter(Boolean)) {
    const query = encodeURIComponent(q)
    const yearParam = anio ? `&year=${anio}` : ''
    const data = await tmdb(`/search/movie?query=${query}${yearParam}&language=es-CL`)
    if (data?.results?.length > 0) return data.results[0]
  }
  return null
}

// ============================================================
//  MAIN
// ============================================================
async function main() {
  console.log('='.repeat(70))
  console.log('  ENRIQUECIMIENTO MASIVO - CINEBRET')
  console.log('='.repeat(70))
  if (DRY_RUN) console.log('  *** DRY RUN — no DB writes ***')

  // 1. Load everything
  console.log('\nCargando datos de Supabase...')
  const [peliculas, enriquecimientos] = await Promise.all([
    supaAll('peliculas', 'select=*'),
    supaAll('enriquecimiento', 'select=*'),
  ])
  console.log(`  ${peliculas.length} películas, ${enriquecimientos.length} enriquecimientos`)

  const enrichById = {}
  for (const e of enriquecimientos) enrichById[e.pelicula_id] = e

  // 2. Determine what each movie needs
  const needsWork = []

  for (const p of peliculas) {
    const e = enrichById[p.id] || null
    const missing = []

    // --- peliculas fields ---
    if (!p.tmdb_id) missing.push('tmdb_id')
    if (!p.nota_imdb && p.nota_imdb !== 0) missing.push('nota_imdb')
    if (!p.poster_path) missing.push('poster_path')
    if (!p.backdrop_path) missing.push('backdrop_path')
    if (!p.logo_path) missing.push('logo_path')
    if (!p.youtube_trailer_key) missing.push('trailer')
    if (!p.imdb_id) missing.push('imdb_id')
    if (!p.runtime) missing.push('runtime')
    if (!p.certification) missing.push('certification')
    if (!p.tagline) missing.push('tagline')
    if (!p.anio) missing.push('anio')

    // --- enriquecimiento fields ---
    if (!e || !e.sinopsis_chilensis) missing.push('sinopsis')
    if (!e || !e.director) missing.push('director')
    if (!e || !e.actores || (Array.isArray(e.actores) && e.actores.length === 0)) missing.push('actores')
    if (!e || !e.compositor) missing.push('compositor')
    if (!e || !Array.isArray(e.generos) || e.generos.length === 0) missing.push('generos')
    if (!e || !Array.isArray(e.keywords) || e.keywords.length === 0) missing.push('keywords')
    if (!e || !Array.isArray(e.cast_json) || e.cast_json.length === 0) missing.push('cast_json')

    if (missing.length > 0) {
      needsWork.push({ p, e, missing })
    }
  }

  // Sort: prioritize by IMDB desc (best movies first), then missing count desc
  needsWork.sort((a, b) => {
    const aImdb = a.p.nota_imdb || 0
    const bImdb = b.p.nota_imdb || 0
    if (bImdb !== aImdb) return bImdb - aImdb
    return b.missing.length - a.missing.length
  })

  // If trailer-only mode, filter to IMDB > 7 without trailer
  let toProcess = needsWork
  if (TRAILER_ONLY) {
    toProcess = needsWork.filter(w =>
      w.missing.includes('trailer') && (w.p.nota_imdb || 0) >= 7
    )
    console.log(`\nModo trailer-only: ${toProcess.length} películas con IMDB>=7 sin trailer`)
  }

  // Apply limit
  if (LIMIT < Infinity) {
    toProcess = toProcess.slice(0, LIMIT)
  }

  console.log(`\nPelículas que necesitan enriquecimiento: ${needsWork.length}`)
  console.log(`A procesar en esta corrida: ${toProcess.length}`)

  // Show missing field summary
  const fieldCount = {}
  for (const w of needsWork) {
    for (const f of w.missing) {
      fieldCount[f] = (fieldCount[f] || 0) + 1
    }
  }
  console.log('\nCampos faltantes:')
  for (const [field, count] of Object.entries(fieldCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(18)} ${count}`)
  }

  // 3. Process each movie
  const stats = { ok: 0, partial: 0, fail: 0, skipped: 0 }

  for (let i = 0; i < toProcess.length; i++) {
    const { p, e, missing } = toProcess[i]
    const pct = ((i + 1) / toProcess.length * 100).toFixed(0)
    const imdb = p.nota_imdb ? p.nota_imdb.toFixed(1) : 'N/A'
    console.log(`\n[${i + 1}/${toProcess.length} ${pct}%] ${p.titulo} (${p.anio || '?'}) ⭐${imdb} — faltan: ${missing.join(', ')}`)

    let tmdbId = p.tmdb_id

    // Step A: If no tmdb_id, search TMDB
    if (!tmdbId) {
      const result = await searchTmdb(p.titulo, p.titulo_ingles, p.anio)
      if (!result) {
        console.log('  ✗ No se encontró en TMDB, saltando')
        stats.skipped++
        continue
      }
      tmdbId = result.id
      console.log(`  Encontrada en TMDB: id=${tmdbId} "${result.title}"`)

      // Update tmdb_id in peliculas
      const pelUpdate = { tmdb_id: tmdbId }
      if (!p.anio && result.release_date) pelUpdate.anio = parseInt(result.release_date.substring(0, 4))
      if (!p.nota_imdb && result.vote_average > 0 && result.vote_count > 100) pelUpdate.nota_imdb = Math.round(result.vote_average * 10) / 10
      if (!p.poster_path && result.poster_path) pelUpdate.poster_path = result.poster_path
      if (!p.backdrop_path && result.backdrop_path) pelUpdate.backdrop_path = result.backdrop_path

      await supaPatch('peliculas', `id=eq.${p.id}`, pelUpdate)
    }

    // Step B: Fetch all TMDB data in parallel
    const [detailsEs, detailsEn, credits, keywords, images, videos, releaseDates] = await Promise.all([
      tmdb(`/movie/${tmdbId}?language=es-CL`),
      tmdb(`/movie/${tmdbId}?language=en-US`),
      tmdb(`/movie/${tmdbId}/credits?language=en-US`),
      tmdb(`/movie/${tmdbId}/keywords`),
      tmdb(`/movie/${tmdbId}/images?include_image_language=en,null`),
      tmdb(`/movie/${tmdbId}/videos?language=en-US`),
      tmdb(`/movie/${tmdbId}/release_dates`),
    ])

    if (!detailsEs) {
      console.log('  ✗ TMDB details failed, saltando')
      stats.fail++
      continue
    }

    // Step C: Build peliculas update (only missing fields)
    const pelUpdate = {}
    let pelFields = 0

    if (missing.includes('nota_imdb') && detailsEs.vote_average > 0 && detailsEs.vote_count > 100) {
      pelUpdate.nota_imdb = Math.round(detailsEs.vote_average * 10) / 10
      pelFields++
    }
    if (missing.includes('poster_path') && detailsEs.poster_path) {
      pelUpdate.poster_path = detailsEs.poster_path
      pelFields++
    }
    if (missing.includes('backdrop_path') && detailsEs.backdrop_path) {
      pelUpdate.backdrop_path = detailsEs.backdrop_path
      pelFields++
    }
    if (missing.includes('runtime') && detailsEs.runtime > 0) {
      pelUpdate.runtime = detailsEs.runtime
      pelFields++
    }
    if (missing.includes('tagline')) {
      // Try Spanish tagline first, fallback to English
      const tag = detailsEs.tagline || detailsEn?.tagline || null
      if (tag) { pelUpdate.tagline = tag; pelFields++ }
    }
    if (missing.includes('imdb_id') && detailsEs.imdb_id) {
      pelUpdate.imdb_id = detailsEs.imdb_id
      pelFields++
    }
    if (missing.includes('anio') && detailsEs.release_date) {
      pelUpdate.anio = parseInt(detailsEs.release_date.substring(0, 4))
      pelFields++
    }
    if (missing.includes('certification') && releaseDates) {
      const cert = getCertification(releaseDates)
      if (cert) { pelUpdate.certification = cert; pelFields++ }
    }

    // Logo
    if (missing.includes('logo_path') && images) {
      const logos = images.logos || []
      if (logos.length > 0) {
        pelUpdate.logo_path = logos[0].file_path
        pelFields++
      }
    }

    // Trailer
    if (missing.includes('trailer') && videos) {
      const trailers = (videos.results || []).filter(v => v.type === 'Trailer' && v.site === 'YouTube')
      // Fallback to any YouTube video (teaser, clip, etc.)
      const anyVideo = trailers.length > 0 ? trailers[0] : (videos.results || []).find(v => v.site === 'YouTube')
      if (anyVideo) {
        pelUpdate.youtube_trailer_key = anyVideo.key
        pelFields++
      }
    }

    // Collection
    if (!p.collection_name && detailsEs.belongs_to_collection?.name) {
      pelUpdate.collection_name = detailsEs.belongs_to_collection.name
    }

    // Write peliculas update
    if (Object.keys(pelUpdate).length > 0) {
      await supaPatch('peliculas', `id=eq.${p.id}`, pelUpdate)
    }

    // Step D: Build enriquecimiento update
    const enrUpdate = {}
    let enrFields = 0

    if (credits) {
      const crew = credits.crew || []
      const cast = credits.cast || []

      if (missing.includes('director')) {
        const dirs = crew.filter(c => c.job === 'Director').map(c => c.name)
        if (dirs.length > 0) { enrUpdate.director = dirs.join(', '); enrFields++ }
      }

      if (missing.includes('actores')) {
        const actors = cast.slice(0, 5).map(c => c.name)
        if (actors.length > 0) { enrUpdate.actores = actors; enrFields++ }
      }

      if (missing.includes('compositor')) {
        const composers = crew.filter(c => c.job === 'Original Music Composer').map(c => c.name)
        if (composers.length > 0) { enrUpdate.compositor = composers.join(', '); enrFields++ }
      }

      if (missing.includes('cast_json')) {
        const castJson = cast.slice(0, 15).map(c => ({
          name: c.name,
          character: c.character,
          profile_path: c.profile_path,
        }))
        if (castJson.length > 0) { enrUpdate.cast_json = castJson; enrFields++ }
      }
    }

    if (missing.includes('generos') && detailsEs.genres) {
      const generos = detailsEs.genres.map(g => g.name)
      if (generos.length > 0) { enrUpdate.generos = generos; enrFields++ }
    }

    if (missing.includes('keywords') && keywords) {
      const kws = (keywords.keywords || []).map(k => k.name)
      if (kws.length > 0) { enrUpdate.keywords = kws; enrFields++ }
    }

    if (missing.includes('sinopsis')) {
      const sinopsis = detailsEs.overview || detailsEn?.overview || null
      if (sinopsis) { enrUpdate.sinopsis_chilensis = sinopsis; enrFields++ }
    }

    // Write enriquecimiento
    if (Object.keys(enrUpdate).length > 0) {
      if (e) {
        // Row exists, patch it
        await supaPatch('enriquecimiento', `pelicula_id=eq.${p.id}`, enrUpdate)
      } else {
        // Need to create row
        await supaUpsert('enriquecimiento', { pelicula_id: p.id, ...enrUpdate })
      }
    }

    const totalFilled = pelFields + enrFields
    const totalMissing = missing.length
    if (totalFilled === totalMissing) {
      console.log(`  ✓ Completo (${totalFilled}/${totalMissing} campos)`)
      stats.ok++
    } else if (totalFilled > 0) {
      console.log(`  ~ Parcial (${totalFilled}/${totalMissing} campos completados)`)
      stats.partial++
    } else {
      console.log(`  ✗ Sin datos en TMDB`)
      stats.fail++
    }
  }

  // 4. Summary
  console.log('\n' + '='.repeat(70))
  console.log('  RESULTADO FINAL')
  console.log('='.repeat(70))
  console.log(`  Procesadas:  ${toProcess.length}`)
  console.log(`  Completas:   ${stats.ok}`)
  console.log(`  Parciales:   ${stats.partial}`)
  console.log(`  Sin datos:   ${stats.fail}`)
  console.log(`  Saltadas:    ${stats.skipped}`)
  console.log(`  Calls TMDB:  ${tmdbCalls}`)
  console.log('='.repeat(70))
}

main().catch(e => { console.error(e); process.exit(1) })
