'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { normalize } from '@/lib/normalize'

type GraphNode = {
  id: string
  title: string
  titleEs: string
  imdb: number
  poster: string
  categoria: string
  color: string
  clusterColor: string
  clusterId: number
  connections: number
  genres: string[]
  x?: number
  y?: number
  vx?: number
  vy?: number
}

type GraphEdge = {
  source: string | GraphNode
  target: string | GraphNode
  weight: number
}

const CAT_LABELS: Record<string, string> = {
  "Pa'l domingo de bajón": 'Bajón',
  "Pa' saltar del sillón": 'Sillón',
  "Pa' quedar con el cerebro como licuadora": 'Licuadora',
  "Pa' llorar a moco tendido": 'Llorar',
}

const CAT_IDS = Object.keys(CAT_LABELS)

const PLATAFORMAS = [
  { id: 'netflix', logo: '/netflix.png' },
  { id: 'disney_plus', logo: '/disney_plus.svg' },
  { id: 'hbo_max', logo: '/hbo_max.png' },
  { id: 'amazon_prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', logo: '/apple_tv.png' },
  { id: 'paramount_plus', logo: '/paramount_plus.svg' },
  { id: 'mubi', logo: '/mubi.png' },
  { id: 'crunchyroll', logo: '/crunchyroll.png' },
]

