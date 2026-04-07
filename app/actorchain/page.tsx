'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

type CastMember = {
  name: string
  profile_path: string | null
  character: string
  order: number
}

type Movie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string
}

type Challenge = {
  startMovie: Movie
  targetMovie: Movie
  optimalPath: string[]
}

type ChainLink = {
  movie: Movie
  actor: CastMember | null
}

type GameStatus = 'loading' | 'intro' | 'playing' | 'won' | 'lost' | 'already-played'
type Feedback = 'closer' | 'further' | null

type DailyResult = {
  won: boolean
  steps: number
  optimal: number
  completed: boolean
  chainTitles?: string[]
}

type Stats = {
  played: number
  won: number
  current_streak: number
  max_streak: number
  distribution: number[]
}

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500'
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185'
const PAGE_SIZE = 1000
const EPOCH = new Date('2026-01-01T00:00:00Z').getTime()

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function dailySeed(): number {
  const today = todayKey()
  let h = 0
  for (let i = 0; i < today.length; i++) h = ((h << 5) - h) + today.charCodeAt(i)
  return Math.abs(h)
}

function dayNumber(): number {
  const now = new Date()
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(1, Math.floor((t - EPOCH) / 86400000) + 1)
}

function bfs(
  actorToMovies: Map<string, Set<string>>,
  movieToActors: Map<string, CastMember[]>,
  startId: string,
  endId: string,
  maxDepth: number = 8
): string[] | null {
  if (startId === endId) return [startId]
  const visited = new Set<string>([startId])
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }]
  while (queue.length) {
    const { id, path } = queue.shift()!
    if (path.length > maxDepth) continue
    const cast = movieToActors.get(id)
    if (!cast) continue
    for (const actor of cast) {
      const movies = actorToMovies.get(actor.name)
      if (!movies) continue
      for (const nextId of movies) {
        if (visited.has(nextId)) continue
        if (nextId === endId) return [...path, nextId]
        visited.add(nextId)
        queue.push({ id: nextId, path: [...path, nextId] })
      }
    }
  }
  return null
}

function bfsDistance(
  actorToMovies: Map<string, Set<string>>,
  movieToActors: Map<string, CastMember[]>,
  startId: string,
  endId: string,
  maxDepth: number = 8
): number {
  const path = bfs(actorToMovies, movieToActors, startId, endId, maxDepth)
  if (!path) return Infinity
  return path.length - 1
}

