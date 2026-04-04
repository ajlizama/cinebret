// Fill titulo_latino from TMDB es-MX for all movies and series
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
  await fetch(`${SUPA_URL}/${table}?${filter}`, {
    method: 'PATCH',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  })
}

async function main() {
  console.log('='.repeat(60))
  console.log('  FILL TITULO_LATINO FROM TMDB (es-MX)')
  console.log('='.repeat(60))

  // Movies
  console.log('\n--- Movies ---')
  const movies = await supaAll('peliculas', 'select=id,tmdb_id,titulo,titulo_latino&tmdb_id=not.is.null&titulo_latino=is.null')
  console.log(`Movies without titulo_latino: ${movies.length}`)

  let mUpdated = 0
  for (let i = 0; i < movies.length; i++) {
    const m = movies[i]
    // Try es-MX first, fallback to es-CL
    const dataMX = await tmdb(`/movie/${m.tmdb_id}?language=es-MX`)
    const dataCL = await tmdb(`/movie/${m.tmdb_id}?language=es-CL`)

    const tituloMX = dataMX?.title
    const tituloCL = dataCL?.title

    // Pick the best: es-MX if different from current titulo (likely Spain version)
    // If es-MX is same as current, try es-CL
    let tituloLatino = null
    if (tituloMX && tituloMX !== m.titulo) {
      tituloLatino = tituloMX
    } else if (tituloCL && tituloCL !== m.titulo) {
      tituloLatino = tituloCL
    } else if (tituloMX) {
      tituloLatino = tituloMX // same as current, but still set it
    }

    if (tituloLatino) {
      await supaPatch('peliculas', `id=eq.${m.id}`, { titulo_latino: tituloLatino })
      mUpdated++
    }

    if ((i + 1) % 100 === 0) console.log(`  Progress: ${i + 1}/${movies.length} (updated: ${mUpdated})`)
  }
  console.log(`  Movies updated: ${mUpdated}`)

  // Series
  console.log('\n--- Series ---')
  const series = await supaAll('series', 'select=id,tmdb_id,titulo,titulo_latino&tmdb_id=not.is.null&titulo_latino=is.null')
  console.log(`Series without titulo_latino: ${series.length}`)

  let sUpdated = 0
  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    const dataMX = await tmdb(`/tv/${s.tmdb_id}?language=es-MX`)
    const dataCL = await tmdb(`/tv/${s.tmdb_id}?language=es-CL`)

    const tituloMX = dataMX?.name
    const tituloCL = dataCL?.name

    let tituloLatino = null
    if (tituloMX && tituloMX !== s.titulo) {
      tituloLatino = tituloMX
    } else if (tituloCL && tituloCL !== s.titulo) {
      tituloLatino = tituloCL
    } else if (tituloMX) {
      tituloLatino = tituloMX
    }

    if (tituloLatino) {
      await supaPatch('series', `id=eq.${s.id}`, { titulo_latino: tituloLatino })
      sUpdated++
    }

    if ((i + 1) % 100 === 0) console.log(`  Progress: ${i + 1}/${series.length} (updated: ${sUpdated})`)
  }
  console.log(`  Series updated: ${sUpdated}`)

  console.log('\n' + '='.repeat(60))
  console.log(`  DONE — Movies: ${mUpdated}, Series: ${sUpdated}, TMDB calls: ${tmdbCalls}`)
  console.log('='.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })
