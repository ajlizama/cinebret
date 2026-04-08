'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Nav from '@/components/Nav'
import { supabase } from '@/lib/supabase'

/* ─── Types ─── */
interface Enriquecimiento {
  director: string | null
  actores: string | null
  generos: string[] | null
  sinopsis_chilensis: string | null
  keywords: string | null
  compositor: string | null
  actores_oscars: string | null
}

interface Movie {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  backdrop_path: string | null
  oscars: string | null
  categoria: string | null
  enriquecimiento: Enriquecimiento | null
}

interface GraphData {
  nodes: { id: string }[]
  edges: { source: string; target: string; weight: number }[]
}

interface GuessResult {
  movie: Movie
  matchGenre: boolean
  matchDecade: boolean
  matchDirector: boolean
  matchCast: boolean
  matchOscars: boolean
  matchCompositor: boolean
  matchMood: boolean
  graphDistance: number | null // null = not connected
}

interface GameState {
  guesses: string[] // movie ids
  solved: boolean
  failed: boolean
}

interface Stats {
  games_played: number
  games_won: number
  current_streak: number
  max_streak: number
  guess_distribution: number[] // index 0 = 1 guess, index 5 = 6 guesses
}

/* ─── Helpers ─── */
function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function getDayNumber(): number {
  const start = new Date('2024-01-01').getTime()
  const now = new Date(getToday()).getTime()
  return Math.floor((now - start) / (1000 * 60 * 60 * 24))
}

function getDecade(year: number | null): number | null {
  if (!year) return null
  return Math.floor(year / 10) * 10
}

function getBlur(attempt: number): number {
  const levels = [40, 33, 26, 19, 12, 5, 0]
  return levels[Math.min(attempt, levels.length - 1)]
}

async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

function loadGameState(date: string): GameState | null {
  try {
    const raw = localStorage.getItem(`cinebret-adivina-${date}`)
    if (!raw) return null
    return JSON.parse(raw) as GameState
  } catch { return null }
}

function saveGameState(date: string, state: GameState) {
  localStorage.setItem(`cinebret-adivina-${date}`, JSON.stringify(state))
}

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem('cinebret-adivina-stats')
    if (!raw) throw new Error('none')
    return JSON.parse(raw) as Stats
  } catch {
    return {
      games_played: 0,
      games_won: 0,
      current_streak: 0,
      max_streak: 0,
      guess_distribution: [0, 0, 0, 0, 0, 0],
    }
  }
}

function saveStats(stats: Stats) {
  localStorage.setItem('cinebret-adivina-stats', JSON.stringify(stats))
}

/* ─── Graph helpers ─── */
function buildAdjacency(edges: GraphData['edges']): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set())
    if (!adj.has(e.target)) adj.set(e.target, new Set())
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }
  return adj
}

function bfsDistance(adj: Map<string, Set<string>>, from: string, to: string): number | null {
  if (from === to) return 0
  if (!adj.has(from) || !adj.has(to)) return null
  const visited = new Set<string>([from])
  const queue: [string, number][] = [[from, 0]]
  let head = 0
  while (head < queue.length) {
    const [node, dist] = queue[head++]
    const neighbors = adj.get(node)
    if (!neighbors) continue
    for (const n of neighbors) {
      if (n === to) return dist + 1
      if (!visited.has(n)) {
        visited.add(n)
        queue.push([n, dist + 1])
      }
    }
  }
  return null
}

function hasOscars(movie: Movie): boolean {
  return movie.oscars != null && movie.oscars !== '' && movie.oscars !== 'N/A'
}

function parseActors(actorsStr: string | null | undefined): string[] {
  if (!actorsStr) return []
  return actorsStr.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
}

/* ─── Connection % helper ─── */
function distanceToPercent(d: number | null): number {
  if (d === null) return 0
  if (d <= 1) return 95
  if (d === 2) return 85
  if (d === 3) return 70
  if (d === 4) return 50
  if (d === 5) return 30
  return 10
}