export default function ActorChainPage() {
  const [status, setStatus] = useState<GameStatus>('loading')
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadLabel, setLoadLabel] = useState('Cargando universo cinematográfico…')

  const actorToMoviesRef = useRef<Map<string, Set<string>>>(new Map())
  const movieToActorsRef = useRef<Map<string, CastMember[]>>(new Map())
  const movieMapRef = useRef<Map<string, Movie>>(new Map())

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [chain, setChain] = useState<ChainLink[]>([])
  const [usedMovies, setUsedMovies] = useState<Set<string>>(new Set())
  const [usedActors, setUsedActors] = useState<Set<string>>(new Set())
  const [currentChoices, setCurrentChoices] = useState<CastMember[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [prevDistance, setPrevDistance] = useState<number>(Infinity)
  const [currentDistance, setCurrentDistance] = useState<number>(Infinity)
  const [transitioning, setTransitioning] = useState(false)
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null)
  const [showShareCopied, setShowShareCopied] = useState(false)

  const dayNum = useMemo(() => dayNumber(), [])

  // ---------- Data Loading ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadLabel('Cargando películas…')
        const movies: Movie[] = []
        {
          let from = 0
          while (true) {
            const { data, error } = await supabase
              .from('peliculas')
              .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path')
              .gte('nota_imdb', 6.5)
              .not('poster_path', 'is', null)
              .order('id', { ascending: true })
              .range(from, from + PAGE_SIZE - 1)
            if (error) throw error
            if (!data || data.length === 0) break
            movies.push(...(data as Movie[]))
            if (!cancelled) setLoadProgress(Math.min(40, Math.round((movies.length / 3000) * 40)))
            if (data.length < PAGE_SIZE) break
            from += PAGE_SIZE
          }
        }
        if (cancelled) return

        setLoadLabel('Cargando elencos…')
        const enrichRows: Array<{ pelicula_id: string; cast_json: CastMember[] }> = []
        {
          let from = 0
          while (true) {
            const { data, error } = await supabase
              .from('enriquecimiento')
              .select('pelicula_id, cast_json')
              .not('cast_json', 'is', null)
              .order('pelicula_id', { ascending: true })
              .range(from, from + PAGE_SIZE - 1)
            if (error) throw error
            if (!data || data.length === 0) break
            for (const r of data as Array<{ pelicula_id: string; cast_json: unknown }>) {
              if (Array.isArray(r.cast_json)) {
                enrichRows.push({ pelicula_id: r.pelicula_id, cast_json: r.cast_json as CastMember[] })
              }
            }
            if (!cancelled) setLoadProgress(40 + Math.min(40, Math.round((enrichRows.length / 3000) * 40)))
            if (data.length < PAGE_SIZE) break
            from += PAGE_SIZE
          }
        }
        if (cancelled) return

        setLoadLabel('Tejiendo conexiones…')
        const movieMap = new Map<string, Movie>()
        for (const m of movies) movieMap.set(String(m.id), m)

        const movieToActors = new Map<string, CastMember[]>()
        const rawActorToMovies = new Map<string, Set<string>>()

        for (const row of enrichRows) {
          const mid = String(row.pelicula_id)
          if (!movieMap.has(mid)) continue
          const topCast = row.cast_json
            .filter((c) => c && typeof c.name === 'string')
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
            .slice(0, 15)
          movieToActors.set(mid, topCast)
          for (const actor of topCast) {
            if (!rawActorToMovies.has(actor.name)) rawActorToMovies.set(actor.name, new Set())
            rawActorToMovies.get(actor.name)!.add(mid)
          }
        }

        // keep actors in 2+ movies
        const actorToMovies = new Map<string, Set<string>>()
        for (const [name, set] of rawActorToMovies) {
          if (set.size >= 2) actorToMovies.set(name, set)
        }
        // filter movieToActors to only include kept actors
        for (const [mid, cast] of movieToActors) {
          movieToActors.set(mid, cast.filter((c) => actorToMovies.has(c.name)))
        }

        actorToMoviesRef.current = actorToMovies
        movieToActorsRef.current = movieToActors
        movieMapRef.current = movieMap

        setLoadProgress(90)
        setLoadLabel('Eligiendo desafío del día…')

        // ---------- Pick daily challenge ----------
        const candidates: Movie[] = []
        for (const [mid, cast] of movieToActors) {
          const m = movieMap.get(mid)
          if (!m) continue
          if ((m.nota_imdb ?? 0) < 7.5) continue
          if (cast.length < 5) continue
          candidates.push(m)
        }
        candidates.sort((a, b) => String(a.id).localeCompare(String(b.id)))

        if (candidates.length < 2) throw new Error('No hay suficientes películas para un desafío')

        const seed = dailySeed()
        let picked: Challenge | null = null
        const aIdx = seed % candidates.length
        const startMovie = candidates[aIdx]
        // try up to N candidates for B
        const tryOrder: number[] = []
        for (let i = 0; i < candidates.length; i++) {
          tryOrder.push((aIdx + 1 + ((seed >> 3) + i * 97)) % candidates.length)
        }
        for (const bIdx of tryOrder) {
          if (bIdx === aIdx) continue
          const endMovie = candidates[bIdx]
          const path = bfs(actorToMovies, movieToActors, String(startMovie.id), String(endMovie.id), 6)
          if (!path) continue
          const dist = path.length - 1
          if (dist >= 3 && dist <= 5) {
            picked = { startMovie, targetMovie: endMovie, optimalPath: path }
            break
          }
        }
        // Fallback: accept distance 2-6
        if (!picked) {
          for (const bIdx of tryOrder) {
            if (bIdx === aIdx) continue
            const endMovie = candidates[bIdx]
            const path = bfs(actorToMovies, movieToActors, String(startMovie.id), String(endMovie.id), 7)
            if (!path) continue
            const dist = path.length - 1
            if (dist >= 2 && dist <= 6) {
              picked = { startMovie, targetMovie: endMovie, optimalPath: path }
              break
            }
          }
        }
        if (!picked) throw new Error('No se pudo generar el desafío del día')

        if (cancelled) return
        setChallenge(picked)
        setLoadProgress(100)

        // Check if already played
        const stored = typeof window !== 'undefined'
          ? window.localStorage.getItem(`actorchain-daily-${todayKey()}`)
          : null
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as DailyResult
            if (parsed.completed) {
              setDailyResult(parsed)
              setStatus('already-played')
              return
            }
          } catch {}
        }

        setStatus('intro')
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setLoadLabel('Error cargando el desafío. Intenta recargar.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ---------- A* Actor Recommendations ----------
  const computeChoices = useCallback(
    (currentMovieId: string, targetId: string, usedM: Set<string>, usedA: Set<string>) => {
      const actorToMovies = actorToMoviesRef.current
      const movieToActors = movieToActorsRef.current
      const cast = movieToActors.get(currentMovieId) || []
      const scored: Array<{ actor: CastMember; score: number; movieCount: number }> = []
      for (const actor of cast) {
        if (usedA.has(actor.name)) continue
        const movies = actorToMovies.get(actor.name)
        if (!movies) continue
        let best = Infinity
        let viableCount = 0
        for (const nextId of movies) {
          if (nextId === currentMovieId) continue
          if (usedM.has(nextId)) continue
          viableCount++
          if (nextId === targetId) { best = 1; continue }
          const d = bfsDistance(actorToMovies, movieToActors, nextId, targetId, 6)
          const total = d + 1
          if (total < best) best = total
        }
        if (viableCount === 0) continue
        scored.push({ actor, score: best, movieCount: movies.size })
      }
      scored.sort((a, b) => a.score - b.score || b.movieCount - a.movieCount)
      return scored.slice(0, 3).map((s) => s.actor)
    },
    []
  )

  // ---------- Start game ----------
  const startGame = useCallback(() => {
    if (!challenge) return
    const startId = String(challenge.startMovie.id)
    const targetId = String(challenge.targetMovie.id)
    const initialChain: ChainLink[] = [{ movie: challenge.startMovie, actor: null }]
    const um = new Set<string>([startId])
    const ua = new Set<string>()
    setChain(initialChain)
    setUsedMovies(um)
    setUsedActors(ua)
    const choices = computeChoices(startId, targetId, um, ua)
    setCurrentChoices(choices)
    const d = bfsDistance(actorToMoviesRef.current, movieToActorsRef.current, startId, targetId, 8)
    setPrevDistance(d)
    setCurrentDistance(d)
    setFeedback(null)
    setStatus('playing')
  }, [challenge, computeChoices])

  // ---------- Persist daily result ----------
  const persistResult = useCallback((result: DailyResult) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`actorchain-daily-${todayKey()}`, JSON.stringify(result))
    const statsRaw = window.localStorage.getItem('actorchain-stats')
    let stats: Stats = statsRaw
      ? JSON.parse(statsRaw)
      : { played: 0, won: 0, current_streak: 0, max_streak: 0, distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    stats.played++
    if (result.won) {
      stats.won++
      stats.current_streak++
      if (stats.current_streak > stats.max_streak) stats.max_streak = stats.current_streak
      const idx = Math.min(9, Math.max(0, result.steps - 1))
      stats.distribution[idx] = (stats.distribution[idx] || 0) + 1
    } else {
      stats.current_streak = 0
    }
    window.localStorage.setItem('actorchain-stats', JSON.stringify(stats))
  }, [])

  // ---------- Pick an actor ----------
  const pickActor = useCallback(
    (actor: CastMember) => {
      if (!challenge || transitioning || status !== 'playing') return
      const currentLink = chain[chain.length - 1]
      if (!currentLink) return
      const currentMovieId = String(currentLink.movie.id)
      const targetId = String(challenge.targetMovie.id)
      const actorToMovies = actorToMoviesRef.current
      const movieToActors = movieToActorsRef.current
      const movieMap = movieMapRef.current

      const actorMovies = actorToMovies.get(actor.name)
      if (!actorMovies) return

      // Pick next movie: prefer target, else one closest to target not used
      let nextId: string | null = null
      let nextDist = Infinity
      for (const mid of actorMovies) {
        if (mid === currentMovieId) return // defensive
        if (usedMovies.has(mid)) continue
        if (mid === targetId) { nextId = mid; nextDist = 0; break }
        const d = bfsDistance(actorToMovies, movieToActors, mid, targetId, 6)
        if (d < nextDist) {
          nextDist = d
          nextId = mid
        }
      }
      if (!nextId) return
      const nextMovie = movieMap.get(nextId)
      if (!nextMovie) return

      setTransitioning(true)

      const newChainLink: ChainLink = { movie: nextMovie, actor }
      const newChain = [...chain.slice(0, -1), { ...currentLink, actor }, newChainLink]
      const newUsedMovies = new Set(usedMovies); newUsedMovies.add(nextId)
      const newUsedActors = new Set(usedActors); newUsedActors.add(actor.name)

      const newDistance = nextId === targetId ? 0 : nextDist

      // feedback vs prevDistance
      let fb: Feedback = null
      if (newDistance < prevDistance) fb = 'closer'
      else if (newDistance > prevDistance) fb = 'further'

      setTimeout(() => {
        setChain(newChain)
        setUsedMovies(newUsedMovies)
        setUsedActors(newUsedActors)
        setPrevDistance(newDistance)
        setCurrentDistance(newDistance)
        setFeedback(fb)

        const steps = newChain.length - 1
        const optimal = challenge.optimalPath.length - 1

        if (nextId === targetId) {
          setCurrentChoices([])
          setStatus('won')
          const result: DailyResult = {
            won: true,
            steps,
            optimal,
            completed: true,
            chainTitles: newChain.map((c) => c.movie.titulo),
          }
          persistResult(result)
          setDailyResult(result)
        } else if (steps > optimal * 2) {
          setCurrentChoices([])
          setStatus('lost')
          const result: DailyResult = {
            won: false,
            steps,
            optimal,
            completed: true,
            chainTitles: newChain.map((c) => c.movie.titulo),
          }
          persistResult(result)
          setDailyResult(result)
        } else {
          const choices = computeChoices(nextId!, targetId, newUsedMovies, newUsedActors)
          if (choices.length === 0) {
            setStatus('lost')
            const result: DailyResult = {
              won: false,
              steps,
              optimal,
              completed: true,
              chainTitles: newChain.map((c) => c.movie.titulo),
            }
            persistResult(result)
            setDailyResult(result)
          } else {
            setCurrentChoices(choices)
          }
        }

        // Clear feedback after ~1s
        setTimeout(() => setFeedback(null), 1100)
        setTransitioning(false)
      }, 450)
    },
    [challenge, chain, usedMovies, usedActors, prevDistance, transitioning, status, computeChoices, persistResult]
  )

  // ---------- Share ----------
  const shareText = useMemo(() => {
    if (!dailyResult || !challenge) return ''
    const optimal = dailyResult.optimal
    const steps = dailyResult.steps
    const stars = dailyResult.won
      ? (steps === optimal ? '⭐⭐⭐' : steps === optimal + 1 ? '⭐⭐' : steps <= optimal + 2 ? '⭐' : '')
      : '💔'
    const diagram = dailyResult.won || dailyResult.completed
      ? (dailyResult.chainTitles ?? []).map(() => '🎬').join(' 🎭 ')
      : '🎬 💔 🎬'
    return `🎬 ActorChain CineBret #${dayNum}\n${stars} ${steps}/${optimal} pasos\n${diagram}\ncinebret.cl/actorchain`
  }, [dailyResult, challenge, dayNum])

  const handleShare = useCallback(async () => {
    if (!shareText) return
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
        setShowShareCopied(true)
        setTimeout(() => setShowShareCopied(false), 1800)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareText)
        setShowShareCopied(true)
        setTimeout(() => setShowShareCopied(false), 1800)
      } catch {}
    }
  }, [shareText])

  // ---------- Derived ----------
  const currentLink = chain[chain.length - 1]
  const currentMovie = currentLink?.movie ?? null
  const steps = Math.max(0, chain.length - 1)
  const optimal = challenge ? challenge.optimalPath.length - 1 : 0
  const maxAllowed = optimal * 2
  const starCount = dailyResult && dailyResult.won
    ? (dailyResult.steps === optimal ? 3 : dailyResult.steps === optimal + 1 ? 2 : dailyResult.steps <= optimal + 2 ? 1 : 0)
    : 0

  // ---------- Render ----------
  return (
    <div
      className="fixed inset-0 w-screen overflow-hidden bg-black text-white"
      style={{ height: '100dvh', touchAction: 'manipulation' }}
    >
      {/* Background poster */}
      <AnimatePresence mode="wait">
        {currentMovie && (status === 'playing' || status === 'won' || status === 'lost') && (
          <motion.div
            key={`bg-${currentMovie.id}`}
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <Image
              src={`${POSTER_BASE}${currentMovie.poster_path}`}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover blur-xl scale-110 opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/95" />
            <div className="absolute inset-0 bg-black/40" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOADING */}
      {status === 'loading' && (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="mb-6 text-5xl">🎬</div>
            <div className="text-xl font-semibold tracking-tight">ActorChain</div>
            <div className="mt-1 text-sm text-white/60">{loadLabel}</div>
            <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 to-rose-500"
                initial={{ width: 0 }}
                animate={{ width: `${loadProgress}%` }}
                transition={{ ease: 'easeOut', duration: 0.4 }}
              />
            </div>
          </motion.div>
        </div>
      )}

      {/* INTRO */}
      {status === 'intro' && challenge && (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md text-center"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-amber-400">Desafío diario #{dayNum}</div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">ActorChain</h1>
            <p className="mt-3 text-sm text-white/70">
              Conecta dos películas a través de actores compartidos. Mientras más corta la cadena, mejor.
            </p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <motion.div
                initial={{ rotate: -6, opacity: 0 }}
                animate={{ rotate: -6, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative aspect-[2/3] w-28 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
              >
                <Image
                  src={`${POSTER_BASE}${challenge.startMovie.poster_path}`}
                  alt={challenge.startMovie.titulo}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </motion.div>
              <motion.div
                animate={{ x: [0, 6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="text-3xl text-white/60"
              >
                →
              </motion.div>
              <motion.div
                initial={{ rotate: 6, opacity: 0 }}
                animate={{ rotate: 6, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="relative aspect-[2/3] w-28 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
              >
                <Image
                  src={`${POSTER_BASE}${challenge.targetMovie.poster_path}`}
                  alt={challenge.targetMovie.titulo}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </motion.div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-300">
                {challenge.startMovie.titulo}
              </div>
              <span className="text-white/40">a</span>
              <div className="rounded-full bg-rose-500/20 px-3 py-1 text-rose-300">
                {challenge.targetMovie.titulo}
              </div>
            </div>

            <div className="mt-4 text-xs text-white/50">
              Ruta óptima: {optimal} {optimal === 1 ? 'paso' : 'pasos'} · Máximo permitido: {maxAllowed}
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              onClick={startGame}
              className="mt-8 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 px-8 py-4 text-lg font-bold tracking-wide text-black shadow-2xl shadow-rose-500/30"
            >
              JUGAR
            </motion.button>

            <div className="mt-6">
              <Link href="/" className="text-xs text-white/40 hover:text-white/70">
                ← volver a cinebret
              </Link>
            </div>
          </motion.div>
        </div>
      )}

      {/* ALREADY PLAYED */}
      {status === 'already-played' && dailyResult && challenge && (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md text-center"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-amber-400">Desafío #{dayNum}</div>
            <h1 className="mt-2 text-2xl font-bold">
              {dailyResult.won ? '¡Ya completaste hoy!' : 'Cadena rota de hoy'}
            </h1>
            <div className="mt-4 text-5xl">
              {dailyResult.won
                ? (dailyResult.steps === dailyResult.optimal ? '⭐⭐⭐' : dailyResult.steps === dailyResult.optimal + 1 ? '⭐⭐' : '⭐')
                : '💔'}
            </div>
            <div className="mt-3 text-lg">
              {dailyResult.steps}/{dailyResult.optimal} pasos
            </div>
            <div className="mt-8 text-sm text-white/60">Vuelve mañana para el próximo desafío</div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleShare}
                className="flex-1 rounded-2xl bg-white/10 px-6 py-3 font-semibold backdrop-blur hover:bg-white/20"
              >
                {showShareCopied ? '¡Copiado!' : 'Compartir'}
              </button>
              <Link
                href="/"
                className="flex-1 rounded-2xl bg-white/5 px-6 py-3 text-center font-semibold backdrop-blur hover:bg-white/10"
              >
                Volver
              </Link>
            </div>
          </motion.div>
        </div>
      )}

      {/* PLAYING */}
      {status === 'playing' && challenge && currentMovie && (
        <>
          {/* Top HUD: breadcrumbs + target */}
          <div className="absolute left-0 right-0 top-0 z-20 px-3 pt-[max(env(safe-area-inset-top),12px)]">
            <div className="flex items-center gap-2">
              <div className="flex-1 overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1.5 backdrop-blur-xl ring-1 ring-white/10">
                  <AnimatePresence initial={false}>
                    {chain.map((link, i) => {
                      const isFirst = i === 0
                      const isCurrent = i === chain.length - 1
                      return (
                        <motion.div
                          key={`${link.movie.id}-${i}`}
                          layout
                          initial={{ scale: 0.6, opacity: 0, y: -8 }}
                          animate={{
                            scale: 1,
                            opacity: 1,
                            y: 0,
                            rotate: 0,
                            x: 0,
                          }}
                          exit={{
                            scale: 0,
                            rotate: Math.random() * 60 - 30,
                            x: Math.random() * 200 - 100,
                            y: Math.random() * 200,
                            opacity: 0,
                          }}
                          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                          className="flex items-center gap-1.5 shrink-0"
                        >
                          {i > 0 && <span className="text-[10px] text-white/40">→</span>}
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ${
                              isFirst
                                ? 'bg-emerald-500/30 text-emerald-100 ring-emerald-400/40'
                                : isCurrent
                                ? 'bg-amber-400/30 text-amber-100 ring-amber-400/40'
                                : 'bg-white/10 text-white/80 ring-white/10'
                            }`}
                          >
                            <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/20">
                              <Image
                                src={`${POSTER_BASE}${link.movie.poster_path}`}
                                alt=""
                                fill
                                sizes="20px"
                                className="object-cover"
                              />
                            </div>
                            <span className="max-w-[100px] truncate">{link.movie.titulo}</span>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </div>

              {/* Target locked poster */}
              <motion.div
                animate={
                  currentDistance <= 2
                    ? { scale: [1, 1.08, 1], boxShadow: ['0 0 0px rgba(244,63,94,0)', '0 0 24px rgba(244,63,94,0.6)', '0 0 0px rgba(244,63,94,0)'] }
                    : { scale: 1 }
                }
                transition={{ repeat: currentDistance <= 2 ? Infinity : 0, duration: 1.4 }}
                className="relative shrink-0"
              >
                <div className="relative aspect-[2/3] w-12 overflow-hidden rounded-lg ring-2 ring-rose-400/50">
                  <Image
                    src={`${POSTER_BASE}${challenge.targetMovie.poster_path}`}
                    alt={challenge.targetMovie.titulo}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 to-transparent">
                    <div className="w-full px-0.5 pb-0.5 text-center text-[8px] font-bold text-rose-200">
                      META
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* progress bar */}
            <div className="mt-2 flex items-center gap-2 px-1">
              <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className={`h-full ${steps > optimal ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  animate={{ width: `${Math.min(100, (steps / maxAllowed) * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                />
              </div>
              <div className="text-[10px] tabular-nums text-white/60">
                {steps}/{maxAllowed}
              </div>
            </div>
          </div>

          {/* Center current movie */}
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 pt-20 pb-[260px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`center-${currentMovie.id}`}
                initial={{ x: 120, rotate: 8, opacity: 0, scale: 0.85 }}
                animate={{ x: 0, rotate: 0, opacity: 1, scale: 1 }}
                exit={{ x: -120, rotate: -8, opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className="flex flex-col items-center"
              >
                <div className="relative aspect-[2/3] w-40 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20">
                  <Image
                    src={`${POSTER_BASE}${currentMovie.poster_path}`}
                    alt={currentMovie.titulo}
                    fill
                    sizes="160px"
                    priority
                    className="object-cover"
                  />
                </div>
                <div className="mt-3 max-w-[80vw] text-center text-lg font-semibold tracking-tight">
                  {currentMovie.titulo}
                </div>
                {currentMovie.anio && (
                  <div className="text-xs text-white/50">{currentMovie.anio}</div>
                )}

                <div className="mt-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur ring-1 ring-white/10">
                  {currentDistance === Infinity
                    ? 'sin ruta directa'
                    : currentDistance === 0
                    ? '¡llegaste!'
                    : `${currentDistance} ${currentDistance === 1 ? 'paso' : 'pasos'} al objetivo`}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Feedback flash */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.7 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.7 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                  className={`absolute top-[48%] rounded-full px-4 py-2 text-sm font-bold backdrop-blur-xl ring-1 ${
                    feedback === 'closer'
                      ? 'bg-emerald-500/30 text-emerald-100 ring-emerald-400/50'
                      : 'bg-rose-500/30 text-rose-100 ring-rose-400/50'
                  }`}
                >
                  {feedback === 'closer' ? '🔥 Más cerca' : '❄️ Más lejos'}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom: actor choices */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-2">
            <div className="rounded-3xl bg-black/55 p-3 backdrop-blur-2xl ring-1 ring-white/10">
              <div className="mb-2 px-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
                Elige un actor para saltar a otra película
              </div>
              <div className="grid grid-cols-3 gap-2">
                {currentChoices.map((actor, idx) => {
                  const count = actorToMoviesRef.current.get(actor.name)?.size ?? 0
                  return (
                    <motion.button
                      key={`${actor.name}-${idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08, type: 'spring', stiffness: 220, damping: 22 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => pickActor(actor)}
                      disabled={transitioning}
                      className="group relative flex flex-col items-center overflow-hidden rounded-2xl bg-white/5 p-2 ring-1 ring-white/10 active:bg-white/10 disabled:opacity-50"
                    >
                      <div className="relative aspect-square w-full max-w-[96px] overflow-hidden rounded-xl ring-1 ring-white/15">
                        {actor.profile_path ? (
                          <Image
                            src={`${PROFILE_BASE}${actor.profile_path}`}
                            alt={actor.name}
                            fill
                            sizes="100px"
                            className="object-cover transition-transform group-active:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/5 text-2xl">
                            🎭
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-center text-[11px] font-semibold leading-tight">
                        {actor.name}
                      </div>
                      {actor.character && (
                        <div className="line-clamp-1 text-center text-[9px] text-white/50">
                          {actor.character}
                        </div>
                      )}
                      <div className="mt-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/70">
                        {count} {count === 1 ? 'película' : 'películas'}
                      </div>
                    </motion.button>
                  )
                })}
                {currentChoices.length === 0 && (
                  <div className="col-span-3 py-8 text-center text-sm text-white/60">
                    Sin actores disponibles…
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* WIN */}
      {status === 'won' && challenge && dailyResult && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-6 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.3, opacity: 0, x: 120, y: 120 }}
            animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            className="w-full max-w-md text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 18 }}
              className="relative mx-auto aspect-[2/3] w-44 overflow-hidden rounded-2xl shadow-2xl ring-2 ring-amber-400/50"
            >
              <Image
                src={`${POSTER_BASE}${challenge.targetMovie.poster_path}`}
                alt={challenge.targetMovie.titulo}
                fill
                sizes="180px"
                className="object-cover"
              />
              {/* particle burst */}
              {Array.from({ length: 14 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos((i / 14) * Math.PI * 2) * 180,
                    y: Math.sin((i / 14) * Math.PI * 2) * 180,
                    opacity: 0,
                  }}
                  transition={{ delay: 0.6, duration: 1.1, ease: 'easeOut' }}
                  className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-amber-400"
                />
              ))}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div className="mt-5 text-3xl font-bold tracking-tight">¡Conectaste!</div>
              <div className="mt-1 text-sm text-white/70">{challenge.targetMovie.titulo}</div>
              <div className="mt-3 text-lg">
                {dailyResult.steps} pasos · Óptimo: {dailyResult.optimal}
              </div>
              <div className="mt-3 text-4xl">
                {'⭐'.repeat(starCount)}
                <span className="text-white/20">{'⭐'.repeat(3 - starCount)}</span>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleShare}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-rose-500 px-6 py-3 font-bold text-black shadow-xl"
                >
                  {showShareCopied ? '¡Copiado!' : 'Compartir'}
                </button>
                <Link
                  href="/"
                  className="flex-1 rounded-2xl bg-white/10 px-6 py-3 text-center font-semibold backdrop-blur"
                >
                  Salir
                </Link>
              </div>
              <div className="mt-4 text-xs text-white/40">Vuelve mañana para el próximo desafío</div>
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* LOSE */}
      {status === 'lost' && challenge && dailyResult && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-md text-center"
          >
            <motion.div
              animate={{ x: [0, -8, 8, -6, 6, 0], rotate: [0, -2, 2, -1, 1, 0] }}
              transition={{ duration: 0.6 }}
              className="text-5xl"
            >
              💔
            </motion.div>
            <div className="mt-4 text-3xl font-bold tracking-tight">Cadena rota</div>
            <div className="mt-2 text-sm text-white/70">
              Usaste {dailyResult.steps} pasos · Óptimo era {dailyResult.optimal}
            </div>

            <div className="mt-6 text-xs uppercase tracking-[0.2em] text-white/50">Ruta óptima</div>
            <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto">
              {challenge.optimalPath.map((mid, i) => {
                const m = movieMapRef.current.get(mid)
                if (!m) return null
                return (
                  <div key={`${mid}-${i}`} className="flex items-center gap-2 shrink-0">
                    {i > 0 && <span className="text-white/40">→</span>}
                    <div className="relative aspect-[2/3] w-12 overflow-hidden rounded-lg ring-1 ring-white/20">
                      <Image
                        src={`${POSTER_BASE}${m.poster_path}`}
                        alt={m.titulo}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={handleShare}
                className="flex-1 rounded-2xl bg-white/10 px-6 py-3 font-semibold backdrop-blur"
              >
                {showShareCopied ? '¡Copiado!' : 'Compartir'}
              </button>
              <Link
                href="/"
                className="flex-1 rounded-2xl bg-white/5 px-6 py-3 text-center font-semibold backdrop-blur"
              >
                Salir
              </Link>
            </div>
            <div className="mt-4 text-xs text-white/40">Vuelve mañana para el próximo desafío</div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
