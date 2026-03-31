// Load seasons + episodes for all series from TMDB
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

async function supaUpsert(table, rows) {
  if (rows.length === 0) return []
  const res = await fetch(`${SUPA_URL}/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    console.error(`  Upsert ${table} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
    return []
  }
  return res.json()
}

async function main() {
  console.log('='.repeat(70))
  console.log('  CARGA DE TEMPORADAS + EPISODIOS')
  console.log('='.repeat(70))

  // Get all series with tmdb_id and their season count
  const series = await supaAll('series', 'select=id,tmdb_id,num_temporadas&tmdb_id=not.is.null')
  console.log(`Series en DB: ${series.length}`)

  // Get existing temporadas to skip already loaded
  const existingTemps = await supaAll('temporadas', 'select=serie_id')
  const loadedSerieIds = new Set(existingTemps.map(t => t.serie_id))

  const toLoad = series.filter(s => !loadedSerieIds.has(s.id) && s.num_temporadas > 0)
  console.log(`Ya cargadas: ${loadedSerieIds.size}, por cargar: ${toLoad.length}`)

  let totalTemps = 0, totalEps = 0, errors = 0

  for (let i = 0; i < toLoad.length; i++) {
    const s = toLoad[i]
    const pct = ((i + 1) / toLoad.length * 100).toFixed(0)

    try {
      // Fetch all seasons in parallel (skip season 0 = specials unless few seasons)
      const seasonNums = Array.from({ length: s.num_temporadas }, (_, j) => j + 1)
      const seasonData = await Promise.all(
        seasonNums.map(n => tmdb(`/tv/${s.tmdb_id}/season/${n}?language=es-CL`))
      )

      const tempRows = []
      const epRows = [] // will fill after inserting temporadas

      for (let j = 0; j < seasonNums.length; j++) {
        const sd = seasonData[j]
        if (!sd) continue

        tempRows.push({
          serie_id: s.id,
          tmdb_id: sd.id || null,
          numero: seasonNums[j],
          nombre: sd.name || `Temporada ${seasonNums[j]}`,
          sinopsis: sd.overview || null,
          poster_path: sd.poster_path || null,
          fecha_estreno: sd.air_date || null,
          num_episodios: (sd.episodes || []).length,
          nota_tmdb: sd.vote_average > 0 ? Math.round(sd.vote_average * 10) / 10 : null,
          _episodes: sd.episodes || [], // temp, will remove before upsert
        })
      }

      if (tempRows.length === 0) continue

      // Upsert temporadas
      const epData = tempRows.map(t => t._episodes)
      const cleanRows = tempRows.map(({ _episodes, ...rest }) => rest)
      const inserted = await supaUpsert('temporadas', cleanRows)

      if (inserted.length === 0) { errors++; continue }

      // Build episode rows
      for (let j = 0; j < inserted.length; j++) {
        const temp = inserted[j]
        const episodes = epData[j] || []
        for (const ep of episodes) {
          epRows.push({
            temporada_id: temp.id,
            serie_id: s.id,
            numero: ep.episode_number,
            nombre: ep.name || null,
            sinopsis: ep.overview || null,
            still_path: ep.still_path || null,
            fecha_estreno: ep.air_date || null,
            runtime: ep.runtime || null,
            nota_tmdb: ep.vote_average > 0 ? Math.round(ep.vote_average * 10) / 10 : null,
          })
        }
      }

      // Upsert episodes in batches of 200
      for (let k = 0; k < epRows.length; k += 200) {
        await supaUpsert('episodios', epRows.slice(k, k + 200))
      }

      totalTemps += inserted.length
      totalEps += epRows.length

      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${toLoad.length} ${pct}%] ${totalTemps} temporadas, ${totalEps} episodios`)
      }
    } catch (err) {
      errors++
      if (errors > 100) { console.log('Too many errors, stopping'); break }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('  RESULTADO')
  console.log('='.repeat(70))
  console.log(`  Temporadas cargadas: ${totalTemps}`)
  console.log(`  Episodios cargados:  ${totalEps}`)
  console.log(`  Errores:             ${errors}`)
  console.log(`  Calls TMDB:          ${tmdbCalls}`)
  console.log('='.repeat(70))
}

main().catch(e => { console.error(e); process.exit(1) })
