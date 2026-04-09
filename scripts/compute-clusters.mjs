#!/usr/bin/env node
/**
 * Compute movie graph clusters using the Louvain community detection algorithm.
 * Reads movie-graph.json, detects communities, names them by analyzing dominant
 * genres/directors/decades, assigns premium colors, and writes back to
 * movie-graph-clusters.json.
 *
 * Run: node scripts/compute-clusters.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const graphPath = join(__dirname, '..', 'public', 'movie-graph.json')
const outPath = join(__dirname, '..', 'public', 'movie-graph-clusters.json')

const graph = JSON.parse(readFileSync(graphPath, 'utf8'))
const nodes = graph.nodes
const edges = graph.edges

console.log(`Loaded ${nodes.length} nodes, ${edges.length} edges`)

// ── Build adjacency with weights ──
const adj = new Map() // nodeId → Map<neighborId, weight>
for (const e of edges) {
  const s = e.source
  const t = e.target
  if (!adj.has(s)) adj.set(s, new Map())
  if (!adj.has(t)) adj.set(t, new Map())
  adj.get(s).set(t, e.weight)
  adj.get(t).set(s, e.weight)
}

// ── Louvain-inspired community detection ──
// Simplified but effective: iterative label propagation with modularity gain.
// Each node starts in its own community. Repeatedly move nodes to the
// neighboring community that gives the largest modularity gain, until stable.

const nodeIds = nodes.map(n => n.id)
const community = new Map() // nodeId → communityId
nodeIds.forEach((id, i) => community.set(id, i))

const totalWeight = edges.reduce((s, e) => s + e.weight, 0) * 2
const degree = new Map() // nodeId → sum of edge weights
for (const id of nodeIds) {
  let d = 0
  if (adj.has(id)) {
    for (const w of adj.get(id).values()) d += w
  }
  degree.set(id, d)
}

function modularityGain(nodeId, targetCom) {
  const ki = degree.get(nodeId)
  let sumIn = 0 // sum of weights from nodeId to nodes in targetCom
  let sumTot = 0 // sum of degrees of nodes in targetCom
  if (adj.has(nodeId)) {
    for (const [nid, w] of adj.get(nodeId)) {
      if (community.get(nid) === targetCom) sumIn += w
    }
  }
  for (const [nid, com] of community) {
    if (com === targetCom) sumTot += degree.get(nid)
  }
  return sumIn / totalWeight - (sumTot * ki) / (totalWeight * totalWeight)
}

// Run 15 iterations of label propagation with modularity optimization
for (let iter = 0; iter < 15; iter++) {
  let moves = 0
  // Shuffle node order for better convergence
  const shuffled = [...nodeIds].sort(() => Math.random() - 0.5)

  for (const nodeId of shuffled) {
    const currentCom = community.get(nodeId)
    const neighbors = adj.get(nodeId)
    if (!neighbors || neighbors.size === 0) continue

    // Collect neighboring communities
    const neighborComs = new Set()
    for (const nid of neighbors.keys()) {
      neighborComs.add(community.get(nid))
    }

    let bestCom = currentCom
    let bestGain = 0
    for (const com of neighborComs) {
      if (com === currentCom) continue
      const gain = modularityGain(nodeId, com) - modularityGain(nodeId, currentCom)
      if (gain > bestGain) {
        bestGain = gain
        bestCom = com
      }
    }

    if (bestCom !== currentCom) {
      community.set(nodeId, bestCom)
      moves++
    }
  }

  console.log(`  Iteration ${iter + 1}: ${moves} moves`)
  if (moves === 0) break
}

// ── Collect communities ──
const comMembers = new Map() // comId → [nodeId, ...]
for (const [nodeId, comId] of community) {
  if (!comMembers.has(comId)) comMembers.set(comId, [])
  comMembers.get(comId).push(nodeId)
}

// Iteratively merge small communities into their nearest large neighbor
// until every community has at least MIN_SIZE members.
const MIN_SIZE = 150

function rebuildComs() {
  const m = new Map()
  for (const [nodeId, comId] of community) {
    if (!m.has(comId)) m.set(comId, [])
    m.get(comId).push(nodeId)
  }
  return m
}

for (let mergeRound = 0; mergeRound < 20; mergeRound++) {
  const coms = rebuildComs()
  const smalls = [...coms.entries()].filter(([, m]) => m.length < MIN_SIZE)
  if (smalls.length === 0) break

  let merges = 0
  for (const [smallComId, smallMembers] of smalls) {
    // Find the neighboring community with the strongest total edge weight
    const neighborWeight = new Map() // comId → total weight
    for (const nodeId of smallMembers) {
      const neighbors = adj.get(nodeId)
      if (!neighbors) continue
      for (const [nid, w] of neighbors) {
        const nCom = community.get(nid)
        if (nCom === smallComId) continue
        neighborWeight.set(nCom, (neighborWeight.get(nCom) || 0) + w)
      }
    }
    // Pick the heaviest neighbor community
    let bestCom = null
    let bestW = -1
    for (const [com, w] of neighborWeight) {
      if (w > bestW) { bestW = w; bestCom = com }
    }
    if (bestCom != null) {
      for (const nodeId of smallMembers) {
        community.set(nodeId, bestCom)
      }
      merges++
    }
  }
  console.log(`  Merge round ${mergeRound + 1}: merged ${merges} small communities`)
  if (merges === 0) break
}

const finalComs = rebuildComs()
// Drop any remaining tiny clusters — their nodes get assigned to cluster 0 (largest)
const sorted = [...finalComs.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .filter(([, members]) => members.length >= MIN_SIZE)

// Assign orphans to the largest cluster
const largestComId = sorted[0]?.[0]
if (largestComId != null) {
  for (const [nodeId, comId] of community) {
    if (!sorted.some(([cid]) => cid === comId)) {
      community.set(nodeId, largestComId)
    }
  }
}
console.log(`\nDetected ${sorted.length} communities:`)

// ── Name each cluster ──
const nodeMap = new Map(nodes.map(n => [n.id, n]))

// Premium muted color palette (15 distinguishable hues for dark bg)
const PALETTE = [
  '#f5c842', // warm gold
  '#e07850', // burnt orange
  '#6ba3d6', // steel blue
  '#b88fd6', // soft lavender
  '#5cb87a', // sage green
  '#d4726a', // dusty rose
  '#7ec4cf', // teal mist
  '#c9a84c', // antique gold
  '#8b8fc7', // periwinkle
  '#d19a66', // copper
  '#6bc5a0', // mint
  '#c77dba', // orchid
  '#a3b86c', // olive
  '#e8a87c', // peach
  '#7ca8c4', // slate blue
  '#d6c06e', // wheat
  '#9fc2b4', // seafoam
  '#c48f8f', // blush
]

function nameCluster(memberIds) {
  const members = memberIds.map(id => nodeMap.get(id)).filter(Boolean)

  // Count genres
  const genres = {}
  const directors = {}
  const decades = {}

  for (const m of members) {
    for (const g of (m.genres || [])) {
      genres[g] = (genres[g] || 0) + 1
    }
  }

  // Top genre
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1])
  const topGenre = topGenres[0]?.[0] || 'Mixto'
  const secondGenre = topGenres[1]?.[0]

  // Average IMDb
  const avgImdb = members.reduce((s, m) => s + (m.imdb || 0), 0) / members.length

  // Dominant decade
  for (const m of members) {
    if (m.imdb) {
      // Use title year info from the graph — approximate from node data
    }
  }

  // Build a descriptive name
  const genreLabel = topGenre
  const size = members.length

  // Normalize genre names to Spanish
  const GNORM = {
    'Comedy': 'Comedia', 'Animation': 'Animación', 'Action': 'Acción',
    'Adventure': 'Aventura', 'Horror': 'Terror', 'Crime': 'Crimen',
    'Mystery': 'Misterio', 'Fantasy': 'Fantasía', 'History': 'Historia',
    'War': 'Guerra', 'Documentary': 'Documental', 'Biography': 'Biografía',
    'Music': 'Música', 'Family': 'Familia', 'Sport': 'Deporte',
    'Science Fiction': 'Ciencia ficción', 'Sci-Fi': 'Ciencia ficción',
  }
  const norm = g => GNORM[g] || g
  const g1 = norm(topGenre)
  let g2 = secondGenre ? norm(secondGenre) : null
  let g3 = topGenres[2]?.[0] ? norm(topGenres[2][0]) : null
  // Deduplicate: if g2 is the same as g1 after normalization, use g3 instead
  if (g2 === g1) { g2 = g3; g3 = topGenres[3]?.[0] ? norm(topGenres[3][0]) : null }
  if (g3 === g1 || g3 === g2) g3 = null

  // Build smart name combining top genres
  if (g1 === 'Drama' && g2) {
    if (g2 === 'Romance' || g2 === 'Comedia') return g3 ? `Drama · ${g2} · ${g3}` : `Drama y ${g2}`
    if (g2 === 'Crimen' || g2 === 'Crime') return 'Drama criminal'
    if (g2 === 'Biografía' || g2 === 'Biography') return 'Drama biográfico'
    if (g2 === 'Historia' || g2 === 'History') return 'Drama histórico'
    if (g2 === 'Guerra' || g2 === 'War') return 'Drama bélico'
    if (g2 === 'Thriller') return g3 ? `Thriller · ${g3}` : 'Thriller dramático'
    if (g2 === 'Acción') return 'Acción dramática'
    if (g2 === 'Ciencia ficción') return 'Ciencia ficción'
    if (g2 === 'Misterio' || g2 === 'Mystery') return 'Misterio y drama'
    return `Drama · ${g2}`
  }
  if (g1 === 'Acción') return g2 ? `Acción y ${g2}` : 'Acción'
  if (g1 === 'Comedia' || g1 === 'Comedy') return g2 && g2 !== 'Drama' ? `Comedia · ${g2}` : 'Comedia'
  if (g1 === 'Animación' || g1 === 'Animation') return g2 === 'Familia' || g2 === 'Family' ? 'Animación familiar' : 'Animación'
  if (g1 === 'Terror' || g1 === 'Horror') return g2 ? `Terror · ${g2}` : 'Terror'
  if (g1 === 'Thriller') return g2 ? `Thriller · ${g2}` : 'Thriller'
  if (g1 === 'Romance') return g2 ? `Romance · ${g2}` : 'Romance'
  if (g1 === 'Ciencia ficción' || g1 === 'Science Fiction') return 'Ciencia ficción'
  if (g1 === 'Documental' || g1 === 'Documentary') return 'Documental'
  if (g1 === 'Western') return 'Western'
  if (g1 === 'Fantasía' || g1 === 'Fantasy') return 'Fantasía'
  if (g1 === 'Guerra' || g1 === 'War') return 'Bélico'

  return g2 ? `${g1} · ${g2}` : g1
}

const clusters = []
const nodeClusterMap = new Map() // nodeId → clusterIndex

sorted.forEach(([comId, memberIds], idx) => {
  const name = nameCluster(memberIds)
  const color = PALETTE[idx % PALETTE.length]

  clusters.push({
    id: idx,
    name,
    size: memberIds.length,
    color,
  })

  for (const nodeId of memberIds) {
    nodeClusterMap.set(nodeId, idx)
  }

  console.log(`  ${idx}. "${name}" — ${memberIds.length} movies — ${color}`)
})

// ── Build output ──
const outNodes = nodes.map(n => ({
  ...n,
  clusterId: nodeClusterMap.get(n.id) ?? 0,
  clusterColor: PALETTE[nodeClusterMap.get(n.id) ?? 0] || '#52525b',
}))

// Remove old `color` field (was category-based) and replace with cluster color
for (const n of outNodes) {
  n.color = n.clusterColor
}

const output = {
  nodes: outNodes,
  edges: graph.edges,
  clusters,
}

writeFileSync(outPath, JSON.stringify(output))
console.log(`\nWritten to ${outPath}`)
console.log(`${outNodes.length} nodes, ${graph.edges.length} edges, ${clusters.length} clusters`)
