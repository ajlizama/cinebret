'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

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
  x?: number
  y?: number
}

type GraphEdge = {
  source: string | GraphNode
  target: string | GraphNode
  weight: number
}

type RawGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const CAT_LABELS: Record<string, string> = {
  "Pa'l domingo de bajón": 'Bajón',
  "Pa' saltar del sillón": 'Sillón',
  "Pa' quedar con el cerebro como licuadora": 'Licuadora',
  "Pa' llorar a moco tendido": 'Moco tendido',
}

const CAT_COLORS: Record<string, string> = {
  "Pa'l domingo de bajón": '#facc15',
  "Pa' saltar del sillón": '#ef4444',
  "Pa' quedar con el cerebro como licuadora": '#3b82f6',
  "Pa' llorar a moco tendido": '#a855f7',
}

const LIMIT_OPTIONS = [500, 1000, 1500, 2000, 3000]

export default function MapaPage() {
  const router = useRouter()
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
  const [pathNodes, setPathNodes] = useState<string[]>([])
  const [pathEdges, setPathEdges] = useState<Set<string>>(new Set())
  const originalPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

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
  }, [])

  // Load raw graph data
  useEffect(() => {
    fetch('/movie-graph.json')
      .then(r => r.json())
      .then((data: RawGraph) => {
        // Preload images
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
  }, [])

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

    // Create fresh node objects without stale x/y positions
    const updatedNodes: GraphNode[] = limitedNodes.map(n => ({
      id: n.id, title: n.title, titleEs: n.titleEs, imdb: n.imdb,
      poster: n.poster, categoria: n.categoria, color: n.color,
      genres: n.genres,
      connections: connCount.get(n.id) || 0,
    }))

    // Fresh edge objects with string IDs (not object references)
    const freshEdges = filteredEdges.map(e => ({
      source: typeof e.source === 'object' ? (e.source as any).id : e.source,
      target: typeof e.target === 'object' ? (e.target as any).id : e.target,
      weight: e.weight,
    }))

    return { nodes: updatedNodes, links: freshEdges }
  }, [rawGraph, nodeLimit])

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
      const parts = searchQuery.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      if (parts.length >= 2) {
        const nodeA = graphData.nodes.find(n => n.title.toLowerCase().includes(parts[0]) || n.titleEs?.toLowerCase().includes(parts[0]))
        const nodeB = graphData.nodes.find(n => n.title.toLowerCase().includes(parts[1]) || n.titleEs?.toLowerCase().includes(parts[1]))
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
    const q = searchQuery.toLowerCase()
    const results = graphData.nodes
      .filter(n => n.title.toLowerCase().includes(q) || n.titleEs?.toLowerCase().includes(q))
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
          // Pull 80% closer to selected node
          const dx = (node.x || 0) - gNode.x
          const dy = (node.y || 0) - gNode.y
          gNode.x += dx * 0.8
          gNode.y += dy * 0.8
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

  // Draw minimapa when selected
  useEffect(() => {
    if (!minimapRef.current || !graphData || !selectedNode) return
    const canvas = minimapRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nodes = graphData.nodes as any[]
    const validNodes = nodes.filter(n => n.x != null && n.y != null)
    if (validNodes.length === 0) return

    const minX = Math.min(...validNodes.map(n => n.x))
    const maxX = Math.max(...validNodes.map(n => n.x))
    const minY = Math.min(...validNodes.map(n => n.y))
    const maxY = Math.max(...validNodes.map(n => n.y))
    const scale = Math.min(96 / (maxX - minX || 1), 96 / (maxY - minY || 1))

    ctx.clearRect(0, 0, 100, 100)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, 100, 100)

    // Edges faintly
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 0.3
    for (const link of graphData.links as any[]) {
      const s = typeof link.source === 'object' ? link.source : null
      const t = typeof link.target === 'object' ? link.target : null
      if (!s?.x || !t?.x) continue
      ctx.beginPath()
      ctx.moveTo((s.x - minX) * scale + 2, (s.y - minY) * scale + 2)
      ctx.lineTo((t.x - minX) * scale + 2, (t.y - minY) * scale + 2)
      ctx.stroke()
    }

    // Nodes as dots
    for (const n of validNodes) {
      const x = (n.x - minX) * scale + 2
      const y = (n.y - minY) * scale + 2
      const isSel = n.id === selectedNode.id
      const isConn = connectedNodes.some(cn => cn.node.id === n.id)
      ctx.beginPath()
      ctx.arc(x, y, isSel ? 3 : isConn ? 2 : 0.7, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? '#facc15' : isConn ? '#facc15' : n.color || '#555'
      ctx.fill()
    }

    // Selected connections
    ctx.strokeStyle = 'rgba(250,204,21,0.6)'
    ctx.lineWidth = 1
    for (const link of graphData.links as any[]) {
      const s = typeof link.source === 'object' ? link.source : null
      const t = typeof link.target === 'object' ? link.target : null
      if (!s?.x || !t?.x) continue
      if (s.id !== selectedNode.id && t.id !== selectedNode.id) continue
      ctx.beginPath()
      ctx.moveTo((s.x - minX) * scale + 2, (s.y - minY) * scale + 2)
      ctx.lineTo((t.x - minX) * scale + 2, (t.y - minY) * scale + 2)
      ctx.stroke()
    }
  }, [selectedNode, graphData, connectedNodes])

  // Paint node — colored circle at distance, poster when zoomed in
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const minSize = 3
    const maxSize = 16
    const size = Math.max(minSize, Math.min(maxSize, minSize + (node.connections / 1.5)))

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

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.25 : 1

    const showPoster = globalScale > 1.2
    const img = imageCache[node.id]
    const hasPoster = img && img.complete && img.naturalWidth > 0

    if (showPoster && hasPoster) {
      // Poster mode: rectangular poster with colored border
      const imgW = size * 2.2
      const imgH = imgW * 1.5
      const border = isSelected ? 2 : isHovered ? 1.5 : 1

      // Border
      ctx.fillStyle = isSelected ? '#facc15' : isOnPath ? '#facc15' : isHovered ? '#ffffff' : node.color
      ctx.beginPath()
      const br = 2
      ctx.roundRect(node.x - imgW / 2 - border, node.y - imgH / 2 - border, imgW + border * 2, imgH + border * 2, br + border)
      ctx.fill()

      // Poster
      ctx.beginPath()
      ctx.roundRect(node.x - imgW / 2, node.y - imgH / 2, imgW, imgH, br)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, node.x - imgW / 2, node.y - imgH / 2, imgW, imgH)
      ctx.restore()

      // Title below poster
      if (globalScale > 3 && !dimmed) {
        const fontSize = Math.max(2, 10 / globalScale)
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.fillText(node.title, node.x + 0.3, node.y + imgH / 2 + 2.3)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(node.title, node.x, node.y + imgH / 2 + 2)
      }
    } else {
      // Circle mode: colored dot
      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = dimmed ? `${node.color}20` : node.color
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#facc15' : '#ffffff'
        ctx.lineWidth = (isSelected ? 3 : 2) / globalScale
        ctx.stroke()
      }

      ctx.restore()

      // Title
      if (globalScale > 3.5 && !dimmed) {
        const fontSize = Math.max(2, 9 / globalScale)
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(node.title, node.x, node.y + size + 2)
      }
    }
  }, [hoveredNode, selectedNode, imageCache, graphData, pathNodes])

  // Paint link
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const sId = typeof link.source === 'object' ? link.source.id : link.source
    const tId = typeof link.target === 'object' ? link.target.id : link.target
    const isConnected = selectedNode && (sId === selectedNode.id || tId === selectedNode.id)
    const edgeKey = [sId, tId].sort().join('-')
    const isPathEdge = pathEdges.has(edgeKey)
    const hasPath = pathNodes.length > 0
    const dimmed = hasPath ? !isPathEdge : (selectedNode && !isConnected)

    ctx.beginPath()
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = dimmed ? 'rgba(255,255,255,0.03)' : isPathEdge ? 'rgba(250,204,21,0.9)' : isConnected ? 'rgba(250,204,21,0.7)' : `rgba(255,255,255,${Math.min(0.15, link.weight * 0.04)})`
    ctx.lineWidth = isPathEdge ? 3 / globalScale : isConnected ? 2 / globalScale : Math.max(0.2, link.weight * 0.3) / globalScale
    ctx.stroke()

    // Show percentage label on path or connected links when zoomed enough
    if ((isConnected || isPathEdge) && globalScale > 1.5) {
      const pct = Math.round((link.weight / 4) * 100)
      const midX = (link.source.x + link.target.x) / 2
      const midY = (link.source.y + link.target.y) / 2
      const fontSize = Math.max(3, 12 / globalScale)

      // Background pill
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      const textWidth = fontSize * 2.5
      ctx.beginPath()
      ctx.roundRect(midX - textWidth / 2, midY - fontSize / 2 - 1, textWidth, fontSize + 2, fontSize / 2)
      ctx.fill()

      // Percentage text
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#facc15'
      ctx.fillText(`${pct}%`, midX, midY)
    }
  }, [selectedNode, pathEdges, pathNodes])

  if (loading || !ForceGraph) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Cargando mapa de películas...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 overflow-hidden">
      <Nav />
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {/* Controls — top left: compact search + collapsible settings */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
          {/* Search bar — always visible, compact */}
          <div className="relative">
            <div className="flex items-center gap-1 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg">
              <svg className="w-3.5 h-3.5 text-zinc-500 ml-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar o A, B..."
                className="w-28 md:w-40 bg-transparent py-1.5 pr-2 text-[11px] text-white placeholder:text-zinc-500 focus:outline-none"
              />
              {!showControls && (
                <button onClick={() => setShowControls(true)} className="px-2 py-1.5 text-zinc-500 hover:text-white border-l border-zinc-800">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 007.92 12.446m-9.09 2.778A7.5 7.5 0 014.085 5.736"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 12h6M19 9v6"/></svg>
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-52 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden max-h-52 overflow-y-auto z-20 backdrop-blur-sm">
                {searchResults.map(n => (
                  <button
                    key={n.id}
                    onClick={() => focusNode(n)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-800 text-left"
                  >
                    {n.poster && (
                      <img src={`https://image.tmdb.org/t/p/w92${n.poster}`} alt="" className="w-5 h-8 rounded object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-[11px] font-medium line-clamp-1">{n.title}</p>
                      <span className="text-yellow-400 text-[9px]">⭐ {n.imdb}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Collapsible settings panel */}
          {showControls && (
            <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-2 w-44 md:w-52 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Ajustes</span>
                <button onClick={() => setShowControls(false)} className="text-zinc-500 hover:text-white text-xs">✕</button>
              </div>

              {/* Slider */}
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 mb-0.5">
                  <span>Películas</span>
                  <span className="text-white font-bold">{nodeLimit}</span>
                </div>
                <input
                  type="range" min={200} max={rawGraph?.nodes.length || 3000} step={100}
                  value={nodeLimit}
                  onChange={e => { setNodeLimit(Number(e.target.value)); deselectNode(); if (fgRef.current) fgRef.current.d3ReheatSimulation() }}
                  className="w-full accent-yellow-400 h-1"
                />
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(CAT_COLORS).map(([cat, color]) => (
                  <div key={cat} className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[8px] text-zinc-500">{CAT_LABELS[cat]}</span>
                  </div>
                ))}
              </div>

              <p className="text-[8px] text-zinc-600">{graphData?.nodes.length} nodos · {graphData?.links.length} conexiones</p>
            </div>
          )}
        </div>

        {/* Selected node panel — desktop: sidebar, mobile: bottom sheet */}
        {selectedNode && (
          <>
            {/* Mobile: bottom poster carousel + close button */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-20">
              <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-3 pb-2 px-2">
                {/* Horizontal scroll: selected poster + connected posters */}
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {/* Selected movie — larger poster */}
                  <div className="shrink-0 relative" onClick={() => router.push(`/pelicula/${selectedNode.id}`)}>
                    {selectedNode.poster && (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${selectedNode.poster}`}
                        alt=""
                        className="h-36 rounded-lg shadow-2xl"
                        style={{ aspectRatio: '2/3', border: `3px solid ${selectedNode.color}` }}
                      />
                    )}
                    <div className="absolute bottom-1 left-1 right-1">
                      <p className="text-white text-[9px] font-bold leading-tight line-clamp-1 drop-shadow-lg">{selectedNode.title}</p>
                      <span className="text-yellow-400 text-[10px] font-black flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                        {selectedNode.imdb} · {connectedNodes.length} conex
                      </span>
                    </div>
                  </div>

                  {/* Connected movies — smaller posters */}
                  {connectedNodes.map(({ node: cn, weight }) => (
                    <div key={cn.id} className="shrink-0 relative" onClick={() => focusNode(cn)}>
                      {cn.poster ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w154${cn.poster}`}
                          alt=""
                          className="h-36 rounded-lg shadow-lg"
                          style={{ aspectRatio: '2/3', border: `2px solid ${cn.color}` }}
                        />
                      ) : (
                        <div className="h-36 rounded-lg bg-zinc-800" style={{ aspectRatio: '2/3', border: `2px solid ${cn.color}` }} />
                      )}
                      <div className="absolute top-1 right-1 bg-black/70 rounded px-1 py-0.5">
                        <span className="text-yellow-400 text-[9px] font-bold">{cn.imdb}</span>
                      </div>
                      <div className="absolute bottom-1 left-1 right-1">
                        <p className="text-white text-[8px] font-medium leading-tight line-clamp-1 drop-shadow-lg">{cn.title}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Close button + watermark row */}
                <div className="flex items-center justify-between mt-1 px-1">
                  <div className="flex items-center gap-1.5 opacity-30">
                    <img src="/logo-oficial.png" alt="CineBret" className="h-3 w-auto" />
                    <span className="text-zinc-600 text-[7px]">cinebret.cl/mapa</span>
                  </div>
                  <button onClick={() => deselectNode()} className="text-zinc-500 text-xs px-2 py-1">✕ Cerrar</button>
                </div>
              </div>
            </div>

            {/* Mobile: minimapa arriba derecha */}
            <div className="md:hidden absolute top-2 right-2 z-10 bg-zinc-900/80 border border-zinc-700 rounded-lg overflow-hidden" style={{ width: 100, height: 100 }}>
              <canvas ref={minimapRef} width={100} height={100} className="w-full h-full" />
            </div>

            {/* Desktop: sidebar */}
            <div className="hidden md:block absolute top-2 right-2 z-10 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-xl w-72 max-h-[80vh] overflow-y-auto">
              <div className="p-3 border-b border-zinc-800">
                <div className="flex items-start gap-3">
                  {selectedNode.poster && (
                    <img
                      src={`https://image.tmdb.org/t/p/w154${selectedNode.poster}`}
                      alt=""
                      className="w-16 rounded-lg object-cover shrink-0"
                      style={{ aspectRatio: '2/3', border: `2px solid ${selectedNode.color}` }}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold leading-tight">{selectedNode.title}</p>
                    {selectedNode.title !== selectedNode.titleEs && (
                      <p className="text-zinc-500 text-[10px] mt-0.5">{selectedNode.titleEs}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-yellow-400 text-xs font-bold">⭐ {selectedNode.imdb}</span>
                      <span className="text-zinc-500 text-[10px]">{selectedNode.connections} conexiones</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {selectedNode.genres.map(g => (
                        <span key={g} className="text-[8px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{g}</span>
                      ))}
                    </div>
                    <button
                      onClick={() => router.push(`/pelicula/${selectedNode.id}`)}
                      className="mt-2 text-[10px] text-yellow-400 hover:text-yellow-300 font-medium"
                    >
                      Ver ficha completa →
                    </button>
                  </div>
                </div>
              </div>
              {connectedNodes.length > 0 && (
                <div className="p-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                    Si te gustó {selectedNode.title}
                  </p>
                  <div className="space-y-1.5">
                    {connectedNodes.map(({ node: cn, weight }) => (
                      <button
                        key={cn.id}
                        onClick={() => focusNode(cn)}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/70 transition-colors text-left"
                      >
                        {cn.poster ? (
                          <img src={`https://image.tmdb.org/t/p/w92${cn.poster}`} alt="" className="w-8 rounded object-cover shrink-0" style={{ aspectRatio: '2/3' }} />
                        ) : (
                          <div className="w-8 rounded bg-zinc-800 shrink-0" style={{ aspectRatio: '2/3' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[11px] font-medium line-clamp-1">{cn.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-yellow-400 text-[9px]">⭐ {cn.imdb}</span>
                            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-yellow-400/60 rounded-full" style={{ width: `${(weight / 4) * 100}%` }} />
                            </div>
                            <span className="text-zinc-600 text-[8px]">{weight.toFixed(1)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Path result panel */}
        {pathNodes.length > 0 && graphData && (
          <div className="absolute top-2 right-2 z-10 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-xl w-64 md:w-72 max-h-[70vh] overflow-y-auto">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-400 font-semibold">Camino encontrado ({pathNodes.length - 1} pasos)</p>
              <button onClick={() => { setPathNodes([]); setPathEdges(new Set()); setSearchQuery('') }} className="text-zinc-500 hover:text-white text-xs">✕</button>
            </div>
            <div className="p-3 space-y-1">
              {pathNodes.map((id, i) => {
                const node = graphData.nodes.find(n => n.id === id)
                if (!node) return null
                return (
                  <div key={id}>
                    <button
                      onClick={() => focusNode(node)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/70 transition-colors text-left"
                    >
                      {node.poster ? (
                        <img src={`https://image.tmdb.org/t/p/w92${node.poster}`} alt="" className="w-8 rounded object-cover shrink-0" style={{ aspectRatio: '2/3' }} />
                      ) : (
                        <div className="w-8 rounded bg-zinc-800 shrink-0" style={{ aspectRatio: '2/3' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[11px] font-medium line-clamp-1">{node.title}</p>
                        <span className="text-yellow-400 text-[9px]">⭐ {node.imdb}</span>
                      </div>
                      {i === 0 && <span className="text-[8px] bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded font-bold">INICIO</span>}
                      {i === pathNodes.length - 1 && <span className="text-[8px] bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded font-bold">FIN</span>}
                    </button>
                    {i < pathNodes.length - 1 && (
                      <div className="flex items-center gap-1 pl-5 py-0.5">
                        <div className="w-px h-3 bg-yellow-400/50" />
                        <svg className="w-3 h-3 text-yellow-400/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 5v14m0 0l-4-4m4 4l4-4"/></svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Hover tooltip (only when no selection) */}
        {hoveredNode && !selectedNode && (
          <div className="absolute top-2 right-2 z-10 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-xl px-3 py-2.5">
            <p className="text-white text-sm font-bold">{hoveredNode.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-yellow-400 text-xs">⭐ {hoveredNode.imdb}</span>
              <span className="text-zinc-500 text-[10px]">{hoveredNode.connections} conexiones</span>
            </div>
          </div>
        )}

        {/* Instructions — auto-hide after interaction */}
        {showInstructions && !selectedNode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-1.5 transition-opacity">
            <p className="text-[10px] text-zinc-500">Scroll para zoom · Arrastra para mover · Click en película para explorar</p>
          </div>
        )}

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
            onNodeHover={(node: any) => setHoveredNode(node)}
            onNodeClick={(node: any) => {
              if (selectedNode?.id === node.id) {
                deselectNode()
              } else {
                focusNode(node)
              }
            }}
            onBackgroundClick={() => deselectNode()}
            onZoom={() => { if (showInstructions) setShowInstructions(false) }}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            minZoom={0.3}
            maxZoom={15}
            backgroundColor="rgba(0,0,0,0)"
          />
        )}
      </div>
    </main>
  )
}
