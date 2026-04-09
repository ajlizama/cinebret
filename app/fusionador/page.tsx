'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  IconButton,
  LoadingState,
  EmptyState,
  Pill,
  Icon,
} from '@/components/ui'

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
  genreOverlap: number
  graphConnections: number
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

      // 1. Combine characteristics of selected movies
      const combinedGenres = new Set<string>()
      let imdbSum = 0
      let imdbCount = 0
      const combinedCategories = new Set<string>()

      for (const sel of selected) {
        if (sel.genres) sel.genres.forEach((g) => combinedGenres.add(g))
        if (sel.imdb > 0) {
          imdbSum += sel.imdb
          imdbCount++
        }
        if (sel.categoria) combinedCategories.add(sel.categoria)
      }

      const avgImdb = imdbCount > 0 ? imdbSum / imdbCount : 0
      const combinedGenresArr = Array.from(combinedGenres)
      const totalGenres = combinedGenresArr.length || 1

      // 2. Score every movie in the graph
      const candidates: ScoredResult[] = []

      for (const node of graph.nodes) {
        if (selectedIds.has(node.id)) continue

        let score = 0

        // Genre overlap: matching genres / total combined genres * 40 points
        const nodeGenres = new Set(node.genres || [])
        let genreMatches = 0
        for (const g of combinedGenresArr) {
          if (nodeGenres.has(g)) genreMatches++
        }
        const genreScore = (genreMatches / totalGenres) * 40
        score += genreScore

        // IMDB proximity: (1 - abs(movie.imdb - avgImdb) / 10) * 20 points
        if (node.imdb > 0 && avgImdb > 0) {
          const imdbProximity = Math.max(0, 1 - Math.abs(node.imdb - avgImdb) / 10)
          score += imdbProximity * 20
        }

        // Category bonus: if movie shares a category with any selected, +10 points
        if (node.categoria && combinedCategories.has(node.categoria)) {
          score += 10
        }

        // Graph connection bonus
        const nodeAdj = adjacency.get(node.id)
        let graphConnections = 0
        if (nodeAdj) {
          for (const sel of selected) {
            const w = nodeAdj.get(sel.id)
            if (w !== undefined) {
              // Direct connection: edge weight * 5 points
              score += w * 5
              graphConnections++
            }
          }
          // Bonus for being connected to multiple selected movies: +10 per extra connection
          if (graphConnections > 1) {
            score += (graphConnections - 1) * 10
          }
        }

        // Skip movies with negligible similarity
        if (score < 1) continue

        candidates.push({
          node,
          score,
          genreOverlap: genreMatches,
          graphConnections,
          maxPossible: selected.length,
        })
      }

      // Sort by total score descending
      candidates.sort((a, b) => b.score - a.score)

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

  const atMax = selected.length >= MAX_MOVIES

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="Fusionador"
        subtitle="Elige entre 2 y 5 películas y fusionaremos sus características para descubrir las más parecidas."
        icon={<Icon.Sparkles className="w-8 h-8" />}
      />

      {loading ? (
        <LoadingState text="Cargando grafo de películas..." size="lg" />
      ) : (
        <>
          {/* Search */}
          <Section label="¿Qué películas quieres fusionar?">
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Icon.Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setDropdownOpen(true)
                  }}
                  onFocus={() => query.length >= 2 && setDropdownOpen(true)}
                  placeholder={
                    atMax
                      ? `Has alcanzado el máximo de ${MAX_MOVIES} películas`
                      : 'Buscar por título...'
                  }
                  disabled={atMax}
                  className="w-full min-h-[44px] rounded-xl border border-zinc-800 bg-zinc-900 pl-11 pr-4 py-3 text-[16px] text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-yellow-400/50 disabled:opacity-50"
                />
              </div>

              {/* Dropdown */}
              {dropdownOpen && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                  {searchResults.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => addMovie(node)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800 min-h-[44px]"
                    >
                      {node.poster ? (
                        <img
                          src={`${POSTER_BASE}${node.poster}`}
                          alt=""
                          className="h-12 w-8 flex-shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-8 flex-shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-500">
                          S/I
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
                      {node.imdb > 0 && (
                        <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-yellow-400">
                          <Icon.Star filled className="w-3.5 h-3.5" />
                          {node.imdb}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Selected chips */}
          {selected.length > 0 && (
            <Section
              label="Tu mezcla"
              action={
                <span className="text-xs font-bold tabular-nums text-zinc-500">
                  {selected.length}/{MAX_MOVIES}
                </span>
              }
            >
              <div className="flex flex-wrap gap-2">
                {selected.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 py-1 pl-1 pr-1"
                  >
                    {node.poster ? (
                      <img
                        src={`${POSTER_BASE}${node.poster}`}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-500">
                        S/I
                      </div>
                    )}
                    <span className="max-w-[140px] truncate text-xs font-semibold text-yellow-400">
                      {node.titleEs || node.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMovie(node.id)}
                      aria-label={`Quitar ${node.titleEs || node.title}`}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-yellow-400/70 transition-colors hover:bg-yellow-400/20 hover:text-yellow-400"
                    >
                      <Icon.Close className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Fusionar button */}
          <Button
            onClick={fusionar}
            disabled={selected.length < MIN_MOVIES}
            loading={fusing}
            size="lg"
            fullWidth
            iconLeft={!fusing ? <Icon.Sparkles className="w-5 h-5" /> : undefined}
          >
            {fusing
              ? 'Fusionando...'
              : selected.length < MIN_MOVIES
              ? `Elige al menos ${MIN_MOVIES} películas`
              : `Fusionar ${selected.length} películas`}
          </Button>

          {/* Results */}
          <div
            ref={resultsRef}
            className={`mt-12 transition-all duration-500 ${
              showResults ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            {showResults && results.length > 0 && (
              <>
                {/* Mini-graph */}
                <Card padding="lg" className="mb-8 border border-zinc-800">
                  <div className="mb-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <Icon.Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    La fusión más compatible
                  </div>
                  <canvas
                    ref={canvasRef}
                    className="mx-auto h-[260px] w-full max-w-[400px] sm:h-[300px]"
                  />
                </Card>

                {/* Top results list */}
                <Section
                  label={`Top ${Math.min(TOP_RESULTS, results.length)} resultados`}
                  count={results.length}
                >
                  <div className="space-y-3">
                    {results.map((r, i) => {
                      const pct = Math.round((r.score / maxScore) * 100)
                      return (
                        <Link
                          key={r.node.id}
                          href={`/pelicula/${r.node.id}`}
                          className="group flex items-center gap-3 rounded-2xl bg-zinc-900 p-4 transition-colors hover:bg-zinc-900/80"
                          style={{
                            animationDelay: `${i * 60}ms`,
                            animation: 'fadeSlideUp 0.4s ease both',
                          }}
                        >
                          {/* Rank */}
                          <span className="w-6 flex-shrink-0 text-center text-sm font-black tabular-nums text-zinc-600">
                            {i + 1}
                          </span>

                          {/* Poster */}
                          {r.node.poster ? (
                            <img
                              src={`${POSTER_BASE}${r.node.poster}`}
                              alt=""
                              className="h-16 w-11 flex-shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] text-zinc-500">
                              S/I
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
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              {r.node.imdb > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-400">
                                  <Icon.Star filled className="w-3 h-3" />
                                  {r.node.imdb}
                                </span>
                              )}
                              {r.genreOverlap > 0 && (
                                <span className="text-xs text-zinc-500">
                                  {r.genreOverlap} {r.genreOverlap === 1 ? 'género' : 'géneros'} en común
                                </span>
                              )}
                              {r.graphConnections > 0 && (
                                <span className="text-xs text-zinc-500">
                                  {r.graphConnections}/{r.maxPossible} conexiones
                                </span>
                              )}
                            </div>

                            {/* Compatibility bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                                <div
                                  className="h-full rounded-full bg-yellow-400 transition-all duration-700"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-10 flex-shrink-0 text-right text-xs font-bold tabular-nums text-yellow-400">
                                {pct}%
                              </span>
                            </div>
                          </div>

                          <Icon.ChevronRight className="w-4 h-4 flex-shrink-0 text-zinc-600 transition-colors group-hover:text-yellow-400" />
                        </Link>
                      )
                    })}
                  </div>
                </Section>
              </>
            )}

            {showResults && results.length === 0 && (
              <EmptyState
                icon={<Icon.Sparkles className="w-16 h-16" />}
                title="No encontramos conexiones"
                description="Prueba con otras películas o con una combinación distinta."
              />
            )}
          </div>
        </>
      )}

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
    </PageShell>
  )
}
