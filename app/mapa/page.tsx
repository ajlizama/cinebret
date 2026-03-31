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
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
          height: window.innerHeight - 120,
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

    const updatedNodes = limitedNodes.map(n => ({
      ...n,
      connections: connCount.get(n.id) || 0,
    }))

    return { nodes: updatedNodes, links: filteredEdges }
  }, [rawGraph, nodeLimit])

  // Search
  useEffect(() => {
    if (!searchQuery.trim() || !graphData) { setSearchResults([]); return }
    const q = searchQuery.toLowerCase()
    const results = graphData.nodes
      .filter(n => n.title.toLowerCase().includes(q) || n.titleEs?.toLowerCase().includes(q))
      .sort((a, b) => (b.imdb || 0) - (a.imdb || 0))
      .slice(0, 8)
    setSearchResults(results)
  }, [searchQuery, graphData])

  const focusNode = useCallback((node: GraphNode) => {
    setSelectedNode(node)
    setSearchQuery('')
    setSearchResults([])
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 800)
      fgRef.current.zoom(4, 800)
    }
  }, [])

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

  // Paint node — colored circle at distance, poster when zoomed in
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const minSize = 3
    const maxSize = 16
    const size = Math.max(minSize, Math.min(maxSize, minSize + (node.connections / 1.5)))

    const isHovered = hoveredNode?.id === node.id
    const isSelected = selectedNode?.id === node.id
    const isConnectedToSelected = selectedNode && graphData?.links.some(l => {
      const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
      const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
      return (sId === selectedNode.id && tId === node.id) || (tId === selectedNode.id && sId === node.id)
    })
    const dimmed = selectedNode && !isSelected && !isConnectedToSelected

    ctx.save()
    ctx.globalAlpha = dimmed ? 0.1 : 1

    const showPoster = globalScale > 2
    const img = imageCache[node.id]
    const hasPoster = img && img.complete && img.naturalWidth > 0

    if (showPoster && hasPoster) {
      // Poster mode: rectangular poster with colored border
      const imgW = size * 2.2
      const imgH = imgW * 1.5
      const border = isSelected ? 2 : isHovered ? 1.5 : 1

      // Border
      ctx.fillStyle = isSelected ? '#facc15' : isHovered ? '#ffffff' : node.color
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
  }, [hoveredNode, selectedNode, imageCache, graphData])

  // Paint link
  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const sId = typeof link.source === 'object' ? link.source.id : link.source
    const tId = typeof link.target === 'object' ? link.target.id : link.target
    const isConnected = selectedNode && (sId === selectedNode.id || tId === selectedNode.id)
    const dimmed = selectedNode && !isConnected

    ctx.beginPath()
    ctx.moveTo(link.source.x, link.source.y)
    ctx.lineTo(link.target.x, link.target.y)
    ctx.strokeStyle = dimmed ? 'rgba(255,255,255,0.02)' : isConnected ? 'rgba(250,204,21,0.6)' : `rgba(255,255,255,${Math.min(0.15, link.weight * 0.04)})`
    ctx.lineWidth = isConnected ? 1.5 / globalScale : Math.max(0.2, link.weight * 0.3) / globalScale
    ctx.stroke()
  }, [selectedNode])

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
    <main className="min-h-screen bg-zinc-950 overflow-hidden">
      <Nav />
      <div ref={containerRef} className="relative">
        {/* Controls panel — top left */}
        <div className="absolute top-2 left-2 z-10 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-xl px-3 py-2.5 space-y-2.5 w-48 md:w-56">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar película..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto z-20">
                {searchResults.map(n => (
                  <button
                    key={n.id}
                    onClick={() => focusNode(n)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-left"
                  >
                    {n.poster && (
                      <img src={`https://image.tmdb.org/t/p/w92${n.poster}`} alt="" className="w-6 h-9 rounded object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium line-clamp-1">{n.title}</p>
                      <span className="text-yellow-400 text-[10px]">⭐ {n.imdb}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Node limit slider */}
          <div>
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
              <span>Películas en mapa</span>
              <span className="text-white font-bold">{nodeLimit}</span>
            </div>
            <input
              type="range"
              min={200}
              max={rawGraph?.nodes.length || 3000}
              step={100}
              value={nodeLimit}
              onChange={e => { setNodeLimit(Number(e.target.value)); setSelectedNode(null); if (fgRef.current) fgRef.current.d3ReheatSimulation() }}
              className="w-full accent-yellow-400"
            />
            <div className="flex justify-between text-[9px] text-zinc-600">
              <span>Top 200</span>
              <span>Todas ({rawGraph?.nodes.length})</span>
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-zinc-800 pt-2">
            <p className="text-[9px] text-zinc-600 uppercase tracking-wide mb-1">Categorías</p>
            {Object.entries(CAT_COLORS).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-zinc-500">{CAT_LABELS[cat]}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-zinc-600">{graphData?.nodes.length} nodos · {graphData?.links.length} conexiones</p>
        </div>

        {/* Selected node panel — desktop: sidebar, mobile: bottom sheet */}
        {selectedNode && (
          <>
            {/* Mobile: bottom sheet overlay */}
            <div className="md:hidden fixed inset-0 z-20" onClick={() => setSelectedNode(null)}>
              <div className="absolute inset-0 bg-black/60" />
              <div className="absolute bottom-0 left-0 right-0 bg-zinc-950 rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-zinc-700 rounded-full" />
                </div>

                {/* Hero: poster + backdrop gradient */}
                <div className="relative px-5 pt-2 pb-4">
                  <div className="flex items-end gap-4">
                    {selectedNode.poster && (
                      <img
                        src={`https://image.tmdb.org/t/p/w342${selectedNode.poster}`}
                        alt=""
                        className="w-28 rounded-xl shadow-2xl shrink-0"
                        style={{ aspectRatio: '2/3', border: `3px solid ${selectedNode.color}` }}
                      />
                    )}
                    <div className="flex-1 min-w-0 pb-1">
                      <h2 className="text-white text-xl font-black leading-tight">{selectedNode.title}</h2>
                      {selectedNode.title !== selectedNode.titleEs && (
                        <p className="text-zinc-500 text-xs mt-0.5">{selectedNode.titleEs}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-yellow-400 text-lg font-black flex items-center gap-1">
                          <svg className="w-4 h-4 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                          {selectedNode.imdb}
                        </span>
                        <span className="text-zinc-500 text-sm">{selectedNode.connections} conexiones</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedNode.genres.map(g => (
                          <span key={g} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{g}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => router.push(`/pelicula/${selectedNode.id}`)}
                        className="mt-3 text-xs text-yellow-400 font-semibold"
                      >
                        Ver ficha completa →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Connected movies — poster grid */}
                {connectedNodes.length > 0 && (
                  <div className="px-5 pb-8">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3 font-semibold">
                      Si te gustó {selectedNode.title}
                    </p>
                    <div className="grid grid-cols-4 gap-2.5">
                      {connectedNodes.map(({ node: cn, weight }) => (
                        <button
                          key={cn.id}
                          onClick={() => focusNode(cn)}
                          className="text-center group"
                        >
                          <div className="relative">
                            {cn.poster ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w154${cn.poster}`}
                                alt=""
                                className="w-full rounded-lg shadow-lg group-hover:ring-2 ring-yellow-400 transition-all"
                                style={{ aspectRatio: '2/3', border: `2px solid ${cn.color}` }}
                              />
                            ) : (
                              <div className="w-full rounded-lg bg-zinc-800" style={{ aspectRatio: '2/3', border: `2px solid ${cn.color}` }} />
                            )}
                            <div className="absolute top-1 right-1 bg-black/70 rounded px-1 py-0.5">
                              <span className="text-yellow-400 text-[9px] font-bold">{cn.imdb}</span>
                            </div>
                          </div>
                          <p className="text-white text-[10px] font-medium mt-1 line-clamp-2 leading-tight">{cn.title}</p>
                        </button>
                      ))}
                    </div>
                    {/* CineBret watermark for screenshots */}
                    <div className="flex items-center justify-center gap-2 mt-5 opacity-40">
                      <img src="/logo-oficial.png" alt="CineBret" className="h-5 w-auto" />
                      <span className="text-zinc-500 text-[10px]">cinebret.cl/mapa</span>
                    </div>
                  </div>
                )}
              </div>
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

        {/* Instructions */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-1.5">
          <p className="text-[10px] text-zinc-500">Scroll para zoom · Arrastra para mover · Click en película para explorar conexiones</p>
        </div>

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
              setSelectedNode(prev => prev?.id === node.id ? null : node)
            }}
            onBackgroundClick={() => setSelectedNode(null)}
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
