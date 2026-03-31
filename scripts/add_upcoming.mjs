// Add upcoming movies to CineBret DB with full TMDB enrichment
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

const TMDB = process.env.TMDB_API_KEY
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const UPCOMING = [
  { tmdb: 1226863, note: 'Super Mario Galaxy Movie' },
  { tmdb: 1275779, note: 'Disclosure Day' },
  { tmdb: 1368337, note: 'The Odyssey (Nolan)' },
  { tmdb: 1122573, note: 'In the Grey' },
  { tmdb: 1248832, note: 'Digger' },
  { tmdb: 1147572, note: 'Narnia' },
  { tmdb: 1284465, note: 'Death of Robin Hood' },
  { tmdb: 1153576, note: 'Street Fighter' },
  { tmdb: 891621, note: 'Wild Horse Nine' },
  { tmdb: 1400940, note: 'Clayface' },
  { tmdb: 1281331, note: 'The Social Reckoning' },
  { tmdb: 1124142, note: 'Rivals of Amziah King' },
  { tmdb: 1381071, note: 'Godzilla Minus Zero (sequel)' },
  { tmdb: 977942, note: 'The Uprising' },
  { tmdb: 1170608, note: 'Dune: Part Three' },
  { tmdb: 1003596, note: 'Avengers: Doomsday' },
  { tmdb: 969681, note: 'Spider-Man: Brand New Day' },
  { tmdb: 1081003, note: 'Supergirl' },
]

async function fetchTMDB(path) {
  const separator = path.includes('?') ? '&' : '?'
  const url = `https://api.themoviedb.org/3${path}${separator}api_key=${TMDB}`
  const res = await fetch(url)
  return res.ok ? res.json() : null
}

async function main() {
  // Check which already exist in our DB
  const tmdbIds = UPCOMING.map(u => u.tmdb)
  const existRes = await fetch(`${SUPA}/rest/v1/peliculas?select=tmdb_id&tmdb_id=in.(${tmdbIds.join(',')})`, { headers })
  const existing = new Set((await existRes.json()).map(r => r.tmdb_id))
  console.log(`Already in DB: ${existing.size}/${UPCOMING.length}`)

  let added = 0
  for (const movie of UPCOMING) {
    if (existing.has(movie.tmdb)) {
      console.log(`SKIP ${movie.note} (already in DB)`)
      continue
    }

    // Fetch all data from TMDB
    const [es, en, credits, keywords, videos, images, relDates] = await Promise.all([
      fetchTMDB(`/movie/${movie.tmdb}?language=es-CL`),
      fetchTMDB(`/movie/${movie.tmdb}?language=en-US`),
      fetchTMDB(`/movie/${movie.tmdb}/credits?language=en-US`),
      fetchTMDB(`/movie/${movie.tmdb}/keywords`),
      fetchTMDB(`/movie/${movie.tmdb}/videos?language=en-US`),
      fetchTMDB(`/movie/${movie.tmdb}/images?include_image_language=en,null`),
      fetchTMDB(`/movie/${movie.tmdb}/release_dates`),
    ])

    if (!es && !en) { console.log(`ERROR: no TMDB data for ${movie.note}`); continue }
    const d = es || en
    const dEn = en || es

    // Extract data
    const titulo = d.title || dEn.title
    const tituloIngles = dEn.original_title || dEn.title
    const anio = d.release_date ? parseInt(d.release_date.split('-')[0]) : null
    const poster = d.poster_path || dEn.poster_path
    const backdrop = d.backdrop_path || dEn.backdrop_path
    const runtime = d.runtime || dEn.runtime || null
    const tagline = d.tagline || dEn.tagline || null
    const collection = d.belongs_to_collection?.name || null

    // Trailer (prefer English official trailer)
    const trailer = videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null

    // Logo
    const logo = images?.logos?.[0]?.file_path || null

    // Certification for CL or US
    let cert = null
    if (relDates?.results) {
      const cl = relDates.results.find(r => r.iso_3166_1 === 'CL')
      const us = relDates.results.find(r => r.iso_3166_1 === 'US')
      cert = cl?.release_dates?.[0]?.certification || us?.release_dates?.[0]?.certification || null
    }

    // Credits
    const director = credits?.crew?.filter(c => c.job === 'Director').map(c => c.name).join(', ') || null
    const compositor = credits?.crew?.find(c => c.job === 'Original Music Composer')?.name || null
    const actores = credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || null
    const cast_json = credits?.cast?.slice(0, 15).map(c => ({ name: c.name, character: c.character, profile_path: c.profile_path })) || null

    // Keywords & genres
    const kws = keywords?.keywords?.map(k => k.name) || []
    const generos = (d.genres || dEn.genres || []).map(g => g.name)

    // Sinopsis
    const sinopsis = d.overview || dEn.overview || null

    console.log(`ADD ${tituloIngles} (${anio}) | dir: ${director} | cast: ${actores?.split(',')[0]}`)

    // Insert into peliculas
    const pelRes = await fetch(`${SUPA}/rest/v1/peliculas`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        titulo, titulo_ingles: tituloIngles, tmdb_id: movie.tmdb,
        anio, poster_path: poster, backdrop_path: backdrop,
        runtime, tagline, youtube_trailer_key: trailer,
        logo_path: logo, certification: cert, collection_name: collection,
        nota_imdb: null, // upcoming, no rating yet
      }),
    })

    if (!pelRes.ok) {
      console.log(`  ERROR inserting: ${pelRes.status} ${await pelRes.text()}`)
      continue
    }

    const pelData = await pelRes.json()
    const pelId = pelData[0]?.id
    if (!pelId) { console.log('  ERROR: no id returned'); continue }

    // Insert enriquecimiento
    await fetch(`${SUPA}/rest/v1/enriquecimiento`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        pelicula_id: pelId, director, compositor, actores,
        cast_json, keywords: kws, generos,
        sinopsis_chilensis: sinopsis,
      }),
    })

    // Fetch watch providers for Chile
    const wp = await fetchTMDB(`/movie/${movie.tmdb}/watch/providers`)
    const cl = wp?.results?.CL
    if (cl) {
      const provMap = { 8: 'netflix', 337: 'disney_plus', 384: 'hbo_max', 1899: 'hbo_max', 119: 'amazon_prime', 9: 'amazon_prime', 10: 'amazon_prime', 350: 'apple_tv', 2: 'apple_tv', 531: 'paramount_plus', 11: 'mubi', 283: 'crunchyroll', 1968: 'crunchyroll' }
      const rows = []
      for (const type of ['flatrate', 'rent', 'buy']) {
        for (const p of (cl[type] || [])) {
          rows.push({
            pelicula_id: pelId, tmdb_id: movie.tmdb,
            provider_id: p.provider_id, provider_name: p.provider_name,
            provider_type: type, platform_key: provMap[p.provider_id] || null,
            logo_path: p.logo_path || '', tmdb_link: cl.link || '',
          })
        }
      }
      if (rows.length > 0) {
        await fetch(`${SUPA}/rest/v1/watch_providers`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(rows),
        })
        console.log(`  + ${rows.length} providers`)
      }
    }

    added++
    console.log(`  OK (id: ${pelId})`)

    // Rate limit
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone! Added ${added} upcoming movies, skipped ${existing.size} existing`)
}

main().catch(e => { console.error(e); process.exit(1) })
