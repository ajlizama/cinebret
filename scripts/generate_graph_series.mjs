// Generate series connection graph from similar_ids — same logic as movies
import { readFileSync, writeFileSync } from 'fs'
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

async function main() {
  console.log('Fetching series...')
  const series = await supaAll('series', 'select=id,tmdb_id,titulo,titulo_ingles,nota_imdb,categoria,poster_path&nota_imdb=not.is.null&poster_path=not.is.null')
  console.log(`Series with poster + IMDB: ${series.length}`)

  console.log('Fetching enrichment...')
  const enrs = await supaAll('enriquecimiento_series', 'select=serie_id,similar_ids,generos&similar_ids=not.is.null')
  console.log(`Enrichments with similar_ids: ${enrs.length}`)

  const TOP_N = 10

  const tmdbToSerie = new Map()
  const idToSerie = new Map()
  series.forEach(s => {
    if (s.tmdb_id) tmdbToSerie.set(s.tmdb_id, s)
    idToSerie.set(s.id, s)
  })

  const enrMap = new Map()
  enrs.forEach(e => enrMap.set(e.serie_id, e))

  const CAT_COLORS = {
    "Pa'l domingo de bajón": '#facc15',
    "Pa' saltar del sillón": '#ef4444',
    "Pa' quedar con el cerebro como licuadora": '#3b82f6',
    "Pa' llorar a moco tendido": '#a855f7',
  }

  const edgeSet = new Set()
  const edges = []
  const connectionCount = new Map()

  for (const serie of series) {
    const enr = enrMap.get(serie.id)
    if (!enr?.similar_ids || enr.similar_ids.length === 0) continue

    const topSimilar = enr.similar_ids.slice(0, TOP_N)
    for (const tmdbId of topSimilar) {
      const target = tmdbToSerie.get(tmdbId)
      if (!target || target.id === serie.id) continue

      // Bidirectional only: A→B must have B→A in top 30
      const targetEnr = enrMap.get(target.id)
      const targetSimilar = (targetEnr?.similar_ids || []).slice(0, 30)
      const isBidirectional = serie.tmdb_id && targetSimilar.includes(serie.tmdb_id)
      if (!isBidirectional) continue

      const key = [serie.id, target.id].sort().join('-')
      if (edgeSet.has(key)) continue
      edgeSet.add(key)

      const posA = topSimilar.indexOf(tmdbId)
      const posB = targetSimilar.indexOf(serie.tmdb_id)
      const weight = 2 + (10 - posA) / 10 + (30 - Math.max(posB, 0)) / 30

      edges.push({
        source: serie.id,
        target: target.id,
        weight: Math.round(weight * 100) / 100,
      })

      connectionCount.set(serie.id, (connectionCount.get(serie.id) || 0) + 1)
      connectionCount.set(target.id, (connectionCount.get(target.id) || 0) + 1)
    }
  }

  const connectedIds = new Set()
  edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target) })

  const nodes = series
    .filter(s => connectedIds.has(s.id))
    .map(s => ({
      id: s.id,
      title: s.titulo_ingles || s.titulo,
      titleEs: s.titulo,
      imdb: s.nota_imdb,
      poster: s.poster_path,
      categoria: s.categoria,
      color: CAT_COLORS[s.categoria] || '#71717a',
      connections: connectionCount.get(s.id) || 0,
      genres: (enrMap.get(s.id)?.generos || []).slice(0, 3),
    }))

  console.log(`\nGraph stats:`)
  console.log(`  Nodes: ${nodes.length}`)
  console.log(`  Edges: ${edges.length}`)
  console.log(`  Avg connections: ${(edges.length * 2 / nodes.length).toFixed(1)}`)

  const graph = { nodes, edges }
  const outPath = join(__dirname, '..', 'public', 'series-graph.json')
  writeFileSync(outPath, JSON.stringify(graph))
  const sizeMB = (JSON.stringify(graph).length / 1024 / 1024).toFixed(1)
  console.log(`Written to ${outPath} (${sizeMB} MB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
