// Load Crunchyroll providers for all series + movies from TMDB
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
const REGION = 'CL'
const CRUNCHYROLL_IDS = [283, 1968]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }

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

async function checkProviders(tmdbId, type) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[REGION] || null
  } catch { return null }
}

async function processItems(items, type, idField, table) {
  let found = 0, checked = 0, batchRows = []

  for (const item of items) {
    const cl = await checkProviders(item.tmdb_id, type)
    checked++

    if (cl) {
      for (const provType of ['flatrate', 'rent', 'buy']) {
        for (const p of (cl[provType] || [])) {
          if (CRUNCHYROLL_IDS.includes(p.provider_id)) {
            batchRows.push({
              [idField]: item.id,
              tmdb_id: item.tmdb_id,
              provider_id: p.provider_id,
              provider_name: p.provider_name,
              provider_type: provType,
              platform_key: 'crunchyroll',
              logo_path: p.logo_path || '',
              tmdb_link: cl.link || '',
            })
          }
        }
      }
    }

    if (batchRows.length >= 100) {
      await fetch(`${SUPA_URL}/${table}`, { method: 'POST', headers, body: JSON.stringify(batchRows) })
      found += batchRows.length
      console.log(`  [${type}] ${checked}/${items.length} checked, ${found} Crunchyroll found`)
      batchRows = []
    }

    if (checked % 35 === 0) await sleep(1000)
  }

  if (batchRows.length > 0) {
    await fetch(`${SUPA_URL}/${table}`, { method: 'POST', headers, body: JSON.stringify(batchRows) })
    found += batchRows.length
  }

  return { checked, found }
}

async function main() {
  console.log('='.repeat(60))
  console.log('  CARGAR CRUNCHYROLL')
  console.log('='.repeat(60))

  // Series
  console.log('\nFetching series...')
  const series = await supaAll('series', 'select=id,tmdb_id&tmdb_id=not.is.null')
  console.log(`Series: ${series.length}`)
  const sr = await processItems(series, 'tv', 'serie_id', 'watch_providers_series')

  // Movies
  console.log('\nFetching movies...')
  const movies = await supaAll('peliculas', 'select=id,tmdb_id&tmdb_id=not.is.null')
  console.log(`Movies: ${movies.length}`)
  const mr = await processItems(movies, 'movie', 'pelicula_id', 'watch_providers')

  console.log('\n' + '='.repeat(60))
  console.log(`  Series: ${sr.found} Crunchyroll providers`)
  console.log(`  Movies: ${mr.found} Crunchyroll providers`)
  console.log('='.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })
