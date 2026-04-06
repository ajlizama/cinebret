'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/* ─── Types ─── */
type BlitzMovie = {
  id: string
  titulo: string
  anio: number | null
  nota_imdb: number | null
  poster_path: string
  backdrop_path: string
  generos: string[]
  director: string | null
  actores: string | null
  compositor: string | null
}

type GameMode = 'mas-menos' | 'genero' | 'decada' | 'director'
type Screen = 'start' | 'playing' | 'gameover'

type Particle = {
  id: number
  x: number
  y: number
  angle: number
  distance: number
  size: number
  color: string
}

/* ─── Constants ─── */
const TIMER_DURATION = 5000
const SWIPE_THRESHOLD = 60
const PARTICLE_COLORS = ['#facc15', '#f59e0b', '#fb923c', '#fbbf24', '#fde68a']
const GENRE_POOL = [
  'Drama', 'Comedia', 'Acción', 'Terror', 'Ciencia ficción', 'Animación',
  'Thriller', 'Romance', 'Documental', 'Western', 'Guerra', 'Crimen',
  'Aventura', 'Fantasía', 'Misterio', 'Musical', 'Biografía', 'Historia',
]
const DECADE_POOL = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s']

const MODE_CONFIG: Record<GameMode, { emoji: string; title: string; description: string }> = {
  'mas-menos': { emoji: '⚖️', title: '¿Más o Menos?', description: '¿Tiene mayor o menor nota IMDb que la anterior?' },
  'genero': { emoji: '🎭', title: '¿Qué Género?', description: 'Elige el género correcto de la película' },
  'decada': { emoji: '📅', title: '¿Qué Década?', description: '¿De qué década es esta película?' },
  'director': { emoji: '🎬', title: '¿Quién Dirigió?', description: 'Elige el director correcto' },
}

/* ─── Data Fetching ─── */
async function fetchMovies(): Promise<BlitzMovie[]> {
  const allMovies: BlitzMovie[] = []
  const pageSize = 1000
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('peliculas')
      .select(`
        id, titulo, anio, nota_imdb, poster_path, backdrop_path,
        enriquecimiento (generos, director, actores, compositor)
      `)
      .gte('nota_imdb', 7)
      .not('poster_path', 'is', null)
      .not('backdrop_path', 'is', null)
      .range(from, from + pageSize - 1)

    if (error || !data) break
    if (data.length < pageSize) keepGoing = false

    for (const p of data) {
      const enr = (p as any).enriquecimiento || {}
      if (p.poster_path && p.backdrop_path) {
        allMovies.push({
          id: p.id,
          titulo: p.titulo,
          anio: p.anio,
          nota_imdb: p.nota_imdb,
          poster_path: p.poster_path!,
          backdrop_path: p.backdrop_path!,
          generos: enr.generos ?? [],
          director: enr.director ?? null,
          actores: enr.actores ?? null,
          compositor: enr.compositor ?? null,
        })
      }
    }

    from += pageSize
  }

  // Shuffle
  for (let i = allMovies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allMovies[i], allMovies[j]] = [allMovies[j], allMovies[i]]
  }

  return allMovies
}

/* ─── Helpers ─── */
function pickRandomGenre(correctGenres: string[], allGenres: string[]): { correct: string; wrong: string; correctSide: 'left' | 'right' } | null {
  const correct = correctGenres[Math.floor(Math.random() * correctGenres.length)]
  const available = allGenres.filter(g => !correctGenres.some(cg => cg.toLowerCase() === g.toLowerCase()))
  if (available.length === 0) return null // Can't find a wrong genre
  const wrong = available[Math.floor(Math.random() * available.length)]
  const correctSide = Math.random() < 0.5 ? 'left' : 'right'
  return { correct, wrong, correctSide }
}

function getDecadeLabel(year: number): string {
  if (year >= 2020) return '2020s'
  if (year >= 2010) return '2010s'
  if (year >= 2000) return '2000s'
  if (year >= 1990) return '90s'
  if (year >= 1980) return '80s'
  if (year >= 1970) return '70s'
  return '60s'
}

function pickDecadeOptions(year: number): { correct: string; wrong: string; correctSide: 'left' | 'right' } {
  const correctDecade = getDecadeLabel(year)
  const otherDecades = DECADE_POOL.filter(d => d !== correctDecade)
  const wrong = otherDecades[Math.floor(Math.random() * otherDecades.length)]
  const correctSide: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right'
  return { correct: correctDecade, wrong, correctSide }
}

function pickDirectorOptions(correctDirector: string, allMovies: BlitzMovie[]): { correct: string; wrong: string; correctSide: 'left' | 'right' } {
  const otherDirectors = [...new Set(allMovies.map(m => m.director).filter((d): d is string => !!d && d !== correctDirector))]
  const wrong = otherDirectors[Math.floor(Math.random() * otherDirectors.length)] || 'Steven Spielberg'
  const correctSide: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right'
  return { correct: correctDirector, wrong, correctSide }
}

function getStreakLabel(streak: number): string {
  if (streak >= 20) return '🔥🔥🔥 IMPARABLE'
  if (streak >= 10) return '🔥🔥'
  if (streak >= 5) return '🔥'
  return ''
}

/* ─── Component ─── */
export default function CineBlitzPage() {
  // Data
  const [movies, setMovies] = useState<BlitzMovie[]>([])
  const [loading, setLoading] = useState(true)

  // Game state
  const [screen, setScreen] = useState<Screen>('start')
  const [mode, setMode] = useState<GameMode | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [previousMovie, setPreviousMovie] = useState<BlitzMovie | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [bestScore, setBestScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [totalAnswered, setTotalAnswered] = useState(0)
  const [speedLabel, setSpeedLabel] = useState('')

  // Round state
  const [roundOptions, setRoundOptions] = useState<{ left: string; right: string; correctSide: 'left' | 'right' }>({ left: '', right: '', correctSide: 'left' })
  const correctSideRef = useRef<'left' | 'right'>('left')
  const [questionText, setQuestionText] = useState('')

  // Timer
  const [timerActive, setTimerActive] = useState(false)
  const [timerStart, setTimerStart] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roundStartRef = useRef(0)

  // Visual feedback
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null)
  const [particles, setParticles] = useState<Particle[]>([])
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null)
  const [answered, setAnswered] = useState(false)
  const particleIdRef = useRef(0)

  // Swipe
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const gameAreaRef = useRef<HTMLDivElement>(null)

  // Preload
  const [preloadedSrc, setPreloadedSrc] = useState('')

  // All unique genres from loaded movies
  const allGenres = useMemo(() => {
    const set = new Set<string>()
    movies.forEach(m => m.generos.forEach(g => set.add(g)))
    return GENRE_POOL.filter(g => set.has(g)).length > 0 ? GENRE_POOL : [...set]
  }, [movies])

  // Load data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await fetchMovies()
      if (!cancelled) {
        setMovies(data)
        setLoading(false)
      }
    })()
    // Load best from localStorage
    try {
      const saved = localStorage.getItem('cineblitz-best')
      if (saved) {
        const parsed = JSON.parse(saved)
        setBestScore(parsed.score ?? 0)
        setBestStreak(parsed.streak ?? 0)
      }
    } catch {}
    return () => { cancelled = true }
  }, [])

  // Preload next backdrop
  useEffect(() => {
    if (screen === 'playing' && currentIndex + 1 < movies.length) {
      const next = movies[currentIndex + 1]
      setPreloadedSrc(`https://image.tmdb.org/t/p/w1280${next.backdrop_path}`)
    }
  }, [screen, currentIndex, movies])

  // Prevent scroll during game
  useEffect(() => {
    if (screen === 'playing') {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [screen])

  const currentMovie = movies[currentIndex] || null

  // Setup round options for the current movie
  const setupRound = useCallback((index: number, prevMovie: BlitzMovie | null) => {
    const movie = movies[index]
    if (!movie || !mode) return

    setAnswered(false)
    setSwipeDir(null)
    setFlashColor(null)
    setSpeedLabel('')

    switch (mode) {
      case 'mas-menos': {
        if (!prevMovie) {
          // First round: skip to second movie, using first as reference
          setPreviousMovie(movie)
          setCurrentIndex(index + 1)
          return
        }
        const correctSide: 'left' | 'right' = (movie.nota_imdb ?? 0) >= (prevMovie.nota_imdb ?? 0) ? 'right' : 'left'
        correctSideRef.current = correctSide
        setRoundOptions({ left: '⬇️ Menor nota', right: '⬆️ Mayor nota', correctSide })
        setQuestionText(`¿${movie.titulo} tiene mayor o menor nota que ${prevMovie.titulo}?`)
        break
      }
      case 'genero': {
        if (movie.generos.length === 0) {
          // Skip movies with no genres
          setCurrentIndex(index + 1)
          return
        }
        const genreResult = pickRandomGenre(movie.generos, allGenres)
        if (!genreResult) {
          // Can't find a wrong genre, skip movie
          setCurrentIndex(index + 1)
          return
        }
        const { correct, wrong, correctSide } = genreResult
        correctSideRef.current = correctSide
        setRoundOptions({
          left: correctSide === 'left' ? correct : wrong,
          right: correctSide === 'right' ? correct : wrong,
          correctSide,
        })
        setQuestionText('¿Qué género es esta película?')
        break
      }
      case 'decada': {
        if (!movie.anio) {
          setCurrentIndex(index + 1)
          return
        }
        const { correct: decCorrect, wrong: decWrong, correctSide: decSide } = pickDecadeOptions(movie.anio)
        correctSideRef.current = decSide
        setRoundOptions({
          left: decSide === 'left' ? decCorrect : decWrong,
          right: decSide === 'right' ? decCorrect : decWrong,
          correctSide: decSide,
        })
        setQuestionText('¿De qué década es esta película?')
        break
      }
      case 'director': {
        if (!movie.director) {
          setCurrentIndex(index + 1)
          return
        }
        const { correct, wrong, correctSide } = pickDirectorOptions(movie.director, movies)
        correctSideRef.current = correctSide
        setRoundOptions({
          left: correctSide === 'left' ? correct : wrong,
          right: correctSide === 'right' ? correct : wrong,
          correctSide,
        })
        setQuestionText('¿Quién dirigió esta película?')
        break
      }
    }

    // Start timer
    roundStartRef.current = Date.now()
    setTimerStart(Date.now())
    setTimerActive(true)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      handleAnswer(null) // Time out
    }, TIMER_DURATION)
  }, [movies, mode, allGenres]) // eslint-disable-line react-hooks/exhaustive-deps

  // When currentIndex changes, setup round
  useEffect(() => {
    if (screen === 'playing' && currentMovie && mode) {
      setupRound(currentIndex, previousMovie)
    }
  }, [currentIndex, screen]) // eslint-disable-line react-hooks/exhaustive-deps

  const spawnParticles = useCallback(() => {
    const newParticles: Particle[] = []
    for (let i = 0; i < 20; i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        angle: Math.random() * 360,
        distance: 50 + Math.random() * 150,
        size: 4 + Math.random() * 8,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      })
    }
    setParticles(newParticles)
    setTimeout(() => setParticles([]), 700)
  }, [])

  const handleAnswer = useCallback((side: 'left' | 'right' | null) => {
    if (answered) return
    setAnswered(true)
    setTimerActive(false)
    if (timerRef.current) clearTimeout(timerRef.current)

    const timeUsed = (Date.now() - roundStartRef.current) / 1000
    const isCorrect = side !== null && side === correctSideRef.current
    const isTimeout = side === null

    if (isCorrect) {
      // Score calculation
      const basePoints = 100
      const speedBonus = Math.max(0, Math.floor((TIMER_DURATION / 1000 - timeUsed) * 30))
      const newStreak = streak + 1
      const streakMultiplier = 1 + newStreak * 0.1
      const roundScore = Math.floor((basePoints + speedBonus) * streakMultiplier)

      setScore(prev => prev + roundScore)
      setStreak(newStreak)
      setCorrectCount(prev => prev + 1)
      if (timeUsed < 2) setSpeedLabel('⚡ RÁPIDO')

      // Visual feedback
      setFlashColor('green')
      spawnParticles()
      setSwipeDir(side)
    } else {
      // Wrong or timeout
      setStreak(0)
      setFlashColor('red')
      if (!isTimeout) setSwipeDir(side)

      // Vibrate on wrong
      try { navigator.vibrate?.(200) } catch {}
    }

    setTotalAnswered(prev => prev + 1)

    // Advance after delay
    setTimeout(() => {
      setFlashColor(null)
      setSwipeDir(null)

      const nextIndex = currentIndex + 1
      if (nextIndex >= movies.length) {
        endGame()
        return
      }

      if (mode === 'mas-menos') {
        setPreviousMovie(currentMovie)
      }
      setCurrentIndex(nextIndex)
    }, 800)
  }, [answered, streak, currentIndex, movies.length, mode, currentMovie, spawnParticles])

  const endGame = useCallback(() => {
    setTimerActive(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    setScreen('gameover')

    // Save best
    try {
      const saved = localStorage.getItem('cineblitz-best')
      const prev = saved ? JSON.parse(saved) : { score: 0, streak: 0 }
      const newBest = {
        score: Math.max(prev.score, score),
        streak: Math.max(prev.streak, bestStreak, streak),
      }
      localStorage.setItem('cineblitz-best', JSON.stringify(newBest))
      setBestScore(newBest.score)
      setBestStreak(newBest.streak)
    } catch {}
  }, [score, bestStreak, streak])

  const startGame = useCallback((selectedMode: GameMode) => {
    setMode(selectedMode)
    setScore(0)
    setStreak(0)
    setCorrectCount(0)
    setTotalAnswered(0)
    setPreviousMovie(null)
    setCurrentIndex(0)
    setAnswered(false)
    setScreen('playing')

    // Re-shuffle movies
    setMovies(prev => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  const shareResult = useCallback(() => {
    const text = `⚡ CineBlitz: ${score} pts | Racha: ${Math.max(streak, bestStreak)} | ${correctCount}/${totalAnswered}\ncinebret.cl/cineblitz`
    if (navigator.share) {
      navigator.share({ text }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(text)
    }
  }, [score, streak, bestStreak, correctCount, totalAnswered])

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (answered) return
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
  }, [answered])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (answered || !touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      handleAnswer(dx > 0 ? 'right' : 'left')
    }
    touchStartRef.current = null
  }, [answered, handleAnswer])

  // ─── RENDER ───

  // Loading
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/70 text-[16px]">Cargando películas...</p>
      </div>
    )
  }

  // ─── START SCREEN ───
  if (screen === 'start') {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex flex-col items-center px-4 py-8 overflow-y-auto">
        {/* Title */}
        <div className="mt-8 mb-2 text-center">
          <h1 className="text-5xl font-black text-white tracking-tight">
            CINE<span className="text-yellow-400">BLITZ</span>
          </h1>
          <p className="text-yellow-400 text-2xl mt-1">⚡</p>
        </div>
        <p className="text-white/50 text-[16px] mb-6">5 segundos. Una respuesta. Sin piedad.</p>

        {/* Best score */}
        {bestScore > 0 && (
          <div className="bg-white/5 backdrop-blur rounded-xl px-6 py-3 mb-6 text-center border border-white/10">
            <p className="text-white/40 text-sm">Mejor puntuación</p>
            <p className="text-yellow-400 text-2xl font-bold">{bestScore} pts</p>
            {bestStreak > 0 && <p className="text-white/40 text-sm">Mejor racha: {bestStreak}</p>}
          </div>
        )}

        {/* Mode cards */}
        <div className="w-full max-w-sm space-y-3 mb-8">
          {(Object.keys(MODE_CONFIG) as GameMode[]).map((m) => {
            const cfg = MODE_CONFIG[m]
            return (
              <button
                key={m}
                onClick={() => startGame(m)}
                className="w-full bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 rounded-2xl p-5 text-left transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{cfg.emoji}</span>
                  <div>
                    <h3 className="text-white font-bold text-[18px]">{cfg.title}</h3>
                    <p className="text-white/50 text-[14px]">{cfg.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <Link href="/catalogo" className="text-white/30 text-[14px] hover:text-white/60 transition-colors">
          ← Volver al catálogo
        </Link>
      </div>
    )
  }

  // ─── GAME OVER SCREEN ───
  if (screen === 'gameover') {
    const maxStreak = Math.max(streak, bestStreak)
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-6xl mb-4">⚡</p>
        <h2 className="text-4xl font-black text-white mb-2">GAME OVER</h2>
        <p className="text-yellow-400 text-5xl font-black my-4">{score} pts</p>

        <div className="grid grid-cols-3 gap-4 mb-8 max-w-xs w-full">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <p className="text-white/40 text-[12px]">Correctas</p>
            <p className="text-white text-xl font-bold">{correctCount}/{totalAnswered}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <p className="text-white/40 text-[12px]">Racha</p>
            <p className="text-white text-xl font-bold">{maxStreak}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <p className="text-white/40 text-[12px]">Precisión</p>
            <p className="text-white text-xl font-bold">
              {totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0}%
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setScreen('start'); setMode(null) }}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-bold py-4 rounded-2xl text-[18px] active:scale-95 transition-all"
          >
            Jugar de nuevo
          </button>
          <button
            onClick={shareResult}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl text-[16px] active:scale-95 transition-all border border-white/10"
          >
            📤 Compartir resultado
          </button>
          <Link
            href="/catalogo"
            className="w-full bg-white/5 hover:bg-white/10 text-white/60 font-medium py-3 rounded-2xl text-[16px] text-center border border-white/10 transition-all"
          >
            Volver al catálogo
          </Link>
        </div>
      </div>
    )
  }

  // ─── PLAYING SCREEN ───
  if (!currentMovie) {
    endGame()
    return null
  }

  const streakLabel = getStreakLabel(streak)
  const backdropUrl = `https://image.tmdb.org/t/p/w1280${currentMovie.backdrop_path}`
  const isMasMenos = mode === 'mas-menos' && previousMovie

  return (
    <div
      ref={gameAreaRef}
      className="fixed inset-0 bg-black select-none overflow-hidden"
      style={{ touchAction: 'none', height: '100dvh' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isMasMenos ? (
        /* ─── MAS/MENOS: Split view ─── */
        <div className={`absolute inset-0 flex flex-col md:flex-row transition-transform duration-500 ease-out ${
          swipeDir === 'left' ? '-translate-x-full -rotate-12' :
          swipeDir === 'right' ? 'translate-x-full rotate-12' : ''
        }`}>
          {/* Left / Top: Previous movie */}
          <div className="relative flex-1 overflow-hidden">
            <Image
              src={`https://image.tmdb.org/t/p/w1280${previousMovie.backdrop_path}`}
              alt={previousMovie.titulo}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute bottom-3 left-0 right-0 text-center px-4">
              <h3 className="text-white text-xl md:text-2xl font-black drop-shadow-lg leading-tight">{previousMovie.titulo}</h3>
              <p className="text-yellow-400 text-lg font-bold drop-shadow-lg mt-1">
                {previousMovie.nota_imdb} <span className="text-white/50 text-sm">IMDb</span>
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="relative z-10 flex items-center justify-center md:flex-col">
            <div className="absolute bg-yellow-400 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
              <span className="text-black font-black text-sm">VS</span>
            </div>
            <div className="w-full h-px md:w-px md:h-full bg-yellow-400/40" />
          </div>

          {/* Right / Bottom: Current movie */}
          <div className="relative flex-1 overflow-hidden">
            <Image
              src={backdropUrl}
              alt={currentMovie.titulo}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute bottom-3 left-0 right-0 text-center px-4">
              <h3 className="text-white text-xl md:text-2xl font-black drop-shadow-lg leading-tight">{currentMovie.titulo}</h3>
              <p className="text-white/40 text-lg font-bold drop-shadow-lg mt-1">
                ? <span className="text-white/30 text-sm">IMDb</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ─── Other modes: Single backdrop ─── */
        <>
          <div className={`absolute inset-0 transition-transform duration-500 ease-out ${
            swipeDir === 'left' ? '-translate-x-full -rotate-12' :
            swipeDir === 'right' ? 'translate-x-full rotate-12' : ''
          }`}>
            <Image
              src={backdropUrl}
              alt={currentMovie.titulo}
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
          </div>
        </>
      )}

      {/* Preload next image */}
      {preloadedSrc && (
        <Image
          src={preloadedSrc}
          alt=""
          width={1}
          height={1}
          className="absolute opacity-0 pointer-events-none"
          aria-hidden
        />
      )}

      {/* Flash overlay */}
      {flashColor && (
        <div
          className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-300 ${
            flashColor === 'green' ? 'bg-green-500/30' : 'bg-red-500/30'
          }`}
        />
      )}

      {/* Particles */}
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance
        return (
          <div
            key={p.id}
            className="absolute z-40 rounded-full pointer-events-none"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: 'cineblitz-particle 600ms ease-out forwards',
              ['--tx' as string]: `${tx}px`,
              ['--ty' as string]: `${ty}px`,
            }}
          />
        )
      })}

      {/* Top HUD: Score + Streak */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <div className="backdrop-blur-md bg-black/40 rounded-xl px-3 py-2 border border-white/10">
          <p className="text-yellow-400 font-bold text-[18px] drop-shadow-lg">{score}</p>
        </div>

        <div className="flex flex-col items-center">
          {streak > 0 && (
            <div className={`backdrop-blur-md bg-black/40 rounded-xl px-4 py-2 border border-white/10 ${streak > 0 ? 'animate-pulse' : ''}`}>
              <p className="text-white font-bold text-[20px] drop-shadow-lg">
                {streak} {streakLabel}
              </p>
            </div>
          )}
          {speedLabel && (
            <p className="text-yellow-300 text-[14px] font-bold mt-1 drop-shadow-lg animate-bounce">{speedLabel}</p>
          )}
        </div>

        <button
          onClick={() => endGame()}
          className="backdrop-blur-md bg-black/40 rounded-xl px-3 py-2 border border-white/10"
        >
          <p className="text-white/70 text-[16px] drop-shadow-lg">✕</p>
        </button>
      </div>

      {/* Timer ring */}
      <TimerRing active={timerActive} startTime={timerStart} duration={TIMER_DURATION} />

      {/* Question text */}
      <div className="absolute top-[calc(max(env(safe-area-inset-top),12px)+60px)] left-0 right-0 z-20 text-center px-6">
        <p className="text-white/80 text-[14px] font-medium drop-shadow-lg backdrop-blur-sm bg-black/30 inline-block px-3 py-1 rounded-lg">{questionText}</p>
      </div>

      {/* Movie title (hidden for mas-menos since titles are in split view) */}
      {!isMasMenos && (
        <div className="absolute bottom-36 left-0 right-0 z-20 text-center px-6">
          <h2 className="text-white text-3xl font-black drop-shadow-lg leading-tight">{currentMovie.titulo}</h2>
          {currentMovie.anio && (
            <p className="text-white/60 text-[16px] mt-1 drop-shadow-lg">{currentMovie.anio}</p>
          )}
        </div>
      )}

      {/* Answer options */}
      <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-between px-4 gap-3 pb-[max(env(safe-area-inset-bottom),8px)]">
        <button
          onClick={() => !answered && handleAnswer('left')}
          className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl py-5 px-3 active:scale-95 transition-all"
        >
          <p className="text-white text-[16px] font-bold drop-shadow-lg text-center leading-tight">{roundOptions.left}</p>
        </button>
        <button
          onClick={() => !answered && handleAnswer('right')}
          className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl py-5 px-3 active:scale-95 transition-all"
        >
          <p className="text-white text-[16px] font-bold drop-shadow-lg text-center leading-tight">{roundOptions.right}</p>
        </button>
      </div>

      {/* Round counter */}
      <div className="absolute bottom-2 left-0 right-0 z-20 text-center pb-[max(env(safe-area-inset-bottom),2px)]">
        <p className="text-white/30 text-[12px]">{currentIndex + 1} / {movies.length}</p>
      </div>

      {/* CSS for particle animation */}
      <style jsx global>{`
        @keyframes cineblitz-particle {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

/* ─── Timer Ring Component ─── */
function TimerRing({ active, startTime, duration }: { active: boolean; startTime: number; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 52
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const center = size / 2
    const radius = 20
    const lineWidth = 4

    function draw() {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const remaining = 1 - progress

      ctx!.clearRect(0, 0, size, size)

      // Background circle
      ctx!.beginPath()
      ctx!.arc(center, center, radius, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx!.lineWidth = lineWidth
      ctx!.stroke()

      // Progress arc
      const startAngle = -Math.PI / 2
      const endAngle = startAngle + remaining * Math.PI * 2

      ctx!.beginPath()
      ctx!.arc(center, center, radius, startAngle, endAngle)

      // Color: yellow -> orange -> red
      let color = '#facc15'
      if (remaining < 0.33) color = '#ef4444'
      else if (remaining < 0.66) color = '#f97316'

      ctx!.strokeStyle = color
      ctx!.lineWidth = lineWidth
      ctx!.lineCap = 'round'
      ctx!.stroke()

      // Time text
      const secondsLeft = Math.ceil((duration - elapsed) / 1000)
      ctx!.fillStyle = color
      ctx!.font = 'bold 16px system-ui'
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText(Math.max(0, secondsLeft).toString(), center, center)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, startTime, duration])

  return (
    <div className="absolute z-20" style={{ top: 'calc(max(env(safe-area-inset-top), 12px) + 48px)', left: '50%', transform: 'translateX(-50%)' }}>
      <canvas ref={canvasRef} style={{ width: 52, height: 52 }} />
    </div>
  )
}
