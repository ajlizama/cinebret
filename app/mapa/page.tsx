'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useMediaMode } from '@/context/MediaModeContext'
import { useAuth } from '@/context/AuthContext'
import { normalize } from '@/lib/normalize'
import { useGuestLimit } from '@/hooks/useGuestLimit'
import GuestLimitModal from '@/components/GuestLimitModal'
import {
  PageShell,
  SearchInput,
  IconButton,
  Card,
  Sheet,
  Modal,
  Pill,
  Button,
  LoadingState,
  Icon,
} from '@/components/ui'

type GraphNode = {
  id: string
  title: string
  titleEs: string
  imdb: number
  poster: string
  categoria: string
  color: string
  connections: number
  genres: string[]
  clusterId?: number
  clusterColor?: string
  subclusterId?: number
  subclusterColor?: string
  x?: number
  y?: number
}

type GraphEdge = {
  source: string | GraphNode
  target: string | GraphNode
  weight: number
}

type ClusterInfo = {
  id: number
  name: string
  size: number
  color: string
}

type RawGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters?: ClusterInfo[]
}

export default function MapaPage() {
  const router = useRouter()
  const { mode } = useMediaMode()
  const { user } = useAuth()
  const { blocked: guestBlocked, increment: guestIncrement } = useGuestLimit(user, 'mapa')
  const isSeries = mode === 'series'
  const [rawGraph, setRawGraph] = useState<RawGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, HTMLImageElement>>({})
  const [ForceGraph, setForceGraph] = useState<any>(null)
  const [nodeLimit, setNodeLimit] = useState(1000)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNode[]>([])
  const [showControls, setShowControls] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem('mapa_onboarding_done')
  })
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [pathNodes, setPathNodes] = useState<string[]>([])
  const [pathEdges, setPathEdges] = useState<Set<string>>(new Set())
  const originalPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [isMobile, setIsMobile] = useState(false)

  // Track mobile viewport for conditional Sheet rendering
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Load ForceGraph2D dynamically
  useEffect(() => {
    import('react-force-graph-2d').then(mod => {
      setForceGraph(() => mod.default)
    })
  }, [])

  // Resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [loading, ForceGraph])

  // Load raw graph data — switches between movies and series
  useEffect(() => {
    setLoading(true)
    setRawGraph(null)
    setSelectedNode(null)
    setPathNodes([])
    setPathEdges(new Set())
    setSearchQuery('')
    originalPositions.current.clear()

    const graphFile = isSeries ? '/series-graph.json' : '/movie-graph-clusters.json'
    fetch(graphFile)
      .then(r => r.json())
      .then((data: RawGraph) => {
        const imgs: Record<string, HTMLImageElement> = {}
        data.nodes.forEach(n => {
          if (n.poster) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = `https://image.tmdb.org/t/p/w92${n.poster}`
            imgs[n.id] = img
          }
        })
        setImageCache(imgs)
        setRawGraph(data)
        setLoading(false)
      })
  }, [isSeries])

  // Filter graph by IMDB limit
  const graphData = useMemo(() => {
    if (!rawGraph) return null
    // Sort by IMDB desc, take top N
    const sortedNodes = [...rawGraph.nodes].sort((a, b) => (b.imdb || 0) - (a.imdb || 0))
    const limitedNodes = sortedNodes.slice(0, nodeLimit)
    const nodeIds = new Set(limitedNodes.map(n => n.id))

    // Recount connections within the limited set
    const connCount = new Map<string, number>()
    const filteredEdges = rawGraph.edges.filter(e => {
      const sId = typeof e.source === 'object' ? (e.source as any).id : e.source
      const tId = typeof e.target === 'object' ? (e.target as any).id : e.target
      if (nodeIds.has(sId) && nodeIds.has(tId)) {
        connCount.set(sId, (connCount.get(sId) || 0) + 1)
        connCount.set(tId, (connCount.get(tId) || 0) + 1)
        return true
      }
      return false
    })

    // Preserve pre-computed x/y positions from the clusters JSON.
    // fx/fy are "fixed" positions that d3-force respects as initial placement.
    const updatedNodes: GraphNode[] = limitedNodes.map(n => ({
      id: n.id, title: n.title, titleEs: n.titleEs, imdb: n.imdb,
      poster: n.poster, categoria: n.categoria, color: n.color,
      genres: n.genres,
      clusterId: (n as any).clusterId,
      clusterColor: (n as any).clusterColor,
      subclusterId: (n as any).subclusterId,
      subclusterColor: (n as any).subclusterColor,
      connections: connCount.get(n.id) || 0,
      x: (n as any).fx ?? undefined,
      y: (n as any).fy ?? undefined,
    }))

    // Fresh edge objects with string IDs (not object references)
    const freshEdges = filteredEdges.map(e => ({
      source: typeof e.source === 'object' ? (e.source as any).id : e.source,
      target: typeof e.target === 'object' ? (e.target as any).id : e.target,
      weight: e.weight,
    }))

    return { nodes: updatedNodes, links: freshEdges }
  }, [rawGraph, nodeLimit])

  // Cluster separation is handled by pre-computed positions in the JSON
  // (computed by scripts/compute-clusters.mjs with d3-force + cluster forces).
  // No runtime force injection needed.

  // Find shortest path between two movies (Dijkstra with inverse weight = strongest path)
  const findPath = useCallback((startId: string, endId: string): string[] | null => {
    if (!graphData) return null
    // Build adjacency list
    const adj = new Map<string, { id: string; weight: number }[]>()
    graphData.nodes.forEach(n => adj.set(n.id, []))
    graphData.links.forEach(l => {
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
      adj.get(sId)?.push({ id: tId, weight: l.weight })
      adj.get(tId)?.push({ id: sId, weight: l.weight })
    })

    // Dijkstra (using inverse weight so we prefer stronger connections)
    const dist = new Map<string, number>()
    const prev = new Map<string, string | null>()
    const visited = new Set<string>()
    dist.set(startId, 0)
    prev.set(startId, null)

    while (true) {
      let minDist = Infinity
      let minNode: string | null = null
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < minDist) { minDist = d; minNode = id }
      }
      if (!minNode || minNode === endId) break
      visited.add(minNode)

      for (const neighbor of (adj.get(minNode) || [])) {
        if (visited.has(neighbor.id)) continue
        // Cost = inverse of weight (stronger = cheaper = preferred)
        const cost = 1 / (neighbor.weight || 0.1)
        const newDist = minDist + cost
        if (!dist.has(neighbor.id) || newDist < (dist.get(neighbor.id) || Infinity)) {
          dist.set(neighbor.id, newDist)
          prev.set(neighbor.id, minNode)
        }
      }
    }

    if (!prev.has(endId)) return null

    // Reconstruct path
    const path: string[] = []
    let current: string | null = endId
    while (current) {
      path.unshift(current)
      current = prev.get(current) || null
    }
    return path
  }, [graphData])

  // Search — detect "movie1, movie2" pattern for path finding
  useEffect(() => {
    if (!searchQuery.trim() || !graphData) { setSearchResults([]); setPathNodes([]); setPathEdges(new Set()); return }

    // Check for path query (comma separated)
    if (searchQuery.includes(',')) {
      const parts = searchQuery.split(',').map(s => normalize(s.trim())).filter(Boolean)
      if (parts.length >= 2) {
        const nodeA = graphData.nodes.find(n => normalize(n.title).includes(parts[0]) || normalize(n.titleEs || '').includes(parts[0]))
        const nodeB = graphData.nodes.find(n => normalize(n.title).includes(parts[1]) || normalize(n.titleEs || '').includes(parts[1]))
        if (nodeA && nodeB) {
          const path = findPath(nodeA.id, nodeB.id)
          if (path && path.length > 0) {
            setPathNodes(path)
            // Build edge set for highlighting
            const edges = new Set<string>()
            for (let i = 0; i < path.length - 1; i++) {
              edges.add([path[i], path[i + 1]].sort().join('-'))
            }
            setPathEdges(edges)
            setSearchResults([])
            deselectNode()
            // Zoom to show the path
            if (fgRef.current && path.length > 0) {
              const pathNodeObjs = path.map(id => graphData.nodes.find(n => n.id === id)).filter(Boolean)
              const avgX = pathNodeObjs.reduce((s, n) => s + (n?.x || 0), 0) / pathNodeObjs.length
              const avgY = pathNodeObjs.reduce((s, n) => s + (n?.y || 0), 0) / pathNodeObjs.length
              fgRef.current.centerAt(avgX, avgY, 1200)
              fgRef.current.zoom(2, 1200)
            }
            return
          }
        }
      }
    }

    setPathNodes([])
    setPathEdges(new Set())
    const q = normalize(searchQuery)
    const results = graphData.nodes
      .filter(n => normalize(n.title).includes(q) || normalize(n.titleEs || '').includes(q))
      .sort((a, b) => (b.imdb || 0) - (a.imdb || 0))
      .slice(0, 8)
    setSearchResults(results)
  }, [searchQuery, graphData])

  const restorePositions = useCallback(() => {
    if (originalPositions.current.size > 0 && graphData) {
      for (const gNode of graphData.nodes as any[]) {
        const orig = originalPositions.current.get(gNode.id)
        if (orig) { gNode.x = orig.x; gNode.y = orig.y }
      }
      originalPositions.current.clear()
    }
  }, [graphData])

  const deselectNode = useCallback(() => {
    restorePositions()
    setSelectedNode(null)
  }, [restorePositions])

  const focusNode = useCallback((node: GraphNode) => {
    // Restore previous positions before selecting new node
    if (originalPositions.current.size > 0 && graphData) {
      for (const gNode of graphData.nodes as any[]) {
        const orig = originalPositions.current.get(gNode.id)
        if (orig) { gNode.x = orig.x; gNode.y = orig.y }
      }
      originalPositions.current.clear()
    }

    setSelectedNode(node)
    setSearchQuery('')
    setSearchResults([])

    if (fgRef.current && graphData) {
      // Save original positions of connected nodes and pull them closer
      const connectedIds = new Set<string>()
      graphData.links.forEach((l: any) => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source
        const tId = typeof l.target === 'object' ? l.target.id : l.target
        if (sId === node.id) connectedIds.add(tId)
        if (tId === node.id) connectedIds.add(sId)
      })

      for (const gNode of graphData.nodes as any[]) {
        if (connectedIds.has(gNode.id) && gNode.x != null && gNode.y != null) {
          // Save original position
          originalPositions.current.set(gNode.id, { x: gNode.x, y: gNode.y })
          // Pull 20% closer to selected node (subtle gravity)
          const dx = (node.x || 0) - gNode.x
          const dy = (node.y || 0) - gNode.y
          gNode.x += dx * 0.2
          gNode.y += dy * 0.2
        }
      }

      // Smooth animated zoom
      fgRef.current.centerAt(node.x, node.y, 1200)
      fgRef.current.zoom(3.5, 1200)
    }
  }, [graphData])

  // Get connected nodes for selected
  const connectedNodes = useMemo(() => {
    if (!selectedNode || !graphData) return []
    const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]))
    return graphData.links
      .filter(l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
        return sId === selectedNode.id || tId === selectedNode.id
      })
      .map(l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
        const otherId = sId === selectedNode.id ? tId : sId
        return { node: nodeMap.get(otherId)!, weight: l.weight }
      })
      .filter(c => c.node)
      .sort((a, b) => b.weight - a.weight)
  }, [selectedNode, graphData])

  // Draw minimapa — zoomed in around selected node, moves with selection
  useEffect(() => {
    if (!minimapRef.current || !graphData || !selectedNode) return
    const canvas = minimapRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const selNode = (graphData.nodes as any[]).find(n => n.id === selectedNode.id)
    if (!selNode?.x == null) return

    // Center on selected node with a neighborhood radius
    const cx = selNode.x || 0
    const cy = selNode.y || 0
    // Find max distance of connected nodes to set zoom
    const connDists = connectedNodes.map(cn => {
      const n = (graphData.nodes as any[]).find(gn => gn.id === cn.node.id)
      if (!n?.x) return 100
      return Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2)
    })
    const viewRadius = Math.max(150, ...connDists) * 1.2
    const scale = 48 / viewRadius

    ctx.clearRect(0, 0, 100, 100)
    ctx.fillStyle = 'rgba(9,9,11,0.7)'
    ctx.fillRect(0, 0, 100, 100)

    // Edges
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 0.3
    for (const link of graphData.links as any[]) {
      const s = typeof link.source === 'object' ? link.source : null
      const t = typeof link.target === 'object' ? link.target : null
      if (!s?.x || !t?.x) continue
      const sx = (s.x - cx) * scale + 50
      const sy = (s.y - cy) * scale + 50
      const tx = (t.x - cx) * scale + 50
      const ty = (t.y - cy) * scale + 50
      if (sx < -20 || sx > 120 || sy < -20 || sy > 120) continue
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
    }

    // Nodes
    const validNodes = (graphData.nodes as any[]).filter(n => n.x != null && n.y != null)
    for (const n of validNodes) {
      const x = (n.x - cx) * scale + 50
      const y = (n.y - cy) * scale + 50
      if (x < -5 || x > 105 || y < -5 || y > 105) continue
      const isSel = n.id === selectedNode.id
      const isConn = connectedNodes.some(cn => cn.node.id === n.id)
      ctx.beginPath()
      ctx.arc(x, y, isSel ? 4 : isConn ? 2.5 : 1, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? '#facc15' : isConn ? '#facc15' : n.color || '#555'
      ctx.fill()
    }

    // Connected edges highlighted
    ctx.strokeStyle = 'rgba(250,204,21,0.7)'
    ctx.lineWidth = 1.2
    for (const link of graphData.links as any[]) {
      const s = typeof link.source === 'object' ? link.source : null
      const t = typeof link.target === 'object' ? link.target : null
      if (!s?.x || !t?.x) continue
      if (s.id !== selectedNode.id && t.id !== selectedNode.id) continue
      ctx.beginPath()
      ctx.moveTo((s.x - cx) * scale + 50, (s.y - cy) * scale + 50)
      ctx.lineTo((t.x - cx) * scale + 50, (t.y - cy) * scale + 50)
      ctx.stroke()
    }
  }, [selectedNode, graphData, connectedNodes])

  // Paint node — Obsidian-inspired: glow aura + smooth detail levels
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const minSize = 3.5
    const maxSize = 18
    // Smoother sizing: sqrt for diminishing returns on highly-connected nodes
    const size = Math.max(minSize, Math.min(maxSize, minSize + Math.sqrt(node.connections) * 2.5))

    const isHovered = hoveredNode?.id === node.id
    const isSelected = selectedNode?.id === node.id
    const isOnPath = pathNodes.includes(node.id)
    const isConnectedToSelected = selectedNode && graphData?.links.some(l => {
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
      return (sId === selectedNode.id && tId === node.id) || (tId === selectedNode.id && sId === node.id)
    })
    const hasPath = pathNodes.length > 0
    const dimmed = hasPath ? !isOnPath : (selectedNode && !isSelected && !isConnectedToSelected)

    // Guard: node positions may be undefined during force-graph warmup
    if (node.x == null || node.y == null || !isFinite(node.x) || !isFinite(node.y)) {
      return
    }

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.15 : 1

    // ── Glow aura (always, stronger on hover/select) ──
    if (!dimmed) {
      const glowRadius = size * (isSelected ? 4 : isHovered ? 3.5 : 2)
      const glowColor = isSelected || isHovered ? '#facc15' : node.color
      const grad = ctx.createRadialGradient(node.x, node.y, size * 0.3, node.x, node.y, glowRadius)
      grad.addColorStop(0, `${glowColor}${isSelected ? '50' : isHovered ? '40' : '18'}`)
      grad.addColorStop(1, `${glowColor}00`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI)
      ctx.fill()
    }

    const showPoster = globalScale > 1.4
    const img = imageCache[node.id]
    const hasPoster = img && img.complete && img.naturalWidth > 0

    if (showPoster && hasPoster) {
      // ── Poster mode: rounded rectangle with soft shadow ──
      const imgW = size * 2.4
      const imgH = imgW * 1.5
      const border = isSelected ? 2.5 : isHovered ? 2 : 0.8
      const borderColor = isSelected ? '#facc15' : isOnPath ? '#facc15' : isHovered ? '#facc15' : node.color
      const br = 3

      // Soft shadow behind poster
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 8 / globalScale
      ctx.shadowOffsetY = 2 / globalScale

      // Border frame
      ctx.fillStyle = borderColor
      ctx.beginPath()
      ctx.roundRect(node.x - imgW / 2 - border, node.y - imgH / 2 - border, imgW + border * 2, imgH + border * 2, br + border)
      ctx.fill()

      // Reset shadow before drawing poster
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Poster image clipped to rounded rect
      ctx.beginPath()
      ctx.roundRect(node.x - imgW / 2, node.y - imgH / 2, imgW, imgH, br)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, node.x - imgW / 2, node.y - imgH / 2, imgW, imgH)
      ctx.restore()

      // Title below poster (with text shadow for readability)
      if (globalScale > 2.5 && !dimmed) {
        const fontSize = Math.max(2.5, 11 / globalScale)
        ctx.font = `600 ${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(0,0,0,0.85)'
        ctx.fillText(node.title, node.x + 0.3, node.y + imgH / 2 + fontSize + 1.3)
        ctx.fillStyle = '#fafaf9'
        ctx.fillText(node.title, node.x, node.y + imgH / 2 + fontSize + 1)
      }
    } else {
      // ── Dot mode: filled circle with subtle inner gradient ──
      const dotGrad = ctx.createRadialGradient(
        node.x - size * 0.2, node.y - size * 0.2, 0,
        node.x, node.y, size,
      )
      const baseColor = dimmed ? `${node.color}15` : node.color
      dotGrad.addColorStop(0, dimmed ? baseColor : `${node.color}ff`)
      dotGrad.addColorStop(1, dimmed ? baseColor : `${node.color}90`)

      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = dotGrad
      ctx.fill()

      // Highlight ring
      if (isSelected || isHovered || isOnPath) {
        ctx.strokeStyle = '#facc15'
        ctx.lineWidth = (isSelected ? 3 : 2) / globalScale
        ctx.stroke()
      }

      ctx.restore()

      // Title near dot at medium zoom
      if (globalScale > 3 && !dimmed) {
        const fontSize = Math.max(2, 10 / globalScale)
        ctx.font = `600 ${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fafaf9'
        ctx.fillText(node.title, node.x, node.y + size + fontSize + 0.5)
      }
    }
  }, [hoveredNode, selectedNode, imageCache, graphData, pathNodes])

  // Paint link — curved bezier lines with weight-based opacity
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const sId = typeof link.source === 'object' ? link.source.id : link.source
    const tId = typeof link.target === 'object' ? link.target.id : link.target
    const isConnected = selectedNode && (sId === selectedNode.id || tId === selectedNode.id)
    const edgeKey = [sId, tId].sort().join('-')
    const isPathEdge = pathEdges.has(edgeKey)
    const hasPath = pathNodes.length > 0
    const dimmed = hasPath ? !isPathEdge : (selectedNode && !isConnected)

    const sx = link.source.x
    const sy = link.source.y
    const tx = link.target.x
    const ty = link.target.y

    // Guard: positions may be undefined during warmup
    if (!isFinite(sx) || !isFinite(sy) || !isFinite(tx) || !isFinite(ty)) return

    // Curved bezier — control point offset perpendicular to the line
    const dx = tx - sx
    const dy = ty - sy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const curvature = 0.15
    const cpx = (sx + tx) / 2 + dy * curvature
    const cpy = (sy + ty) / 2 - dx * curvature

    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(cpx, cpy, tx, ty)

    if (isPathEdge) {
      // Path edges: gold with glow
      ctx.strokeStyle = 'rgba(250,204,21,0.9)'
      ctx.lineWidth = 3 / globalScale
      ctx.shadowColor = 'rgba(250,204,21,0.5)'
      ctx.shadowBlur = 6 / globalScale
    } else if (isConnected) {
      ctx.strokeStyle = 'rgba(250,204,21,0.6)'
      ctx.lineWidth = 1.5 / globalScale
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    } else {
      const alpha = dimmed ? 0.02 : Math.min(0.12, link.weight * 0.035)
      ctx.strokeStyle = `rgba(250,204,21,${alpha})`
      ctx.lineWidth = Math.max(0.15, link.weight * 0.25) / globalScale
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    // Percentage label on path edges
    if (isPathEdge && globalScale > 1.5) {
      const pct = Math.round((link.weight / 4) * 100)
      // Point on the bezier at t=0.5
      const midX = 0.25 * sx + 0.5 * cpx + 0.25 * tx
      const midY = 0.25 * sy + 0.5 * cpy + 0.25 * ty
      const fontSize = Math.max(3, 12 / globalScale)

      ctx.fillStyle = 'rgba(9,9,11,0.85)'
      const textWidth = fontSize * 2.8
      ctx.beginPath()
      ctx.roundRect(midX - textWidth / 2, midY - fontSize / 2 - 1.5, textWidth, fontSize + 3, fontSize / 2)
      ctx.fill()

      ctx.font = `bold ${fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#facc15'
      ctx.fillText(`${pct}%`, midX, midY)
    }
  }, [selectedNode, pathEdges, pathNodes])

  const mediaLabel = isSeries ? 'series' : 'películas'

  const clearPath = () => {
    setPathNodes([])
    setPathEdges(new Set())
    setSearchQuery('')
  }

  const finishOnboarding = () => {
    setShowOnboarding(false)
    setShowInstructions(false)
    if (typeof window !== 'undefined') localStorage.setItem('mapa_onboarding_done', '1')
  }

  if (loading || !ForceGraph) {
    return (
      <PageShell fullBleed>
        <div className="flex items-center justify-center h-[calc(100dvh-57px)]">
          <LoadingState text={`Cargando mapa de ${mediaLabel}...`} size="lg" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell fullBleed>
      <div
        ref={containerRef}
        className="relative h-[calc(100dvh-57px)] w-full overflow-hidden bg-zinc-950"
      >
        {/* Top-left controls: search + settings */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 w-[min(22rem,calc(100vw-1.5rem))]">
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Buscar o escribir A, B para ruta..."
                />
              </div>
              <IconButton
                icon={<Icon.Settings className="w-5 h-5" />}
                label="Ajustes del mapa"
                variant="secondary"
                active={showControls}
                onClick={() => setShowControls(v => !v)}
              />
            </div>

            {searchResults.length > 0 && (
              <Card padding="none" className="absolute top-full mt-2 left-0 right-0 border border-zinc-800 max-h-72 overflow-y-auto z-20 shadow-2xl">
                <ul className="divide-y divide-zinc-800/60">
                  {searchResults.map(n => (
                    <li key={n.id}>
                      <button
                        onClick={() => focusNode(n)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/70 text-left min-h-[44px] cursor-pointer transition-colors"
                      >
                        {n.poster ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${n.poster}`}
                            alt=""
                            className="w-8 h-12 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-12 rounded bg-zinc-800 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium line-clamp-1">{n.title}</p>
                          <span className="inline-flex items-center gap-1 text-yellow-400 text-xs mt-0.5">
                            <Icon.Star filled className="w-3 h-3" />
                            {n.imdb}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {showControls && (
            <Card padding="sm" className="border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Ajustes</span>
                <IconButton
                  icon={<Icon.Close className="w-4 h-4" />}
                  label="Cerrar ajustes"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowControls(false)}
                />
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Películas visibles</span>
                  <span className="text-white font-bold">{nodeLimit}</span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={rawGraph?.nodes.length || 3000}
                  step={100}
                  value={nodeLimit}
                  onChange={e => {
                    setNodeLimit(Number(e.target.value))
                    deselectNode()
                    if (fgRef.current) fgRef.current.d3ReheatSimulation()
                  }}
                  className="w-full accent-yellow-400 h-1"
                />
              </div>

              <div className="flex flex-wrap gap-1 mb-2">
                {(rawGraph?.clusters ?? []).map(cl => (
                  <span key={cl.id} className="inline-flex items-center gap-1 text-[9px] text-zinc-400 bg-zinc-800/60 rounded-full px-2 py-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cl.color }} />
                    {cl.name} <span className="text-zinc-600">({cl.size})</span>
                  </span>
                ))}
              </div>

              <p className="text-[10px] text-zinc-500">
                {graphData?.nodes.length} nodos · {graphData?.links.length} conexiones
              </p>
            </Card>
          )}
        </div>

        {/* Selected node — desktop sidebar */}
        {selectedNode && !pathNodes.length && (
          <div className="hidden md:block absolute top-3 right-3 z-10 w-80 max-h-[calc(100dvh-100px)]">
            <Card padding="none" className="border border-zinc-800 overflow-hidden">
              <div className="max-h-[calc(100dvh-100px)] overflow-y-auto">
                <div className="p-4 border-b border-zinc-800 relative">
                  <IconButton
                    icon={<Icon.Close className="w-4 h-4" />}
                    label="Cerrar"
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={deselectNode}
                  />
                  <div className="flex items-start gap-3 pr-8">
                    {selectedNode.poster && (
                      <img
                        src={`https://image.tmdb.org/t/p/w154${selectedNode.poster}`}
                        alt=""
                        className="w-20 rounded-lg object-cover shrink-0"
                        style={{ aspectRatio: '2/3', border: `2px solid ${selectedNode.color}` }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-bold leading-tight">{selectedNode.title}</p>
                      {selectedNode.title !== selectedNode.titleEs && (
                        <p className="text-zinc-500 text-[11px] mt-0.5">{selectedNode.titleEs}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="inline-flex items-center gap-1 text-yellow-400 text-xs font-bold">
                          <Icon.Star filled className="w-3 h-3" />
                          {selectedNode.imdb}
                        </span>
                        <span className="text-zinc-500 text-[11px]">
                          {selectedNode.connections} conexiones
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedNode.genres.map(g => (
                          <Pill key={g} variant="default" size="sm">{g}</Pill>
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        iconRight={<Icon.ArrowRight className="w-3.5 h-3.5" />}
                        onClick={() => router.push(`${isSeries ? '/serie' : '/pelicula'}/${selectedNode.id}`)}
                      >
                        Ver ficha completa
                      </Button>
                    </div>
                  </div>
                </div>

                {connectedNodes.length > 0 && (
                  <div className="p-4">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-2">
                      Películas conectadas
                    </p>
                    <div className="space-y-1.5">
                      {connectedNodes.map(({ node: cn, weight }) => (
                        <button
                          key={cn.id}
                          onClick={() => focusNode(cn)}
                          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left cursor-pointer min-h-[44px]"
                        >
                          {cn.poster ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${cn.poster}`}
                              alt=""
                              className="w-9 rounded object-cover shrink-0"
                              style={{ aspectRatio: '2/3' }}
                            />
                          ) : (
                            <div className="w-9 rounded bg-zinc-800 shrink-0" style={{ aspectRatio: '2/3' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium line-clamp-1">{cn.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-0.5 text-yellow-400 text-[10px]">
                                <Icon.Star filled className="w-2.5 h-2.5" />
                                {cn.imdb}
                              </span>
                              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-400/60 rounded-full"
                                  style={{ width: `${(weight / 4) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Selected node — mobile peek sheet */}
        <Sheet
          open={!!selectedNode && !pathNodes.length && isMobile}
          onClose={deselectNode}
          peek={26}
        >
          {selectedNode && (
            <div>
              {/* Compact header — visible in peek mode */}
              <div className="flex items-center gap-3">
                {selectedNode.poster && (
                  <img
                    src={`https://image.tmdb.org/t/p/w185${selectedNode.poster}`}
                    alt=""
                    className="w-12 rounded-md object-cover shrink-0"
                    style={{ aspectRatio: '2/3', border: `2px solid ${selectedNode.color}` }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-white font-bold text-sm leading-tight line-clamp-1">
                    {selectedNode.title}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-0.5 text-yellow-400 text-xs font-bold tabular-nums">
                      <Icon.Star filled className="w-3 h-3" />
                      {selectedNode.imdb}
                    </span>
                    <span className="text-zinc-500 text-[11px] tabular-nums">
                      · {selectedNode.connections} conexiones
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`${isSeries ? '/serie' : '/pelicula'}/${selectedNode.id}`)}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-yellow-400 text-zinc-950 text-xs font-bold cursor-pointer hover:bg-yellow-300 transition-colors min-h-[36px]"
                >
                  Ficha
                  <Icon.ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Connected movies — horizontal carousel in peek view */}
              {connectedNodes.length > 0 && (
                <div className="mt-3">
                  <div className="-mx-5 px-5 overflow-x-auto no-scrollbar">
                    <div className="flex gap-2 snap-x">
                      {connectedNodes.map(({ node: cn, weight }) => (
                        <button
                          key={cn.id}
                          type="button"
                          onClick={() => focusNode(cn)}
                          className="snap-start shrink-0 w-16 text-left cursor-pointer"
                        >
                          {cn.poster ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w185${cn.poster}`}
                              alt=""
                              className="w-16 rounded-md object-cover"
                              style={{ aspectRatio: '2/3' }}
                            />
                          ) : (
                            <div className="w-16 rounded-md bg-zinc-800" style={{ aspectRatio: '2/3' }} />
                          )}
                          <div className="flex items-center gap-0.5 mt-1">
                            <Icon.Star filled className="w-2 h-2 text-yellow-400" />
                            <span className="text-yellow-400 text-[9px] font-bold tabular-nums">{cn.imdb}</span>
                          </div>
                          <div className="mt-0.5 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-400/70 rounded-full"
                              style={{ width: `${(weight / 4) * 100}%` }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Expanded-only content: genres + full list */}
              <div className="mt-5">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selectedNode.genres.map((g) => (
                    <Pill key={g} variant="default" size="sm">{g}</Pill>
                  ))}
                </div>
                {connectedNodes.length > 0 && (
                  <>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">
                      Todas las conexiones · {connectedNodes.length}
                    </p>
                    <div className="space-y-2">
                      {connectedNodes.map(({ node: cn, weight }) => (
                        <button
                          key={`full-${cn.id}`}
                          type="button"
                          onClick={() => focusNode(cn)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/70 text-left cursor-pointer min-h-[44px]"
                        >
                          {cn.poster ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${cn.poster}`}
                              alt=""
                              className="w-10 rounded object-cover shrink-0"
                              style={{ aspectRatio: '2/3' }}
                            />
                          ) : (
                            <div className="w-10 rounded bg-zinc-800 shrink-0" style={{ aspectRatio: '2/3' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium line-clamp-1">{cn.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="inline-flex items-center gap-0.5 text-yellow-400 text-[11px] tabular-nums">
                                <Icon.Star filled className="w-3 h-3" />
                                {cn.imdb}
                              </span>
                              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-400/70 rounded-full"
                                  style={{ width: `${(weight / 4) * 100}%` }}
                                />
                              </div>
                              <span className="text-zinc-500 text-[10px] tabular-nums shrink-0">
                                {Math.round((weight / 4) * 100)}%
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </Sheet>

        {/* Minimap on mobile when a node is selected */}
        {selectedNode && !pathNodes.length && (
          <div
            className="md:hidden absolute top-3 right-3 z-10 bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden"
            style={{ width: 100, height: 100 }}
          >
            <canvas ref={minimapRef} width={100} height={100} className="w-full h-full" />
          </div>
        )}

        {/* Path result panel — desktop sidebar */}
        {pathNodes.length > 0 && graphData && (
          <div className="hidden md:block absolute top-3 right-3 z-10 w-80 max-h-[calc(100dvh-100px)]">
            <Card padding="none" className="border border-zinc-800 overflow-hidden">
              <div className="max-h-[calc(100dvh-100px)] overflow-y-auto">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Camino encontrado</p>
                    <p className="text-white text-sm font-bold mt-0.5">{pathNodes.length - 1} pasos</p>
                  </div>
                  <IconButton
                    icon={<Icon.Close className="w-4 h-4" />}
                    label="Cerrar ruta"
                    size="sm"
                    variant="ghost"
                    onClick={clearPath}
                  />
                </div>
                <div className="p-4 space-y-1">
                  {pathNodes.map((id, i) => {
                    const node = graphData.nodes.find((n: any) => n.id === id)
                    if (!node) return null
                    return (
                      <div key={id}>
                        <button
                          onClick={() => focusNode(node)}
                          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/70 transition-colors text-left cursor-pointer min-h-[44px]"
                        >
                          {node.poster ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${node.poster}`}
                              alt=""
                              className="w-9 rounded object-cover shrink-0"
                              style={{ aspectRatio: '2/3' }}
                            />
                          ) : (
                            <div className="w-9 rounded bg-zinc-800 shrink-0" style={{ aspectRatio: '2/3' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium line-clamp-1">{node.title}</p>
                            <span className="inline-flex items-center gap-0.5 text-yellow-400 text-[10px] mt-0.5">
                              <Icon.Star filled className="w-2.5 h-2.5" />
                              {node.imdb}
                            </span>
                          </div>
                          {i === 0 && <Pill variant="gold" size="sm">Inicio</Pill>}
                          {i === pathNodes.length - 1 && <Pill variant="gold" size="sm">Fin</Pill>}
                        </button>
                        {i < pathNodes.length - 1 && (
                          <div className="flex items-center gap-1 pl-5 py-0.5">
                            <div className="w-px h-3 bg-yellow-400/50" />
                            <Icon.ChevronDown className="w-3 h-3 text-yellow-400/50" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Path — mobile horizontal strip */}
        {pathNodes.length > 0 && graphData && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
            <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-4 pb-3 px-3 pointer-events-auto">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs text-zinc-300 font-semibold">{pathNodes.length - 1} pasos</p>
                <IconButton
                  icon={<Icon.Close className="w-4 h-4" />}
                  label="Cerrar ruta"
                  size="sm"
                  variant="ghost"
                  onClick={clearPath}
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                {pathNodes.map((id, i) => {
                  const node = graphData.nodes.find((n: any) => n.id === id)
                  if (!node) return null
                  const isEndpoint = i === 0 || i === pathNodes.length - 1
                  return (
                    <div key={id} className="flex items-center shrink-0">
                      <button onClick={() => focusNode(node)} className="relative cursor-pointer">
                        {node.poster ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w154${node.poster}`}
                            alt=""
                            className="h-28 rounded-lg"
                            style={{
                              aspectRatio: '2/3',
                              border: isEndpoint ? '2px solid #facc15' : '2px solid #3f3f46',
                            }}
                          />
                        ) : (
                          <div className="h-28 rounded-lg bg-zinc-800" style={{ aspectRatio: '2/3' }} />
                        )}
                        <div className="absolute top-1 right-1 bg-black/70 rounded px-1 py-0.5 inline-flex items-center gap-0.5">
                          <Icon.Star filled className="w-2 h-2 text-yellow-400" />
                          <span className="text-yellow-400 text-[9px] font-bold">{node.imdb}</span>
                        </div>
                        {i === 0 && (
                          <div className="absolute bottom-1 left-1 bg-yellow-400 text-zinc-950 text-[8px] font-bold px-1.5 rounded">
                            Inicio
                          </div>
                        )}
                        {i === pathNodes.length - 1 && (
                          <div className="absolute bottom-1 left-1 bg-yellow-400 text-zinc-950 text-[8px] font-bold px-1.5 rounded">
                            Fin
                          </div>
                        )}
                      </button>
                      {i < pathNodes.length - 1 && (
                        <Icon.ChevronRight className="w-4 h-4 text-yellow-400/60 shrink-0 mx-0.5" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Hover tooltip (only when no selection) */}
        {hoveredNode && !selectedNode && !pathNodes.length && (
          <div className="hidden md:block absolute top-3 right-3 z-10">
            <Card padding="sm" className="border border-zinc-800">
              <p className="text-white text-sm font-bold">{hoveredNode.title}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
                  <Icon.Star filled className="w-3 h-3" />
                  {hoveredNode.imdb}
                </span>
                <span className="text-zinc-500 text-[11px]">
                  {hoveredNode.connections} conexiones
                </span>
              </div>
            </Card>
          </div>
        )}

        {/* Guest limit modal */}
        {guestBlocked && <GuestLimitModal />}

        {/* Onboarding modal */}
        <Modal
          open={showOnboarding && !loading}
          onClose={finishOnboarding}
          showCloseButton={false}
          size="sm"
        >
          <div className="text-center">
            {onboardingStep === 0 && (
              <>
                <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center mx-auto mb-4">
                  <Icon.Search className="w-7 h-7 text-yellow-400" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">Busca películas</h3>
                <p className="text-zinc-400 text-sm">
                  Usa el buscador superior para encontrar cualquier película y ver sus conexiones.
                </p>
              </>
            )}
            {onboardingStep === 1 && (
              <>
                <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center mx-auto mb-4">
                  <Icon.Map className="w-7 h-7 text-yellow-400" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">Explora el mapa</h3>
                <p className="text-zinc-400 text-sm">
                  Arrastra para moverte y usa scroll o pellizcar para hacer zoom. Los pósters aparecen al acercarte.
                </p>
              </>
            )}
            {onboardingStep === 2 && (
              <>
                <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center mx-auto mb-4">
                  <Icon.Sparkles className="w-7 h-7 text-yellow-400" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">Toca una película</h3>
                <p className="text-zinc-400 text-sm">
                  Selecciona cualquier nodo para ver sus conexiones y descubrir películas similares.
                </p>
              </>
            )}

            <div className="flex items-center justify-center gap-3 mt-5">
              {onboardingStep < 2 ? (
                <Button variant="primary" size="md" onClick={() => setOnboardingStep(s => s + 1)}>
                  Siguiente
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={finishOnboarding}>
                  Explorar
                </Button>
              )}
            </div>

            <div className="flex justify-center gap-1.5 mt-4">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === onboardingStep ? 'w-6 bg-yellow-400' : 'w-1.5 bg-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </Modal>

        {graphData && (
          <ForceGraph
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeCanvasObject={paintNode}
            linkCanvasObject={paintLink}
            nodeRelSize={6}
            linkDirectionalParticles={0}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            warmupTicks={100}
            cooldownTicks={200}
            onEngineStop={() => {
              // After simulation stabilizes, zoom to fit the entire graph
              // so ALL cluster labels are visible on first load
              if (fgRef.current && !selectedNode && pathNodes.length === 0) {
                fgRef.current.zoomToFit(800, 60)
              }
            }}
            onNodeHover={(node: any) => setHoveredNode(node)}
            onNodeClick={(node: any) => {
              if (selectedNode?.id === node.id) {
                deselectNode()
              } else {
                if (guestIncrement()) return
                focusNode(node)
              }
            }}
            onBackgroundClick={() => deselectNode()}
            onZoom={() => { requestAnimationFrame(() => { if (showInstructions) setShowInstructions(false) }) }}
            onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              if (!graphData) return
              const gnodes = graphData.nodes as GraphNode[]

              // ── Level 0 labels: mega-clusters (zoom < 0.8) ──
              if (globalScale < 0.8 && rawGraph?.clusters) {
                const centroids: Record<number, { x: number; y: number; count: number }> = {}
                for (const node of gnodes) {
                  const cid = node.clusterId ?? 0
                  if (!isFinite(node.x ?? NaN) || !isFinite(node.y ?? NaN)) continue
                  if (!centroids[cid]) centroids[cid] = { x: 0, y: 0, count: 0 }
                  centroids[cid].x += node.x!
                  centroids[cid].y += node.y!
                  centroids[cid].count++
                }
                for (const cl of rawGraph.clusters) {
                  const c = centroids[cl.id]
                  if (!c || c.count === 0) continue
                  const cx = c.x / c.count
                  const cy = c.y / c.count
                  const fontSize = Math.max(10, 24 / globalScale)
                  ctx.font = `900 ${fontSize}px Inter, sans-serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.globalAlpha = Math.min(0.75, (0.8 - globalScale) * 2.5)
                  // Text shadow for readability
                  ctx.fillStyle = 'rgba(0,0,0,0.6)'
                  ctx.fillText(cl.name.toUpperCase(), cx + 1.5, cy + 1.5)
                  ctx.fillStyle = cl.color
                  ctx.fillText(cl.name.toUpperCase(), cx, cy)
                  ctx.globalAlpha = 1
                }
              }

              // ── Level 1 labels: subclusters (zoom 0.4 - 1.5) ──
              if (globalScale > 0.4 && globalScale < 1.5 && (rawGraph as any)?.subclusters) {
                const subclusters = (rawGraph as any).subclusters as { id: number; name: string; size: number; color: string; parentId: number }[]
                const subCentroids: Record<number, { x: number; y: number; count: number }> = {}
                for (const node of gnodes) {
                  const sid = (node as any).subclusterId ?? 0
                  if (!isFinite(node.x ?? NaN) || !isFinite(node.y ?? NaN)) continue
                  if (!subCentroids[sid]) subCentroids[sid] = { x: 0, y: 0, count: 0 }
                  subCentroids[sid].x += node.x!
                  subCentroids[sid].y += node.y!
                  subCentroids[sid].count++
                }
                for (const sc of subclusters) {
                  const c = subCentroids[sc.id]
                  if (!c || c.count < 10) continue
                  const cx = c.x / c.count
                  const cy = c.y / c.count
                  const fontSize = Math.max(6, 14 / globalScale)
                  ctx.font = `700 ${fontSize}px Inter, sans-serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  // Fade in as you zoom in from 0.25, fade out as you approach 1.0
                  const fadeIn = Math.min(1, (globalScale - 0.4) * 4)
                  const fadeOut = Math.min(1, (1.5 - globalScale) * 2)
                  ctx.globalAlpha = Math.min(0.6, fadeIn * fadeOut)
                  ctx.fillStyle = 'rgba(0,0,0,0.5)'
                  ctx.fillText(sc.name, cx + 1, cy + 1)
                  ctx.fillStyle = sc.color
                  ctx.fillText(sc.name, cx, cy)
                  ctx.globalAlpha = 1
                }
              }
            }}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            minZoom={0.1}
            maxZoom={15}
            backgroundColor="rgba(0,0,0,0)"
          />
        )}
      </div>
    </PageShell>
  )
}
