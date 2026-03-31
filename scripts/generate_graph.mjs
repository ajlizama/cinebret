// Generate movie connection graph from similar_ids
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
  console.log('Fetching movies...')
  const movies = await supaAll('peliculas', 'select=id,tmdb_id,titulo,titulo_ingles,nota_imdb,categoria,poster_path&nota_imdb=not.is.null&poster_path=not.is.null')
  console.log(`Movies with poster + IMDB: ${movies.length}`)

  console.log('Fetching enrichment...')
  const enrs = await supaAll('enriquecimiento', 'select=pelicula_id,similar_ids,generos&similar_ids=not.is.null')
  console.log(`Enrichments with similar_ids: ${enrs.length}`)

  // Build tmdb_id → movie map
  const tmdbToMovie = new Map()
  const idToMovie = new Map()
  movies.forEach(m => {
    if (m.tmdb_id) tmdbToMovie.set(m.tmdb_id, m)
    idToMovie.set(m.id, m)
  })

  // Build enrichment map
  const enrMap = new Map()
  enrs.forEach(e => enrMap.set(e.pelicula_id, e))

  // TOP_N for connections
  const TOP_N = 10

  // Build edges: A connects to its top 10 similar
  const edgeSet = new Set()
  const edges = []
  const connectionCount = new Map() // node id → connection count

  for (const movie of movies) {
    const enr = enrMap.get(movie.id)
    if (!enr?.similar_ids || enr.similar_ids.length === 0) continue

    const topSimilar = enr.similar_ids.slice(0, TOP_N)
    for (const tmdbId of topSimilar) {
      const target = tmdbToMovie.get(tmdbId)
      if (!target || target.id === movie.id) continue

      // Bidirectional only: A→B must have B→A in top 30
      const targetEnr = enrMap.get(target.id)
      const targetSimilar = (targetEnr?.similar_ids || []).slice(0, 30)
      const isBidirectional = movie.tmdb_id && targetSimilar.includes(movie.tmdb_id)
      if (!isBidirectional) continue

      const key = [movie.id, target.id].sort().join('-')
      if (edgeSet.has(key)) continue
      edgeSet.add(key)

      const posA = topSimilar.indexOf(tmdbId)
      const posB = targetSimilar.indexOf(movie.tmdb_id)
      const weight = 2 + (10 - posA) / 10 + (30 - Math.max(posB, 0)) / 30

      edges.push({
        source: movie.id,
        target: target.id,
        weight: Math.round(weight * 100) / 100,
      })

      connectionCount.set(movie.id, (connectionCount.get(movie.id) || 0) + 1)
      connectionCount.set(target.id, (connectionCount.get(target.id) || 0) + 1)
    }
  }

  // Category color map
  const CAT_COLORS = {
    "Pa'l domingo de bajón": '#facc15',         // yellow
    "Pa' saltar del sillón": '#ef4444',          // red
    "Pa' quedar con el cerebro como licuadora": '#3b82f6', // blue
    "Pa' llorar a moco tendido": '#a855f7',      // purple
  }

  // Build nodes (only include movies that have at least 1 connection)
  const connectedIds = new Set()
  edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target) })

  const nodes = movies
    .filter(m => connectedIds.has(m.id))
    .map(m => ({
      id: m.id,
      title: m.titulo_ingles || m.titulo,
      titleEs: m.titulo,
      imdb: m.nota_imdb,
      poster: m.poster_path,
      categoria: m.categoria,
      color: CAT_COLORS[m.categoria] || '#71717a',
      connections: connectionCount.get(m.id) || 0,
      genres: (enrMap.get(m.id)?.generos || []).slice(0, 3),
    }))

  // Stats
  const avgConnections = nodes.reduce((s, n) => s + n.connections, 0) / nodes.length
  const hubs = nodes.filter(n => n.connections > avgConnections * 2).sort((a, b) => b.connections - a.connections)
  const satellites = nodes.filter(n => n.connections <= 2)

  console.log(`\nGraph stats:`)
  console.log(`  Nodes: ${nodes.length}`)
  console.log(`  Edges: ${edges.length}`)
  console.log(`  Bidirectional edges: ${edges.filter(e => e.bidirectional).length}`)
  console.log(`  Avg connections: ${avgConnections.toFixed(1)}`)
  console.log(`  Hubs (>2x avg): ${hubs.length}`)
  console.log(`  Top 10 hubs:`)
  hubs.slice(0, 10).forEach(h => console.log(`    ${h.connections} connections: ${h.title}`))
  console.log(`  Satellites (<=2): ${satellites.length}`)

  // Write JSON
  const graph = { nodes, edges }
  const outPath = join(__dirname, '..', 'public', 'movie-graph.json')
  writeFileSync(outPath, JSON.stringify(graph))
  const sizeMB = (JSON.stringify(graph).length / 1024 / 1024).toFixed(1)
  console.log(`\nWritten to ${outPath} (${sizeMB} MB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
