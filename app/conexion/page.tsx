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

  /* Top connections for mobile (max 8 by edge weight, always include target) */
  const mobileConnections: GraphNode[] = (() => {
    if (!currentId || connectedNodes.length <= 8) return connectedNodes
    const targetInList = endNode ? connectedNodes.find((n) => n.id === endNode.id) : null
    const sorted = [...connectedNodes].sort((a, b) => {
      const wa = edgeWeights.get(`${currentId}::${a.id}`) ?? 0
      const wb = edgeWeights.get(`${currentId}::${b.id}`) ?? 0
      return wb - wa
    })
    const top8 = sorted.slice(0, 8)
    if (targetInList && !top8.find((n) => n.id === targetInList.id)) {
      top8[7] = targetInList
    }
    return top8
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
      // Animate: fade out connections, then update
      setMobileTransition(true)
      setTimeout(() => {
        if (currentDistToTarget !== null) setPrevDist(currentDistToTarget)
        const newPath = [...path, id]
        setPath(newPath)
        if (id === endNode?.id) {
          setWon(true)
          setWinCelebrating(true)
          setTimeout(() => setWinCelebrating(false), 2000)
        }
        setMobileTransition(false)
      }, 300)
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
  /*  MOBILE EXPLORER VIEW                                            */
  /* ================================================================ */
  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-40 overflow-hidden" style={{ perspective: '800px' }}>

        {/* Background: current movie poster, large, low opacity ---- */}
        {currentNode && (
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <Image
              src={`${TMDB_IMG}${currentNode.poster}`}
              alt=""
              fill
              className="object-cover blur-sm"
              sizes="100vw"
              unoptimized
              priority
            />
          </div>
        )}

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
            {/* Particles */}
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

        {/* HUD: top bar ------------------------------------------- */}
        <div className="absolute top-0 inset-x-0 z-50 safe-area-top">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            {/* Start poster */}
            <div className="flex items-center gap-1.5">
              <div className="relative w-8 h-12 rounded overflow-hidden ring-1 ring-green-500 shrink-0">
                <Image src={`${TMDB_IMG}${startNode.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
              </div>
              <span className="text-[9px] text-green-400 leading-tight max-w-[60px] line-clamp-2">{startNode.titleEs || startNode.title}</span>
            </div>

            {/* Steps */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <div className="w-6 border-t border-dashed border-zinc-600" />
                <span className="text-yellow-400 font-bold text-sm">{path.length - 1}</span>
                <div className="w-6 border-t border-dashed border-zinc-600" />
              </div>
              <span className="text-[9px] text-zinc-500">pasos</span>
            </div>

            {/* Target poster */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-red-400 leading-tight max-w-[60px] line-clamp-2 text-right">{endNode.titleEs || endNode.title}</span>
              <div className="relative w-8 h-12 rounded overflow-hidden ring-1 ring-red-500 shrink-0">
                <Image src={`${TMDB_IMG}${endNode.poster}`} alt="" fill className="object-cover" sizes="32px" unoptimized />
              </div>
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

        {/* Center: trompo spinning -------------------------------- */}
        {!won && !surrendered && currentNode && (
          <div
            className="absolute top-1/2 left-1/2 z-30 flex flex-col items-center pointer-events-none"
            style={{
              transform: trompoEntered
                ? 'translate(-50%, -50%) translateY(0px)'
                : 'translate(-50%, -50%) translateY(-200px)',
              opacity: trompoEntered ? 1 : 0,
              transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
            }}
          >
            <video
              src="/loading.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-16 h-16 object-contain"
              style={{ mixBlendMode: 'lighten' }}
            />
            <p className="text-white text-[10px] text-center mt-0.5 font-bold drop-shadow-lg max-w-[100px] leading-tight">
              {currentNode.titleEs || currentNode.title}
            </p>
          </div>
        )}

        {/* Win trompo spin ---------------------------------------- */}
        {won && (
          <div className="absolute top-1/2 left-1/2 z-30 flex flex-col items-center pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
            <video
              src="/loading.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-24 h-24 object-contain"
              style={{
                mixBlendMode: 'lighten',
                animation: winCelebrating ? 'trompo-mega-spin 0.8s ease-out' : undefined,
              }}
            />
          </div>
        )}

        {/* Connected movies in circle ----------------------------- */}
        {!won && !surrendered && currentNode && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            {mobileConnections.map((n, i) => {
              const total = mobileConnections.length
              const angle = (i / total) * 2 * Math.PI - Math.PI / 2
              const radius = 130
              const x = Math.cos(angle) * radius
              const y = Math.sin(angle) * radius
              const isTarget = n.id === endNode.id
              const alreadyVisited = path.includes(n.id)
              const rotateY = angle > 0 && angle < Math.PI ? -10 : 10

              return (
                <button
                  key={n.id}
                  onClick={() => !alreadyVisited && selectMovie(n.id)}
                  disabled={alreadyVisited}
                  className="absolute pointer-events-auto"
                  style={{
                    top: '50%',
                    left: '50%',
                    width: '72px',
                    marginTop: '-56px',
                    marginLeft: '-36px',
                    transform: mobileTransition
                      ? `translate(${x}px, ${y}px) perspective(600px) rotateY(${rotateY}deg) scale(0.3)`
                      : `translate(${x}px, ${y}px) perspective(600px) rotateY(${rotateY}deg) scale(${isTarget ? 1.1 : 0.85})`,
                    opacity: mobileTransition ? 0 : alreadyVisited ? 0.25 : 1,
                    transition: 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease',
                  }}
                >
                  <div className="relative w-[72px] h-[100px] rounded-lg overflow-hidden shadow-lg shadow-black/50">
                    <Image
                      src={`${TMDB_IMG}${n.poster}`}
                      alt={n.titleEs || n.title}
                      fill
                      className="object-cover"
                      sizes="72px"
                      unoptimized
                    />
                    {isTarget && (
                      <div className="absolute inset-0 border-2 border-red-500 rounded-lg animate-pulse" />
                    )}
                  </div>
                  <p className={`text-[9px] text-center mt-0.5 drop-shadow leading-tight line-clamp-2 ${isTarget ? 'text-red-400 font-bold' : 'text-white'}`}>
                    {n.titleEs || n.title}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        {/* Win screen overlay ------------------------------------- */}
        {won && (
          <div className="absolute inset-0 z-40 flex items-center justify-center">
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
          <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto py-20">
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

        {/* Bottom: buttons + path --------------------------------- */}
        <div className="absolute bottom-0 inset-x-0 z-50 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-8 pb-safe">
          {/* Action buttons */}
          <div className="flex justify-center gap-3 px-4 mb-2">
            {!won && !surrendered && (
              <button
                onClick={surrender}
                className="px-4 py-1.5 bg-zinc-800/80 text-red-400 text-xs font-medium rounded-lg border border-red-500/30"
              >
                Rendirse
              </button>
            )}
            <button
              onClick={startGame}
              className="px-4 py-1.5 bg-zinc-800/80 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-700"
            >
              Cambiar
            </button>
            {!won && !surrendered && path.length > 1 && (
              <button
                onClick={undo}
                className="px-4 py-1.5 bg-zinc-800/80 text-yellow-400 text-xs font-medium rounded-lg border border-yellow-400/30"
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

        {/* CSS animations for particles + trompo ------------------- */}
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
