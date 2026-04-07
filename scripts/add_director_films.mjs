// Add specific director films to CineBret DB with full TMDB enrichment
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

// Curated list - main feature films only, no shorts/docs/unreleased
const FILMS = [
  // Christopher Nolan
  { tmdb: 320, note: 'Insomnia (Nolan)' },
  { tmdb: 11660, note: 'Following (Nolan)' },

  // Quentin Tarantino
  { tmdb: 184, note: 'Jackie Brown' },
  { tmdb: 1991, note: 'Death Proof' },
  { tmdb: 5, note: 'Four Rooms' },

  // Stanley Kubrick
  { tmdb: 345, note: 'Eyes Wide Shut' },
  { tmdb: 3175, note: 'Barry Lyndon' },
  { tmdb: 935, note: 'Dr. Strangelove' },
  { tmdb: 802, note: 'Lolita (Kubrick)' },
  { tmdb: 247, note: 'The Killing' },
  { tmdb: 10056, note: "Killer's Kiss" },
  { tmdb: 10165, note: 'Fear and Desire' },

  // Steven Spielberg
  { tmdb: 511809, note: 'West Side Story' },
  { tmdb: 446354, note: 'The Post' },
  { tmdb: 267935, note: 'The BFG' },
  { tmdb: 296098, note: 'Bridge of Spies' },
  { tmdb: 72976, note: 'Lincoln' },
  { tmdb: 57212, note: 'War Horse' },
  { tmdb: 17578, note: 'The Adventures of Tintin' },
  { tmdb: 612, note: 'Munich' },
  { tmdb: 11831, note: 'Amistad' },
  { tmdb: 11352, note: 'Always (Spielberg)' },
  { tmdb: 15301, note: 'Twilight Zone: The Movie' },
  { tmdb: 11519, note: '1941' },
  { tmdb: 840, note: 'Close Encounters of the Third Kind' },
  { tmdb: 5121, note: 'The Sugarland Express' },
  { tmdb: 839, note: 'Duel' },

  // Martin Scorsese (main features only)
  { tmdb: 68730, note: 'Silence (Scorsese)' },
  { tmdb: 44826, note: 'Hugo' },
  { tmdb: 2567, note: 'The Aviator' },
  { tmdb: 3131, note: 'Gangs of New York' },
  { tmdb: 8649, note: 'Bringing Out the Dead' },
  { tmdb: 9746, note: 'Kundun' },
  { tmdb: 10436, note: 'The Age of Innocence' },
  { tmdb: 1598, note: 'Cape Fear' },
  { tmdb: 11051, note: 'The Last Temptation of Christ' },
  { tmdb: 10843, note: 'After Hours' },
  { tmdb: 12637, note: 'New York, New York' },
  { tmdb: 16153, note: "Alice Doesn't Live Here Anymore" },
  { tmdb: 203, note: 'Mean Streets' },
  { tmdb: 22784, note: 'Boxcar Bertha' },
  { tmdb: 42694, note: "Who's That Knocking at My Door" },
]

async function fetchTMDB(path) {
  const separator = path.includes('?') ? '&' : '?'
  const url = `https://api.themoviedb.org/3${path}${separator}api_key=${TMDB}`
  const res = await fetch(url)
  return res.ok ? res.json() : null
}