export default function MapaPruebaPage() {
  const { user } = useAuth()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[]; clusters: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, HTMLImageElement>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNode[]>([])
  const [moodFilter, setMoodFilter] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(true)

  // Camera state
  const camera = useRef({ x: 0, y: 0, zoom: 1.8 }) // Start zoomed enough for posters
  const velocity = useRef({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const animFrame = useRef<number>(0)

  // Floating drift for nodes
  const driftTime = useRef(0)

  // Resize
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Load graph
  useEffect(() => {
    fetch('/movie-graph-clusters.json')
      .then(r => r.json())
      .then(data => {
        // Preload images
        const imgs: Record<string, HTMLImageElement> = {}
        data.nodes.forEach((n: any) => {
          if (n.poster) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = `https://image.tmdb.org/t/p/w92${n.poster}`
            imgs[n.id] = img
          }
        })
        setImageCache(imgs)
        setGraphData(data)
        setLoading(false)
      })
  }, [])

  // Search
  useEffect(() => {
    if (!searchQuery.trim() || !graphData) { setSearchResults([]); return }
    const q = normalize(searchQuery)
    setSearchResults(
      graphData.nodes
        .filter(n => normalize(n.title).includes(q) || normalize(n.titleEs || '').includes(q))
        .sort((a, b) => (b.imdb || 0) - (a.imdb || 0))
        .slice(0, 8)
    )
  }, [searchQuery, graphData])

  // Connected nodes for selected
  const connectedNodes = useMemo(() => {
    if (!selectedNode || !graphData) return []
    const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]))
    return graphData.edges
      .filter(l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
        return sId === selectedNode.id || tId === selectedNode.id
      })
      .map(l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
        return { node: nodeMap.get(sId === selectedNode.id ? tId : sId)!, weight: l.weight }
      })
      .filter(c => c.node)
      .sort((a, b) => b.weight - a.weight)
  }, [selectedNode, graphData])

  // Main render loop
  useEffect(() => {
    if (!canvasRef.current || !graphData || loading) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nodes = graphData.nodes as any[]
    const edges = graphData.edges as any[]

    // Initialize positions if needed
    if (nodes[0]?.x == null) {
      nodes.forEach((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 * 10 + Math.random() * 2
        const radius = 300 + Math.random() * 800
        n.x = Math.cos(angle) * radius
        n.y = Math.sin(angle) * radius
      })
    }

    let running = true

    const render = () => {
      if (!running) return
      driftTime.current += 0.005

      const w = dimensions.width
      const h = dimensions.height
      canvas.width = w * 2 // retina
      canvas.height = h * 2
      ctx.scale(2, 2)

      // Apply velocity (joystick-like momentum)
      if (!isDragging.current) {
        camera.current.x += velocity.current.x
        camera.current.y += velocity.current.y
        velocity.current.x *= 0.95 // friction
        velocity.current.y *= 0.95
      }

      const cam = camera.current
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, w, h)

      // Transform
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.translate(-cam.x, -cam.y)

      // Filter by mood if active
      const visibleIds = new Set(
        moodFilter.length === 0
          ? nodes.map((n: any) => n.id)
          : nodes.filter((n: any) => moodFilter.includes(n.categoria)).map((n: any) => n.id)
      )

      // Draw edges
      for (const e of edges) {
        const sId = typeof e.source === 'object' ? e.source.id : e.source
        const tId = typeof e.target === 'object' ? e.target.id : e.target
        if (!visibleIds.has(sId) || !visibleIds.has(tId)) continue
        const s = typeof e.source === 'object' ? e.source : nodes.find((n: any) => n.id === e.source)
        const t = typeof e.target === 'object' ? e.target : nodes.find((n: any) => n.id === e.target)
        if (!s?.x || !t?.x) continue

        const isConnected = selectedNode && (sId === selectedNode.id || tId === selectedNode.id)
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = isConnected ? 'rgba(250,204,21,0.6)' : 'rgba(255,255,255,0.04)'
        ctx.lineWidth = isConnected ? 1.5 / cam.zoom : 0.3 / cam.zoom
        ctx.stroke()
      }

      // Draw nodes with floating drift
      for (const n of nodes) {
        if (!visibleIds.has(n.id)) continue
        if (n.x == null) continue

        // Micro-drift (floating like microbes)
        const driftX = Math.sin(driftTime.current + n.id.charCodeAt(0) * 0.1) * 0.3
        const driftY = Math.cos(driftTime.current + n.id.charCodeAt(1) * 0.1) * 0.3
        const nx = n.x + driftX
        const ny = n.y + driftY

        const isSelected = selectedNode?.id === n.id
        const isConnected = selectedNode && connectedNodes.some(cn => cn.node.id === n.id)
        const dimmed = selectedNode && !isSelected && !isConnected
        const size = Math.max(3, Math.min(14, 3 + (n.connections / 2)))

        ctx.globalAlpha = dimmed ? 0.15 : 1

        // Poster
        const img = imageCache[n.id]
        if (img && img.complete && img.naturalWidth > 0) {
          const imgW = size * 2
          const imgH = imgW * 1.5
          const border = isSelected ? 2.5 / cam.zoom : 1 / cam.zoom

          // Border color = cluster color
          ctx.fillStyle = isSelected ? '#facc15' : n.clusterColor
          ctx.beginPath()
          ctx.roundRect(nx - imgW / 2 - border, ny - imgH / 2 - border, imgW + border * 2, imgH + border * 2, 2 / cam.zoom)
          ctx.fill()

          ctx.save()
          ctx.beginPath()
          ctx.roundRect(nx - imgW / 2, ny - imgH / 2, imgW, imgH, 1.5 / cam.zoom)
          ctx.clip()
          ctx.drawImage(img, nx - imgW / 2, ny - imgH / 2, imgW, imgH)
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(nx, ny, size, 0, Math.PI * 2)
          ctx.fillStyle = n.clusterColor
          ctx.fill()
        }

        // Title
        if (cam.zoom > 2.5 && !dimmed) {
          const fontSize = Math.max(2, 9 / cam.zoom)
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillStyle = '#fff'
          ctx.fillText(n.title, nx, ny + size * 1.5 + 3 / cam.zoom)
        }

        ctx.globalAlpha = 1
      }

      // Draw explorer character at center of camera
      const charSize = 12 / cam.zoom
      ctx.font = `${charSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('😊', cam.x, cam.y)

      ctx.restore()

      animFrame.current = requestAnimationFrame(render)
    }

    render()
    return () => { running = false; cancelAnimationFrame(animFrame.current) }
  }, [graphData, loading, dimensions, selectedNode, connectedNodes, imageCache, moodFilter])

  // Mouse/touch handlers for panning
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }
    velocity.current = { x: 0, y: 0 }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const dx = (e.clientX - lastPointer.current.x) / camera.current.zoom
    const dy = (e.clientY - lastPointer.current.y) / camera.current.zoom
    camera.current.x -= dx
    camera.current.y -= dy
    velocity.current = { x: -dx * 0.5, y: -dy * 0.5 }
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    camera.current.zoom = Math.max(0.5, Math.min(10, camera.current.zoom * delta))
  }, [])

  // Click to select node
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!graphData || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const cam = camera.current
    // Convert screen to world coords
    const worldX = (e.clientX - rect.left - rect.width / 2) / cam.zoom + cam.x
    const worldY = (e.clientY - rect.top - rect.height / 2) / cam.zoom + cam.y

    // Find closest node
    let closest: GraphNode | null = null
    let minDist = Infinity
    for (const n of graphData.nodes as any[]) {
      if (n.x == null) continue
      const dist = Math.sqrt((n.x - worldX) ** 2 + (n.y - worldY) ** 2)
      const hitRadius = Math.max(8, 3 + (n.connections / 2)) * 1.5
      if (dist < hitRadius && dist < minDist) {
        minDist = dist
        closest = n
      }
    }

    if (closest) {
      setSelectedNode(prev => prev?.id === closest!.id ? null : closest)
      setShowFilters(false)
    } else {
      setSelectedNode(null)
      setShowFilters(true)
    }
  }, [graphData])

  const focusNode = useCallback((node: GraphNode) => {
    camera.current.x = node.x || 0
    camera.current.y = node.y || 0
    camera.current.zoom = 3.5
    setSelectedNode(node)
    setShowFilters(false)
    setSearchQuery('')
    setSearchResults([])
  }, [])

  if (loading) {
    return (
      <main className="fixed inset-0 flex flex-col bg-zinc-950">
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 overflow-hidden">
      <Nav />
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          onClick={handleClick}
        />

        {/* Search bar top left */}
        <div className="absolute top-2 left-2 z-10">
          <div className="relative">
            <div className="flex items-center gap-1 bg-zinc-900/90 backdrop-blur-sm rounded-lg">
              <svg className="w-3.5 h-3.5 text-zinc-500 ml-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-28 md:w-40 bg-transparent py-1.5 pr-2 text-[16px] md:text-[11px] text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-52 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden max-h-52 overflow-y-auto z-20">
                {searchResults.map(n => (
                  <button key={n.id} onClick={() => focusNode(n)} className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-zinc-800 text-left">
                    {n.poster && <img src={`https://image.tmdb.org/t/p/w92${n.poster}`} alt="" className="w-5 h-8 rounded object-cover shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-white text-[11px] font-medium line-clamp-1">{n.title}</p>
                      <span className="text-yellow-400 text-[9px]">⭐ {n.imdb}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filters panel — bottom when no selection */}
        {showFilters && !selectedNode && (
          <div className="absolute bottom-4 left-2 right-2 z-10">
            <div className="bg-zinc-900/90 backdrop-blur-sm rounded-xl px-3 py-2.5 space-y-2">
              {/* Moods */}
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                {CAT_IDS.map(cat => {
                  const active = moodFilter.includes(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => setMoodFilter(prev => active ? prev.filter(c => c !== cat) : [...prev, cat])}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${active ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      {CAT_LABELS[cat]}
                    </button>
                  )
                })}
                {moodFilter.length > 0 && (
                  <button onClick={() => setMoodFilter([])} className="shrink-0 px-2 py-1.5 text-zinc-500 text-[10px]">✕</button>
                )}
              </div>
              {/* Platforms */}
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {PLATAFORMAS.map(p => (
                  <div key={p.id} className="shrink-0 h-7 w-12 rounded-lg bg-white/90 flex items-center justify-center">
                    <img src={p.logo} alt={p.id} className="h-3 w-auto object-contain" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Selected node — bottom carousel */}
        {selectedNode && (
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-3 pb-2 px-2">
              <div className="flex gap-2 pb-1">
                <div className="shrink-0 relative" onClick={() => router.push(`/pelicula/${selectedNode.id}`)}>
                  {selectedNode.poster && (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${selectedNode.poster}`}
                      alt=""
                      className="h-32 rounded-lg shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                      style={{ aspectRatio: '2/3', border: '3px solid #facc15' }}
                    />
                  )}
                  <div className="absolute bottom-1 left-1 right-1 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg px-1 pt-3 pb-0.5">
                    <p className="text-white text-[8px] font-bold leading-tight line-clamp-1">{selectedNode.title}</p>
                    <span className="text-yellow-400 text-[9px] font-black">⭐ {selectedNode.imdb}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-x-auto scrollbar-none">
                  <div className="flex gap-1.5 h-24">
                    {connectedNodes.map(({ node: cn }) => (
                      <div key={cn.id} className="shrink-0 relative h-full" onClick={() => focusNode(cn)}>
                        {cn.poster && (
                          <img
                            src={`https://image.tmdb.org/t/p/w154${cn.poster}`}
                            alt=""
                            className="h-full rounded-lg"
                            style={{ aspectRatio: '2/3', border: `2px solid ${cn.clusterColor}` }}
                          />
                        )}
                        <div className="absolute top-0.5 right-0.5 bg-black/70 rounded px-0.5">
                          <span className="text-yellow-400 text-[7px] font-bold">{cn.imdb}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="absolute top-2 right-2 z-10 bg-zinc-900/60 rounded-lg px-2 py-1">
          <p className="text-[8px] text-zinc-600">{graphData?.nodes.length} películas</p>
        </div>
      </div>
    </main>
  )
}