/* ─── Component ─── */
export default function AdivinaPage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [targetMovie, setTargetMovie] = useState<Movie | null>(null)
  const [graphAdj, setGraphAdj] = useState<Map<string, Set<string>> | null>(null)
  const [guesses, setGuesses] = useState<GuessResult[]>([])
  const [solved, setSolved] = useState(false)
  const [failed, setFailed] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<Stats>(loadStats)
  const [copied, setCopied] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [isFreeMode, setIsFreeMode] = useState(false)
  const [allMovies, setAllMovies] = useState<Movie[]>([]) // all valid movies for free mode picks
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const today = useMemo(() => getToday(), [])
  const dayNumber = useMemo(() => getDayNumber(), [])
  const gameOver = solved || failed

  // Fetch movies
  useEffect(() => {
    async function load() {
      const [raw, graphRes] = await Promise.all([
        fetchAllPages<any>(
          (from, to) =>
            supabase
              .from('peliculas')
              .select(`
                id, titulo, titulo_ingles, anio, nota_imdb, poster_path, backdrop_path, oscars, categoria,
                enriquecimiento (director, actores, generos, sinopsis_chilensis, keywords, compositor, actores_oscars)
              `)
              .gte('nota_imdb', 7.5)
              .not('poster_path', 'is', null)
              .not('backdrop_path', 'is', null)
              .range(from, to),
          1000,
        ),
        fetch('/movie-graph.json').then((r) => r.json()).catch(() => null) as Promise<GraphData | null>,
      ])

      const adj = graphRes ? buildAdjacency(graphRes.edges) : null
      if (adj) {
        setGraphAdj(adj)
      }

      // Build set of movie IDs that exist in graph
      const nodeIds = new Set<string>()
      if (graphRes) {
        for (const n of graphRes.nodes) nodeIds.add(n.id)
        for (const e of graphRes.edges) { nodeIds.add(e.source); nodeIds.add(e.target) }
      }

      const parsed: Movie[] = raw.map((p: any) => ({
        id: p.id,
        titulo: p.titulo,
        titulo_ingles: p.titulo_ingles,
        anio: p.anio,
        nota_imdb: p.nota_imdb,
        poster_path: p.poster_path,
        backdrop_path: p.backdrop_path,
        oscars: p.oscars ?? null,
        categoria: p.categoria ?? null,
        enriquecimiento: p.enriquecimiento ?? null,
      }))

      // Filter: only movies that have connections in the graph (if graph loaded)
      const connected = nodeIds.size > 0
        ? parsed.filter((m) => nodeIds.has(m.id))
        : parsed

      // Sort deterministically by id for consistent indexing
      connected.sort((a, b) => a.id.localeCompare(b.id))
      setMovies(parsed) // keep all for search suggestions
      setAllMovies(connected) // only connected movies for target selection

      if (connected.length > 0) {
        const idx = hashString(`cinebret-${today}`) % connected.length
        const target = connected[idx]
        setTargetMovie(target)

        // Check if daily was already played
        const saved = loadGameState(today)
        if (saved) {
          const restoredGuesses: GuessResult[] = saved.guesses
            .map((gid) => {
              const m = parsed.find((p) => p.id === gid)
              if (!m || !target) return null
              return buildGuessResult(m, target, adj)
            })
            .filter(Boolean) as GuessResult[]
          setGuesses(restoredGuesses)
          setSolved(saved.solved)
          setFailed(saved.failed)
        }
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildGuessResult(guessed: Movie, target: Movie, adj?: Map<string, Set<string>> | null): GuessResult {
    const tEnr = target.enriquecimiento
    const gEnr = guessed.enriquecimiento
    const matchGenre =
      !!tEnr?.generos &&
      !!gEnr?.generos &&
      tEnr.generos.some((g) => gEnr.generos!.includes(g))
    const matchDecade = getDecade(target.anio) === getDecade(guessed.anio)
    const matchDirector =
      !!tEnr?.director &&
      !!gEnr?.director &&
      tEnr.director.toLowerCase() === gEnr.director.toLowerCase()

    // CAST: shares any actor
    const targetActors = parseActors(tEnr?.actores)
    const guessedActors = parseActors(gEnr?.actores)
    const matchCast = targetActors.length > 0 && guessedActors.length > 0 &&
      targetActors.some((a) => guessedActors.includes(a))

    // OSC: same oscar status
    const matchOscars = hasOscars(target) === hasOscars(guessed)

    // COMP: same compositor
    const tComp = tEnr?.compositor?.trim().toLowerCase() ?? ''
    const gComp = gEnr?.compositor?.trim().toLowerCase() ?? ''
    const matchCompositor = tComp !== '' && gComp !== '' && tComp === gComp

    // MOOD: same CineBret categoria
    const matchMood =
      !!target.categoria && !!guessed.categoria &&
      target.categoria.trim().toLowerCase() === guessed.categoria.trim().toLowerCase()

    // Graph distance
    const graphDistance = adj ? bfsDistance(adj, guessed.id, target.id) : null

    return { movie: guessed, matchGenre, matchDecade, matchDirector, matchCast, matchOscars, matchCompositor, matchMood, graphDistance }
  }

  // Click outside to close suggestions
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredMovies = useMemo(() => {
    if (!searchText.trim() || searchText.length < 2) return []
    const q = searchText.toLowerCase()
    const guessedIds = new Set(guesses.map((g) => g.movie.id))
    return movies
      .filter((m) => {
        if (guessedIds.has(m.id)) return false
        return (
          m.titulo.toLowerCase().includes(q) ||
          (m.titulo_ingles && m.titulo_ingles.toLowerCase().includes(q))
        )
      })
      .slice(0, 8)
  }, [searchText, movies, guesses])

  const submitGuess = useCallback(
    (movie: Movie) => {
      if (!targetMovie || gameOver) return
      const result = buildGuessResult(movie, targetMovie, graphAdj)
      const newGuesses = [...guesses, result]
      setGuesses(newGuesses)
      setSearchText('')
      setShowSuggestions(false)

      const won = movie.id === targetMovie.id
      const lost = !won && newGuesses.length >= 6

      // Only persist daily game state (not free mode)
      if (!isFreeMode) {
        const newState: GameState = {
          guesses: newGuesses.map((g) => g.movie.id),
          solved: won,
          failed: lost,
        }
        saveGameState(today, newState)
      }

      if (won) {
        setSolved(true)
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3000)
        // Only update stats for daily game
        if (!isFreeMode) {
          const s = loadStats()
          s.games_played += 1
          s.games_won += 1
          s.current_streak += 1
          if (s.current_streak > s.max_streak) s.max_streak = s.current_streak
          s.guess_distribution[newGuesses.length - 1] += 1
          saveStats(s)
          setStats(s)
        }
      } else if (lost) {
        setFailed(true)
        // Only update stats for daily game
        if (!isFreeMode) {
          const s = loadStats()
          s.games_played += 1
          s.current_streak = 0
          saveStats(s)
          setStats(s)
        }
      }
    },
    [targetMovie, gameOver, guesses, today, graphAdj, isFreeMode],
  )

  const startFreeGame = useCallback(() => {
    if (allMovies.length === 0) return
    const randomIdx = Math.floor(Math.random() * allMovies.length)
    const newTarget = allMovies[randomIdx]
    setTargetMovie(newTarget)
    setGuesses([])
    setSolved(false)
    setFailed(false)
    setIsFreeMode(true)
    setSearchText('')
    setShowSuggestions(false)
  }, [allMovies])

  const shareText = useMemo(() => {
    if (!solved && !failed) return ''
    const squares = guesses
      .map((g) => (g.movie.id === targetMovie?.id ? '🟩' : '🟥'))
      .join('')
    const score = solved ? `${guesses.length}/6` : 'X/6'
    return `🎬 Adivina la Peli CineBret #${dayNumber}\n${squares} (${score})\ncinebret.cl/adivina`
  }, [solved, failed, guesses, targetMovie, dayNumber])

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = shareText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ─── Hints ─── */
  function getHints(): string[] {
    if (!targetMovie) return []
    const enr = targetMovie.enriquecimiento
    const hints: string[] = []
    const attempts = guesses.length

    if (attempts >= 1) {
      const decade = getDecade(targetMovie.anio)
      hints.push(`📅 Año: ${targetMovie.anio ?? '?'} (década del ${decade ?? '?'})`)
    }
    if (attempts >= 2 && enr?.generos) {
      hints.push(`🎭 Géneros: ${enr.generos.join(', ')}`)
    }
    if (attempts >= 3 && enr?.director) {
      hints.push(`🎬 Director: ${enr.director.charAt(0)}...`)
    }
    if (attempts >= 4 && enr?.actores) {
      const first = enr.actores.split(',')[0]?.trim()
      if (first) hints.push(`⭐ Actor: ${first}`)
    }
    if (attempts >= 5 && enr?.sinopsis_chilensis) {
      const firstLine = enr.sinopsis_chilensis.split('.')[0]
      hints.push(`📝 "${firstLine}..."`)
    }
    return hints
  }

  /* ─── Render ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Nav active="inicio" />
        <div className="flex items-center justify-center pt-32">
          <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  if (!targetMovie) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Nav active="inicio" />
        <div className="text-center pt-32 text-zinc-400">No se pudo cargar el juego.</div>
      </div>
    )
  }

  const blurPx = gameOver
    ? 0
    : getBlur(guesses.length)

  const hints = getHints()
  const maxDist = Math.max(...stats.guess_distribution, 1)

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav active="inicio" />

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-5%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <div
                className="w-2 h-3 rounded-sm"
                style={{
                  backgroundColor: ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'][i % 6],
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            </div>
          ))}
          <style>{`
            @keyframes confetti-fall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }
            .animate-confetti {
              animation: confetti-fall 3s ease-in forwards;
            }
          `}</style>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4 pb-20">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-yellow-400">Adivina la Peli</h1>
          <p className="text-zinc-400 text-sm">
            {isFreeMode ? 'Modo libre' : `Desafío diario #${dayNumber}`} &middot; {guesses.length}/6 intentos
          </p>
          <div className="flex items-center justify-center gap-3 mt-1">
            <button
              onClick={() => { setStats(loadStats()); setShowStats(true) }}
              className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors"
            >
              📊 Estadísticas
            </button>
            <button
              onClick={() => setShowLegend((v) => !v)}
              className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors"
              title="¿Qué significan las siglas?"
            >
              ℹ️ Siglas
            </button>
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="mb-4 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-300 space-y-1">
            <p className="text-yellow-400 font-semibold mb-1.5">¿Qué significan las siglas?</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">DEC</span> Década — verde si misma década</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">GEN</span> Género — verde si comparte algún género</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">DIR</span> Director — verde si mismo director</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">CAST</span> Reparto — verde si comparte algún actor</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">OSC</span> Oscars — verde si mismo status de Oscar</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">COMP</span> Compositor — verde si mismo compositor</p>
            <p><span className="inline-block w-11 font-bold bg-green-600 text-white text-center rounded px-1 mr-1.5">MOOD</span> Mood CineBret — verde si misma categoría</p>
          </div>
        )}

        {/* Backdrop image */}
        <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-4 bg-zinc-900">
          <Image
            src={`https://image.tmdb.org/t/p/w1280${targetMovie.backdrop_path}`}
            alt="¿Qué película es?"
            fill
            className="object-cover transition-all duration-700"
            style={{ filter: `blur(${blurPx}px)`, transform: 'scale(1.1)' }}
            priority
          />
          {!gameOver && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl font-bold text-white/30 select-none">?</span>
            </div>
          )}
        </div>

        {/* Hints */}
        {hints.length > 0 && !gameOver && (
          <div className="mb-4 space-y-1">
            {hints.map((h, i) => (
              <div
                key={i}
                className="text-sm bg-zinc-900 rounded-lg px-3 py-1.5 text-zinc-300 border border-zinc-800"
              >
                {h}
              </div>
            ))}
          </div>
        )}

        {/* Guess list */}
        {guesses.length > 0 && (
          <div className="mb-4 space-y-2">
            {guesses.map((g, i) => {
              const isCorrect = g.movie.id === targetMovie.id
              const pct = distanceToPercent(g.graphDistance)
              const pctColor = pct > 70 ? 'bg-green-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-red-500'
              const pctTextColor = pct > 70 ? 'text-green-400' : pct >= 30 ? 'text-yellow-400' : 'text-red-400'
              return (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 border ${
                    isCorrect
                      ? 'bg-green-950/50 border-green-700'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium flex-1 truncate">
                      {isCorrect ? '✅' : '❌'} {g.movie.titulo} ({g.movie.anio ?? '?'})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchDecade ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Década"
                    >
                      DEC
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchGenre ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Género"
                    >
                      GEN
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchDirector ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Director"
                    >
                      DIR
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchCast ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Comparten actor"
                    >
                      CAST
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchOscars ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Mismo estado Oscars"
                    >
                      OSC
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchCompositor ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Mismo compositor"
                    >
                      COMP
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        g.matchMood ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}
                      title="Misma categoría CineBret"
                    >
                      MOOD
                    </span>
                  </div>
                  {!isCorrect && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className={`text-[11px] font-semibold ${pctTextColor}`}>
                        Conexión: {pct}%
                      </span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pctColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Search input */}
        {!gameOver && (
          <div className="relative mb-4" ref={suggestionsRef}>
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="¿Qué película es? Escribe el nombre..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
            {showSuggestions && filteredMovies.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden z-20 max-h-64 overflow-y-auto">
                {filteredMovies.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => submitGuess(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
                  >
                    <span className="text-white text-sm font-medium">{m.titulo}</span>
                    {m.titulo_ingles && (
                      <span className="text-zinc-500 text-xs ml-2">({m.titulo_ingles})</span>
                    )}
                    {m.anio && (
                      <span className="text-zinc-500 text-xs ml-1">&middot; {m.anio}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Win state */}
        {solved && (
          <div className="text-center space-y-4">
            <div className="text-2xl font-bold text-green-400">
              ¡Adivinaste!
            </div>
            <div className="flex justify-center">
              <div className="relative w-40 aspect-[2/3] rounded-lg overflow-hidden shadow-lg">
                <Image
                  src={`https://image.tmdb.org/t/p/w500${targetMovie.poster_path}`}
                  alt={targetMovie.titulo}
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-400">{targetMovie.titulo}</p>
              {targetMovie.titulo_ingles && (
                <p className="text-zinc-400 text-sm">{targetMovie.titulo_ingles}</p>
              )}
              <p className="text-zinc-400 text-sm">
                {targetMovie.anio} &middot; IMDb {targetMovie.nota_imdb}
              </p>
              {targetMovie.enriquecimiento?.director && (
                <p className="text-zinc-500 text-xs mt-1">Dir: {targetMovie.enriquecimiento.director}</p>
              )}
              {targetMovie.enriquecimiento?.generos && (
                <p className="text-zinc-500 text-xs">{targetMovie.enriquecimiento.generos.join(', ')}</p>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              {!isFreeMode && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 bg-yellow-400 text-black font-bold px-6 py-2.5 rounded-full hover:bg-yellow-300 transition-colors"
                >
                  {copied ? '¡Copiado!' : '📋 Compartir resultado'}
                </button>
              )}
              <button
                onClick={startFreeGame}
                className="inline-flex items-center gap-2 bg-zinc-800 text-yellow-400 border border-zinc-700 font-bold px-6 py-2.5 rounded-full hover:bg-zinc-700 transition-colors text-sm"
              >
                🎬 Jugar otra película
              </button>
            </div>
          </div>
        )}

        {/* Lose state */}
        {failed && (
          <div className="text-center space-y-4">
            <div className="text-xl font-bold text-red-400">
              No era esa... La película era:
            </div>
            <div className="flex justify-center">
              <div className="relative w-40 aspect-[2/3] rounded-lg overflow-hidden shadow-lg">
                <Image
                  src={`https://image.tmdb.org/t/p/w500${targetMovie.poster_path}`}
                  alt={targetMovie.titulo}
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-400">{targetMovie.titulo}</p>
              {targetMovie.titulo_ingles && (
                <p className="text-zinc-400 text-sm">{targetMovie.titulo_ingles}</p>
              )}
              <p className="text-zinc-400 text-sm">
                {targetMovie.anio} &middot; IMDb {targetMovie.nota_imdb}
              </p>
              {targetMovie.enriquecimiento?.director && (
                <p className="text-zinc-500 text-xs mt-1">Dir: {targetMovie.enriquecimiento.director}</p>
              )}
              {targetMovie.enriquecimiento?.generos && (
                <p className="text-zinc-500 text-xs">{targetMovie.enriquecimiento.generos.join(', ')}</p>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              {!isFreeMode && (
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-2 bg-yellow-400 text-black font-bold px-6 py-2.5 rounded-full hover:bg-yellow-300 transition-colors"
                >
                  {copied ? '¡Copiado!' : '📋 Compartir resultado'}
                </button>
              )}
              <button
                onClick={startFreeGame}
                className="inline-flex items-center gap-2 bg-zinc-800 text-yellow-400 border border-zinc-700 font-bold px-6 py-2.5 rounded-full hover:bg-zinc-700 transition-colors text-sm"
              >
                🎬 Jugar otra película
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats modal */}
      {showStats && (
        <div
          className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4"
          onClick={() => setShowStats(false)}
        >
          <div
            className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-yellow-400">Estadísticas</h2>
              <button
                onClick={() => setShowStats(false)}
                className="text-zinc-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6 text-center">
              <div>
                <div className="text-2xl font-bold">{stats.games_played}</div>
                <div className="text-[10px] text-zinc-400 uppercase">Jugadas</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {stats.games_played > 0 ? Math.round((stats.games_won / stats.games_played) * 100) : 0}%
                </div>
                <div className="text-[10px] text-zinc-400 uppercase">Ganadas</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.current_streak}</div>
                <div className="text-[10px] text-zinc-400 uppercase">Racha</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.max_streak}</div>
                <div className="text-[10px] text-zinc-400 uppercase">Max racha</div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-zinc-400 uppercase font-medium mb-2">Distribución</p>
              {stats.guess_distribution.map((count, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-3 text-right">{i + 1}</span>
                  <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className={`h-full rounded flex items-center justify-end px-1.5 text-[10px] font-bold transition-all ${
                        solved && guesses.length === i + 1
                          ? 'bg-green-500 text-white'
                          : 'bg-zinc-600 text-zinc-300'
                      }`}
                      style={{
                        width: `${Math.max((count / maxDist) * 100, count > 0 ? 10 : 0)}%`,
                        minWidth: count > 0 ? '20px' : '0',
                      }}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
