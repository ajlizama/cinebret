'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import Nav from '@/components/Nav'

/* ------------------------------------------------------------------ */
/*  SpinningTop — pure SVG/CSS replacement for video trompo            */
/* ------------------------------------------------------------------ */

function SpinningTop({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-24 h-24' : 'w-14 h-14'
  return (
    <div className={`relative ${dim}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full animate-spin" style={{ animationDuration: '3s' }}>
        {/* Top body - golden metallic */}
        <ellipse cx="50" cy="45" rx="18" ry="6" fill="#d4a017" opacity="0.5" />
        <polygon points="32,45 50,10 68,45" fill="url(#topGrad)" />
        <polygon points="38,45 50,85 62,45" fill="url(#bottomGrad)" />
        {/* Tip glow */}
        <circle cx="50" cy="85" r="3" fill="#facc15" />
        <circle cx="50" cy="85" r="6" fill="#facc15" opacity="0.3" />
        {/* Gradients */}
        <defs>
          <linearGradient id="topGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#d4a017" />
            <stop offset="100%" stopColor="#92700a" />
          </linearGradient>
          <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4a017" />
            <stop offset="100%" stopColor="#78550a" />
          </linearGradient>
        </defs>
      </svg>
      {/* Glow ring */}
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 20px rgba(250,204,21,0.4)' }} />
    </div>
  )
}

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

function distToPercent(dist: number): number {
  if (dist <= 1) return 95
  if (dist === 2) return 85
  if (dist === 3) return 70
  if (dist === 4) return 50
  if (dist === 5) return 30
  return 10
}

function pickTwoRandom(nodes: GraphNode[], adj: Map<string, Set<string>>): [GraphNode, GraphNode] | null {
  // Prefer movies with >= 10 connections, fall back to >= 8
  const veryWellConnected = nodes.filter((n) => n.connections >= 10)
  const wellConnected = veryWellConnected.length >= 2 ? veryWellConnected : nodes.filter((n) => n.connections >= 8)
  if (wellConnected.length < 2) return null

  // Try up to 10 times for ideal distance (3-6), then fall back to looser criteria
  for (let attempt = 0; attempt < 10; attempt++) {
    const a = wellConnected[Math.floor(Math.random() * wellConnected.length)]
    const b = wellConnected[Math.floor(Math.random() * wellConnected.length)]
    if (a.id === b.id) continue
    const path = bfs(adj, a.id, b.id)
    if (path && path.length >= 4 && path.length <= 7) return [a, b] // distance 3-6
  }

  // Fallback: accept any path >= 3
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
/*  Edge-weight lookup                                                 */
/* ------------------------------------------------------------------ */

function buildEdgeWeightMap(edges: GraphEdge[]) {
  const m = new Map<string, number>()
  for (const e of edges) {
    m.set(`${e.source}::${e.target}`, e.weight)
    m.set(`${e.target}::${e.source}`, e.weight)
  }
  return m
}

/* ------------------------------------------------------------------ */
/*  useIsMobile hook                                                   */
/* ------------------------------------------------------------------ */

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return mobile
}

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
  const [surrendered, setSurrendered] = useState(false)
  const [optimalPath, setOptimalPath] = useState<string[]>([])
  const [prevDist, setPrevDist] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edgeWeights, setEdgeWeights] = useState<Map<string, number>>(new Map())
  const [mobileTransition, setMobileTransition] = useState(false)
  const [trompoEntered, setTrompoEntered] = useState(false)
  const [winCelebrating, setWinCelebrating] = useState(false)
  const [boardOffset, setBoardOffset] = useState({ x: 0, y: 0 })
  const [boardPhase, setBoardPhase] = useState<'idle' | 'moving' | 'fading' | 'resetting'>('idle')
  const [visitedPositions, setVisitedPositions] = useState<Array<{ x: number; y: number; poster: string }>>([])
  const [chooserOpen, setChooserOpen] = useState(false)
  const [searchStart, setSearchStart] = useState('')
  const [searchEnd, setSearchEnd] = useState('')
  const [chosenStart, setChosenStart] = useState<GraphNode | null>(null)
  const [chosenEnd, setChosenEnd] = useState<GraphNode | null>(null)
  const [chooserError, setChooserError] = useState<string | null>(null)
  const [chooserFocused, setChooserFocused] = useState<'start' | 'end' | null>(null)
  const pathRef = useRef<HTMLDivElement>(null)
  const mobilePathRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

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
        setEdgeWeights(buildEdgeWeightMap(data.edges))
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
    setOptimalPath(optimal ?? [])
    setWon(false)
    setSurrendered(false)
    setPrevDist(optimal ? optimal.length - 1 : null)
    setError(null)
    setVisitedPositions([])
    setBoardOffset({ x: 0, y: 0 })
    setBoardPhase('idle')
  }, [graph])

  /* Start game with chosen movies --------------------------------- */
  const startGameWithChoices = useCallback((s: GraphNode, e: GraphNode) => {
    if (!graph) return
    const a = buildAdjacency(graph.edges)
    const optimal = bfs(a, s.id, e.id)
    if (!optimal) return
    setStartNode(s)
    setEndNode(e)
    setPath([s.id])
    setOptimalLen(optimal.length)
    setOptimalPath(optimal)
    setWon(false)
    setSurrendered(false)
    setPrevDist(optimal.length - 1)
    setError(null)
    setVisitedPositions([])
    setBoardOffset({ x: 0, y: 0 })
    setBoardPhase('idle')
  }, [graph])

  useEffect(() => {
    if (graph) startGame()
  }, [graph, startGame])

  /* Trompo entrance animation ------------------------------------ */
  useEffect(() => {
    if (startNode && isMobile) {
      setTrompoEntered(false)
      const t = setTimeout(() => setTrompoEntered(true), 50)
      return () => clearTimeout(t)
    }
  }, [startNode, isMobile])

  /* Scroll path strip to end ------------------------------------- */
  useEffect(() => {
    if (pathRef.current) {
      pathRef.current.scrollLeft = pathRef.current.scrollWidth
    }
    if (mobilePathRef.current) {
      mobilePathRef.current.scrollLeft = mobilePathRef.current.scrollWidth
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

  /* Top connections for mobile (max 6 by edge weight, always include target) */
  const mobileConnections: GraphNode[] = (() => {
    if (!currentId || connectedNodes.length <= 6) return connectedNodes.slice(0, 6)
    const targetInList = endNode ? connectedNodes.find((n) => n.id === endNode.id) : null
    const sorted = [...connectedNodes].sort((a, b) => {
      const wa = edgeWeights.get(`${currentId}::${a.id}`) ?? 0
      const wb = edgeWeights.get(`${currentId}::${b.id}`) ?? 0
      return wb - wa
    })
    const top6 = sorted.slice(0, 6)
    if (targetInList && !top6.find((n) => n.id === targetInList.id)) {
      top6[5] = targetInList
    }
    return top6
  })()

  /* Distance to target --------------------------------------------- */
  const currentDistToTarget: number | null = (() => {
    if (!endNode || !currentId || won || surrendered) return null
    const bfsPath = bfs(adj, currentId, endNode.id)
    return bfsPath ? bfsPath.length - 1 : null
  })()

  const isGettingCloser = prevDist !== null && currentDistToTarget !== null && currentDistToTarget < prevDist

  /* Tap a connected movie ---------------------------------------- */
  function selectMovie(id: string) {
    if (won || surrendered) return
    if (path.includes(id)) return // already in path

    if (isMobile) {
      // Find the position of the tapped card
      const tappedIndex = mobileConnections.findIndex((n) => n.id === id)
      const MOBILE_POSITIONS = [
        { x: 0, y: -150 },
        { x: 130, y: -75 },
        { x: 130, y: 75 },
        { x: 0, y: 150 },
        { x: -130, y: 75 },
        { x: -130, y: -75 },
      ]
      const tappedPos = MOBILE_POSITIONS[tappedIndex % MOBILE_POSITIONS.length] ?? { x: 0, y: 0 }

      // Store breadcrumb for current position
      if (currentNode) {
        setVisitedPositions((prev) => [...prev, { x: 0, y: 0, poster: currentNode.poster }])
      }

      // Phase 1: Move board toward tapped card
      setBoardPhase('moving')
      setBoardOffset({ x: -tappedPos.x, y: -tappedPos.y })

      // Phase 2: Fade out connections
      setTimeout(() => {
        setBoardPhase('fading')
        setMobileTransition(true)
      }, 400)

      // Phase 3: Reset board, update state
      setTimeout(() => {
        if (currentDistToTarget !== null) setPrevDist(currentDistToTarget)
        const newPath = [...path, id]
        setPath(newPath)
        setBoardOffset({ x: 0, y: 0 })
        setBoardPhase('idle')
        setMobileTransition(false)
        if (id === endNode?.id) {
          setWon(true)
          setWinCelebrating(true)
          setTimeout(() => setWinCelebrating(false), 2000)
        }
      }, 500)
    } else {
      // Save current distance as previous before updating path
      if (currentDistToTarget !== null) setPrevDist(currentDistToTarget)
      const newPath = [...path, id]
      setPath(newPath)
      if (id === endNode?.id) setWon(true)
    }
  }

  /* Undo --------------------------------------------------------- */
  function undo() {
    if (path.length <= 1 || won || surrendered) return
    const newPath = path.slice(0, -1)
    setPath(newPath)
    // Recalculate prevDist for the step before the new current
    if (newPath.length >= 2 && endNode) {
      const prevId = newPath[newPath.length - 2]
      const prevBfs = bfs(adj, prevId, endNode.id)
      setPrevDist(prevBfs ? prevBfs.length - 1 : null)
    } else {
      setPrevDist(optimalLen > 0 ? optimalLen - 1 : null)
    }
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

  /* Surrender ------------------------------------------------------ */
  function surrender() {
    if (won || surrendered) return
    setSurrendered(true)
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

  /* ================================================================ */
  /*  MOBILE EXPLORER VIEW — Isometric Board Game                     */
  /* ================================================================ */

  const BOARD_POSITIONS = [
    { x: 0, y: -150 },    // top
    { x: 130, y: -75 },   // top-right
    { x: 130, y: 75 },    // bottom-right
    { x: 0, y: 150 },     // bottom
    { x: -130, y: 75 },   // bottom-left
    { x: -130, y: -75 },  // top-left
  ]

  /* Search results for movie chooser ------------------------------ */
  const searchStartResults = useMemo(() => {
    if (!graph || searchStart.length < 2) return []
    const q = searchStart.toLowerCase()
    return graph.nodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.titleEs.toLowerCase().includes(q))
      .slice(0, 8)
  }, [graph, searchStart])

  const searchEndResults = useMemo(() => {
    if (!graph || searchEnd.length < 2) return []
    const q = searchEnd.toLowerCase()
    return graph.nodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.titleEs.toLowerCase().includes(q))
      .slice(0, 8)
  }, [graph, searchEnd])

  function handleChooserStart() {
    if (!chosenStart || !chosenEnd) {
      setChooserError('Selecciona ambas peliculas')
      return
    }
    if (chosenStart.id === chosenEnd.id) {
      setChooserError('Deben ser peliculas diferentes')
      return
    }
    const p = bfs(adj, chosenStart.id, chosenEnd.id)
    if (!p) {
      setChooserError('No hay camino entre estas peliculas')
      return
    }
    startGameWithChoices(chosenStart, chosenEnd)
    setChooserOpen(false)
    setChooserError(null)
    setSearchStart('')
    setSearchEnd('')
    setChosenStart(null)
    setChosenEnd(null)
    setChooserFocused(null)
  }

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-40 overflow-hidden">

        {/* Background: current movie poster, large, low opacity ---- */}
        {currentNode && (
          <div className="absolute inset-0 opacity-15 pointer-events-none">
            <Image
              src={`${TMDB_IMG}${currentNode.poster}`}
              alt=""
              fill
              className="object-cover blur-md"
              sizes="100vw"
              unoptimized
              priority
            />
          </div>
        )}

        {/* Subtle grid pattern for board feel ---------------------- */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #facc15 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Win celebration overlay -------------------------------- */}
        {won && winCelebrating && (
          <div className="absolute inset-0 z-[70] pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 opacity-40">
              <Image
                src={`${TMDB_IMG}${endNode.poster}`}
                alt=""
                fill
                className="object-cover"
                sizes="100vw"
                unoptimized
              />
            </div>
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={`particle-${i}`}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: ['#facc15', '#ef4444', '#22c55e', '#3b82f6'][i % 4],
                  top: '50%',
                  left: '50%',
                  animation: `particle-explode-${i % 4} 1.5s ease-out forwards`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        )}

        {/* ======== HUD: Fixed top bar ======== */}
        <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-gradient-to-b from-zinc-950 via-zinc-950/90 to-transparent pb-4">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            {/* Start poster */}
            <div className="flex flex-col items-center w-16 shrink-0">
              <div className="relative w-14 h-20 rounded-lg overflow-hidden ring-2 ring-green-500 shrink-0">
                <Image src={`${TMDB_IMG}${startNode.poster}`} alt="" fill className="object-cover" sizes="56px" unoptimized />
              </div>
              <span className="text-[9px] text-green-400 leading-tight text-center mt-0.5 line-clamp-2">{startNode.titleEs || startNode.title}</span>
            </div>

            {/* Steps + VS */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-yellow-400 font-black text-2xl leading-none">{path.length - 1}</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">pasos</span>
              <span className="text-zinc-600 text-[10px] font-bold mt-0.5">VS</span>
            </div>

            {/* Target poster */}
            <div className="flex flex-col items-center w-16 shrink-0">
              <div className="relative w-14 h-20 rounded-lg overflow-hidden ring-2 ring-red-500 shrink-0">
                <Image src={`${TMDB_IMG}${endNode.poster}`} alt="" fill className="object-cover" sizes="56px" unoptimized />
              </div>
              <span className="text-[9px] text-red-400 leading-tight text-center mt-0.5 line-clamp-2">{endNode.titleEs || endNode.title}</span>
            </div>
          </div>

          {/* Distance indicator */}
          {!won && !surrendered && currentDistToTarget !== null && path.length > 1 && (
            <div
              className={`mx-3 text-center text-xs font-medium px-2 py-1 rounded-lg ${
                isGettingCloser
                  ? 'bg-green-500/15 text-green-400'
                  : 'bg-red-500/15 text-red-400'
              }`}
            >
              {isGettingCloser ? '↓' : '↑'} A {currentDistToTarget} paso{currentDistToTarget !== 1 ? 's' : ''} — Conexion: {distToPercent(currentDistToTarget)}%
            </div>
          )}
        </div>

        {/* ======== Game board with perspective + movement ======== */}
        {!won && !surrendered && currentNode && (
          <div
            className="fixed inset-0 flex items-center justify-center"
            style={{ paddingTop: '110px', paddingBottom: '140px' }}
          >
            <div
              className="relative"
              style={{
                transform: `perspective(600px) rotateX(20deg) translate(${boardOffset.x}px, ${boardOffset.y}px)`,
                transformStyle: 'preserve-3d',
                transition: boardPhase === 'moving'
                  ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                  : boardPhase === 'idle'
                    ? 'transform 0.15s ease-out'
                    : 'none',
              }}
            >
              {/* Breadcrumb trail — visited positions */}
              {visitedPositions.map((pos, i) => (
                <div
                  key={`crumb-${i}`}
                  className="absolute pointer-events-none"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: `translate(${pos.x - 16}px, ${pos.y - 16}px)`,
                    opacity: 0.2,
                  }}
                >
                  <div className="w-8 h-8 rounded overflow-hidden ring-1 ring-yellow-400/30">
                    <Image src={`${TMDB_IMG}${pos.poster}`} alt="" width={32} height={32} className="w-full h-full object-cover" unoptimized />
                  </div>
                </div>
              ))}

              {/* SVG connection lines */}
              <svg
                className="absolute pointer-events-none"
                style={{
                  overflow: 'visible',
                  top: '50%',
                  left: '50%',
                  width: '0',
                  height: '0',
                }}
              >
                {mobileConnections.map((n, i) => {
                  const pos = BOARD_POSITIONS[i % BOARD_POSITIONS.length]
                  const weight = edgeWeights.get(`${currentId}::${n.id}`) ?? 1
                  const strokeW = Math.max(1, Math.min(3, weight / 2))
                  return (
                    <line
                      key={`line-${n.id}`}
                      x1={0}
                      y1={0}
                      x2={pos.x}
                      y2={pos.y}
                      stroke="#facc15"
                      strokeOpacity={0.25}
                      strokeWidth={strokeW}
                      strokeDasharray="4 4"
                      style={{
                        opacity: mobileTransition ? 0 : 1,
                        transition: 'opacity 0.3s ease',
                      }}
                    />
                  )
                })}
              </svg>

              {/* Current movie poster as ground tile */}
              <div className="relative w-32 h-44 rounded-xl overflow-hidden shadow-2xl shadow-black/80 ring-2 ring-yellow-400/60 mx-auto">
                <Image
                  src={`${TMDB_IMG}${currentNode.poster}`}
                  alt={currentNode.titleEs || currentNode.title}
                  fill
                  className="object-cover"
                  sizes="128px"
                  unoptimized
                />
                {/* Dark overlay with title */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                  <p className="text-white text-[10px] font-bold text-center leading-tight line-clamp-2 drop-shadow-lg">
                    {currentNode.titleEs || currentNode.title}
                  </p>
                </div>
              </div>

              {/* Connected movies positioned around the center */}
              {mobileConnections.map((n, i) => {
                const pos = BOARD_POSITIONS[i % BOARD_POSITIONS.length]
                const isTarget = n.id === endNode.id
                const alreadyVisited = path.includes(n.id)

                return (
                  <button
                    key={n.id}
                    onClick={() => !alreadyVisited && selectMovie(n.id)}
                    disabled={alreadyVisited || boardPhase !== 'idle'}
                    className="absolute pointer-events-auto"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: mobileTransition
                        ? `translate(${pos.x - (isTarget ? 48 : 40)}px, ${pos.y - (isTarget ? 64 : 56)}px) translateZ(20px) scale(0.5)`
                        : `translate(${pos.x - (isTarget ? 48 : 40)}px, ${pos.y - (isTarget ? 64 : 56)}px) translateZ(20px) scale(1)`,
                      opacity: mobileTransition ? 0 : alreadyVisited ? 0.3 : 1,
                      transition: 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease',
                      filter: alreadyVisited ? 'grayscale(1)' : 'none',
                    }}
                  >
                    <div
                      className={`relative overflow-hidden shadow-xl shadow-black/60 ${
                        isTarget ? 'w-24 h-32 rounded-xl' : 'w-20 h-28 rounded-lg'
                      }`}
                      style={{
                        boxShadow: isTarget
                          ? '0 0 16px rgba(239,68,68,0.5), 0 8px 24px rgba(0,0,0,0.6)'
                          : '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      <Image
                        src={`${TMDB_IMG}${n.poster}`}
                        alt={n.titleEs || n.title}
                        fill
                        className="object-cover"
                        sizes={isTarget ? '96px' : '80px'}
                        unoptimized
                      />
                      {isTarget && (
                        <div className="absolute inset-0 border-2 border-red-500 rounded-xl animate-pulse" />
                      )}
                    </div>
                    <p className={`text-[9px] text-center mt-0.5 drop-shadow-lg leading-tight line-clamp-2 max-w-[80px] ${
                      isTarget ? 'text-red-400 font-bold' : 'text-white/90'
                    }`}>
                      {n.titleEs || n.title}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ======== Trompo — FIXED, centered, outside perspective ======== */}
        {!won && !surrendered && currentNode && (
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              transform: trompoEntered
                ? 'translate(-50%, -50%)'
                : 'translate(-50%, calc(-50% - 200px))',
              opacity: trompoEntered ? 1 : 0,
              transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
              marginTop: '-20px',
            }}
          >
            <SpinningTop />
          </div>
        )}

        {/* Win trompo spin ---------------------------------------- */}
        {won && (
          <div className="fixed top-1/2 left-1/2 z-[100] flex flex-col items-center pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
            <div style={{ animation: winCelebrating ? 'trompo-mega-spin 0.8s ease-out' : undefined }}>
              <SpinningTop size="lg" />
            </div>
          </div>
        )}

        {/* Win screen overlay ------------------------------------- */}
        {won && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="bg-zinc-900/90 backdrop-blur-sm rounded-2xl p-6 mx-6 border border-yellow-400/30 text-center">
              <p className="text-3xl mb-2">{getRating()}</p>
              <p className="text-yellow-400 font-bold text-lg mb-1">
                ¡Conectaste en {path.length - 1} pasos!
              </p>
              <p className="text-zinc-400 text-sm mb-4">
                Camino optimo: {optimalLen - 1} pasos
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={share}
                  className="px-5 py-2.5 bg-yellow-400 text-black font-semibold rounded-xl text-sm"
                >
                  Compartir
                </button>
                <button
                  onClick={startGame}
                  className="px-5 py-2.5 bg-zinc-800 text-white font-semibold rounded-xl text-sm border border-zinc-700"
                >
                  Jugar de nuevo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Surrender screen overlay ------------------------------- */}
        {surrendered && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto py-20">
            <div className="bg-zinc-900/90 backdrop-blur-sm rounded-2xl p-5 mx-4 border border-red-400/30 text-center">
              <p className="text-red-400 font-bold text-base mb-3">El camino optimo era:</p>
              <div className="flex items-center justify-center gap-1 flex-wrap mb-3">
                {optimalPath.map((id, i) => {
                  const n = nodeMap.get(id)
                  if (!n) return null
                  return (
                    <div key={`opt-${id}-${i}`} className="flex items-center shrink-0">
                      {i > 0 && <span className="text-zinc-600 text-xs mx-0.5">&rarr;</span>}
                      <div className="flex flex-col items-center w-14">
                        <div className="relative w-12 h-[72px] rounded-lg overflow-hidden ring-1 ring-yellow-400/50">
                          <Image src={`${TMDB_IMG}${n.poster}`} alt={n.titleEs || n.title} fill className="object-cover" sizes="48px" unoptimized />
                        </div>
                        <span className="text-[8px] text-center mt-0.5 text-zinc-400 leading-tight line-clamp-2">
                          {n.titleEs || n.title}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-zinc-500 text-xs mb-3">
                {optimalLen - 1} pasos — Conexion: {distToPercent(optimalLen - 1)}%
              </p>
              <button
                onClick={startGame}
                className="px-5 py-2.5 bg-yellow-400 text-black font-semibold rounded-xl text-sm"
              >
                Jugar de nuevo
              </button>
            </div>
          </div>
        )}

        {/* ======== Movie Chooser Modal ======== */}
        {chooserOpen && (
          <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-16 px-4">
            <div className="bg-zinc-900 rounded-2xl p-5 w-full max-w-sm border border-yellow-400/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-yellow-400 font-bold text-base">Elegir peliculas</h3>
                <button onClick={() => { setChooserOpen(false); setChooserError(null); setChooserFocused(null) }} className="text-zinc-500 text-xl leading-none">&times;</button>
              </div>

              {/* Start search */}
              <div className="mb-3 relative">
                <label className="text-[10px] text-green-400 uppercase tracking-wider mb-1 block">Pelicula inicio</label>
                {chosenStart ? (
                  <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-2">
                    <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
                      <Image src={`${TMDB_IMG}${chosenStart.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
                    </div>
                    <span className="text-white text-xs flex-1 line-clamp-2">{chosenStart.titleEs || chosenStart.title}</span>
                    <button onClick={() => { setChosenStart(null); setSearchStart('') }} className="text-zinc-500 text-sm">&times;</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={searchStart}
                      onChange={(e) => setSearchStart(e.target.value)}
                      onFocus={() => setChooserFocused('start')}
                      placeholder="Buscar pelicula..."
                      className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-zinc-700 focus:border-green-500"
                    />
                    {chooserFocused === 'start' && searchStartResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 rounded-lg border border-zinc-700 max-h-48 overflow-y-auto z-10">
                        {searchStartResults.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => { setChosenStart(n); setSearchStart(''); setChooserFocused(null) }}
                            className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-700 text-left"
                          >
                            <div className="relative w-6 h-9 rounded overflow-hidden shrink-0">
                              <Image src={`${TMDB_IMG}${n.poster}`} alt="" fill className="object-cover" sizes="24px" unoptimized />
                            </div>
                            <span className="text-white text-xs line-clamp-1">{n.titleEs || n.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* End search */}
              <div className="mb-4 relative">
                <label className="text-[10px] text-red-400 uppercase tracking-wider mb-1 block">Pelicula destino</label>
                {chosenEnd ? (
                  <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-2">
                    <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
                      <Image src={`${TMDB_IMG}${chosenEnd.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
                    </div>
                    <span className="text-white text-xs flex-1 line-clamp-2">{chosenEnd.titleEs || chosenEnd.title}</span>
                    <button onClick={() => { setChosenEnd(null); setSearchEnd('') }} className="text-zinc-500 text-sm">&times;</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={searchEnd}
                      onChange={(e) => setSearchEnd(e.target.value)}
                      onFocus={() => setChooserFocused('end')}
                      placeholder="Buscar pelicula..."
                      className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-zinc-700 focus:border-red-500"
                    />
                    {chooserFocused === 'end' && searchEndResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 rounded-lg border border-zinc-700 max-h-48 overflow-y-auto z-10">
                        {searchEndResults.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => { setChosenEnd(n); setSearchEnd(''); setChooserFocused(null) }}
                            className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-700 text-left"
                          >
                            <div className="relative w-6 h-9 rounded overflow-hidden shrink-0">
                              <Image src={`${TMDB_IMG}${n.poster}`} alt="" fill className="object-cover" sizes="24px" unoptimized />
                            </div>
                            <span className="text-white text-xs line-clamp-1">{n.titleEs || n.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {chooserError && <p className="text-red-400 text-xs mb-3 text-center">{chooserError}</p>}

              <button
                onClick={handleChooserStart}
                className="w-full py-2.5 bg-yellow-400 text-black font-semibold rounded-xl text-sm"
              >
                Jugar
              </button>
            </div>
          </div>
        )}

        {/* ======== Fixed bottom bar ======== */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-8 pb-safe">
          {/* Action buttons */}
          <div className="flex justify-center gap-2 px-4 mb-2 flex-wrap">
            {!won && !surrendered && (
              <button
                onClick={surrender}
                className="px-3 py-1.5 bg-zinc-800/80 text-red-400 text-xs font-medium rounded-lg border border-red-500/30"
              >
                Rendirse
              </button>
            )}
            <button
              onClick={startGame}
              className="px-3 py-1.5 bg-zinc-800/80 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-700"
            >
              Cambiar
            </button>
            <button
              onClick={() => { setChooserOpen(true); setChooserError(null); setChosenStart(null); setChosenEnd(null); setSearchStart(''); setSearchEnd('') }}
              className="px-3 py-1.5 bg-zinc-800/80 text-yellow-400 text-xs font-medium rounded-lg border border-yellow-400/30"
            >
              Elegir peliculas
            </button>
            {!won && !surrendered && path.length > 1 && (
              <button
                onClick={undo}
                className="px-3 py-1.5 bg-zinc-800/80 text-yellow-400 text-xs font-medium rounded-lg border border-yellow-400/30"
              >
                Deshacer
              </button>
            )}
          </div>

          {/* Path strip */}
          <div ref={mobilePathRef} className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide">
            {path.map((id, i) => {
              const n = nodeMap.get(id)
              if (!n) return null
              const isStart = i === 0
              const isEnd = id === endNode.id && won
              return (
                <div key={`m-${id}-${i}`} className="flex items-center shrink-0">
                  {i > 0 && <div className="w-3 border-t border-zinc-600 mx-0.5" />}
                  <div
                    className={`relative w-8 h-12 rounded overflow-hidden ring-1 ${
                      isStart ? 'ring-green-500' : isEnd ? 'ring-red-500' : 'ring-yellow-400/50'
                    }`}
                  >
                    <Image src={`${TMDB_IMG}${n.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
                  </div>
                </div>
              )
            })}
            {/* Ghost target */}
            {!won && !surrendered && (
              <div className="flex items-center shrink-0">
                <span className="text-zinc-600 text-[10px] mx-0.5">...</span>
                <div className="relative w-8 h-12 rounded overflow-hidden ring-1 ring-red-500/40 opacity-40">
                  <Image src={`${TMDB_IMG}${endNode.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CSS animations ----------------------------------------- */}
        <style jsx>{`
          @keyframes trompo-mega-spin {
            0% { transform: rotate(0deg) scale(1); }
            50% { transform: rotate(720deg) scale(1.5); }
            100% { transform: rotate(1080deg) scale(1); }
          }
          ${Array.from({ length: 4 }).map((_, i) => `
            @keyframes particle-explode-${i} {
              0% { transform: translate(0, 0) scale(1); opacity: 1; }
              100% {
                transform: translate(${Math.cos((i / 4) * Math.PI * 2) * 150}px, ${Math.sin((i / 4) * Math.PI * 2) * 150}px) scale(0);
                opacity: 0;
              }
            }
          `).join('')}
          .pb-safe { padding-bottom: env(safe-area-inset-bottom, 16px); }
          .safe-area-top { padding-top: env(safe-area-inset-top, 0px); }
        `}</style>
      </div>
    )
  }

  /* ================================================================ */
  /*  DESKTOP VIEW (unchanged)                                        */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-44">
      <Nav active="inicio" />

      {/* Header: challenge ---------------------------------------- */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-2">
        <h1 className="text-center text-yellow-400 font-bold text-xl mb-1">Conexion CineBret</h1>
        <p className="text-center text-zinc-400 text-sm mb-4">¿Puedes conectar estas peliculas?</p>

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
            <span className="text-yellow-400 text-2xl">&rarr;</span>
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

        {/* Initial distance info */}
        {optimalLen > 1 && (
          <p className="text-center text-zinc-400 text-sm mt-3">
            Estan a <span className="text-yellow-400 font-bold">{optimalLen - 1} pasos</span> de distancia
            <span className="ml-2 text-zinc-500">— Conexion: {distToPercent(optimalLen - 1)}%</span>
          </p>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-3 mt-3">
          <button
            onClick={startGame}
            className="px-4 py-1.5 bg-zinc-800 text-zinc-300 text-xs font-medium rounded-lg hover:bg-zinc-700 transition border border-zinc-700"
          >
            Cambiar peliculas
          </button>
          {!won && !surrendered && (
            <button
              onClick={surrender}
              className="px-4 py-1.5 bg-zinc-800 text-red-400 text-xs font-medium rounded-lg hover:bg-zinc-700 transition border border-red-500/30"
            >
              Rendirse
            </button>
          )}
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
              Camino optimo: {optimalLen - 1} pasos
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

      {/* Surrender screen --------------------------------------------- */}
      {surrendered && (
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="bg-zinc-900 rounded-2xl p-6 border border-red-400/30">
            <p className="text-red-400 font-bold text-lg mb-3">El camino optimo era:</p>
            <div className="flex items-center justify-center gap-1 flex-wrap mb-4">
              {optimalPath.map((id, i) => {
                const n = nodeMap.get(id)
                if (!n) return null
                return (
                  <div key={`opt-${id}-${i}`} className="flex items-center shrink-0">
                    {i > 0 && <span className="text-zinc-600 text-sm mx-0.5">&rarr;</span>}
                    <div className="flex flex-col items-center w-16">
                      <div className="relative w-14 h-[84px] rounded-lg overflow-hidden ring-1 ring-yellow-400/50">
                        <Image
                          src={`${TMDB_IMG}${n.poster}`}
                          alt={n.titleEs || n.title}
                          fill
                          className="object-cover"
                          sizes="56px"
                          unoptimized
                        />
                      </div>
                      <span className="text-[9px] text-center mt-0.5 text-zinc-400 leading-tight line-clamp-2">
                        {n.titleEs || n.title}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-zinc-500 text-sm mb-4">
              {optimalLen - 1} pasos — Conexion: {distToPercent(optimalLen - 1)}%
            </p>
            <button
              onClick={startGame}
              className="px-5 py-2.5 bg-yellow-400 text-black font-semibold rounded-xl text-sm hover:bg-yellow-300 transition"
            >
              Jugar de nuevo
            </button>
          </div>
        </div>
      )}

      {/* Current movie + connections ------------------------------- */}
      {!won && !surrendered && currentNode && (
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

          {/* Distance indicator */}
          {currentDistToTarget !== null && path.length > 1 && (
            <div
              className={`text-center text-sm font-medium mb-3 px-3 py-1.5 rounded-lg ${
                isGettingCloser
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {isGettingCloser ? '↓' : '↑'} Estas a {currentDistToTarget} paso{currentDistToTarget !== 1 ? 's' : ''} del objetivo — Conexion: {distToPercent(currentDistToTarget)}%
            </div>
          )}

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
        {!won && !surrendered && path.length > 1 && (
          <div className="flex justify-end px-4 pt-2">
            <button
              onClick={undo}
              className="text-xs text-yellow-400 hover:text-yellow-300 transition font-medium"
            >
              &larr; Deshacer
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
          {!won && !surrendered && (
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
