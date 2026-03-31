// Assign CineBret categories to series based on genres
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

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1'
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || ''

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

// Category rules based on genres
// Pa'l domingo de bajón = chill/comfort (Comedy, Family, Animation, Romance light)
// Pa' saltar del sillón = action/thrill (Action, Thriller, Crime, Adventure, Sci-Fi)
// Pa' quedar con el cerebro como licuadora = mind-bending (Mystery, Sci-Fi+Drama, Documentary)
// Pa' llorar a moco tendido = emotional (Drama heavy, War, History)
function assignCategoria(generos) {
  if (!generos || generos.length === 0) return null
  const g = new Set(generos.map(x => x.toLowerCase()))

  // Terror/Horror → sillón
  if (g.has('terror') || g.has('horror')) return "Pa' saltar del sillón"

  // Animation + Family/Comedy → domingo
  if ((g.has('animación') || g.has('animation')) && (g.has('familia') || g.has('family') || g.has('comedia') || g.has('comedy')))
    return "Pa'l domingo de bajón"

  // Mystery + (Drama or Thriller) → licuadora
  if ((g.has('misterio') || g.has('mystery')) && (g.has('drama') || g.has('thriller')))
    return "Pa' quedar con el cerebro como licuadora"

  // Documentary → licuadora
  if (g.has('documental') || g.has('documentary'))
    return "Pa' quedar con el cerebro como licuadora"

  // Sci-Fi → licuadora or sillón
  if (g.has('ciencia ficción') || g.has('science fiction') || g.has('sci-fi & fantasy')) {
    if (g.has('acción') || g.has('action') || g.has('action & adventure')) return "Pa' saltar del sillón"
    return "Pa' quedar con el cerebro como licuadora"
  }

  // Action/Crime/Thriller → sillón
  if (g.has('acción') || g.has('action') || g.has('action & adventure') || g.has('crimen') || g.has('crime') || g.has('thriller'))
    return "Pa' saltar del sillón"

  // War/History + Drama → llorar
  if ((g.has('guerra') || g.has('war') || g.has('war & politics') || g.has('historia') || g.has('history')) && g.has('drama'))
    return "Pa' llorar a moco tendido"

  // Pure Drama → llorar
  if (g.has('drama') && g.size <= 2) return "Pa' llorar a moco tendido"

  // Romance → llorar or domingo
  if (g.has('romance')) {
    if (g.has('comedia') || g.has('comedy')) return "Pa'l domingo de bajón"
    return "Pa' llorar a moco tendido"
  }

  // Comedy → domingo
  if (g.has('comedia') || g.has('comedy')) return "Pa'l domingo de bajón"

  // Family → domingo
  if (g.has('familia') || g.has('family') || g.has('kids')) return "Pa'l domingo de bajón"

  // Adventure → sillón
  if (g.has('aventura') || g.has('adventure')) return "Pa' saltar del sillón"

  // Drama (with other genres) → llorar
  if (g.has('drama')) return "Pa' llorar a moco tendido"

  // Default → domingo
  return "Pa'l domingo de bajón"
}

async function main() {
  console.log('Fetching series without categoria...')
  const series = await supaAll('series', 'select=id&categoria=is.null')
  console.log(`Series sin categoria: ${series.length}`)

  const enrichments = await supaAll('enriquecimiento_series', 'select=serie_id,generos')
  const enrMap = {}
  enrichments.forEach(e => { enrMap[e.serie_id] = e })

  const catCount = {}
  let updated = 0

  for (const s of series) {
    const enr = enrMap[s.id]
    const cat = assignCategoria(enr?.generos)
    if (!cat) continue

    catCount[cat] = (catCount[cat] || 0) + 1

    await fetch(`${SUPA_URL}/series?id=eq.${s.id}`, {
      method: 'PATCH',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ categoria: cat }),
    })
    updated++
  }

  console.log(`\nUpdated: ${updated}`)
  console.log('Distribution:', JSON.stringify(catCount, null, 2))
}

main()
