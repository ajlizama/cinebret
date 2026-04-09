#!/usr/bin/env node
/**
 * Hierarchical (fractal) clustering for the CineBret movie graph.
 *
 * Level 0: Louvain on the full graph → ~7 mega-clusters
 * Level 1: Louvain WITHIN each mega-cluster → ~3-5 subclusters each
 *
 * The output enriches each node with:
 *   clusterId (level 0), clusterColor, subclusterId (level 1), subclusterColor
 *
 * And provides:
 *   clusters[] (level 0 with names + colors)
 *   subclusters[] (level 1 with names + colors + parent clusterId)
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

// ═══════════════════════════════════════════════════════════════════
// LOUVAIN ENGINE (reusable for any subgraph)
// ═══════════════════════════════════════════════════════════════════

function buildAdj(nodeIds, edgeList) {
  const idSet = new Set(nodeIds)
  const adj = new Map()
  for (const id of nodeIds) adj.set(id, new Map())
  for (const e of edgeList) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      adj.get(e.source).set(e.target, e.weight)
      adj.get(e.target).set(e.source, e.weight)
    }
  }
  return adj
}

function louvain(nodeIds, adj, iterations = 15) {
  const community = new Map()
  nodeIds.forEach((id, i) => community.set(id, i))

  const degree = new Map()
  let totalWeight = 0
  for (const id of nodeIds) {
    let d = 0
    for (const w of (adj.get(id)?.values() || [])) d += w
    degree.set(id, d)
    totalWeight += d
  }
  if (totalWeight === 0) return community

  for (let iter = 0; iter < iterations; iter++) {
    let moves = 0
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5)
    for (const nodeId of shuffled) {
      const currentCom = community.get(nodeId)
      const neighbors = adj.get(nodeId)
      if (!neighbors || neighbors.size === 0) continue
      const neighborComs = new Set()
      for (const nid of neighbors.keys()) neighborComs.add(community.get(nid))

      let bestCom = currentCom
      let bestGain = 0
      const ki = degree.get(nodeId)
      for (const com of neighborComs) {
        if (com === currentCom) continue
        let sumInNew = 0, sumTotNew = 0, sumInOld = 0, sumTotOld = 0
        for (const [nid, w] of neighbors) {
          if (community.get(nid) === com) sumInNew += w
          if (community.get(nid) === currentCom) sumInOld += w
        }
        for (const [nid, c] of community) {
          if (c === com) sumTotNew += degree.get(nid)
          if (c === currentCom) sumTotOld += degree.get(nid)
        }
        const gain = (sumInNew - sumInOld) / totalWeight -
          ki * (sumTotNew - sumTotOld + ki) / (totalWeight * totalWeight)
        if (gain > bestGain) { bestGain = gain; bestCom = com }
      }
      if (bestCom !== currentCom) { community.set(nodeId, bestCom); moves++ }
    }
    if (moves === 0) break
  }
  return community
}

function mergeTiny(community, adj, minSize) {
  for (let round = 0; round < 20; round++) {
    const coms = new Map()
    for (const [nodeId, comId] of community) {
      if (!coms.has(comId)) coms.set(comId, [])
      coms.get(comId).push(nodeId)
    }
    const smalls = [...coms.entries()].filter(([, m]) => m.length < minSize)
    if (smalls.length === 0) break
    let merges = 0
    for (const [smallComId, smallMembers] of smalls) {
      const neighborWeight = new Map()
      for (const nodeId of smallMembers) {
        for (const [nid, w] of (adj.get(nodeId) || [])) {
          const nCom = community.get(nid)
          if (nCom === smallComId) continue
          neighborWeight.set(nCom, (neighborWeight.get(nCom) || 0) + w)
        }
      }
      let bestCom = null, bestW = -1
      for (const [com, w] of neighborWeight) {
        if (w > bestW) { bestW = w; bestCom = com }
      }
      if (bestCom != null) {
        for (const nodeId of smallMembers) community.set(nodeId, bestCom)
        merges++
      }
    }
    if (merges === 0) break
  }
  return community
}

function collectCommunities(community) {
  const coms = new Map()
  for (const [nodeId, comId] of community) {
    if (!coms.has(comId)) coms.set(comId, [])
    coms.get(comId).push(nodeId)
  }
  return [...coms.entries()].sort((a, b) => b[1].length - a[1].length)
}

// ═══════════════════════════════════════════════════════════════════
// NAMING ENGINE
// ═══════════════════════════════════════════════════════════════════

const nodeMap = new Map(nodes.map(n => [n.id, n]))

const GNORM = {
  'Comedy': 'Comedia', 'Animation': 'Animación', 'Action': 'Acción',
  'Adventure': 'Aventura', 'Horror': 'Terror', 'Crime': 'Crimen',
  'Mystery': 'Misterio', 'Fantasy': 'Fantasía', 'History': 'Historia',
  'War': 'Guerra', 'Documentary': 'Documental', 'Biography': 'Biografía',
  'Music': 'Música', 'Family': 'Familia', 'Sport': 'Deporte',
  'Science Fiction': 'Ciencia ficción', 'Sci-Fi': 'Ciencia ficción',
}
const norm = g => GNORM[g] || g

function nameCluster(memberIds, usedNames = new Set()) {
  const members = memberIds.map(id => nodeMap.get(id)).filter(Boolean)
  const genres = {}
  for (const m of members) {
    for (const g of (m.genres || [])) {
      const ng = norm(g)
      genres[ng] = (genres[ng] || 0) + 1
    }
  }
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1])
  let g1 = topGenres[0]?.[0] || 'Mixto'
  let g2 = topGenres[1]?.[0] ? norm(topGenres[1][0]) : null
  let g3 = topGenres[2]?.[0] ? norm(topGenres[2][0]) : null
  if (g2 === g1) { g2 = g3; g3 = topGenres[3]?.[0] ? norm(topGenres[3][0]) : null }
  if (g3 === g1 || g3 === g2) g3 = null

  let name
  if (g1 === 'Drama' && g2) {
    if (['Romance', 'Comedia'].includes(g2)) name = g3 ? `${g2} · ${g3}` : `Drama y ${g2}`
    else if (g2 === 'Crimen') name = 'Crimen'
    else if (g2 === 'Biografía') name = 'Biografías'
    else if (g2 === 'Historia') name = 'Drama histórico'
    else if (g2 === 'Guerra') name = 'Bélico'
    else if (g2 === 'Thriller') name = g3 ? `Thriller · ${g3}` : 'Thriller'
    else if (g2 === 'Acción') name = 'Acción dramática'
    else if (g2 === 'Ciencia ficción') name = 'Ciencia ficción'
    else if (g2 === 'Misterio') name = 'Misterio'
    else name = `Drama · ${g2}`
  } else if (g1 === 'Acción') { name = g2 ? `Acción · ${g2}` : 'Acción' }
  else if (g1 === 'Comedia') { name = g2 && g2 !== 'Drama' ? `Comedia · ${g2}` : 'Comedia' }
  else if (g1 === 'Animación') {
    // Try to detect anime vs western vs superhero
    const titles = members.map(m => (m.title || '').toLowerCase())
    const hasAnime = titles.some(t => /\b(dragon ball|naruto|one piece|ghibli|miyazaki|anime|jujutsu|demon slayer|attack on titan)\b/i.test(t)) || members.some(m => (m.genres || []).some(g => g === 'Anime'))
    const hasSuperhero = titles.some(t => /\b(batman|superman|spider|marvel|avengers|justice league|dc|x-men)\b/i.test(t))
    if (hasAnime) name = 'Anime'
    else if (hasSuperhero) name = 'Superhéroes animados'
    else if (g2 === 'Familia') name = 'Animación familiar'
    else name = 'Animación'
  }
  else if (['Terror', 'Horror'].includes(g1)) { name = g2 ? `Terror · ${g2}` : 'Terror' }
  else if (g1 === 'Thriller') { name = g2 ? `Thriller · ${g2}` : 'Thriller' }
  else if (g1 === 'Romance') { name = g2 ? `Romance · ${g2}` : 'Romance' }
  else if (g1 === 'Ciencia ficción') { name = 'Ciencia ficción' }
  else if (g1 === 'Documental') { name = 'Documental' }
  else if (g1 === 'Western') { name = 'Western' }
  else if (g1 === 'Fantasía') { name = 'Fantasía y aventura' }
  else { name = g2 ? `${g1} · ${g2}` : g1 }

  // Deduplicate: if name already used, add g3 or a number
  if (usedNames.has(name)) {
    if (g3 && !name.includes(g3)) name = `${name} · ${g3}`
    let i = 2
    while (usedNames.has(name)) { name = `${name.split(' ·')[0]} ${i}`; i++ }
  }
  usedNames.add(name)
  return name
}

// ═══════════════════════════════════════════════════════════════════
// COLOR PALETTES
// ═══════════════════════════════════════════════════════════════════

// Level 0: 7-8 very distinct premium hues
const L0_COLORS = [
  '#f5c842', '#e07850', '#6ba3d6', '#b88fd6',
  '#5cb87a', '#d4726a', '#7ec4cf', '#c9a84c',
]

// Level 1: 4-5 shades WITHIN each parent hue (lighter/darker variations)
function subColors(parentColor, count) {
  // Parse hex to HSL, shift lightness
  const hex = parentColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max - min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  const results = []
  for (let i = 0; i < count; i++) {
    const lShift = -0.12 + (i / Math.max(1, count - 1)) * 0.24 // range: -0.12 to +0.12
    const sShift = (i % 2 === 0 ? 0.05 : -0.05)
    const nl = Math.max(0.2, Math.min(0.8, l + lShift))
    const ns = Math.max(0.2, Math.min(0.9, s + sShift))
    // HSL to hex
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p }
    const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns
    const p = 2 * nl - q
    const nr = Math.round(hue2rgb(p, q, h + 1/3) * 255)
    const ng = Math.round(hue2rgb(p, q, h) * 255)
    const nb = Math.round(hue2rgb(p, q, h - 1/3) * 255)
    results.push(`#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`)
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════
// LEVEL 0: Full graph clustering
// ═══════════════════════════════════════════════════════════════════

console.log('\n── Level 0: Full graph ──')
const allIds = nodes.map(n => n.id)
const fullAdj = buildAdj(allIds, edges)
let l0community = louvain(allIds, fullAdj)
l0community = mergeTiny(l0community, fullAdj, 150)

const l0sorted = collectCommunities(l0community)
const usedL0Names = new Set()
const l0clusters = []
const l0map = new Map() // nodeId → l0 index

l0sorted.forEach(([comId, memberIds], idx) => {
  const name = nameCluster(memberIds, usedL0Names)
  const color = L0_COLORS[idx % L0_COLORS.length]
  l0clusters.push({ id: idx, name, size: memberIds.length, color })
  for (const nodeId of memberIds) l0map.set(nodeId, idx)
  console.log(`  ${idx}. "${name}" — ${memberIds.length} movies — ${color}`)
})

// ═══════════════════════════════════════════════════════════════════
// LEVEL 1: Subcluster within each L0 cluster
// ═══════════════════════════════════════════════════════════════════

console.log('\n── Level 1: Subclusters ──')
const allSubclusters = []
const l1map = new Map() // nodeId → global subcluster index
let globalSubIdx = 0

for (const l0cl of l0clusters) {
  const memberIds = [...l0map.entries()].filter(([, idx]) => idx === l0cl.id).map(([id]) => id)
  if (memberIds.length < 30) {
    // Too small to subdivide — treat the whole cluster as one subcluster
    const scColor = subColors(l0cl.color, 1)[0]
    allSubclusters.push({ id: globalSubIdx, name: l0cl.name, size: memberIds.length, color: scColor, parentId: l0cl.id })
    for (const nodeId of memberIds) l1map.set(nodeId, globalSubIdx)
    globalSubIdx++
    continue
  }

  // Run Louvain within this subgraph
  const subAdj = buildAdj(memberIds, edges)
  let subCommunity = louvain(memberIds, subAdj, 12)

  // Min size for subclusters: ~15% of the parent or 20, whichever is larger
  const subMinSize = Math.max(20, Math.floor(memberIds.length * 0.12))
  subCommunity = mergeTiny(subCommunity, subAdj, subMinSize)
  const subSorted = collectCommunities(subCommunity)

  const scColors = subColors(l0cl.color, subSorted.length)
  const usedSubNames = new Set()

  console.log(`\n  L0 "${l0cl.name}" (${memberIds.length}) → ${subSorted.length} subclusters:`)
  subSorted.forEach(([, subMembers], si) => {
    const scName = nameCluster(subMembers, usedSubNames)
    const scColor = scColors[si % scColors.length]
    allSubclusters.push({ id: globalSubIdx, name: scName, size: subMembers.length, color: scColor, parentId: l0cl.id })
    for (const nodeId of subMembers) l1map.set(nodeId, globalSubIdx)
    console.log(`    ${si}. "${scName}" — ${subMembers.length} — ${scColor}`)
    globalSubIdx++
  })
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════

const outNodes = nodes.map(n => ({
  ...n,
  clusterId: l0map.get(n.id) ?? 0,
  clusterColor: l0clusters[l0map.get(n.id) ?? 0]?.color || '#52525b',
  subclusterId: l1map.get(n.id) ?? 0,
  subclusterColor: allSubclusters[l1map.get(n.id) ?? 0]?.color || '#52525b',
  // Use subcluster color as the node's display color for maximum visual detail
  color: allSubclusters[l1map.get(n.id) ?? 0]?.color || '#52525b',
}))

const output = {
  nodes: outNodes,
  edges: graph.edges,
  clusters: l0clusters,
  subclusters: allSubclusters,
}

writeFileSync(outPath, JSON.stringify(output))
console.log(`\nWritten: ${outNodes.length} nodes, ${graph.edges.length} edges, ${l0clusters.length} clusters, ${allSubclusters.length} subclusters`)
