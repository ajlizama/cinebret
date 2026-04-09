#!/usr/bin/env node
/**
 * Enriches movie-graph-clusters.json nodes with director, sinopsis (short),
 * anio, and compositor from Supabase — so the mapa canvas can render
 * movie details inline when zoomed in deeply.
 *
 * Run: node scripts/enrich-graph-nodes.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY in .env.local
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clusterPath = join(__dirname, '..', 'public', 'movie-graph-clusters.json')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY
if (!url || !key) { console.error('Missing Supabase env vars'); process.exit(1) }

const sb = createClient(url, key)
const graph = JSON.parse(readFileSync(clusterPath, 'utf8'))

console.log(`Enriching ${graph.nodes.length} nodes...`)

// Fetch all enrichment data in paginated batches
const enrMap = new Map()
const pelMap = new Map()
let offset = 0
while (true) {
  const { data } = await sb.from('enriquecimiento')
    .select('pelicula_id, director, compositor, sinopsis_chilensis')
    .range(offset, offset + 999)
  if (!data || data.length === 0) break
  data.forEach(e => enrMap.set(e.pelicula_id, e))
  if (data.length < 1000) break
  offset += 1000
}
console.log(`  Fetched ${enrMap.size} enrichment rows`)

offset = 0
while (true) {
  const { data } = await sb.from('peliculas')
    .select('id, anio, backdrop_path')
    .range(offset, offset + 999)
  if (!data || data.length === 0) break
  data.forEach(p => pelMap.set(p.id, p))
  if (data.length < 1000) break
  offset += 1000
}
console.log(`  Fetched ${pelMap.size} peliculas rows`)

// Enrich nodes
let enriched = 0
for (const node of graph.nodes) {
  const enr = enrMap.get(node.id)
  const pel = pelMap.get(node.id)
  if (enr) {
    node.director = enr.director || null
    node.compositor = enr.compositor || null
    // Short sinopsis: first 120 chars + ellipsis
    if (enr.sinopsis_chilensis) {
      const s = enr.sinopsis_chilensis
      node.sinopsis = s.length > 120 ? s.slice(0, 117) + '...' : s
    }
    enriched++
  }
  if (pel) {
    node.anio = pel.anio || null
    node.backdrop = pel.backdrop_path || null
  }
}

writeFileSync(clusterPath, JSON.stringify(graph))
console.log(`Enriched ${enriched} nodes. Written to ${clusterPath}`)
