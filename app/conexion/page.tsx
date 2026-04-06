'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Nav from '@/components/Nav'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string
  title: string
  titleEs: string
  imdb: number
  poster: string
  categoria: string
  color: string
  connections: number
  genres: string[]
}

interface GraphEdge {
  source: string
  target: string
  weight: number
}

interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildAdjacency(edges: GraphEdge[]) {
  const adj = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set())
    if (!adj.has(e.target)) adj.set(e.target, new Set())
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }
  return adj
}

function bfs(adj: Map<string, Set<string>>, startId: string, endId: string): string[] | null {
  if (startId === endId) return [startId]
  const visited = new Set<string>([startId])
  const queue: string[][] = [[startId]]
  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    const neighbors = adj.get(current)
    if (!neighbors) continue
    for (const n of neighbors) {
      if (visited.has(n)) continue
      const newPath = [...path, n]
      if (n === endId) return newPath
      visited.add(n)
      queue.push(newPath)
    }
  }
  return null
}

function pickTwoRandom(nodes: GraphNode[], adj: Map<string, Set<string>>): [GraphNode, GraphNode] | null {
  const wellConnected = nodes.filter((n) => n.connections >= 8)
  if (wellConnected.length < 2) return null

  for (let attempt = 0; attempt < 50; attempt++) {
    const a = wellConnected[Math.floor(Math.random() * wellConnected.length)]
    const b = wellConnected[Math.floor(Math.random() * wellConnected.length)]
    if (a.id === b.id) continue
    const path = bfs(adj, a.id, b.id)
    if (path && path.length >= 3) return [a, b]
  }
  return null
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConexionPage() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [adj, setAdj] = useState<Map<string, Set<string>>>(new Map())
  const [nodeMap, setNodeMap] = useState<Map<string, GraphNode>>(new Map())
  const [startNode, setStartNode] = useState<GraphNode | null>(null)
  const [endNode, setEndNode] = useState<GraphNode | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [optimalLen, setOptimalLen] = useState<number>(0)
  const [won, setWon] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pathRef = useRef<HTMLDivElement>(null)

  /* Load graph ---------------------------------------------------- */
  useEffect(() => {
    fetch('/movie-graph.json')
      .then((r) => r.json())
      .then((data: Graph) => {
        setGraph(data)
        const a = buildAdjacency(data.edges)
        setAdj(a)
        const nm = new Map<string, GraphNode>()
        for (const n of data.nodes) nm.set(n.id, n)
        setNodeMap(nm)
      })
      .catch(() => setError('No se pudo cargar el grafo de películas.'))
  }, [])

  /* Start new game ------------------------------------------------ */
  const startGame = useCallback(() => {
    if (!graph) return
    const a = buildAdjacency(graph.edges)
    const pair = pickTwoRandom(graph.nodes, a)
    if (!pair) {
      setError('No se encontraron películas suficientes.')
      return
    }
    const [s, e] = pair
    const optimal = bfs(a, s.id, e.id)
    setStartNode(s)
    setEndNode(e)
    setPath([s.id])
    setOptimalLen(optimal ? optimal.length : 0)
    setWon(false)
    setError(null)
  }, [graph])

  useEffect(() => {
    if (graph) startGame()
  }, [graph, startGame])

  /* Scroll path strip to end ------------------------------------- */
  useEffect(() => {
    if (pathRef.current) {
      pathRef.current.scrollLeft = pathRef.current.scrollWidth
    }
  }, [path])

  /* Current movie ------------------------------------------------- */
  const currentId = path[path.length - 1]
  const currentNode = currentId ? nodeMap.get(currentId) ?? null : null

  /* Connections of current movie ---------------------------------- */
  const connectedNodes: GraphNode[] = []
  if (currentId && adj.has(currentId)) {
    const neighborIds = adj.get(currentId)!
    for (const nId of neighborIds) {
      const n = nodeMap.get(nId)
      if (n) connectedNodes.push(n)
    }
    connectedNodes.sort((a, b) => (b.imdb ?? 0) - (a.imdb ?? 0))
  }

  /* Tap a connected movie ---------------------------------------- */
  function selectMovie(id: string) {
    if (won) return
    if (path.includes(id)) return // already in path
    const newPath = [...path, id]
    setPath(newPath)
    if (id === endNode?.id) setWon(true)
  }

  /* Undo --------------------------------------------------------- */
  function undo() {
    if (path.length <= 1 || won) return
    setPath(path.slice(0, -1))
  }

  /* Share --------------------------------------------------------- */
  function share() {
    if (!startNode || !endNode) return
    const steps = path.length - 1
    const text = `🔗 Conexión CineBret: Conecté ${startNode.titleEs || startNode.title} → ${endNode.titleEs || endNode.title} en ${steps} pasos (óptimo: ${optimalLen - 1})\ncinebret.cl/conexion`
    if (navigator.share) {
      navigator.share({ text }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  /* Rating -------------------------------------------------------- */
  function getRating() {
    const steps = path.length - 1
    const optimal = optimalLen - 1
    if (steps === optimal) return '🏆 Perfecto!'
    if (steps <= optimal + 2) return '⭐ Muy bien!'
    return '👍 Lo lograste'
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Nav active="inicio" />
        <div className="flex items-center justify-center pt-32">
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      </div>
    )
  }

  if (!graph || !startNode || !endNode) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Nav active="inicio" />
        <div className="flex items-center justify-center pt-32">
          <div className="animate-pulse text-yellow-400 text-lg">Cargando grafo de películas...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-44">
      <Nav active="inicio" />

      {/* Header: challenge ---------------------------------------- */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-center text-yellow-400 font-bold text-xl mb-1">Conexión CineBret</h1>
        <p className="text-center text-zinc-400 text-sm mb-4">¿Puedes conectar estas películas?</p>

        <div className="flex items-center justify-center gap-3">
          {/* Start movie */}
          <div className="flex flex-col items-center w-24 shrink-0">
            <div className="relative w-20 h-[120px] rounded-lg overflow-hidden ring-2 ring-green-500">
              <Image
                src={`${TMDB_IMG}${startNode.poster}`}
                alt={startNode.titleEs || startNode.title}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </div>
            <span className="text-[11px] text-center mt-1 text-green-400 leading-tight line-clamp-2">
              {startNode.titleEs || startNode.title}
            </span>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <span className="text-yellow-400 text-2xl">→</span>
            <span className="text-[10px] text-zinc-500">{path.length - 1} pasos</span>
          </div>

          {/* End movie */}
          <div className="flex flex-col items-center w-24 shrink-0">
            <div className="relative w-20 h-[120px] rounded-lg overflow-hidden ring-2 ring-red-500">
              <Image
                src={`${TMDB_IMG}${endNode.poster}`}
                alt={endNode.titleEs || endNode.title}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </div>
            <span className="text-[11px] text-center mt-1 text-red-400 leading-tight line-clamp-2">
              {endNode.titleEs || endNode.title}
            </span>
          </div>
        </div>
      </div>

      {/* Win screen ------------------------------------------------ */}
      {won && (
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="bg-zinc-900 rounded-2xl p-6 border border-yellow-400/30">
            <p className="text-3xl mb-2">{getRating()}</p>
            <p className="text-yellow-400 font-bold text-lg mb-1">
              ¡Conectaste en {path.length - 1} pasos!
            </p>
            <p className="text-zinc-400 text-sm mb-4">
              Camino óptimo: {optimalLen - 1} pasos
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={share}
                className="px-5 py-2.5 bg-yellow-400 text-black font-semibold rounded-xl text-sm hover:bg-yellow-300 transition"
              >
                Compartir
              </button>
              <button
                onClick={startGame}
                className="px-5 py-2.5 bg-zinc-800 text-white font-semibold rounded-xl text-sm hover:bg-zinc-700 transition border border-zinc-700"
              >
                Jugar de nuevo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current movie + connections ------------------------------- */}
      {!won && currentNode && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {/* Current movie info */}
          <div className="flex items-start gap-3 mb-4">
            <div className="relative w-16 h-24 rounded-lg overflow-hidden shrink-0 ring-2 ring-yellow-400">
              <Image
                src={`${TMDB_IMG}${currentNode.poster}`}
                alt={currentNode.titleEs || currentNode.title}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </div>
            <div className="min-w-0">
              <p className="text-yellow-400 font-bold text-base leading-tight">
                {currentNode.titleEs || currentNode.title}
              </p>
              <p className="text-zinc-500 text-xs mt-0.5">{currentNode.title}</p>
              <p className="text-zinc-400 text-xs mt-1">
                {currentNode.categoria} &middot; IMDb {currentNode.imdb}
              </p>
            </div>
          </div>

          {/* Connections label */}
          <p className="text-zinc-400 text-xs font-medium mb-2 uppercase tracking-wider">
            Conexiones ({connectedNodes.length})
          </p>

          {/* Connections grid */}
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[40vh] overflow-y-auto pr-1">
            {connectedNodes.map((n) => {
              const isTarget = n.id === endNode.id
              const alreadyVisited = path.includes(n.id)
              return (
                <button
                  key={n.id}
                  onClick={() => selectMovie(n.id)}
                  disabled={alreadyVisited}
                  className={`flex flex-col items-center rounded-xl p-1.5 transition
                    ${isTarget ? 'bg-red-500/20 ring-2 ring-red-500' : ''}
                    ${alreadyVisited ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-800 active:scale-95'}
                  `}
                >
                  <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden">
                    <Image
                      src={`${TMDB_IMG}${n.poster}`}
                      alt={n.titleEs || n.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 25vw, 100px"
                      unoptimized
                    />
                  </div>
                  <span
                    className={`text-[10px] leading-tight mt-1 text-center line-clamp-2 ${
                      isTarget ? 'text-red-400 font-bold' : 'text-zinc-300'
                    }`}
                  >
                    {n.titleEs || n.title}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Path strip at bottom ------------------------------------- */}
      <div className="fixed bottom-0 inset-x-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 z-50">
        {/* Undo button */}
        {!won && path.length > 1 && (
          <div className="flex justify-end px-4 pt-2">
            <button
              onClick={undo}
              className="text-xs text-yellow-400 hover:text-yellow-300 transition font-medium"
            >
              ← Deshacer
            </button>
          </div>
        )}

        {/* Horizontal path */}
        <div ref={pathRef} className="flex items-center gap-1 px-4 py-3 overflow-x-auto scrollbar-hide">
          {path.map((id, i) => {
            const n = nodeMap.get(id)
            if (!n) return null
            const isStart = i === 0
            const isEnd = id === endNode.id && won
            return (
              <div key={`${id}-${i}`} className="flex items-center shrink-0">
                {i > 0 && <span className="text-zinc-600 text-xs mx-0.5">—</span>}
                <div
                  className={`relative w-10 h-[60px] rounded-md overflow-hidden ring-1 ${
                    isStart
                      ? 'ring-green-500'
                      : isEnd
                        ? 'ring-red-500'
                        : 'ring-yellow-400/50'
                  }`}
                >
                  <Image
                    src={`${TMDB_IMG}${n.poster}`}
                    alt={n.titleEs || n.title}
                    fill
                    className="object-cover"
                    sizes="40px"
                    unoptimized
                  />
                </div>
              </div>
            )
          })}

          {/* Ghost target */}
          {!won && (
            <div className="flex items-center shrink-0">
              <span className="text-zinc-600 text-xs mx-0.5">···</span>
              <div className="relative w-10 h-[60px] rounded-md overflow-hidden ring-1 ring-red-500/40 opacity-40">
                <Image
                  src={`${TMDB_IMG}${endNode.poster}`}
                  alt={endNode.titleEs || endNode.title}
                  fill
                  className="object-cover"
                  sizes="40px"
                  unoptimized
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
