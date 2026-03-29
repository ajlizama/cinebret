// Fetch TMDB watch/providers for all CineBret movies (Chile region)
// Uses Node.js fetch (no Python dependency issues)

// Load env vars from ../.env.local
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

const TMDB_API_KEY = process.env.TMDB_API_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || ''
const REGION = 'CL'

const PROVIDER_MAP = {
  8: 'netflix', 337: 'disney_plus', 384: 'hbo_max', 1899: 'hbo_max',
  119: 'amazon_prime', 9: 'amazon_prime', 10: 'amazon_prime',
  350: 'apple_tv', 2: 'apple_tv', 531: 'paramount_plus', 11: 'mubi',
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
}

async function supaGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  return res.json()
}

async function supaUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  })
  return res.status
}

async function tmdbProviders(tmdbId) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[REGION] || null
  } catch { return null }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  // Fetch all movies
  console.log('Fetching movies from Supabase...')
  const allMovies = []
  let offset = 0
  while (true) {
    const batch = await supaGet('peliculas', `select=id,tmdb_id&tmdb_id=not.is.null&order=id&offset=${offset}&limit=1000`)
    if (!batch.length) break
    allMovies.push(...batch)
    offset += batch.length
    if (batch.length < 1000) break
  }
  console.log(`Found ${allMovies.length} movies`)

  // Check existing
  const existing = new Set()
  offset = 0
  while (true) {
    const batch = await supaGet('watch_providers', `select=pelicula_id&offset=${offset}&limit=1000`)
    if (!batch.length) break
    batch.forEach(r => existing.add(r.pelicula_id))
    offset += batch.length
    if (batch.length < 1000) break
  }

  const toFetch = allMovies.filter(m => !existing.has(m.id))
  console.log(`Already have: ${existing.size}, to fetch: ${toFetch.length}`)

  let batchRows = []
  let fetched = 0
  let errors = 0
  let totalRows = 0

  for (const movie of toFetch) {
    try {
      const cl = await tmdbProviders(movie.tmdb_id)
      if (cl) {
        const link = cl.link || ''
        for (const type of ['flatrate', 'rent', 'buy']) {
          for (const p of (cl[type] || [])) {
            batchRows.push({
              pelicula_id: movie.id,
              tmdb_id: movie.tmdb_id,
              provider_id: p.provider_id,
              provider_name: p.provider_name,
              provider_type: type,
              platform_key: PROVIDER_MAP[p.provider_id] || null,
              logo_path: p.logo_path || '',
              tmdb_link: link,
            })
          }
        }
      }

      fetched++

      // Upsert in batches of 200
      if (batchRows.length >= 200) {
        const status = await supaUpsert('watch_providers', batchRows)
        totalRows += batchRows.length
        console.log(`  Upserted ${batchRows.length} rows (${fetched}/${toFetch.length} movies) [${status}]`)
        batchRows = []
      }

      // Rate limit
      if (fetched % 35 === 0) await sleep(1000)

      // Progress
      if (fetched % 200 === 0) console.log(`  Progress: ${fetched}/${toFetch.length}...`)

    } catch (e) {
      errors++
      console.log(`  Error ${movie.tmdb_id}: ${e.message}`)
      if (errors > 50) { console.log('Too many errors, stopping'); break }
    }
  }

  // Final batch
  if (batchRows.length > 0) {
    await supaUpsert('watch_providers', batchRows)
    totalRows += batchRows.length
    console.log(`  Upserted final ${batchRows.length} rows`)
  }

  console.log(`\nDone! ${fetched} movies, ${totalRows} provider rows, ${errors} errors`)
}

main()
