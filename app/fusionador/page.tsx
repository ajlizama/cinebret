'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Nav from '@/components/Nav'

/* ── Types ────────────────────────────────────────── */

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
}

type GraphEdge = {
  source: string
  target: string
  weight: number
}

type RawGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

type ScoredResult = {
  node: GraphNode
  score: number
  matchCount: number
  maxPossible: number
}

/* ── Constants ────────────────────────────────────── */

const MIN_MOVIES = 2
const MAX_MOVIES = 5
const TOP_RESULTS = 10
const POSTER_BASE = 'https://image.tmdb.org/t/p/w185'

/* ── Component ────────────────────────────────────── */

export default function FusionadorPage() {
  const [graph, setGraph] = useState<RawGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GraphNode[]>([])
  const [results, setResults] = useState<ScoredResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [fusing, setFusing] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Build adjacency map for fast lookups
  const adjacency = useMemo(() => {
    if (!graph) return new Map<string, Map<string, number>>()
    const adj = new Map<string, Map<string, number>>()
    for (const edge of graph.edges) {
      const s = typeof edge.source === 'string' ? edge.source : (edge.source as any).id
      const t = typeof edge.target === 'string' ? edge.target : (edge.target as any).id
      if (!adj.has(s)) adj.set(s, new Map())
      if (!adj.has(t)) adj.set(t, new Map())
      adj.get(s)!.set(t, edge.weight)
      adj.get(t)!.set(s, edge.weight)
    }
    return adj
  }, [graph])

  const nodeMap = useMemo(() => {
    if (!graph) return new Map<string, GraphNode>()
    const m = new Map<string, GraphNode>()
    for (const n of graph.nodes) m.set(n.id, n)
    return m
  }, [graph])

  /* ── Load graph ─────────────────────────────────── */

  useEffect(() => {
    fetch('/movie-graph.json')
      .then((r) => r.json())
      .then((data: RawGraph) => {
        setGraph(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  /* ── Search filtering ───────────────────────────── */

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const searchResults = useMemo(() => {
    if (!graph || query.length < 2) return []
    const q = normalize(query)
    const selectedIds = new Set(selected.map((s) => s.id))
    return graph.nodes
      .filter((n) => {
        if (selectedIds.has(n.id)) return false
        return normalize(n.title).includes(q) || normalize(n.titleEs || '').includes(q)
      })
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 8)
  }, [graph, query, selected])

  /* ── Click outside to close dropdown ────────────── */

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as HTMLElement)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Add / Remove ───────────────────────────────── */

  const addMovie = useCallback(
    (node: GraphNode) => {
      if (selected.length >= MAX_MOVIES) return
      if (selected.find((s) => s.id === node.id)) return
      setSelected((prev) => [...prev, node])
      setQuery('')
      setDropdownOpen(false)
      setShowResults(false)
      setResults([])
    },
    [selected]
  )

  const removeMovie = useCallback((id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id))
    setShowResults(false)
    setResults([])
  }, [])

  /* ── Fusion algorithm ───────────────────────────── */

  const fusionar = useCallback(() => {
    if (!graph || selected.length < MIN_MOVIES) return
    setFusing(true)
    setShowResults(false)

    // Use requestAnimationFrame to allow the loading state to render
    requestAnimationFrame(() => {
      const selectedIds = new Set(selected.map((s) => s.id))

      // For each candidate node (not in selected), compute score
      const candidates: ScoredResult[] = []

      for (const node of graph.nodes) {
        if (selectedIds.has(node.id)) continue

        const nodeAdj = adjacency.get(node.id)
        if (!nodeAdj) continue

        let score = 0
        let matchCount = 0

        for (const sel of selected) {
          const w = nodeAdj.get(sel.id)
          if (w !== undefined) {
            score += w
            matchCount++
          }
        }

        if (matchCount === 0) continue

        candidates.push({
          node,
          score,
          matchCount,
          maxPossible: selected.length,
        })
      }

      // Sort: first by matchCount desc, then by score desc
      candidates.sort((a, b) => {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
        return b.score - a.score
      })

      const top = candidates.slice(0, TOP_RESULTS)
      setResults(top)
      setShowResults(true)
      setFusing(false)

      // Scroll to results after a beat
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    })
  }, [graph, selected, adjacency])

  /* ── Mini-graph canvas ──────────────────────────── */

  const drawMiniGraph = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || results.length === 0 || selected.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const W = rect.width
    const H = rect.height
    const cx = W / 2
    const cy = H / 2

    ctx.clearRect(0, 0, W, H)

    const winner = results[0]

    // Position selected movies in a circle around center
    const selPositions: { x: number; y: number; node: GraphNode }[] = []
    const radius = Math.min(W, H) * 0.35
    for (let i = 0; i < selected.length; i++) {
      const angle = (i / selected.length) * Math.PI * 2 - Math.PI / 2
      selPositions.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        node: selected[i],
      })
    }

    // Draw edges from center (winner) to each selected
    for (const pos of selPositions) {
      const nodeAdj = adjacency.get(winner.node.id)
      const w = nodeAdj?.get(pos.node.id) ?? 0
      const alpha = w > 0 ? Math.min(0.3 + (w / 10) * 0.7, 1) : 0.15

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = `rgba(250, 204, 21, ${alpha})`
      ctx.lineWidth = w > 0 ? 1.5 + w * 0.3 : 0.5
      ctx.stroke()
    }

    // Draw selected movie circles
    const nodeRadius = 22
    for (const pos of selPositions) {
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2)
      ctx.fillStyle = '#3f3f46'
      ctx.fill()
      ctx.strokeStyle = '#a1a1aa'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Label
      ctx.fillStyle = '#d4d4d8'
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const label = (pos.node.titleEs || pos.node.title).slice(0, 14)
      ctx.fillText(label, pos.x, pos.y + nodeRadius + 4)
    }

    // Draw winner node at center
    ctx.beginPath()
    ctx.arc(cx, cy, nodeRadius + 6, 0, Math.PI * 2)
    ctx.fillStyle = '#854d0e'
    ctx.fill()
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Winner glow
    ctx.shadowColor = '#facc15'
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.arc(cx, cy, nodeRadius + 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.shadowBlur = 0

    // Winner label
    ctx.fillStyle = '#facc15'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const winLabel = (winner.node.titleEs || winner.node.title).slice(0, 18)
    ctx.fillText(winLabel, cx, cy + nodeRadius + 10)
  }, [results, selected, adjacency])

  useEffect(() => {
    if (showResults && results.length > 0) {
      // Small delay for canvas to mount
      const t = setTimeout(drawMiniGraph, 50)
      window.addEventListener('resize', drawMiniGraph)
      return () => {
        clearTimeout(t)
        window.removeEventListener('resize', drawMiniGraph)
      }
    }
  }, [showResults, results, drawMiniGraph])

  /* ── Max score for % calculation ────────────────── */

  const maxScore = useMemo(() => {
    if (results.length === 0) return 1
    return results[0].score || 1
  }, [results])

  /* ── Render ─────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav active="inicio" />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold sm:text-4xl">
            <span className="text-yellow-400">Fusionador</span> de Pelis
          </h1>
          <p className="text-sm text-zinc-400">
            Elige entre 2 y 5 pelis y encontramos el punto de equilibrio: la peli que las conecta a
            todas.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Search */}
            <div ref={searchRef} className="relative mb-4">
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                ¿Qué películas quieres fusionar?
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setDropdownOpen(true)
                }}
                onFocus={() => query.length >= 2 && setDropdownOpen(true)}
                placeholder="Busca por nombre..."
                disabled={selected.length >= MAX_MOVIES}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-yellow-400 disabled:opacity-50"
              />

              {/* Dropdown */}
              {dropdownOpen && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                  {searchResults.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => addMovie(node)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-zinc-800"
                    >
                      {node.poster ? (
                        <img
                          src={`${POSTER_BASE}${node.poster}`}
                          alt=""
                          className="h-12 w-8 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-8 flex-shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
                          N/A
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {node.titleEs || node.title}
                        </p>
                        {node.titleEs && node.titleEs !== node.title && (
                          <p className="truncate text-xs text-zinc-500">{node.title}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-xs text-yellow-400">
                        {node.imdb > 0 ? `★ ${node.imdb}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {selected.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 py-1 pl-1 pr-3"
                  >
                    {node.poster ? (
                      <img
                        src={`${POSTER_BASE}${node.poster}`}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-500">
                        ?
                      </div>
                    )}
                    <span className="max-w-[120px] truncate text-xs font-medium">
                      {node.titleEs || node.title}
                    </span>
                    <button
                      onClick={() => removeMovie(node.id)}
                      className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[10px] leading-none text-zinc-300 transition hover:bg-red-500 hover:text-white"
                      aria-label={`Quitar ${node.titleEs || node.title}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <span className="self-center text-xs text-zinc-500">
                  {selected.length}/{MAX_MOVIES}
                </span>
              </div>
            )}

            {/* Fusionar button */}
            <button
              onClick={fusionar}
              disabled={selected.length < MIN_MOVIES || fusing}
              className="w-full rounded-lg bg-yellow-400 px-6 py-3 text-sm font-bold text-zinc-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fusing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                  Fusionando...
                </span>
              ) : selected.length < MIN_MOVIES ? (
                `Elige al menos ${MIN_MOVIES} pelis`
              ) : (
                `Fusionar ${selected.length} pelis`
              )}
            </button>

            {/* Results */}
            <div
              ref={resultsRef}
              className={`mt-10 transition-all duration-500 ${
                showResults ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
            >
              {showResults && results.length > 0 && (
                <>
                  {/* Mini-graph */}
                  <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="mb-3 text-center text-xs font-medium text-zinc-400">
                      El punto de equilibrio es...
                    </p>
                    <canvas
                      ref={canvasRef}
                      className="mx-auto h-[260px] w-full max-w-[400px] sm:h-[300px]"
                    />
                  </div>

                  {/* Top results list */}
                  <h2 className="mb-4 text-lg font-bold">
                    Top {Math.min(TOP_RESULTS, results.length)} resultados
                  </h2>

                  <div className="space-y-3">
                    {results.map((r, i) => {
                      const pct = Math.round((r.score / maxScore) * 100)
                      return (
                        <Link
                          key={r.node.id}
                          href={`/pelicula/${r.node.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-600 hover:bg-zinc-900"
                          style={{
                            animationDelay: `${i * 60}ms`,
                            animation: 'fadeSlideUp 0.4s ease both',
                          }}
                        >
                          {/* Rank */}
                          <span className="w-6 flex-shrink-0 text-center text-sm font-bold text-zinc-500">
                            {i + 1}
                          </span>

                          {/* Poster */}
                          {r.node.poster ? (
                            <img
                              src={`${POSTER_BASE}${r.node.poster}`}
                              alt=""
                              className="h-16 w-11 flex-shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
                              N/A
                            </div>
                          )}

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white group-hover:text-yellow-400">
                              {r.node.titleEs || r.node.title}
                            </p>
                            {r.node.titleEs && r.node.titleEs !== r.node.title && (
                              <p className="truncate text-xs text-zinc-500">{r.node.title}</p>
                            )}
                            <div className="mt-1 flex items-center gap-2">
                              {r.node.imdb > 0 && (
                                <span className="text-xs text-yellow-400">★ {r.node.imdb}</span>
                              )}
                              <span className="text-xs text-zinc-500">
                                {r.matchCount}/{r.maxPossible} conexiones
                              </span>
                            </div>

                            {/* Compatibility bar */}
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                                <div
                                  className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-10 flex-shrink-0 text-right text-xs font-bold text-yellow-400">
                                {pct}%
                              </span>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}

              {showResults && results.length === 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                  <p className="text-lg font-bold text-zinc-400">No encontramos conexiones</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Prueba con otras pelis o combinaciones distintas.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
