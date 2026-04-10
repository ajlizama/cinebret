'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  Card,
  Button,
  IconButton,
  SearchInput,
  Modal,
  LoadingState,
  EmptyState,
  Pill,
  Icon,
} from '@/components/ui'

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
/*  Daily seed helpers                                                 */
/* ------------------------------------------------------------------ */

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

type ConexionDailyState = {
  startId: string
  endId: string
  path: string[]
  won: boolean
  surrendered: boolean
}

function loadConexionDaily(today: string): ConexionDailyState | null {
  try {
    const raw = localStorage.getItem(`cinebret-conexion-${today}`)
    if (!raw) return null
    return JSON.parse(raw) as ConexionDailyState
  } catch { return null }
}

function saveConexionDaily(today: string, state: ConexionDailyState): void {
  try {
    localStorage.setItem(`cinebret-conexion-${today}`, JSON.stringify(state))
  } catch { /* quota exceeded, ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConexionPage() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [adj, setAdj] = useState<Map<string, Set<string>>>(new Map())
  const [nodeMap, setNodeMap] = useState<Map<string, GraphNode>>(new Map())
  const [curatedNodes, setCuratedNodes] = useState<GraphNode[]>([])
  const [startNode, setStartNode] = useState<GraphNode | null>(null)
  const [endNode, setEndNode] = useState<GraphNode | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [optimalLen, setOptimalLen] = useState<number>(0)
  const [won, setWon] = useState(false)
  const [surrendered, setSurrendered] = useState(false)
  const [optimalPath, setOptimalPath] = useState<string[]>([])
  const [prevDist, setPrevDist] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDaily, setIsDaily] = useState(true)
  const [catalogMeta, setCatalogMeta] = useState<Record<string, { difficulty?: string; category?: string | null }> | null>(null)
  const pathRef = useRef<HTMLDivElement>(null)

  // Movie chooser state
  const [chooserOpen, setChooserOpen] = useState(false)
  const [searchStart, setSearchStart] = useState('')
  const [searchEnd, setSearchEnd] = useState('')
  const [chosenStart, setChosenStart] = useState<GraphNode | null>(null)
  const [chosenEnd, setChosenEnd] = useState<GraphNode | null>(null)
  const [chooserError, setChooserError] = useState('')

  /* Load graph + curated catalog ---------------------------------- */
  useEffect(() => {
    Promise.all([
      fetch('/movie-graph.json').then(r => r.json()) as Promise<Graph>,
      fetch('/curated-catalog.json').then(r => r.json()) as Promise<{ ids: string[]; meta?: Record<string, { difficulty?: string; category?: string | null }> }>,
    ])
      .then(([data, catalog]) => {
        const curatedSet = new Set(catalog.ids)
        if (catalog.meta) setCatalogMeta(catalog.meta)
        setGraph(data)
        const a = buildAdjacency(data.edges)
        setAdj(a)
        const nm = new Map<string, GraphNode>()
        for (const n of data.nodes) nm.set(n.id, n)
        setNodeMap(nm)

        // Filter graph nodes to curated IDs only
        const curated = data.nodes.filter(n => curatedSet.has(n.id))
        setCuratedNodes(curated)
      })
      .catch(() => setError('No se pudo cargar el grafo de películas.'))
  }, [])

  /* Start new RANDOM game (non-daily) ----------------------------- */
  const startGame = useCallback(() => {
    if (!graph || curatedNodes.length < 2) return
    const a = buildAdjacency(graph.edges)
    const pair = pickTwoRandom(curatedNodes, a)
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
    setIsDaily(false)
  }, [graph, curatedNodes])

  /* Start daily game on load -------------------------------------- */
  useEffect(() => {
    if (!graph || curatedNodes.length < 2) return
    const a = buildAdjacency(graph.edges)
    const today = getToday()
    const seed = hashString('cinebret-conexion-' + today)

    // Pick two curated movies deterministically
    const wellConnected = curatedNodes.filter(n => n.connections >= 8)
    const pool = wellConnected.length >= 2 ? wellConnected : curatedNodes
    const startIdx = seed % pool.length
    let endIdx = (seed * 7 + 13) % pool.length
    if (endIdx === startIdx) endIdx = (endIdx + 1) % pool.length

    const s = pool[startIdx]
    const e = pool[endIdx]
    const optimal = bfs(a, s.id, e.id)

    // If no path exists between daily picks, fall back to random
    if (!optimal) {
      startGame()
      return
    }

    // Check localStorage for existing daily game state
    const saved = loadConexionDaily(today)

    setStartNode(s)
    setEndNode(e)
    setOptimalLen(optimal.length)
    setOptimalPath(optimal)
    setError(null)
    setIsDaily(true)

    if (saved && saved.startId === s.id && saved.endId === e.id) {
      // Restore saved daily game
      setPath(saved.path)
      setWon(saved.won)
      setSurrendered(saved.surrendered)
      setPrevDist(optimal.length - 1)
    } else {
      // Fresh daily game
      setPath([s.id])
      setWon(false)
      setSurrendered(false)
      setPrevDist(optimal.length - 1)
    }
  }, [graph, curatedNodes, startGame])

  /* Persist daily state ------------------------------------------- */
  useEffect(() => {
    if (!isDaily || !startNode || !endNode) return
    const today = getToday()
    saveConexionDaily(today, {
      startId: startNode.id,
      endId: endNode.id,
      path,
      won,
      surrendered,
    })
  }, [path, won, surrendered, startNode, endNode, isDaily])

  // Search results for movie chooser
  const startResults = graph && searchStart.length >= 2
    ? graph.nodes.filter(n => (n.title || '').toLowerCase().includes(searchStart.toLowerCase()) || (n.titleEs || '').toLowerCase().includes(searchStart.toLowerCase())).slice(0, 6)
    : []
  const endResults = graph && searchEnd.length >= 2
    ? graph.nodes.filter(n => (n.title || '').toLowerCase().includes(searchEnd.toLowerCase()) || (n.titleEs || '').toLowerCase().includes(searchEnd.toLowerCase())).slice(0, 6)
    : []

  function startCustomGame() {
    if (!chosenStart || !chosenEnd || !adj) return
    if (chosenStart.id === chosenEnd.id) { setChooserError('Elige dos películas distintas'); return }
    const p = bfs(adj, chosenStart.id, chosenEnd.id)
    if (!p) { setChooserError('No hay conexión entre estas películas'); return }
    if (p.length < 5) { setChooserError(`Están a solo ${p.length - 1} pasos. El mínimo es 4.`); return }
    setStartNode(chosenStart)
    setEndNode(chosenEnd)
    setPath([chosenStart.id])
    setOptimalLen(p.length)
    setOptimalPath(p)
    setWon(false)
    setSurrendered(false)
    setPrevDist(p.length - 1)
    setError(null)
    setIsDaily(false)
    setChooserOpen(false)
    setChooserError('')
    setSearchStart('')
    setSearchEnd('')
    setChosenStart(null)
    setChosenEnd(null)
  }

  function closeChooser() {
    setChooserOpen(false)
    setChooserError('')
  }

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
    // Cannot go directly back to the immediately previous movie. The user
    // CAN revisit the same movie later (after going through others) so
    // path.includes() is intentionally NOT a block.
    const previousId = path.length >= 2 ? path[path.length - 2] : null
    if (previousId && id === previousId) return
    // Save current distance as previous before updating path
    if (currentDistToTarget !== null) setPrevDist(currentDistToTarget)
    const newPath = [...path, id]
    setPath(newPath)
    if (id === endNode?.id) setWon(true)
  }

  /* Share --------------------------------------------------------- */
  function share() {
    if (!startNode || !endNode) return
    const steps = path.length - 1
    const text = `Conexión CineBret: Conecté ${startNode.titleEs || startNode.title} → ${endNode.titleEs || endNode.title} en ${steps} pasos (óptimo: ${optimalLen - 1})\ncinebret.cl/conexion`
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
    if (steps === optimal) return 'Perfecto'
    if (steps <= optimal + 2) return 'Muy bien'
    return 'Lo lograste'
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  if (error) {
    return (
      <PageShell maxWidth="2xl">
        <EmptyState
          icon={<Icon.Error className="w-16 h-16" />}
          title="Algo salió mal"
          description={error}
          action={
            <Button onClick={() => { setError(null); startGame() }} iconLeft={<Icon.Refresh className="w-4 h-4" />}>
              Reintentar
            </Button>
          }
        />
      </PageShell>
    )
  }

  if (!graph || !startNode || !endNode) {
    return (
      <PageShell maxWidth="2xl">
        <LoadingState text="Cargando grafo de películas..." size="lg" />
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="2xl" className="pb-44">
      <PageHeader
        title="Conexión Cinéfila"
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            Encuentra el camino más corto entre dos películas saltando por sus conexiones.
            {isDaily && startNode && catalogMeta?.[startNode.id]?.difficulty && (
              <Pill variant={catalogMeta[startNode.id].difficulty === 'Fácil' ? 'success' : catalogMeta[startNode.id].difficulty === 'Difícil' ? 'danger' : 'default'} size="sm">
                {catalogMeta[startNode.id].difficulty}
              </Pill>
            )}
          </span>
        }
        icon={<Icon.Map className="w-7 h-7" />}
      />

      {/* Challenge card -------------------------------------------- */}
      <Card padding="lg" className="mb-6">
        <div className="flex items-center justify-center gap-3">
          {/* Start movie */}
          <div className="flex flex-col items-center w-24 shrink-0">
            <div className="relative w-20 h-[120px] rounded-lg overflow-hidden ring-2 ring-yellow-400">
              <Image
                src={`${TMDB_IMG}${startNode.poster}`}
                alt={startNode.titleEs || startNode.title}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </div>
            <span className="text-[11px] text-center mt-2 text-yellow-400 leading-tight line-clamp-2 font-semibold">
              {startNode.titleEs || startNode.title}
            </span>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Icon.ArrowRight className="w-6 h-6 text-yellow-400" />
            <span className="text-[10px] text-zinc-500 tabular-nums">{path.length - 1} pasos</span>
          </div>

          {/* End movie */}
          <div className="flex flex-col items-center w-24 shrink-0">
            <div className="relative w-20 h-[120px] rounded-lg overflow-hidden ring-2 ring-yellow-400/40">
              <Image
                src={`${TMDB_IMG}${endNode.poster}`}
                alt={endNode.titleEs || endNode.title}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </div>
            <span className="text-[11px] text-center mt-2 text-zinc-300 leading-tight line-clamp-2 font-semibold">
              {endNode.titleEs || endNode.title}
            </span>
          </div>
        </div>

        {/* Initial distance info */}
        {optimalLen > 1 && (
          <div className="flex items-center justify-center gap-2 mt-5">
            <Pill variant="gold">
              {optimalLen - 1} pasos óptimos
            </Pill>
            <Pill variant="default">
              Conexión {distToPercent(optimalLen - 1)}%
            </Pill>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-2 mt-5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={startGame}
            iconLeft={<Icon.Refresh className="w-4 h-4" />}
          >
            Cambiar películas
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setChooserOpen(true)}
            iconLeft={<Icon.Search className="w-4 h-4" />}
          >
            Elegir películas
          </Button>
          {!won && !surrendered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={surrender}
            >
              Rendirse
            </Button>
          )}
        </div>
      </Card>

      {/* Movie Chooser Modal */}
      <Modal open={chooserOpen} onClose={closeChooser} title="Elegir películas" size="sm">
        <p className="text-zinc-500 text-xs mb-4">Mínimo 4 pasos de distancia</p>

        {/* Start movie search */}
        <div className="mb-4 relative">
          <label className="text-zinc-400 text-xs mb-1.5 block font-medium">Película de inicio</label>
          {chosenStart ? (
            <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 border border-zinc-800">
              <div className="w-8 h-12 rounded overflow-hidden shrink-0 bg-zinc-700">
                {chosenStart.poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${TMDB_IMG}${chosenStart.poster}`} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-white text-sm flex-1 line-clamp-1">{chosenStart.titleEs || chosenStart.title}</span>
              <IconButton
                icon={<Icon.Close className="w-4 h-4" />}
                label="Quitar película"
                size="sm"
                onClick={() => { setChosenStart(null); setSearchStart('') }}
              />
            </div>
          ) : (
            <div>
              <SearchInput
                value={searchStart}
                onChange={setSearchStart}
                placeholder="Buscar película..."
                autoFocus
              />
              {startResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-48 overflow-y-auto">
                  {startResults.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setChosenStart(n); setSearchStart('') }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 text-left transition-colors"
                    >
                      <div className="w-6 h-9 rounded overflow-hidden shrink-0 bg-zinc-700">
                        {n.poster && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${TMDB_IMG}${n.poster}`} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-white text-xs line-clamp-1">{n.titleEs || n.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* End movie search */}
        <div className="mb-4 relative">
          <label className="text-zinc-400 text-xs mb-1.5 block font-medium">Película de destino</label>
          {chosenEnd ? (
            <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 border border-zinc-800">
              <div className="w-8 h-12 rounded overflow-hidden shrink-0 bg-zinc-700">
                {chosenEnd.poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${TMDB_IMG}${chosenEnd.poster}`} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-white text-sm flex-1 line-clamp-1">{chosenEnd.titleEs || chosenEnd.title}</span>
              <IconButton
                icon={<Icon.Close className="w-4 h-4" />}
                label="Quitar película"
                size="sm"
                onClick={() => { setChosenEnd(null); setSearchEnd('') }}
              />
            </div>
          ) : (
            <div>
              <SearchInput
                value={searchEnd}
                onChange={setSearchEnd}
                placeholder="Buscar película..."
              />
              {endResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 max-h-48 overflow-y-auto">
                  {endResults.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setChosenEnd(n); setSearchEnd('') }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 text-left transition-colors"
                    >
                      <div className="w-6 h-9 rounded overflow-hidden shrink-0 bg-zinc-700">
                        {n.poster && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${TMDB_IMG}${n.poster}`} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-white text-xs line-clamp-1">{n.titleEs || n.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {chooserError && (
          <p className="text-red-400 text-xs mb-3" role="alert">{chooserError}</p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={startCustomGame}
            disabled={!chosenStart || !chosenEnd}
            fullWidth
          >
            Jugar
          </Button>
          <Button variant="ghost" onClick={closeChooser}>
            Cancelar
          </Button>
        </div>
      </Modal>

      {/* Win screen ------------------------------------------------ */}
      {won && (
        <Card padding="lg" className="text-center mb-6 border border-yellow-400/30">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-400/15 text-yellow-400 mb-3">
            <Icon.Trophy className="w-7 h-7" />
          </div>
          <p className="text-2xl text-white font-black mb-1">{getRating()}</p>
          <p className="text-yellow-400 font-bold text-lg mb-1">
            Conectaste en {path.length - 1} pasos
          </p>
          <p className="text-zinc-400 text-sm mb-5">
            Camino óptimo: {optimalLen - 1} pasos
          </p>

          {/* Ideal path reveal */}
          {optimalPath.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-3">
                Camino óptimo
              </p>
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {optimalPath.map((id, i) => {
                  const n = nodeMap.get(id)
                  if (!n) return null
                  return (
                    <div key={`win-opt-${id}-${i}`} className="flex items-center shrink-0">
                      {i > 0 && <Icon.ChevronRight className="w-3 h-3 text-zinc-600 mx-0.5" />}
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
                        <span className="text-[9px] text-center mt-1 text-zinc-400 leading-tight line-clamp-2">
                          {n.titleEs || n.title}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 flex-wrap">
            <Button onClick={share} iconLeft={<Icon.Share className="w-4 h-4" />}>
              Compartir
            </Button>
            <Button variant="secondary" onClick={startGame} iconLeft={<Icon.Refresh className="w-4 h-4" />}>
              Jugar de nuevo
            </Button>
          </div>
        </Card>
      )}

      {/* Surrender screen --------------------------------------------- */}
      {surrendered && (
        <Card padding="lg" className="text-center mb-6 border border-zinc-800">
          <p className="text-white font-bold text-lg mb-4">El camino óptimo era</p>
          <div className="flex items-center justify-center gap-1 flex-wrap mb-4">
            {optimalPath.map((id, i) => {
              const n = nodeMap.get(id)
              if (!n) return null
              return (
                <div key={`opt-${id}-${i}`} className="flex items-center shrink-0">
                  {i > 0 && <Icon.ChevronRight className="w-3 h-3 text-zinc-600 mx-0.5" />}
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
                    <span className="text-[9px] text-center mt-1 text-zinc-400 leading-tight line-clamp-2">
                      {n.titleEs || n.title}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-center gap-2 mb-5">
            <Pill variant="gold">{optimalLen - 1} pasos</Pill>
            <Pill variant="default">Conexión {distToPercent(optimalLen - 1)}%</Pill>
          </div>
          <Button onClick={startGame} iconLeft={<Icon.Refresh className="w-4 h-4" />}>
            Jugar de nuevo
          </Button>
        </Card>
      )}

      {/* Current movie + connections ------------------------------- */}
      {!won && !surrendered && currentNode && (
        <div>
          {/* Current movie info */}
          <Card padding="md" className="mb-4">
            <div className="flex items-start gap-3">
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
                  {currentNode.categoria} · IMDb {currentNode.imdb}
                </p>
              </div>
            </div>
          </Card>

          {/* Distance indicator */}
          {currentDistToTarget !== null && path.length > 1 && (
            <div
              className={`flex items-center justify-center gap-2 text-sm font-medium mb-4 px-3 py-2 rounded-xl border ${
                isGettingCloser
                  ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
              role="status"
            >
              {isGettingCloser ? (
                <Icon.ChevronDown className="w-4 h-4" />
              ) : (
                <Icon.ChevronUp className="w-4 h-4" />
              )}
              <span>
                A {currentDistToTarget} paso{currentDistToTarget !== 1 ? 's' : ''} del objetivo · Conexión {distToPercent(currentDistToTarget)}%
              </span>
            </div>
          )}

          {/* Connections label */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
              Conexiones
            </p>
            <span className="text-zinc-500 text-xs tabular-nums">{connectedNodes.length}</span>
          </div>

          {/* Connections grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[42vh] overflow-y-auto pr-1">
            {connectedNodes.map((n) => {
              const isTarget = n.id === endNode.id
              // The user can revisit movies, but not the IMMEDIATELY previous one.
              const previousId = path.length >= 2 ? path[path.length - 2] : null
              const isImmediatelyPrevious = previousId === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => selectMovie(n.id)}
                  disabled={isImmediatelyPrevious}
                  className={`flex flex-col items-center rounded-xl p-2 transition min-h-[44px]
                    ${isTarget ? 'bg-yellow-400/10 ring-2 ring-yellow-400' : 'bg-zinc-900/40'}
                    ${isImmediatelyPrevious ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-800 active:scale-95 cursor-pointer'}
                  `}
                  title={isImmediatelyPrevious ? 'No puedes volver inmediatamente atrás' : undefined}
                >
                  <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-zinc-800/60">
                    <Image
                      src={`${TMDB_IMG}${n.poster}`}
                      alt={n.titleEs || n.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 33vw, 120px"
                      unoptimized
                    />
                  </div>
                  <span
                    className={`text-[11px] leading-tight mt-1.5 text-center line-clamp-2 ${
                      isTarget ? 'text-yellow-400 font-bold' : 'text-zinc-300'
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
      <div className="fixed bottom-0 inset-x-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 z-40">
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
                    isStart || isEnd
                      ? 'ring-yellow-400'
                      : 'ring-yellow-400/40'
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
              <div className="relative w-10 h-[60px] rounded-md overflow-hidden ring-1 ring-yellow-400/30 opacity-40">
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
    </PageShell>
  )
}