async function main() {
  // Check which already exist
  const tmdbIds = FILMS.map(f => f.tmdb)
  const existRes = await fetch(`${SUPA}/rest/v1/peliculas?select=tmdb_id&tmdb_id=in.(${tmdbIds.join(',')})`, { headers })
  const existing = new Set((await existRes.json()).map(r => r.tmdb_id))
  console.log(`Already in DB: ${existing.size}/${FILMS.length}\n`)

  let added = 0
  let errors = 0

  for (const film of FILMS) {
    if (existing.has(film.tmdb)) {
      console.log(`SKIP ${film.note}`)
      continue
    }

    const [es, en, credits, keywords, videos, images, relDates, omdbData] = await Promise.all([
      fetchTMDB(`/movie/${film.tmdb}?language=es-CL`),
      fetchTMDB(`/movie/${film.tmdb}?language=en-US`),
      fetchTMDB(`/movie/${film.tmdb}/credits?language=en-US`),
      fetchTMDB(`/movie/${film.tmdb}/keywords`),
      fetchTMDB(`/movie/${film.tmdb}/videos?language=en-US`),
      fetchTMDB(`/movie/${film.tmdb}/images?include_image_language=en,null`),
      fetchTMDB(`/movie/${film.tmdb}/release_dates`),
      fetchTMDB(`/movie/${film.tmdb}?language=en-US`),
    ])

    if (!es && !en) { console.log(`ERROR: no TMDB data for ${film.note}`); errors++; continue }
    const d = es || en
    const dEn = en || es

    const titulo = d.title || dEn.title
    const tituloIngles = dEn.original_title || dEn.title
    const anio = d.release_date ? parseInt(d.release_date.split('-')[0]) : null
    const poster = d.poster_path || dEn.poster_path
    const backdrop = d.backdrop_path || dEn.backdrop_path
    const runtime = d.runtime || dEn.runtime || null
    const tagline = d.tagline || dEn.tagline || null
    const collection = d.belongs_to_collection?.name || null
    const imdbId = d.imdb_id || dEn.imdb_id || null
    const tmdbVote = d.vote_average || null

    // Try to get IMDB rating from OMDB
    let imdbRating = tmdbVote ? parseFloat(tmdbVote.toFixed(1)) : null
    if (imdbId && process.env.OMDB_API_KEY) {
      try {
        const omdbRes = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`)
        const omdb = await omdbRes.json()
        if (omdb.imdbRating && omdb.imdbRating !== 'N/A') imdbRating = parseFloat(omdb.imdbRating)
      } catch {}
    }

    const trailer = videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null
    const logo = images?.logos?.[0]?.file_path || null

    let cert = null
    if (relDates?.results) {
      const cl = relDates.results.find(r => r.iso_3166_1 === 'CL')
      const us = relDates.results.find(r => r.iso_3166_1 === 'US')
      cert = cl?.release_dates?.[0]?.certification || us?.release_dates?.[0]?.certification || null
    }

    const director = credits?.crew?.filter(c => c.job === 'Director').map(c => c.name).join(', ') || null
    const compositor = credits?.crew?.find(c => c.job === 'Original Music Composer')?.name || null
    const actores = credits?.cast?.slice(0, 5).map(c => c.name).join(', ') || null
    const cast_json = credits?.cast?.slice(0, 15).map(c => ({ name: c.name, character: c.character, profile_path: c.profile_path, order: c.order })) || null

    const kws = keywords?.keywords?.map(k => k.name) || []
    const generos = (d.genres || dEn.genres || []).map(g => g.name)
    const sinopsis = d.overview || dEn.overview || null

    // Get similar movies
    const similar = await fetchTMDB(`/movie/${film.tmdb}/similar?language=en-US`)
    const similar_ids = (similar?.results || []).slice(0, 30).map(s => s.id)

    console.log(`ADD ${tituloIngles} (${anio}) | ${director} | IMDB: ${imdbRating}`)

    const pelRes = await fetch(`${SUPA}/rest/v1/peliculas`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        titulo, titulo_ingles: tituloIngles, tmdb_id: film.tmdb,
        anio, poster_path: poster, backdrop_path: backdrop,
        runtime, tagline, youtube_trailer_key: trailer,
        logo_path: logo, certification: cert, collection_name: collection,
        nota_imdb: imdbRating, imdb_id: imdbId,
      }),
    })

    if (!pelRes.ok) {
      console.log(`  ERROR: ${pelRes.status} ${await pelRes.text()}`)
      errors++
      continue
    }

    const pelData = await pelRes.json()
    const pelId = pelData[0]?.id
    if (!pelId) { console.log('  ERROR: no id'); errors++; continue }

    // Enriquecimiento
    await fetch(`${SUPA}/rest/v1/enriquecimiento`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        pelicula_id: pelId, director, compositor, actores,
        cast_json, keywords: kws, generos,
        sinopsis_chilensis: sinopsis, similar_ids,
      }),
    })

    // Watch providers for Chile
    const wp = await fetchTMDB(`/movie/${film.tmdb}/watch/providers`)
    const cl = wp?.results?.CL
    if (cl) {
      const provMap = { 8: 'netflix', 337: 'disney_plus', 384: 'hbo_max', 1899: 'hbo_max', 119: 'amazon_prime', 9: 'amazon_prime', 10: 'amazon_prime', 350: 'apple_tv', 2: 'apple_tv', 531: 'paramount_plus', 11: 'mubi', 283: 'crunchyroll', 1968: 'crunchyroll' }
      const rows = []
      for (const type of ['flatrate', 'rent', 'buy']) {
        for (const p of (cl[type] || [])) {
          rows.push({
            pelicula_id: pelId, tmdb_id: film.tmdb,
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
      }
    }

    added++
    console.log(`  OK (${pelId})`)
    await new Promise(r => setTimeout(r, 350))
  }

  console.log(`\nDone! Added: ${added} | Errors: ${errors} | Skipped: ${existing.size}`)
}

main().catch(e => { console.error(e); process.exit(1) })
