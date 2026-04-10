'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import AuthModal from '@/components/AuthModal'
import {
  PageShell,
  PageHeader,
  Card,
  Button,
  IconButton,
  Pill,
  LoadingState,
  ErrorState,
  Modal,
  Icon,
} from '@/components/ui'
import {
  loadStats as loadGameStatsRemote,
  saveStats as saveGameStatsRemote,
  type GameStats,
  DEFAULT_GAME_STATS,
} from '@/lib/gameStats'

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

// Stats type lives in @/lib/gameStats now (GameStats). Keep a local alias
// so existing references compile without churn.
type Stats = GameStats

const FREE_ROUNDS_PER_DAY = 3
const FREE_ROUNDS_KEY = 'cinebret-adivina-free-rounds'
function getFreeRoundsUsed(date: string): number {
  try {
    const raw = localStorage.getItem(FREE_ROUNDS_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { date: string; count: number }
    if (parsed.date !== date) return 0
    return parsed.count
  } catch { return 0 }
}
function incrementFreeRounds(date: string): number {
  const next = getFreeRoundsUsed(date) + 1
  try { localStorage.setItem(FREE_ROUNDS_KEY, JSON.stringify({ date, count: next })) } catch {}
  return next
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

// Stats persistence delegated to @/lib/gameStats. The wrappers below preserve
// the synchronous API the rest of the file expects:
//   - On mount, the AdivinaPage component fetches once via loadGameStatsRemote
//     and stores the result in `stats` state.
//   - Sync mutations call computeNextStats(prev, ...) and write through both
//     local + remote via saveGameStatsRemote (fire-and-forget).

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
const HOWTO_SEEN_KEY = 'cinebret-adivina-howto-seen'

export default function AdivinaPage() {
  const { user } = useAuth()
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
  const [stats, setStats] = useState<Stats>(DEFAULT_GAME_STATS)
  const [copied, setCopied] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showHowTo, setShowHowTo] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [resultAutoOpened, setResultAutoOpened] = useState(false)
  const [isFreeMode, setIsFreeMode] = useState(false)
  const [allMovies, setAllMovies] = useState<Movie[]>([]) // all valid movies for free mode picks
  const [freeRoundsUsed, setFreeRoundsUsed] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // First-visit instructions modal
  useEffect(() => {
    try {
      if (!localStorage.getItem(HOWTO_SEEN_KEY)) setShowHowTo(true)
    } catch {}
  }, [])

  // Load stats from local (guest) or remote (logged in) on mount and whenever
  // user auth state changes. Logged-in users get the source-of-truth from
  // Supabase; guests fall back to localStorage.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const fresh = await loadGameStatsRemote('adivina', user?.id ?? null)
      if (!cancelled) setStats(fresh)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Helper: write-through save (updates local state + persists to local +
  // remote when applicable). Fire-and-forget — UI doesn't block on the network.
  const persistStats = useCallback((next: Stats) => {
    setStats(next)
    saveGameStatsRemote('adivina', user?.id ?? null, next).catch(() => {})
  }, [user?.id])

  // Timer — only ticks for the daily official game while it's not over and the
  // tab is visible. Persists elapsed seconds in localStorage so a refresh
  // doesn't reset the clock.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const lastTickRef = useRef<number | null>(null)

  const today = useMemo(() => getToday(), [])
  const dayNumber = useMemo(() => getDayNumber(), [])
  const gameOver = solved || failed
  const TIMER_KEY = `cinebret-adivina-timer-${today}`

  // Auto-open result modal once when the game ends. Small delay so the user
  // sees the last guess animate in before the popup covers the screen.
  useEffect(() => {
    if (!gameOver || resultAutoOpened) return
    const t = setTimeout(() => {
      setShowResult(true)
      setResultAutoOpened(true)
    }, 800)
    return () => clearTimeout(t)
  }, [gameOver, resultAutoOpened])

  // Fetch movies
  useEffect(() => {
    async function load() {
      const [raw, graphRes, curatedCatalog] = await Promise.all([
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
        fetch('/curated-catalog.json').then((r) => r.json()).then((d: { ids: string[] }) => new Set(d.ids)).catch(() => null as Set<string> | null),
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

      const allParsed: Movie[] = raw.map((p: any) => ({
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

      // Filter to curated catalog only
      const parsed = curatedCatalog
        ? allParsed.filter((m) => curatedCatalog.has(m.id))
        : allParsed

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

  // Restore persisted timer + free-rounds-used on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY)
      if (raw) {
        const seconds = parseInt(raw, 10)
        if (Number.isFinite(seconds) && seconds >= 0) setElapsedSeconds(seconds)
      }
    } catch {}
    setFreeRoundsUsed(getFreeRoundsUsed(today))
  }, [TIMER_KEY, today])

  // Daily timer — only ticks when:
  //   - Daily mode (not free)
  //   - Game not over
  //   - Tab visible
  //   - Game data loaded
  useEffect(() => {
    if (isFreeMode || gameOver || loading || !targetMovie) return

    let rafActive = true
    function tick() {
      if (!rafActive) return
      const now = Date.now()
      if (lastTickRef.current !== null) {
        const delta = (now - lastTickRef.current) / 1000
        setElapsedSeconds((prev) => {
          const next = prev + delta
          try { localStorage.setItem(TIMER_KEY, String(Math.floor(next))) } catch {}
          return next
        })
      }
      lastTickRef.current = now
    }

    const interval = setInterval(tick, 1000)
    lastTickRef.current = Date.now()

    function handleVisibility() {
      if (document.hidden) {
        rafActive = false
        lastTickRef.current = null
      } else {
        rafActive = true
        lastTickRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      rafActive = false
      lastTickRef.current = null
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isFreeMode, gameOver, loading, targetMovie, TIMER_KEY])

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
          const finalSeconds = Math.floor(elapsedSeconds)
          const next: Stats = { ...stats, guess_distribution: [...stats.guess_distribution] }
          next.games_played += 1
          next.games_won += 1
          next.current_streak += 1
          if (next.current_streak > next.max_streak) next.max_streak = next.current_streak
          next.guess_distribution[newGuesses.length - 1] += 1
          next.last_time_seconds = finalSeconds
          next.total_time_seconds = (next.total_time_seconds ?? 0) + finalSeconds
          if (next.best_time_seconds == null || finalSeconds < next.best_time_seconds) {
            next.best_time_seconds = finalSeconds
          }
          next.last_played_date = today
          persistStats(next)
        }
      } else if (lost) {
        setFailed(true)
        // Only update stats for daily game
        if (!isFreeMode) {
          const finalSeconds = Math.floor(elapsedSeconds)
          const next: Stats = { ...stats, guess_distribution: [...stats.guess_distribution] }
          next.games_played += 1
          next.current_streak = 0
          next.last_time_seconds = finalSeconds
          next.total_time_seconds = (next.total_time_seconds ?? 0) + finalSeconds
          next.last_played_date = today
          persistStats(next)
        }
      }
    },
    [targetMovie, gameOver, guesses, today, graphAdj, isFreeMode, elapsedSeconds, stats, persistStats],
  )

  const startFreeGame = useCallback(() => {
    if (allMovies.length === 0) return
    if (freeRoundsUsed >= FREE_ROUNDS_PER_DAY) return
    const randomIdx = Math.floor(Math.random() * allMovies.length)
    const newTarget = allMovies[randomIdx]
    setTargetMovie(newTarget)
    setGuesses([])
    setSolved(false)
    setFailed(false)
    setIsFreeMode(true)
    setSearchText('')
    setShowSuggestions(false)
    setFreeRoundsUsed(incrementFreeRounds(today))
  }, [allMovies, freeRoundsUsed, today])

  const shareText = useMemo(() => {
    if (!solved && !failed) return ''
    const squares = guesses
      .map((g) => (g.movie.id === targetMovie?.id ? '🟩' : '🟥'))
      .join('')
    const score = solved ? `${guesses.length}/6` : 'X/6'
    const timeLine = !isFreeMode && solved
      ? `\n⏱ ${formatTime(Math.floor(elapsedSeconds))}`
      : ''
    return `🎬 Adivina la Película CineBret #${dayNumber}\n${squares} (${score})${timeLine}\ncinebret.cl/adivina`
  }, [solved, failed, guesses, targetMovie, dayNumber, elapsedSeconds, isFreeMode])

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
  type Hint = { label: string; value: string }
  function getHints(): Hint[] {
    if (!targetMovie) return []
    const enr = targetMovie.enriquecimiento
    const hints: Hint[] = []
    const attempts = guesses.length

    if (attempts >= 1) {
      const decade = getDecade(targetMovie.anio)
      hints.push({
        label: 'Año',
        value: `${targetMovie.anio ?? '?'} (década del ${decade ?? '?'})`,
      })
    }
    if (attempts >= 2 && enr?.generos) {
      hints.push({ label: 'Géneros', value: enr.generos.join(', ') })
    }
    if (attempts >= 3 && enr?.director) {
      hints.push({ label: 'Director', value: `${enr.director.charAt(0)}...` })
    }
    if (attempts >= 4 && enr?.actores) {
      const first = enr.actores.split(',')[0]?.trim()
      if (first) hints.push({ label: 'Actor', value: first })
    }
    if (attempts >= 5 && enr?.sinopsis_chilensis) {
      const firstLine = enr.sinopsis_chilensis.split('.')[0]
      hints.push({ label: 'Sinopsis', value: `"${firstLine}..."` })
    }
    return hints
  }

  /* ─── Render ─── */
  if (loading) {
    return (
      <PageShell maxWidth="lg">
        <LoadingState text="Cargando el desafío..." />
      </PageShell>
    )
  }

  if (!targetMovie) {
    return (
      <PageShell maxWidth="lg">
        <ErrorState
          title="No se pudo cargar el juego"
          description="Inténtalo de nuevo en unos segundos."
          onRetry={() => window.location.reload()}
        />
      </PageShell>
    )
  }

  const blurPx = gameOver ? 0 : getBlur(guesses.length)
  const hints = getHints()
  const maxDist = Math.max(...stats.guess_distribution, 1)

  type CategoryKey = 'DEC' | 'GEN' | 'DIR' | 'CAST' | 'OSC' | 'COMP' | 'MOOD'
  const CATEGORY_LABELS: Record<CategoryKey, string> = {
    DEC: 'Década',
    GEN: 'Género',
    DIR: 'Director',
    CAST: 'Reparto',
    OSC: 'Estado Oscars',
    COMP: 'Compositor',
    MOOD: 'Mood CineBret',
  }
  const CATEGORY_DESCRIPTIONS: Record<CategoryKey, string> = {
    DEC: 'Misma década',
    GEN: 'Comparte algún género',
    DIR: 'Mismo director',
    CAST: 'Comparte algún actor',
    OSC: 'Mismo estado de Oscar',
    COMP: 'Mismo compositor',
    MOOD: 'Misma categoría CineBret',
  }

  function CategoryChip({
    code,
    match,
  }: {
    code: CategoryKey
    match: boolean
  }) {
    return (
      <span
        title={CATEGORY_LABELS[code]}
        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
          match
            ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
            : 'bg-zinc-800 text-zinc-500 border border-zinc-800'
        }`}
      >
        {code}
      </span>
    )
  }

  return (
    <PageShell maxWidth="lg">
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
                className="w-1.5 h-3 rounded-sm bg-yellow-400"
                style={{
                  transform: `rotate(${Math.random() * 360}deg)`,
                  opacity: 0.6 + Math.random() * 0.4,
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

      <PageHeader
        title="Adivina la Película"
        subtitle={
          isFreeMode
            ? `Modo libre · ronda ${freeRoundsUsed}/${FREE_ROUNDS_PER_DAY} · ${guesses.length}/6 intentos`
            : `Desafío diario #${dayNumber} · ${guesses.length}/6 intentos · ⏱ ${formatTime(Math.floor(elapsedSeconds))}`
        }
        icon={<Icon.Sparkles className="w-7 h-7" />}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Icon.Trophy className="w-4 h-4" />}
              onClick={async () => {
                const fresh = await loadGameStatsRemote('adivina', user?.id ?? null)
                setStats(fresh)
                setShowStats(true)
              }}
            >
              Estadísticas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Icon.Info className="w-4 h-4" />}
              onClick={() => setShowLegend((v) => !v)}
            >
              Siglas
            </Button>
            <IconButton
              icon={<Icon.Info className="w-4 h-4" />}
              label="Cómo jugar"
              variant="ghost"
              size="sm"
              onClick={() => setShowHowTo(true)}
            />
          </>
        }
      />

      {/* Legend */}
      {showLegend && (
        <Card padding="md" className="mb-6">
          <p className="text-yellow-400 font-bold text-sm mb-3">
            ¿Qué significa cada sigla?
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs text-zinc-300">
                <span className="inline-flex items-center justify-center w-12 shrink-0 px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 border border-yellow-400/30 font-bold text-[10px] uppercase tracking-wide">
                  {k}
                </span>
                <span className="text-zinc-400">
                  <span className="text-white font-semibold">
                    {CATEGORY_LABELS[k]}
                  </span>{' '}
                  — {CATEGORY_DESCRIPTIONS[k]}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Backdrop image */}
      <Card padding="none" className="overflow-hidden mb-6">
        <div className="relative w-full aspect-video bg-zinc-950">
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
              <span
                aria-hidden="true"
                className="text-6xl font-black text-white/20 select-none"
              >
                ?
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Hints */}
      {hints.length > 0 && !gameOver && (
        <div className="mb-6 space-y-2">
          {hints.map((h, i) => (
            <Card key={i} padding="sm" className="flex items-start gap-3">
              <span className="text-yellow-400 mt-0.5">
                <Icon.Sparkles className="w-4 h-4" />
              </span>
              <div className="text-sm text-zinc-300 leading-relaxed">
                <span className="text-zinc-500 font-semibold uppercase tracking-wide text-[10px] mr-2">
                  {h.label}
                </span>
                {h.value}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Guess list */}
      {guesses.length > 0 && (
        <div className="mb-6 space-y-3">
          {guesses.map((g, i) => {
            const isCorrect = g.movie.id === targetMovie.id
            const pct = distanceToPercent(g.graphDistance)
            return (
              <Card
                key={i}
                padding="sm"
                className={
                  isCorrect
                    ? 'ring-1 ring-yellow-400/50 bg-yellow-400/5'
                    : ''
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isCorrect ? 'text-yellow-400' : 'text-zinc-500'
                    }
                    aria-hidden="true"
                  >
                    {isCorrect ? (
                      <Icon.Check className="w-4 h-4" />
                    ) : (
                      <Icon.Close className="w-4 h-4" />
                    )}
                  </span>
                  <span className="text-sm font-semibold text-white flex-1 truncate">
                    {g.movie.titulo}{' '}
                    <span className="text-zinc-500 font-normal">
                      ({g.movie.anio ?? '?'})
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <CategoryChip code="DEC" match={g.matchDecade} />
                  <CategoryChip code="GEN" match={g.matchGenre} />
                  <CategoryChip code="DIR" match={g.matchDirector} />
                  <CategoryChip code="CAST" match={g.matchCast} />
                  <CategoryChip code="OSC" match={g.matchOscars} />
                  <CategoryChip code="COMP" match={g.matchCompositor} />
                  <CategoryChip code="MOOD" match={g.matchMood} />
                </div>
                {!isCorrect && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-yellow-400 tabular-nums">
                      Conexión {pct}%
                    </span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-yellow-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Search input */}
      {!gameOver && (
        <div className="relative mb-6" ref={suggestionsRef}>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
              <Icon.Search className="w-5 h-5" />
            </span>
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
              className="w-full min-h-[52px] bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </div>
          {showSuggestions && filteredMovies.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden z-20 max-h-72 overflow-y-auto shadow-2xl">
              {filteredMovies.map((m) => (
                <button
                  key={m.id}
                  onClick={() => submitGuess(m)}
                  className="w-full text-left px-4 py-3 min-h-[44px] hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
                >
                  <span className="text-white text-sm font-semibold">
                    {m.titulo}
                  </span>
                  {m.titulo_ingles && (
                    <span className="text-zinc-500 text-xs ml-2">
                      ({m.titulo_ingles})
                    </span>
                  )}
                  {m.anio && (
                    <span className="text-zinc-500 text-xs ml-1">
                      · {Math.floor(m.anio / 10) * 10}s
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result state (win / lose) */}
      {gameOver && (
        <Card padding="md" className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            {solved ? (
              <Pill variant="gold" size="md" icon={<Icon.Check className="w-4 h-4" />}>
                ¡Adivinaste!
              </Pill>
            ) : (
              <Pill variant="default" size="md" icon={<Icon.Close className="w-4 h-4" />}>
                No acertaste
              </Pill>
            )}
          </div>
          <p className="text-zinc-400 text-xs">La película era</p>
          <p className="text-base font-black text-yellow-400 mt-0.5">{targetMovie.titulo}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            iconLeft={<Icon.Trophy className="w-4 h-4" />}
            onClick={() => setShowResult(true)}
          >
            Ver resultado
          </Button>
        </Card>
      )}

      {/* Stats modal */}
      <Modal
        open={showStats}
        onClose={() => setShowStats(false)}
        title="Estadísticas"
        size="sm"
      >
        <div className="grid grid-cols-4 gap-3 mb-6 text-center">
          <div>
            <div className="text-2xl font-black text-yellow-400 tabular-nums">
              {stats.games_played}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Jugadas
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-yellow-400 tabular-nums">
              {stats.games_played > 0
                ? Math.round((stats.games_won / stats.games_played) * 100)
                : 0}
              %
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Ganadas
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-yellow-400 tabular-nums">
              {stats.current_streak}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Racha
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-yellow-400 tabular-nums">
              {stats.max_streak}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Máx. racha
            </div>
          </div>
        </div>

        {/* Time stats — only daily */}
        <div className="grid grid-cols-3 gap-3 mb-6 text-center">
          <div>
            <div className="text-xl font-black text-yellow-400 tabular-nums">
              {stats.last_time_seconds != null ? formatTime(stats.last_time_seconds) : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Hoy
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-yellow-400 tabular-nums">
              {stats.best_time_seconds != null ? formatTime(stats.best_time_seconds) : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Mejor
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-yellow-400 tabular-nums">
              {stats.total_time_seconds != null && stats.games_played > 0
                ? formatTime(Math.round(stats.total_time_seconds / stats.games_played))
                : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mt-1">
              Promedio
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wide mb-2">
            Distribución
          </p>
          {stats.guess_distribution.map((count, i) => {
            const isHighlight = solved && guesses.length === i + 1
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 w-3 text-right font-bold">
                  {i + 1}
                </span>
                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                  <div
                    className={`h-full rounded flex items-center justify-end px-1.5 text-[10px] font-bold transition-all ${
                      isHighlight
                        ? 'bg-yellow-400 text-zinc-950'
                        : 'bg-zinc-700 text-zinc-300'
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
            )
          })}
        </div>

        {/* Source-of-truth caption */}
        <p className="mt-4 pt-3 border-t border-zinc-800 text-[10px] text-zinc-600 text-center">
          {user
            ? 'Sincronizado en tu cuenta'
            : 'Solo en este dispositivo · iniciá sesión para sincronizar'}
        </p>
      </Modal>

      {/* ─── Result modal — auto-opens at end of game ─── */}
      <Modal
        open={showResult && gameOver && !!targetMovie}
        onClose={() => setShowResult(false)}
        title={solved ? '¡Adivinaste!' : 'No acertaste'}
        size="sm"
      >
        {targetMovie && (
          <div className="text-center">
            {/* Poster + title */}
            <div className="flex justify-center mb-3">
              <div className="relative w-32 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-800">
                <Image
                  src={`https://image.tmdb.org/t/p/w500${targetMovie.poster_path}`}
                  alt={targetMovie.titulo}
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <p className="text-lg font-black text-yellow-400">{targetMovie.titulo}</p>
            {targetMovie.titulo_ingles && targetMovie.titulo_ingles !== targetMovie.titulo && (
              <p className="text-zinc-400 text-xs">{targetMovie.titulo_ingles}</p>
            )}
            <p className="text-zinc-500 text-xs mt-1">
              {targetMovie.anio} · IMDb {targetMovie.nota_imdb}
              {!isFreeMode && solved && elapsedSeconds > 0 && ` · ⏱ ${formatTime(Math.floor(elapsedSeconds))}`}
            </p>

            {/* Logged-in: stats grid */}
            {user && !isFreeMode && (
              <div className="mt-5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">
                  Tus estadísticas
                </p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="bg-zinc-950/60 rounded-lg py-2">
                    <div className="text-lg font-black text-yellow-400 tabular-nums">{stats.games_played}</div>
                    <div className="text-[9px] text-zinc-500 uppercase font-bold">Jugadas</div>
                  </div>
                  <div className="bg-zinc-950/60 rounded-lg py-2">
                    <div className="text-lg font-black text-yellow-400 tabular-nums">
                      {stats.games_played > 0 ? Math.round((stats.games_won / stats.games_played) * 100) : 0}%
                    </div>
                    <div className="text-[9px] text-zinc-500 uppercase font-bold">Ganadas</div>
                  </div>
                  <div className="bg-zinc-950/60 rounded-lg py-2">
                    <div className="text-lg font-black text-yellow-400 tabular-nums">{stats.current_streak}</div>
                    <div className="text-[9px] text-zinc-500 uppercase font-bold">Racha</div>
                  </div>
                  <div className="bg-zinc-950/60 rounded-lg py-2">
                    <div className="text-lg font-black text-yellow-400 tabular-nums">{stats.max_streak}</div>
                    <div className="text-[9px] text-zinc-500 uppercase font-bold">Máx</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  iconLeft={<Icon.Trophy className="w-4 h-4" />}
                  onClick={() => {
                    setShowResult(false)
                    setShowStats(true)
                  }}
                >
                  Ver estadísticas completas
                </Button>
              </div>
            )}

            {/* Guest: login CTA */}
            {!user && !isFreeMode && (
              <div className="mt-5 bg-yellow-400/5 border border-yellow-400/30 rounded-xl p-4">
                <div className="flex items-start gap-3 text-left">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center">
                    <Icon.Trophy className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">Guardá tu progreso</p>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      Iniciá sesión para llevar tus rachas y stats en todos tus dispositivos.
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  fullWidth
                  className="mt-3"
                  iconLeft={<Icon.User className="w-4 h-4" />}
                  onClick={() => {
                    setShowResult(false)
                    setShowAuth(true)
                  }}
                >
                  Iniciar sesión / Crear cuenta
                </Button>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-5 flex flex-col gap-2">
              {!isFreeMode && (
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleShare}
                  iconLeft={<Icon.Share className="w-4 h-4" />}
                >
                  {copied ? '¡Copiado!' : 'Compartir resultado'}
                </Button>
              )}
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setShowResult(false)
                  startFreeGame()
                }}
                iconLeft={<Icon.Refresh className="w-4 h-4" />}
                disabled={freeRoundsUsed >= FREE_ROUNDS_PER_DAY}
              >
                {freeRoundsUsed >= FREE_ROUNDS_PER_DAY
                  ? `Sin rondas extra (${FREE_ROUNDS_PER_DAY}/${FREE_ROUNDS_PER_DAY})`
                  : `Jugar otra (${freeRoundsUsed}/${FREE_ROUNDS_PER_DAY})`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── How to play modal ─── */}
      <Modal
        open={showHowTo}
        onClose={() => {
          setShowHowTo(false)
          try { localStorage.setItem(HOWTO_SEEN_KEY, '1') } catch {}
        }}
        title="Cómo jugar"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-zinc-300 text-sm leading-relaxed">
            Adiviná la película del día en <span className="font-bold text-yellow-400">6 intentos</span>.
            Cada intento te da pistas: cuanto más cerca estés, más datos compartirá con la película secreta.
          </p>

          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">
              Después de cada intento
            </p>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <Icon.Check className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <span>Si la pista coincide (mismo director, género, década, etc.) se marca en dorado.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon.Close className="w-4 h-4 text-zinc-600 mt-0.5 shrink-0" />
                <span>Si no coincide, se queda en gris.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icon.Eye className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <span>La imagen detrás se va revelando con cada intento.</span>
              </li>
            </ul>
          </div>

          <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2">
              Pistas que comparamos
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <span className="text-zinc-400"><span className="text-white font-semibold">DEC</span> · Década</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">GEN</span> · Género</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">DIR</span> · Director</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">CAST</span> · Reparto</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">OSC</span> · Óscar</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">COMP</span> · Compositor</span>
              <span className="text-zinc-400"><span className="text-white font-semibold">MOOD</span> · Categoría</span>
            </div>
          </div>

          <p className="text-zinc-500 text-xs leading-relaxed">
            Hay un desafío diario para todos. Después podés jugar hasta {FREE_ROUNDS_PER_DAY} rondas extra al azar (no cuentan para tu racha).
          </p>

          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setShowHowTo(false)
              try { localStorage.setItem(HOWTO_SEEN_KEY, '1') } catch {}
            }}
          >
            Empezar a jugar
          </Button>
        </div>
      </Modal>

      {/* Auth modal — login / signup */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </PageShell>
  )
}
