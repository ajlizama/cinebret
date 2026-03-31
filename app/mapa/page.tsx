'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import dynamic from 'next/dynamic'

// ForceGraph2D must be loaded client-side only (uses canvas/webgl)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

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
  bidirectional: boolean
}

type GraphData = {
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

export default function MapaPage() {
  const router = useRouter()
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [imageCache, setImageCache] = useState<Record<string, HTMLImageElement>>({})
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Resize handler
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

  // Load graph data
  useEffect(() => {
    fetch('/movie-graph.json')
      .then(r => r.json())
      .then((data: GraphData) => {
        // Preload poster images for visible nodes
        const imgs: Record<string, HTMLImageElement> = {}
        const topNodes = [...data.nodes].sort((a, b) => b.connections - a.connections).slice(0, 500)
        topNodes.forEach(n => {
          if (n.poster) {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.src = `https://image.tmdb.org/t/p/w92${n.poster}`
            imgs[n.id] = img
          }
        })
        setImageCache(imgs)

        setGraphData({
          nodes: data.nodes,
          links: data.edges,
        })
        setLoading(false)
      })
  }, [])

  // Draw node
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const size = Math.max(4, Math.min(12, 3 + node.connections / 3))
    const isHovered = hoveredNode?.id === node.id
    const isSelected = selectedNode?.id === node.id
    const isConnectedToSelected = selectedNode && graphData?.links.some(
      l => {
        const sId = typeof l.source === 'object' ? (l.source as any).id : l.source
        const tId = typeof l.target === 'object' ? (l.target as any).id : l.target
        return (sId === selectedNode.id && tId === node.id) || (tId === selectedNode.id && sId === node.id)
      }
    )
    const dimmed = selectedNode && !isSelected && !isConnectedToSelected

    // Try to draw poster
    const img = imageCache[node.id]
    if (img && img.complete && img.naturalWidth > 0 && globalScale > 1.5) {
      const imgSize = size * 2.5
      ctx.save()
      ctx.globalAlpha = dimmed ? 0.15 : 1
      // Rounded rect clip
      const r = imgSize * 0.15
      ctx.beginPath()
      ctx.moveTo(node.x - imgSize / 2 + r, node.y - imgSize * 0.75)
      ctx.lineTo(node.x + imgSize / 2 - r, node.y - imgSize * 0.75)
      ctx.quadraticCurveTo(node.x + imgSize / 2, node.y - imgSize * 0.75, node.x + imgSize / 2, node.y - imgSize * 0.75 + r)
      ctx.lineTo(node.x + imgSize / 2, node.y + imgSize * 0.75 - r)
      ctx.quadraticCurveTo(node.x + imgSize / 2, node.y + imgSize * 0.75, node.x + imgSize / 2 - r, node.y + imgSize * 0.75)
      ctx.lineTo(node.x - imgSize / 2 + r, node.y + imgSize * 0.75)
      ctx.quadraticCurveTo(node.x - imgSize / 2, node.y + imgSize * 0.75, node.x - imgSize / 2, node.y + imgSize * 0.75 - r)
      ctx.lineTo(node.x - imgSize / 2, node.y - imgSize * 0.75 + r)
      ctx.quadraticCurveTo(node.x - imgSize / 2, node.y - imgSize * 0.75, node.x - imgSize / 2 + r, node.y - imgSize * 0.75)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, node.x - imgSize / 2, node.y - imgSize * 0.75, imgSize, imgSize * 1.5)
      ctx.restore()

      // Border for selected/hovered
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#facc15' : '#ffffff'
        ctx.lineWidth = isSelected ? 2 / globalScale : 1 / globalScale
        ctx.beginPath()
        ctx.rect(node.x - imgSize / 2, node.y - imgSize * 0.75, imgSize, imgSize * 1.5)
        ctx.stroke()
      }
    } else {
      // Fallback: colored circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = dimmed ? `${node.color}30` : node.color
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#facc15' : '#ffffff'
        ctx.lineWidth = 2 / globalScale
        ctx.stroke()
      }
    }

    // Title label when zoomed in
    if (globalScale > 3 && !dimmed) {
      ctx.font = `${Math.max(2, 10 / globalScale)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(node.title, node.x, node.y + size + 3)
    }
  }, [hoveredNode, selectedNode, imageCache, graphData])

  // Draw link
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

  if (loading) {
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
        {/* Legend */}
        <div className="absolute top-2 left-2 z-10 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl px-3 py-2 space-y-1">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Categorías</p>
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-zinc-400">{CAT_LABELS[cat] || cat}</span>
            </div>
          ))}
          <p className="text-[10px] text-zinc-600 mt-2">{graphData?.nodes.length} películas · {graphData?.links.length} conexiones</p>
        </div>

        {/* Selected node info */}
        {(selectedNode || hoveredNode) && (
          <div className="absolute top-2 right-2 z-10 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-3 max-w-xs">
            <div className="flex items-start gap-3">
              {(selectedNode || hoveredNode)!.poster && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${(selectedNode || hoveredNode)!.poster}`}
                  alt=""
                  className="w-12 h-18 rounded object-cover shrink-0"
                />
              )}
              <div>
                <p className="text-white text-sm font-bold">{(selectedNode || hoveredNode)!.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-yellow-400 text-xs font-bold">⭐ {(selectedNode || hoveredNode)!.imdb}</span>
                  <span className="text-zinc-500 text-[10px]">{(selectedNode || hoveredNode)!.connections} conexiones</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedNode || hoveredNode)!.genres.map(g => (
                    <span key={g} className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{g}</span>
                  ))}
                </div>
                {selectedNode && (
                  <button
                    onClick={() => router.push(`/pelicula/${selectedNode.id}`)}
                    className="mt-2 text-xs text-yellow-400 hover:text-yellow-300 font-medium"
                  >
                    Ver ficha →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-1.5">
          <p className="text-[10px] text-zinc-500">Scroll para zoom · Arrastra para mover · Click en película para ver conexiones</p>
        </div>

        {graphData && (
          <ForceGraph2D
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
            onNodeClick={(node: any) => setSelectedNode(prev => prev?.id === node.id ? null : node)}
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
