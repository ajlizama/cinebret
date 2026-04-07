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
  cast: CastMember[]
}

type ChainLink = {
  movie: Movie
  actor: CastMember | null
}

type GameMode = 'classic' | 'blitz'

const POSTER_BASE = 'https://image.tmdb.org/t/p/w500'
const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185'
const BLITZ_TIME = 30
const BEST_KEY = 'actorchain-best'

function scoreForLink(linkIndex: number): number {
  // linkIndex 0 = first jump (link 1) = 100, then *1.5
  let pts = 100
  for (let i = 0; i < linkIndex; i++) pts *= 1.5
  return Math.round(pts)
}

export default function ActorChainPage() {
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [movies, setMovies] = useState<Movie[]>([])
  const [actorToMovies, setActorToMovies] = useState<Map<string, Set<string>>>(new Map())
  const [movieToActors, setMovieToActors] = useState<Map<string, CastMember[]>>(new Map())
  const movieByIdRef = useRef<Map<string, Movie>>(new Map())

  const [mode, setMode] = useState<GameMode | null>(null)
  const [chain, setChain] = useState<ChainLink[]>([])
  const [usedMovies, setUsedMovies] = useState<Set<string>>(new Set())
  const [usedActors, setUsedActors] = useState<Set<string>>(new Set())
  const [currentChoices, setCurrentChoices] = useState<CastMember[]>([])
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(BLITZ_TIME)
  const [gameOver, setGameOver] = useState(false)
  const [bestScore, setBestScore] = useState(0)
  const [transitioning, setTransitioning] = useState(false)

  const breadcrumbsRef = useRef<HTMLDivElement>(null)

  // Load best score
  useEffect(() => {
    try {
      const b = localStorage.getItem(BEST_KEY)
      if (b) setBestScore(parseInt(b, 10) || 0)
    } catch {}
  }, [])

  // Load data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)

      // Fetch all enriquecimiento with cast_json paginated
      const allEnr: { pelicula_id: string; cast_json: CastMember[] | null }[] = []
      let offset = 0
      while (true) {
        const { data, error } = await supabase
          .from('enriquecimiento')
          .select('pelicula_id, cast_json')
          .not('cast_json', 'is', null)
          .range(offset, offset + 999)
        if (error || !data || data.length === 0) break
        allEnr.push(...(data as any))
        if (cancelled) return
        setLoadProgress(allEnr.length)
        if (data.length < 1000) break
        offset += 1000
      }

      const enrMap = new Map<string, CastMember[]>()
      for (const e of allEnr) {
        if (Array.isArray(e.cast_json) && e.cast_json.length > 0) {
          enrMap.set(e.pelicula_id, e.cast_json as CastMember[])
        }
      }

      // Fetch all movies with poster + nota_imdb >= 6.5 paginated
      const allPels: any[] = []
      offset = 0
      while (true) {
        const { data, error } = await supabase
          .from('peliculas')
          .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path')
          .not('poster_path', 'is', null)
          .gte('nota_imdb', 6.5)
          .range(offset, offset + 999)
        if (error || !data || data.length === 0) break
        allPels.push(...data)
        if (cancelled) return
        if (data.length < 1000) break
        offset += 1000
      }

      // Build movies array filtered to those with cast
      const builtMovies: Movie[] = []
      const m2a = new Map<string, CastMember[]>()
      const a2m = new Map<string, Set<string>>()

      for (const p of allPels) {
        const cast = enrMap.get(p.id)
        if (!cast || cast.length === 0) continue
        // sort by order ascending, take top ~15 to keep things relevant
        const sortedCast = [...cast]
          .filter(c => c && c.name)
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .slice(0, 15)
        if (sortedCast.length === 0) continue

        const movie: Movie = {
          id: String(p.id),
          titulo: p.titulo,
          titulo_ingles: p.titulo_ingles,
          anio: p.anio,
          nota_imdb: p.nota_imdb,
          poster_path: p.poster_path,
          cast: sortedCast,
        }
        builtMovies.push(movie)
        m2a.set(movie.id, sortedCast)
        for (const c of sortedCast) {
          if (!a2m.has(c.name)) a2m.set(c.name, new Set())
          a2m.get(c.name)!.add(movie.id)
        }
      }

      // Filter to actors with 2+ movies
      const validActors = new Set<string>()
      for (const [name, set] of a2m.entries()) {
        if (set.size >= 2) validActors.add(name)
      }
      // Remove invalid actors from sets
      const cleanedA2M = new Map<string, Set<string>>()
      for (const name of validActors) cleanedA2M.set(name, a2m.get(name)!)

      const cleanedM2A = new Map<string, CastMember[]>()
      for (const [id, cast] of m2a.entries()) {
        const filtered = cast.filter(c => validActors.has(c.name))
        if (filtered.length > 0) cleanedM2A.set(id, filtered)
      }

      const finalMovies = builtMovies.filter(m => cleanedM2A.has(m.id))
      const movieById = new Map<string, Movie>()
      for (const m of finalMovies) {
        m.cast = cleanedM2A.get(m.id)!
        movieById.set(m.id, m)
      }

      if (cancelled) return
      movieByIdRef.current = movieById
      setMovies(finalMovies)
      setActorToMovies(cleanedA2M)
      setMovieToActors(cleanedM2A)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Pick 3 best actor choices for current movie
  const pickChoices = useCallback(
    (movie: Movie, usedM: Set<string>, usedA: Set<string>): CastMember[] => {
      const candidates: { actor: CastMember; interest: number }[] = []
      for (const actor of movie.cast) {
        if (usedA.has(actor.name)) continue
        const moviesForActor = actorToMovies.get(actor.name)
        if (!moviesForActor) continue
        let interest = 0
        for (const mid of moviesForActor) {
          if (!usedM.has(mid)) interest++
        }
        if (interest > 0) {
          candidates.push({ actor, interest })
        }
      }
      if (candidates.length === 0) return []
      // Sort by interest desc
      candidates.sort((a, b) => b.interest - a.interest)
      // Take top 6, then randomly pick 3 with weighted preference for higher interest
      const pool = candidates.slice(0, Math.min(6, candidates.length))
      const picked: CastMember[] = []
      const usedIdx = new Set<number>()
      while (picked.length < 3 && usedIdx.size < pool.length) {
        // Weighted random
        const totalWeight = pool.reduce(
          (acc, c, i) => (usedIdx.has(i) ? acc : acc + Math.max(1, c.interest)),
          0
        )
        let r = Math.random() * totalWeight
        let chosenIdx = -1
        for (let i = 0; i < pool.length; i++) {
          if (usedIdx.has(i)) continue
          r -= Math.max(1, pool[i].interest)
          if (r <= 0) {
            chosenIdx = i
            break
          }
        }
        if (chosenIdx === -1) {
          for (let i = 0; i < pool.length; i++) {
            if (!usedIdx.has(i)) {
              chosenIdx = i
              break
            }
          }
        }
        if (chosenIdx === -1) break
        usedIdx.add(chosenIdx)
        picked.push(pool[chosenIdx].actor)
      }
      return picked
    },
    [actorToMovies]
  )

  // Start game
  const startGame = useCallback(
    (m: GameMode) => {
      if (movies.length === 0) return
      // Pick a random starting movie that has at least 1 valid actor with another movie
      let attempts = 0
      let startMovie: Movie | null = null
      while (attempts < 50) {
        const candidate = movies[Math.floor(Math.random() * movies.length)]
        const choices = pickChoices(candidate, new Set([candidate.id]), new Set())
        if (choices.length > 0) {
          startMovie = candidate
          break
        }
        attempts++
      }
      if (!startMovie) startMovie = movies[Math.floor(Math.random() * movies.length)]

      const newUsedM = new Set([startMovie.id])
      const newUsedA = new Set<string>()
      const choices = pickChoices(startMovie, newUsedM, newUsedA)
      setMode(m)
      setChain([{ movie: startMovie, actor: null }])
      setUsedMovies(newUsedM)
      setUsedActors(newUsedA)
      setCurrentChoices(choices)
      setScore(0)
      setGameOver(false)
      setTimeLeft(BLITZ_TIME)
      setTransitioning(false)
    },
    [movies, pickChoices]
  )

  // Blitz timer
  useEffect(() => {
    if (mode !== 'blitz' || gameOver || !chain.length) return
    if (timeLeft <= 0) {
      setGameOver(true)
      return
    }
    if (timeLeft <= 5 && timeLeft > 0) {
      try {
        navigator.vibrate?.(50)
      } catch {}
    }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000)
    return () => clearTimeout(t)
  }, [mode, gameOver, timeLeft, chain.length])

  // Auto-scroll breadcrumbs to end
  useEffect(() => {
    if (breadcrumbsRef.current) {
      breadcrumbsRef.current.scrollTo({
        left: breadcrumbsRef.current.scrollWidth,
        behavior: 'smooth',
      })
    }
  }, [chain.length])

  // Save best score on game over
  useEffect(() => {
    if (gameOver && score > bestScore) {
      setBestScore(score)
      try {
        localStorage.setItem(BEST_KEY, String(score))
      } catch {}
    }
  }, [gameOver, score, bestScore])

  const currentMovie = chain.length > 0 ? chain[chain.length - 1].movie : null

  const handlePickActor = useCallback(
    (actor: CastMember) => {
      if (transitioning || gameOver || !currentMovie) return
      const moviesForActor = actorToMovies.get(actor.name)
      if (!moviesForActor) return
      const possibleNext: string[] = []
      for (const mid of moviesForActor) {
        if (!usedMovies.has(mid)) possibleNext.push(mid)
      }
      if (possibleNext.length === 0) {
        setGameOver(true)
        return
      }
      // Pick a random next movie from the actor's filmography
      const nextId = possibleNext[Math.floor(Math.random() * possibleNext.length)]
      const nextMovie = movieByIdRef.current.get(nextId)
      if (!nextMovie) {
        setGameOver(true)
        return
      }

      setTransitioning(true)
      const linkIdx = chain.length - 1 // current jump count
      const pts = scoreForLink(linkIdx)

      setTimeout(() => {
        const newUsedM = new Set(usedMovies)
        newUsedM.add(nextMovie.id)
        const newUsedA = new Set(usedActors)
        newUsedA.add(actor.name)
        // Update last link's actor
        const newChain = [...chain]
        newChain[newChain.length - 1] = { ...newChain[newChain.length - 1], actor }
        newChain.push({ movie: nextMovie, actor: null })

        const newChoices = pickChoices(nextMovie, newUsedM, newUsedA)
        setChain(newChain)
        setUsedMovies(newUsedM)
        setUsedActors(newUsedA)
        setCurrentChoices(newChoices)
        setScore(prev => prev + pts)
        if (mode === 'blitz') setTimeLeft(BLITZ_TIME)
        if (newChoices.length === 0) {
          // No more moves possible from next movie
          setTimeout(() => setGameOver(true), 500)
        }
        setTransitioning(false)
      }, 350)
    },
    [transitioning, gameOver, currentMovie, actorToMovies, usedMovies, usedActors, chain, mode, pickChoices]
  )

  const surrender = () => setGameOver(true)

  const goHome = () => {
    setMode(null)
    setChain([])
    setUsedMovies(new Set())
    setUsedActors(new Set())
    setCurrentChoices([])
    setScore(0)
    setGameOver(false)
  }

  const buildShareText = () => {
    if (chain.length === 0) return ''
    const parts: string[] = []
    for (let i = 0; i < chain.length; i++) {
      parts.push(chain[i].movie.titulo)
      if (chain[i].actor) parts.push(chain[i].actor!.name)
    }
    return `🔗 ActorChain CineBret\n${chain.length} eslabones · ${score} pts\n${parts.join(' → ')}\ncinebret.cl/actorchain`
  }

  const handleShare = async () => {
    const text = buildShareText()
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        alert('Copiado al portapapeles')
      }
    } catch {}
  }

  // ============ RENDER ============

  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center"
        style={{ height: '100dvh', touchAction: 'manipulation' }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="text-6xl mb-6"
        >
          🔗
        </motion.div>
        <div className="text-yellow-400 font-bold text-xl mb-2">ActorChain</div>
        <div className="text-white/50 text-sm">Cargando cast... ({loadProgress})</div>
      </div>
    )
  }

  // START SCREEN
  if (mode === null) {
    return (
      <div
        className="fixed inset-0 bg-gradient-to-br from-black via-zinc-950 to-black text-white overflow-hidden"
        style={{ height: '100dvh', touchAction: 'manipulation' }}
      >
        {/* decorative animated chains in background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute text-6xl"
              initial={{
                x: `${(i * 137) % 100}%`,
                y: `${(i * 73) % 100}%`,
                rotate: 0,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20 + i * 2, repeat: Infinity, ease: 'linear' }}
            >
              🔗
            </motion.div>
          ))}
        </div>

        <div className="relative h-full flex flex-col items-center justify-center px-6 max-w-md mx-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="text-center mb-2"
          >
            <div className="text-7xl mb-4">🔗</div>
            <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              ACTORCHAIN
            </h1>
            <p className="text-white/70 mt-3 text-[16px]">Conecta películas a través del cast</p>
          </motion.div>

          {bestScore > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 px-4 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-sm font-bold"
            >
              ★ Mejor puntaje: {bestScore}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-8 w-full space-y-3"
          >
            <button
              onClick={() => startGame('classic')}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black text-xl shadow-lg shadow-yellow-400/20 active:scale-95 transition-transform"
            >
              Clásico
            </button>
            <button
              onClick={() => startGame('blitz')}
              className="w-full py-5 rounded-2xl bg-zinc-900 border border-yellow-400/40 text-yellow-400 font-black text-xl active:scale-95 transition-transform"
            >
              Blitz ⚡ (30s)
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 text-center text-white/50 text-sm leading-relaxed px-4"
          >
            Elige un actor → salta a otra película → repite. Sin repetir nada.
          </motion.p>

          <Link
            href="/"
            className="absolute top-6 left-6 text-white/60 hover:text-white text-sm"
          >
            ← Volver
          </Link>
        </div>
      </div>
    )
  }

  // GAME OVER SCREEN
  if (gameOver) {
    return (
      <div
        className="fixed inset-0 bg-black text-white overflow-hidden flex flex-col"
        style={{ height: '100dvh', touchAction: 'manipulation' }}
      >
        <div className="flex-1 overflow-y-auto px-6 pt-10 pb-32 max-w-2xl mx-auto w-full">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 150 }}
            className="text-center mb-6"
          >
            <div className="text-6xl mb-4">💔</div>
            <h2 className="text-3xl font-black text-white">Cadena rota</h2>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-6"
          >
            <div className="text-6xl font-black text-yellow-400 leading-none">{score}</div>
            <div className="text-white/60 text-sm mt-2">puntos</div>
            <div className="text-white/80 mt-3 font-semibold">{chain.length} eslabones</div>
            {score > 0 && score === bestScore && (
              <div className="mt-2 inline-block px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-bold">
                ★ NUEVO RÉCORD
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="space-y-2"
          >
            {chain.map((link, i) => (
              <motion.div
                key={`${link.movie.id}-${i}`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.05 }}
                className="flex items-center gap-3 bg-white/5 rounded-xl p-3"
              >
                <div className="relative w-12 h-16 rounded-md overflow-hidden flex-shrink-0 bg-zinc-800">
                  <Image
                    src={`${POSTER_BASE}${link.movie.poster_path}`}
                    alt={link.movie.titulo}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{link.movie.titulo}</div>
                  <div className="text-white/40 text-xs">{link.movie.anio}</div>
                  {link.actor && (
                    <div className="text-yellow-400 text-xs mt-1 truncate">
                      → {link.actor.name}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/95 to-transparent space-y-2">
          <div className="max-w-md mx-auto space-y-2">
            <button
              onClick={handleShare}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black active:scale-95 transition-transform"
            >
              Compartir
            </button>
            <button
              onClick={() => startGame(mode!)}
              className="w-full py-4 rounded-2xl bg-zinc-900 border border-white/20 text-white font-bold active:scale-95 transition-transform"
            >
              Jugar de nuevo
            </button>
            <button
              onClick={goHome}
              className="w-full py-2 text-white/60 text-sm"
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    )
  }

  // GAME SCREEN
  if (!currentMovie) return null

  return (
    <div
      className="fixed inset-0 bg-black text-white overflow-hidden"
      style={{ height: '100dvh', touchAction: 'manipulation' }}
    >
      {/* Background poster */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${currentMovie.id}`}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0"
        >
          <Image
            src={`${POSTER_BASE}${currentMovie.poster_path}`}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover blur-2xl scale-110 opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black" />
        </motion.div>
      </AnimatePresence>

      {/* TOP HUD */}
      <div className="relative z-20 pt-3 px-3">
        {/* Score + length */}
        <div className="flex items-start justify-between mb-2">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5">
            <div className="text-[10px] text-white/50 uppercase tracking-wide">Eslabones</div>
            <div className="text-lg font-black text-white leading-none">{chain.length - 1}</div>
          </div>
          <div className="bg-black/60 backdrop-blur-md border border-yellow-400/30 rounded-xl px-3 py-1.5 text-right">
            <div className="text-[10px] text-yellow-400/70 uppercase tracking-wide">Score</div>
            <div className="text-lg font-black text-yellow-400 leading-none">{score}</div>
          </div>
        </div>

        {/* Blitz Timer */}
        {mode === 'blitz' && (
          <div className="mb-2">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                key={`timer-${chain.length}`}
                initial={{ width: '100%' }}
                animate={{ width: `${(timeLeft / BLITZ_TIME) * 100}%` }}
                transition={{ duration: 0.95, ease: 'linear' }}
                className={`h-full rounded-full ${
                  timeLeft <= 5
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-gradient-to-r from-yellow-400 to-amber-500'
                }`}
              />
            </div>
            <div
              className={`text-center text-xs mt-1 font-bold ${
                timeLeft <= 5 ? 'text-red-400' : 'text-white/60'
              }`}
            >
              {timeLeft}s
            </div>
          </div>
        )}

        {/* Breadcrumbs chain */}
        <div
          ref={breadcrumbsRef}
          className="overflow-x-auto scrollbar-hide bg-black/50 backdrop-blur-md rounded-2xl border border-white/10 p-2"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="flex items-center gap-1.5 min-w-max">
            <AnimatePresence>
              {chain.map((link, i) => (
                <motion.div
                  key={`bc-${link.movie.id}-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{
                    scale: 0,
                    opacity: 0,
                    rotate: Math.random() * 180 - 90,
                    x: Math.random() * 200 - 100,
                    y: Math.random() * 200 - 100,
                  }}
                  transition={{ type: 'spring', stiffness: 200, damping: 16, delay: i === chain.length - 1 ? 0.1 : 0 }}
                  className="flex items-center gap-1.5"
                >
                  <div className="relative w-9 h-12 rounded-md overflow-hidden bg-zinc-800 ring-1 ring-white/20 flex-shrink-0">
                    <Image
                      src={`${POSTER_BASE}${link.movie.poster_path}`}
                      alt={link.movie.titulo}
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </div>
                  {link.actor && (
                    <>
                      <div className="text-yellow-400/70 text-xs">→</div>
                      <div className="bg-yellow-400/20 border border-yellow-400/40 rounded-full px-2 py-1 text-yellow-300 text-[11px] font-bold whitespace-nowrap">
                        {link.actor.name}
                      </div>
                      <div className="text-yellow-400/70 text-xs">→</div>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* CENTER POSTER */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 mt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={`center-${currentMovie.id}`}
            initial={{ opacity: 0, x: 100, rotate: 8, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2, filter: 'blur(20px)' }}
            transition={{ type: 'spring', stiffness: 180, damping: 20 }}
            className="text-center"
          >
            <div className="relative w-40 h-60 sm:w-48 sm:h-72 mx-auto rounded-2xl overflow-hidden shadow-2xl shadow-black ring-2 ring-white/20">
              <Image
                src={`${POSTER_BASE}${currentMovie.poster_path}`}
                alt={currentMovie.titulo}
                fill
                sizes="(max-width: 640px) 160px, 192px"
                priority
                className="object-cover"
              />
            </div>
            <div className="mt-3 px-4">
              <h2 className="text-xl font-black text-white drop-shadow-lg line-clamp-2">
                {currentMovie.titulo}
              </h2>
              <div className="flex items-center justify-center gap-3 mt-1 text-white/70 text-sm">
                {currentMovie.anio && <span>{currentMovie.anio}</span>}
                {currentMovie.nota_imdb && (
                  <span className="text-yellow-400 font-bold">★ {currentMovie.nota_imdb.toFixed(1)}</span>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* BOTTOM ACTOR CHOICES */}
      <div className="relative z-20 px-3 pb-4">
        <div className="text-center text-white/50 text-xs uppercase tracking-widest mb-2">
          Elige un actor para saltar
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={`choices-${currentMovie.id}`}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="grid grid-cols-3 gap-2"
          >
            {currentChoices.map((actor, i) => {
              const totalMovies = actorToMovies.get(actor.name)?.size ?? 0
              return (
                <motion.button
                  key={`${actor.name}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 200 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handlePickActor(actor)}
                  disabled={transitioning}
                  className="bg-black/70 backdrop-blur-md border border-white/15 rounded-2xl p-2 text-left active:border-yellow-400 transition-colors disabled:opacity-50"
                >
                  <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 mb-2">
                    {actor.profile_path ? (
                      <Image
                        src={`${PROFILE_BASE}${actor.profile_path}`}
                        alt={actor.name}
                        fill
                        sizes="(max-width: 640px) 33vw, 150px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-yellow-400/20 to-amber-700/20 text-3xl font-black text-yellow-400">
                        {actor.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="font-bold text-white text-[13px] leading-tight line-clamp-2">
                    {actor.name}
                  </div>
                  {actor.character && (
                    <div className="text-white/50 text-[11px] mt-0.5 line-clamp-1 italic">
                      {actor.character}
                    </div>
                  )}
                  <div className="text-yellow-400 text-[11px] font-bold mt-1">
                    → {totalMovies} pelis
                  </div>
                </motion.button>
              )
            })}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between mt-3 px-1">
          <Link href="/" className="text-white/40 text-xs">
            ← Inicio
          </Link>
          <button onClick={surrender} className="text-white/40 text-xs hover:text-red-400">
            Rendirse
          </button>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
