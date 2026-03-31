// Fix: fill imdb_id for all series using TMDB /tv/{id}/external_ids
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

let calls = 0
async function tmdb(path) {
  calls++
  if (calls % 35 === 0) await sleep(1100)
  const res = await fetch(`https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}`)
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

async function main() {
  // Get all series without imdb_id
  const series = await supaAll('series', 'select=id,tmdb_id&imdb_id=is.null&tmdb_id=not.is.null')
  console.log(`Series sin IMDB ID: ${series.length}`)

  let updated = 0, noImdb = 0, errors = 0

  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    try {
      const ext = await tmdb(`/tv/${s.tmdb_id}/external_ids`)
      if (ext?.imdb_id) {
        await fetch(`${SUPA_URL}/series?id=eq.${s.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({ imdb_id: ext.imdb_id }),
        })
        updated++
      } else {
        noImdb++
      }
    } catch {
      errors++
    }

    if ((i + 1) % 200 === 0) console.log(`  Progress: ${i + 1}/${series.length} (updated: ${updated}, no imdb: ${noImdb})`)
  }

  console.log(`\nDone! Updated: ${updated}, No IMDB in TMDB: ${noImdb}, Errors: ${errors}`)
}

main()
