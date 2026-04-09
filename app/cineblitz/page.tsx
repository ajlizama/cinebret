'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  StatCard,
  Button,
  IconButton,
  Pill,
  LoadingState,
  Icon,
} from '@/components/ui'

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
const PARTICLE_COLORS = ['#facc15', '#f59e0b', '#fbbf24', '#fde68a', '#fef3c7']
const GENRE_POOL = [
  'Drama', 'Comedia', 'Acción', 'Terror', 'Ciencia ficción', 'Animación',
  'Thriller', 'Romance', 'Documental', 'Western', 'Guerra', 'Crimen',
  'Aventura', 'Fantasía', 'Misterio', 'Musical', 'Biografía', 'Historia',
]
const DECADE_POOL = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s']

const MODE_CONFIG: Record<
  GameMode,
  { icon: React.ReactNode; title: string; description: string }
> = {
  'mas-menos': {
    icon: <Icon.Trending className="w-6 h-6" />,
    title: '¿Mayor o menor?',
    description: '¿Tiene mayor o menor nota IMDb que la película anterior?',
  },
  'genero': {
    icon: <Icon.Film className="w-6 h-6" />,
    title: '¿Qué género?',
    description: 'Elige el género correcto de la película.',
  },
  'decada': {
    icon: <Icon.Calendar className="w-6 h-6" />,
    title: '¿Qué década?',
    description: '¿De qué década es esta película?',
  },
  'director': {
    icon: <Icon.User className="w-6 h-6" />,
    title: '¿Quién la dirigió?',
    description: 'Elige el director correcto entre dos opciones.',
  },
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
  if (streak >= 20) return 'Imparable'
  if (streak >= 10) return 'En racha'
  if (streak >= 5) return 'Encendido'
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
  const [flashColor, setFlashColor] = useState<'correct' | 'wrong' | null>(null)
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
        setRoundOptions({ left: 'Menor nota', right: 'Mayor nota', correctSide })
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
      if (timeUsed < 2) setSpeedLabel('Respuesta rápida')

      // Visual feedback
      setFlashColor('correct')
      spawnParticles()
      setSwipeDir(side)
    } else {
      // Wrong or timeout
      setStreak(0)
      setFlashColor('wrong')
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
    const text = `CineBlitz: ${score} pts | Racha: ${Math.max(streak, bestStreak)} | ${correctCount}/${totalAnswered}\ncinebret.cl/cineblitz`
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
      <PageShell maxWidth="2xl">
        <LoadingState text="Cargando películas..." size="lg" />
      </PageShell>
    )
  }

  // ─── START SCREEN ───
  if (screen === 'start') {
    return (
      <PageShell maxWidth="2xl">
        <PageHeader
          icon={<Icon.Sparkles className="w-7 h-7" />}
          title="CineBlitz"
          subtitle="Cinco segundos. Una respuesta. Sin pausa."
        />

        {bestScore > 0 && (
          <Section label="Tu mejor marca">
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={bestScore} label="Puntuación" sub="récord personal" color="gold" />
              <StatCard value={bestStreak} label="Racha máxima" color="white" />
            </div>
          </Section>
        )}

        <Section label="Elige un modo">
          <div className="grid grid-cols-1 gap-3">
            {(Object.keys(MODE_CONFIG) as GameMode[]).map((m) => {
              const cfg = MODE_CONFIG[m]
              return (
                <Card
                  key={m}
                  as="button"
                  interactive
                  onClick={() => startGame(m)}
                  padding="lg"
                  className="text-left w-full"
                >
                  <div className="flex items-center gap-4">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-yellow-400/15 border border-yellow-400/30 text-yellow-400 flex items-center justify-center">
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-bold text-base sm:text-lg">{cfg.title}</h3>
                      <p className="text-zinc-400 text-sm mt-0.5 leading-relaxed">{cfg.description}</p>
                    </div>
                    <Icon.ChevronRight className="w-5 h-5 text-zinc-600 shrink-0" />
                  </div>
                </Card>
              )
            })}
          </div>
        </Section>

        <Section label="Cómo se juega">
          <Card padding="lg">
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex gap-3">
                <Icon.Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Tienes <span className="text-white font-semibold">5 segundos</span> por pregunta. Si se acaba el tiempo, pierdes la racha.</span>
              </li>
              <li className="flex gap-3">
                <Icon.Trending className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Cada acierto seguido <span className="text-white font-semibold">multiplica</span> tu puntaje.</span>
              </li>
              <li className="flex gap-3">
                <Icon.Sparkles className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <span>Responder en menos de 2 segundos te da un bonus extra.</span>
              </li>
            </ul>
          </Card>
        </Section>
      </PageShell>
    )
  }

  // ─── GAME OVER SCREEN ───
  if (screen === 'gameover') {
    const maxStreak = Math.max(streak, bestStreak)
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
    return (
      <PageShell maxWidth="2xl">
        <PageHeader
          icon={<Icon.Trophy className="w-7 h-7" />}
          title="Fin del juego"
          subtitle="Aquí tienes tu desempeño en esta partida."
        />

        <Section label="Resultado">
          <Card padding="lg" className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Puntuación final</p>
            <p className="text-yellow-400 text-5xl sm:text-6xl font-black tabular-nums mt-2">{score.toLocaleString('es')}</p>
            <p className="text-zinc-500 text-sm mt-1">puntos</p>
          </Card>
        </Section>

        <Section label="Estadísticas">
          <div className="grid grid-cols-3 gap-3">
            <StatCard value={`${correctCount}/${totalAnswered}`} label="Aciertos" color="white" />
            <StatCard value={maxStreak} label="Racha" color="white" />
            <StatCard value={`${accuracy}%`} label="Precisión" color="gold" />
          </div>
        </Section>

        <Section>
          <div className="flex flex-col gap-3">
            <Button
              fullWidth
              size="lg"
              onClick={() => { setScreen('start'); setMode(null) }}
              iconLeft={<Icon.Refresh className="w-5 h-5" />}
            >
              Jugar de nuevo
            </Button>
            <Button
              fullWidth
              size="lg"
              variant="secondary"
              onClick={shareResult}
              iconLeft={<Icon.Share className="w-5 h-5" />}
            >
              Compartir resultado
            </Button>
            <Button
              fullWidth
              size="lg"
              variant="ghost"
              onClick={() => { window.location.href = '/catalogo' }}
              iconLeft={<Icon.ArrowLeft className="w-5 h-5" />}
            >
              Volver al catálogo
            </Button>
          </div>
        </Section>
      </PageShell>
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
      className="fixed inset-0 z-50 bg-zinc-950 select-none overflow-hidden"
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
              <p className="text-yellow-400 text-lg font-bold drop-shadow-lg mt-1 tabular-nums">
                {previousMovie.nota_imdb} <span className="text-zinc-400 text-sm">IMDb</span>
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="relative z-10 flex items-center justify-center md:flex-col">
            <div className="absolute bg-yellow-400 rounded-full w-9 h-9 flex items-center justify-center shadow-lg">
              <span className="text-zinc-950 font-black text-xs tracking-wider">VS</span>
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
              <p className="text-zinc-400 text-lg font-bold drop-shadow-lg mt-1">
                ? <span className="text-zinc-500 text-sm">IMDb</span>
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

      {/* Flash overlay — gold for correct, zinc for wrong (no green/red) */}
      {flashColor && (
        <div
          className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-300 ${
            flashColor === 'correct' ? 'bg-yellow-400/25' : 'bg-zinc-100/15'
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

      {/* Top HUD: Score + Streak + Exit */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <div className="backdrop-blur-md bg-zinc-950/60 rounded-xl px-3.5 py-2 border border-yellow-400/30">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Puntos</p>
          <p className="text-yellow-400 font-black text-lg tabular-nums leading-none mt-0.5">{score.toLocaleString('es')}</p>
        </div>

        <div className="flex flex-col items-center gap-1 min-w-0">
          {streak > 0 && (
            <div className={`backdrop-blur-md bg-zinc-950/60 rounded-full px-3.5 py-1.5 border border-yellow-400/30 flex items-center gap-1.5 ${streak >= 5 ? 'animate-pulse' : ''}`}>
              <Icon.Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <p className="text-white font-bold text-sm tabular-nums leading-none">
                {streak}
                {streakLabel && <span className="text-yellow-400 ml-1.5">· {streakLabel}</span>}
              </p>
            </div>
          )}
          {speedLabel && (
            <Pill variant="gold" size="sm">{speedLabel}</Pill>
          )}
        </div>

        <IconButton
          icon={<Icon.Close className="w-5 h-5" />}
          label="Salir del juego"
          variant="secondary"
          size="md"
          onClick={() => endGame()}
          className="backdrop-blur-md bg-zinc-950/60 border-yellow-400/30 text-white"
        />
      </div>

      {/* Timer ring */}
      <TimerRing active={timerActive} startTime={timerStart} duration={TIMER_DURATION} />

      {/* Question text */}
      <div className="absolute top-[calc(max(env(safe-area-inset-top),12px)+112px)] left-0 right-0 z-20 text-center px-6">
        <p className="text-white text-sm font-medium drop-shadow-lg backdrop-blur-md bg-zinc-950/50 inline-block px-3.5 py-1.5 rounded-full border border-white/10">{questionText}</p>
      </div>

      {/* Movie title (hidden for mas-menos since titles are in split view) */}
      {!isMasMenos && (
        <div className="absolute bottom-44 left-0 right-0 z-20 text-center px-6">
          <h2 className="text-white text-3xl sm:text-4xl font-black drop-shadow-lg leading-tight">{currentMovie.titulo}</h2>
          {currentMovie.anio && (
            <p className="text-zinc-300 text-base mt-1 drop-shadow-lg tabular-nums">{currentMovie.anio}</p>
          )}
        </div>
      )}

      {/* Answer options */}
      <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-between px-4 gap-3 pb-[max(env(safe-area-inset-bottom),8px)]">
        <button
          type="button"
          onClick={() => !answered && handleAnswer('left')}
          disabled={answered}
          className="flex-1 min-h-[64px] bg-zinc-950/60 hover:bg-zinc-900/70 active:scale-95 backdrop-blur-md border border-yellow-400/30 hover:border-yellow-400/60 rounded-2xl py-5 px-4 transition-all"
        >
          <p className="text-white text-base sm:text-lg font-bold drop-shadow-lg text-center leading-tight">{roundOptions.left}</p>
        </button>
        <button
          type="button"
          onClick={() => !answered && handleAnswer('right')}
          disabled={answered}
          className="flex-1 min-h-[64px] bg-zinc-950/60 hover:bg-zinc-900/70 active:scale-95 backdrop-blur-md border border-yellow-400/30 hover:border-yellow-400/60 rounded-2xl py-5 px-4 transition-all"
        >
          <p className="text-white text-base sm:text-lg font-bold drop-shadow-lg text-center leading-tight">{roundOptions.right}</p>
        </button>
      </div>

      {/* Round counter */}
      <div className="absolute bottom-2 left-0 right-0 z-20 text-center pb-[max(env(safe-area-inset-bottom),2px)]">
        <p className="text-zinc-500 text-xs tabular-nums">{currentIndex + 1} / {movies.length}</p>
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

    const size = 64
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const center = size / 2
    const radius = 26
    const lineWidth = 5

    function draw() {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const remaining = 1 - progress

      ctx!.clearRect(0, 0, size, size)

      // Background circle
      ctx!.beginPath()
      ctx!.arc(center, center, radius, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx!.lineWidth = lineWidth
      ctx!.stroke()

      // Progress arc — gold throughout (no green/red), faded as time runs out
      const startAngle = -Math.PI / 2
      const endAngle = startAngle + remaining * Math.PI * 2

      ctx!.beginPath()
      ctx!.arc(center, center, radius, startAngle, endAngle)
      ctx!.strokeStyle = '#facc15'
      ctx!.globalAlpha = remaining < 0.33 ? 0.6 : 1
      ctx!.lineWidth = lineWidth
      ctx!.lineCap = 'round'
      ctx!.stroke()
      ctx!.globalAlpha = 1

      // Time text
      const secondsLeft = Math.ceil((duration - elapsed) / 1000)
      ctx!.fillStyle = '#facc15'
      ctx!.font = 'bold 18px system-ui'
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
    <div
      className="absolute z-20"
      style={{
        top: 'calc(max(env(safe-area-inset-top), 12px) + 56px)',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <canvas ref={canvasRef} style={{ width: 64, height: 64 }} />
    </div>
  )
}
