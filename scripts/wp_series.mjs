// Fetch TMDB watch/providers for all series (Chile region)
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
  350: 'apple_tv', 2: 'apple_tv', 531: 'paramount_plus', 11: 'mubi', 283: 'crunchyroll', 1968: 'crunchyroll',
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
}

async function supaGet(table, params) {
  const all = []
  let offset = 0
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}&offset=${offset}&limit=1000`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    const data = await res.json()
    if (!data.length) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function supaUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers,
    body: JSON.stringify(rows),
  })
  return res.status
}

async function tmdbProviders(tmdbId) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[REGION] || null
  } catch { return null }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('Fetching series from Supabase...')
  const allSeries = await supaGet('series', 'select=id,tmdb_id&tmdb_id=not.is.null&order=id')
  console.log(`Found ${allSeries.length} series`)

  // Check existing
  const existing = new Set()
  const existingRows = await supaGet('watch_providers_series', 'select=serie_id')
  existingRows.forEach(r => existing.add(r.serie_id))

  const toFetch = allSeries.filter(s => !existing.has(s.id))
  console.log(`Already have: ${existing.size}, to fetch: ${toFetch.length}`)

  let batchRows = []
  let fetched = 0, errors = 0, totalRows = 0

  for (const serie of toFetch) {
    try {
      const cl = await tmdbProviders(serie.tmdb_id)
      if (cl) {
        for (const type of ['flatrate', 'rent', 'buy']) {
          for (const p of (cl[type] || [])) {
            batchRows.push({
              serie_id: serie.id,
              tmdb_id: serie.tmdb_id,
              provider_id: p.provider_id,
              provider_name: p.provider_name,
              provider_type: type,
              platform_key: PROVIDER_MAP[p.provider_id] || null,
              logo_path: p.logo_path || '',
              tmdb_link: cl.link || '',
            })
          }
        }
      }
      fetched++

      if (batchRows.length >= 200) {
        const status = await supaUpsert('watch_providers_series', batchRows)
        totalRows += batchRows.length
        console.log(`  Upserted ${batchRows.length} rows (${fetched}/${toFetch.length} series) [${status}]`)
        batchRows = []
      }

      if (fetched % 35 === 0) await sleep(1000)
      if (fetched % 200 === 0) console.log(`  Progress: ${fetched}/${toFetch.length}...`)
    } catch (e) {
      errors++
      if (errors > 50) { console.log('Too many errors, stopping'); break }
    }
  }

  if (batchRows.length > 0) {
    await supaUpsert('watch_providers_series', batchRows)
    totalRows += batchRows.length
    console.log(`  Upserted final ${batchRows.length} rows`)
  }

  console.log(`\nDone! ${fetched} series, ${totalRows} provider rows, ${errors} errors`)
}

main()
