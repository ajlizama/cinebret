'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  Pill,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'

type BattleMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  backdrop_path: string | null
  generos: string[]
  director: string | null
  compositor: string | null
  oscars: string | null
  sinopsis: string | null
  keywords: string | null
}

type BracketMatch = {
  a: BattleMovie | null
  b: BattleMovie | null
  winner: BattleMovie | null
}

type ThemeConfig = {
  id: string
  title: string
  description: string
  filter: 'custom' | 'personalizado' | ((m: BattleMovie) => boolean)
}

const ROUND_NAMES = ['Octavos', 'Cuartos', 'Semifinal', 'Final']

const GENRE_OPTIONS = [
  'Drama', 'Comedia', 'Acción', 'Terror', 'Ciencia ficción', 'Animación',
  'Thriller', 'Romance', 'Documental', 'Western', 'Guerra', 'Biografía',
  'Crimen', 'Aventura', 'Fantasía', 'Misterio', 'Musical', 'Historia',
]

const DECADE_OPTIONS = [
  { label: 'Antes de 1980', min: 1900, max: 1979 },
  { label: '1980s', min: 1980, max: 1989 },
  { label: '1990s', min: 1990, max: 1999 },
  { label: '2000s', min: 2000, max: 2009 },
  { label: '2010s', min: 2010, max: 2019 },
  { label: '2020s', min: 2020, max: 2029 },
]

export const THEME_LIST: ThemeConfig[] = [
  {
    id: 'drama90s',
    title: 'Drama de los 90s',
    description: 'Los mejores dramas de la década dorada',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('drama')) && (m.anio ?? 0) >= 1990 && (m.anio ?? 0) <= 1999,
  },
  {
    id: 'oscar_winners',
    title: 'Ganadoras de Mejor Película',
    description: 'Las que se llevaron el Óscar principal',
    filter: (m) => !!(m.oscars && m.oscars.toLowerCase().startsWith('gan')),
  },
  {
    id: 'tarantino',
    title: 'Películas de Tarantino',
    description: 'Sangre, diálogos y soundtracks',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('tarantino')),
  },
  {
    id: 'nolan',
    title: 'Películas de Nolan',
    description: 'Tiempo, espacio y la mente',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('nolan')),
  },
  {
    id: 'zimmer',
    title: 'Soundtracks de Hans Zimmer',
    description: 'Las mejores bandas sonoras',
    filter: (m) => !!(m.compositor && m.compositor.toLowerCase().includes('zimmer')),
  },
  {
    id: 'comedy2000s',
    title: 'Comedias de los 2000s',
    description: 'Risas del nuevo milenio',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('comedia') || g.toLowerCase().includes('comedy')) && (m.anio ?? 0) >= 2000 && (m.anio ?? 0) <= 2009,
  },
  {
    id: 'horror_classic',
    title: 'Terror Clásico',
    description: 'Las que te quitaron el sueño',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('terror') || g.toLowerCase().includes('horror')) && (m.anio ?? 0) < 2010,
  },
  {
    id: 'scifi',
    title: 'Ciencia Ficción',
    description: 'Futuros posibles e imposibles',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('ciencia ficci') || g.toLowerCase().includes('sci-fi') || g.toLowerCase().includes('science fiction')),
  },
  {
    id: 'animation_adult',
    title: 'Animación para adultos',
    description: 'Animación con nota alta en IMDb',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('animaci') || g.toLowerCase().includes('animation')) && (m.nota_imdb ?? 0) >= 7.5,
  },
  {
    id: 'thriller_psych',
    title: 'Thrillers Psicológicos',
    description: 'Te vuelan la cabeza',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('thriller') || g.toLowerCase().includes('suspense')),
  },
  {
    id: 'spielberg',
    title: 'Películas de Spielberg',
    description: 'El maestro del cine popular',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('spielberg')),
  },
  {
    id: 'romance_epic',
    title: 'Romance Épico',
    description: 'Historias de amor inolvidables',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('romance') || g.toLowerCase().includes('romanc')) && (m.nota_imdb ?? 0) >= 7,
  },
  {
    id: 'action80s',
    title: 'Acción de los 80s',
    description: 'Explosiones y músculos',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('acci') || g.toLowerCase().includes('action')) && (m.anio ?? 0) >= 1980 && (m.anio ?? 0) <= 1989,
  },
  {
    id: 'docs_top',
    title: 'Documentales Top',
    description: 'La realidad supera la ficción',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('documental') || g.toLowerCase().includes('documentary')) && (m.nota_imdb ?? 0) >= 8,
  },
  {
    id: 'imdb9',
    title: 'Películas con +9 IMDb',
    description: 'Lo mejor de lo mejor',
    filter: (m) => (m.nota_imdb ?? 0) >= 9,
  },
  {
    id: 'western',
    title: 'Western',
    description: 'Duelos al atardecer',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('western')),
  },
  {
    id: 'war',
    title: 'Guerra y Conflicto',
    description: 'Batallas que marcaron la historia',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('guerra') || g.toLowerCase().includes('war') || g.toLowerCase().includes('belic')),
  },
  {
    id: 'biography',
    title: 'Biografías Épicas',
    description: 'Vidas que merecen una película',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('biograf') || g.toLowerCase().includes('biography')),
  },
  {
    id: 'classics',
    title: 'Clásicos (+30 años)',
    description: 'Las que resisten el paso del tiempo',
    filter: (m) => (m.anio ?? 2000) < 1996,
  },
  {
    id: 'recent',
    title: 'Estrenos Recientes',
    description: 'Lo más nuevo del cine',
    filter: (m) => (m.anio ?? 0) >= 2023,
  },
  {
    id: 'random',
    title: 'Aleatorio',
    description: '16 películas al azar',
    filter: 'custom',
  },
  {
    id: 'personalizado',
    title: 'Personalizado',
    description: 'Elige género y década',
    filter: 'personalizado',
  },
]

async function fetchAllMoviesWithEnrichment(): Promise<BattleMovie[]> {
  const allMovies: BattleMovie[] = []
  const pageSize = 1000
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('peliculas')
      .select(`
        id, titulo, titulo_ingles, anio, nota_imdb, poster_path, backdrop_path, oscars,
        enriquecimiento (director, compositor, generos, sinopsis_chilensis, keywords)
      `)
      .not('poster_path', 'is', null)
      .not('backdrop_path', 'is', null)
      .range(from, from + pageSize - 1)

    if (error || !data) break
    if (data.length < pageSize) keepGoing = false

    for (const p of data) {
      const enr = (p as any).enriquecimiento || {}
      allMovies.push({
        id: p.id,
        titulo: p.titulo,
        titulo_ingles: p.titulo_ingles,
        anio: p.anio,
        nota_imdb: p.nota_imdb,
        poster_path: p.poster_path,
        backdrop_path: p.backdrop_path,
        generos: enr.generos ?? [],
        director: enr.director ?? null,
        compositor: enr.compositor ?? null,
        oscars: p.oscars ?? null,
        sinopsis: enr.sinopsis_chilensis ?? null,
        keywords: enr.keywords ?? null,
      })
    }

    from += pageSize
  }

  return allMovies
}

function pickRandom16(pool: BattleMovie[]): BattleMovie[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 16)
}

export default function BatallaPage() {
  const [phase, setPhase] = useState<'theme' | 'personalizado' | 'battle'>('theme')
  const [allMovies, setAllMovies] = useState<BattleMovie[]>([])
  const [allLoading, setAllLoading] = useState(true)

  const [movies, setMovies] = useState<BattleMovie[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | null>(null)

  // Custom filter state
  const [customGenres, setCustomGenres] = useState<string[]>([])
  const [customDecade, setCustomDecade] = useState<{ min: number; max: number } | null>(null)

  // Bracket state
  const [rounds, setRounds] = useState<BracketMatch[][]>([])
  const [currentRound, setCurrentRound] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const [chosen, setChosen] = useState<'a' | 'b' | null>(null)
  const [champion, setChampion] = useState<BattleMovie | null>(null)
  const [showCopied, setShowCopied] = useState(false)
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load all movies once on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAllLoading(true)
      const data = await fetchAllMoviesWithEnrichment()
      if (!cancelled) {
        setAllMovies(data)
        setAllLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
    }
  }, [])

  const startBattle = useCallback((pool: BattleMovie[], theme: ThemeConfig) => {
    setError(null)
    setChampion(null)
    setChosen(null)
    setCurrentRound(0)
    setCurrentMatch(0)
    setRounds([])
    setSelectedTheme(theme)

    if (pool.length < 16) {
      setError(`Solo hay ${pool.length} películas para "${theme.title}". Se necesitan al menos 16.`)
      setPhase('battle')
      setLoading(false)
      return
    }

    const selected = pickRandom16(pool)
    setMovies(selected)

    const initialMatches: BracketMatch[] = []
    for (let i = 0; i < 16; i += 2) {
      initialMatches.push({ a: selected[i], b: selected[i + 1], winner: null })
    }
    setRounds([initialMatches])
    setPhase('battle')
    setLoading(false)
  }, [])

  const handleThemeSelect = useCallback((theme: ThemeConfig) => {
    if (theme.filter === 'personalizado') {
      setSelectedTheme(theme)
      setPhase('personalizado')
      return
    }

    setLoading(true)
    setPhase('battle')

    if (theme.filter === 'custom') {
      // Random - just use all movies with imdb >= 7.5
      const pool = allMovies.filter(m => (m.nota_imdb ?? 0) >= 7.5)
      startBattle(pool, theme)
    } else {
      const filterFn = theme.filter as (m: BattleMovie) => boolean
      const pool = allMovies.filter(filterFn)
      startBattle(pool, theme)
    }
  }, [allMovies, startBattle])

  const handleCustomStart = useCallback(() => {
    setLoading(true)
    const pool = allMovies.filter(m => {
      if (customGenres.length > 0) {
        const movieGenres = (m.generos ?? []).map(g => g.toLowerCase())
        const hasGenre = customGenres.some(cg => movieGenres.some(mg => mg.includes(cg.toLowerCase())))
        if (!hasGenre) return false
      }
      if (customDecade) {
        const year = m.anio ?? 0
        if (year < customDecade.min || year > customDecade.max) return false
      }
      return true
    })

    const customTheme: ThemeConfig = {
      id: 'custom_user',
      title: `${customGenres.join(', ') || 'Todas'}${customDecade ? ` (${customDecade.min}s)` : ''}`,
      description: 'Batalla personalizada',
      filter: 'personalizado',
    }

    startBattle(pool, customTheme)
  }, [allMovies, customGenres, customDecade, startBattle])

  const handleChoice = (side: 'a' | 'b') => {
    if (chosen) return
    setChosen(side)

    const match = rounds[currentRound][currentMatch]
    const winner = side === 'a' ? match.a! : match.b!

    const updatedRounds = [...rounds]
    updatedRounds[currentRound] = [...updatedRounds[currentRound]]
    updatedRounds[currentRound][currentMatch] = { ...match, winner }

    animTimeoutRef.current = setTimeout(() => {
      const roundMatches = updatedRounds[currentRound]
      const nextMatchIdx = currentMatch + 1

      if (nextMatchIdx < roundMatches.length) {
        setRounds(updatedRounds)
        setCurrentMatch(nextMatchIdx)
        setChosen(null)
      } else {
        const allWinners = updatedRounds[currentRound].map((m, i) =>
          i === currentMatch ? winner : m.winner!
        )

        if (allWinners.length === 1) {
          setRounds(updatedRounds)
          setChampion(allWinners[0])
          setChosen(null)
        } else {
          const nextRoundMatches: BracketMatch[] = []
          for (let i = 0; i < allWinners.length; i += 2) {
            nextRoundMatches.push({ a: allWinners[i], b: allWinners[i + 1], winner: null })
          }
          updatedRounds.push(nextRoundMatches)
          setRounds(updatedRounds)
          setCurrentRound(currentRound + 1)
          setCurrentMatch(0)
          setChosen(null)
        }
      }
    }, 350)
  }

  const handleShare = async () => {
    if (!champion) return
    const themeLabel = selectedTheme ? ` [${selectedTheme.title}]` : ''
    const text = `Mi campeón en Batalla CineBret${themeLabel}: ${champion.titulo}${champion.anio ? ` (${champion.anio})` : ''}\nIMDb ${champion.nota_imdb}\ncinebret.cl/batalla`
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(text)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 2000)
  }

  const goToThemes = () => {
    setPhase('theme')
    setChampion(null)
    setChosen(null)
    setCurrentRound(0)
    setCurrentMatch(0)
    setRounds([])
    setError(null)
    setLoading(false)
  }

  const totalMatchesInRound = rounds[currentRound]?.length ?? 0

  const renderBracketTree = () => {
    if (rounds.length === 0) return null

    return (
      <div className="mt-10 overflow-x-auto pb-4 w-full">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 text-center">Cuadro del torneo</h3>
        <div className="flex items-center justify-center gap-2 md:gap-4 min-w-[700px] mx-auto">
          {rounds.map((round, ri) => (
            <div key={ri} className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 12}px` }}>
              <div className="text-[10px] text-zinc-500 text-center mb-1 font-medium uppercase tracking-wide">
                {ROUND_NAMES[ri] ?? `R${ri + 1}`}
              </div>
              {round.map((match, mi) => (
                <div key={mi} className="flex flex-col border border-zinc-800 rounded-lg bg-zinc-900/80 overflow-hidden text-[11px]">
                  <div className={`px-2 py-1 truncate border-b border-zinc-800 ${match.winner?.id === match.a?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                    {match.a?.titulo ?? '—'}
                  </div>
                  <div className={`px-2 py-1 truncate ${match.winner?.id === match.b?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                    {match.b?.titulo ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {champion && (
            <div className="flex flex-col justify-center flex-shrink-0">
              <div className="text-[10px] text-zinc-500 text-center mb-1 font-medium uppercase tracking-wide">
                Campeón
              </div>
              <div className="border-2 border-yellow-400 rounded-lg bg-zinc-900 px-3 py-2 text-yellow-400 font-bold text-xs text-center max-w-[120px] truncate">
                {champion.titulo}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderMovieCard = (movie: BattleMovie, side: 'a' | 'b') => {
    const isChosen = chosen === side
    const isLoser = chosen !== null && chosen !== side

    return (
      <button
        onClick={() => handleChoice(side)}
        disabled={chosen !== null}
        className={`
          relative w-full aspect-[16/10] md:aspect-[16/9] rounded-2xl overflow-hidden
          transition-all duration-300 ease-out group min-h-[44px]
          ${isChosen ? 'scale-[1.03] ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20 z-10' : ''}
          ${isLoser ? 'opacity-30 scale-95 grayscale' : ''}
          ${!chosen ? 'hover:scale-[1.02] hover:ring-1 hover:ring-yellow-400/50 cursor-pointer active:scale-[0.98]' : ''}
        `}
      >
        {movie.backdrop_path && (
          <Image
            src={`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`}
            alt={movie.titulo}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 text-left">
          <h3 className="text-white font-bold text-base md:text-xl leading-tight drop-shadow-lg">
            {movie.titulo}
          </h3>
          {movie.titulo_ingles && movie.titulo_ingles !== movie.titulo && (
            <p className="text-zinc-300 text-xs mt-0.5 italic">{movie.titulo_ingles}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {movie.nota_imdb && (
              <span className="bg-yellow-400 text-zinc-950 text-xs font-bold px-1.5 py-0.5 rounded">
                IMDb {movie.nota_imdb}
              </span>
            )}
            {movie.anio && (
              <span className="text-zinc-300 text-xs">{movie.anio}</span>
            )}
          </div>
          {movie.generos.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {movie.generos.slice(0, 3).map(g => (
                <span key={g} className="text-[10px] bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded-full">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
        {isChosen && (
          <div className="absolute inset-0 flex items-center justify-center bg-yellow-400/10">
            <Icon.Check className="w-16 h-16 text-yellow-400 drop-shadow-lg" strokeWidth={3} />
          </div>
        )}
      </button>
    )
  }

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Batalla CineBret"
        subtitle="Dieciséis películas entran al torneo. Solo una alcanza la gloria."
        icon={<Icon.Trophy className="w-8 h-8" />}
      />

      {/* Loading all movies */}
      {allLoading && <LoadingState text="Cargando películas..." />}

      {/* THEME SELECTION */}
      {!allLoading && phase === 'theme' && (
        <Section label="Elige un tema para tu batalla">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {THEME_LIST.map((theme) => (
              <Card
                key={theme.id}
                as="button"
                interactive
                onClick={() => handleThemeSelect(theme)}
                padding="md"
                className="text-center border border-zinc-800 hover:border-yellow-400/60 min-h-[44px]"
              >
                <div className="flex flex-col items-center gap-2">
                  <Icon.Trophy className="w-6 h-6 text-yellow-400" />
                  <span className="text-sm font-bold text-white leading-tight">
                    {theme.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 leading-tight">
                    {theme.description}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* PERSONALIZADO SCREEN */}
      {!allLoading && phase === 'personalizado' && (
        <div className="max-w-lg mx-auto">
          <button
            onClick={goToThemes}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-yellow-400 transition-colors text-sm font-semibold cursor-pointer mb-6"
          >
            <Icon.ArrowLeft className="w-4 h-4" />
            <span>Volver a temas</span>
          </button>
          <h2 className="text-xl font-bold mb-6 text-white">Crear batalla personalizada</h2>

          <Section label="Géneros (opcional)">
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS.map(g => (
                <Pill
                  key={g}
                  variant="filter"
                  active={customGenres.includes(g)}
                  onClick={() => setCustomGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                >
                  {g}
                </Pill>
              ))}
            </div>
          </Section>

          <Section label="Década (opcional)">
            <div className="flex flex-wrap gap-2">
              {DECADE_OPTIONS.map(d => (
                <Pill
                  key={d.label}
                  variant="filter"
                  active={customDecade?.min === d.min}
                  onClick={() => setCustomDecade(prev => prev?.min === d.min ? null : { min: d.min, max: d.max })}
                >
                  {d.label}
                </Pill>
              ))}
            </div>
          </Section>

          <Button onClick={handleCustomStart} fullWidth size="lg">
            Iniciar batalla personalizada
          </Button>
        </div>
      )}

      {/* BATTLE PHASE */}
      {!allLoading && phase === 'battle' && (
        <>
          {loading && <LoadingState text="Preparando el torneo..." />}

          {error && (
            <EmptyState
              icon={<Icon.Warning className="w-16 h-16" />}
              title="No hay suficientes películas"
              description={error}
              action={
                <Button onClick={goToThemes} iconLeft={<Icon.ArrowLeft className="w-4 h-4" />}>
                  Elegir otro tema
                </Button>
              }
            />
          )}

          {/* Theme badge */}
          {selectedTheme && !loading && !error && (
            <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
              <Pill variant="gold" icon={<Icon.Trophy className="w-3.5 h-3.5" />}>
                {selectedTheme.title}
              </Pill>
              <button
                onClick={goToThemes}
                className="text-zinc-500 text-xs hover:text-yellow-400 transition-colors underline underline-offset-2"
              >
                Cambiar tema
              </button>
            </div>
          )}

          {/* Active Battle */}
          {!loading && !error && !champion && rounds.length > 0 && rounds[currentRound]?.[currentMatch] && (
            <div>
              <div className="text-center mb-4">
                <p className="text-yellow-400 font-bold text-sm md:text-base">
                  {ROUND_NAMES[currentRound]} — Partido {currentMatch + 1} de {totalMatchesInRound}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Ronda {currentRound + 1} de {currentRound + Math.ceil(Math.log2(totalMatchesInRound * 2))}
                </p>
                <div className="flex justify-center gap-1.5 mt-2">
                  {rounds[currentRound].map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i < currentMatch ? 'bg-yellow-400' :
                        i === currentMatch ? 'bg-yellow-400 animate-pulse' :
                        'bg-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <p className="text-center text-zinc-300 font-medium mb-4 text-lg">
                ¿Cuál es mejor?
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {renderMovieCard(rounds[currentRound][currentMatch].a!, 'a')}
                <div className="md:hidden flex items-center justify-center -my-1">
                  <span className="text-yellow-400 font-black text-sm tracking-widest">VS</span>
                </div>
                {renderMovieCard(rounds[currentRound][currentMatch].b!, 'b')}
              </div>
            </div>
          )}

          {/* Champion screen */}
          {champion && (
            <div className="flex flex-col items-center text-center">
              <p className="text-yellow-400 text-sm font-bold uppercase tracking-widest mb-1">
                Campeón del torneo
              </p>
              <h2 className="text-3xl md:text-5xl font-black mb-6 text-white">
                Tu campeón es…
              </h2>

              <div className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl shadow-yellow-400/10 border border-yellow-400/30">
                {champion.backdrop_path && (
                  <div className="relative w-full aspect-[16/9]">
                    <Image
                      src={`https://image.tmdb.org/t/p/w780${champion.backdrop_path}`}
                      alt={champion.titulo}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 512px"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                  </div>
                )}

                <div className="absolute top-4 left-4 w-24 md:w-32 rounded-lg overflow-hidden shadow-xl border-2 border-yellow-400/50">
                  {champion.poster_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w342${champion.poster_path}`}
                      alt={champion.titulo}
                      width={128}
                      height={192}
                      className="w-full h-auto"
                    />
                  )}
                </div>

                <div className="relative -mt-16 md:-mt-20 px-5 pb-5 pt-0 z-10">
                  <h3 className="text-2xl md:text-3xl font-black text-yellow-400 drop-shadow-lg">
                    {champion.titulo}
                  </h3>
                  {champion.titulo_ingles && champion.titulo_ingles !== champion.titulo && (
                    <p className="text-zinc-300 text-sm italic mt-0.5">{champion.titulo_ingles}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 justify-center flex-wrap">
                    {champion.nota_imdb && (
                      <span className="bg-yellow-400 text-zinc-950 text-sm font-bold px-2 py-0.5 rounded">
                        IMDb {champion.nota_imdb}
                      </span>
                    )}
                    {champion.anio && (
                      <span className="text-zinc-300 text-sm">{champion.anio}</span>
                    )}
                  </div>
                  {champion.generos.length > 0 && (
                    <div className="flex gap-1.5 mt-2 justify-center flex-wrap">
                      {champion.generos.map(g => (
                        <span key={g} className="text-xs bg-white/10 text-zinc-300 px-2 py-0.5 rounded-full">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full max-w-lg">
                <Link href={`/pelicula/${champion.id}`} className="flex-1">
                  <Button fullWidth size="lg" iconLeft={<Icon.Film className="w-4 h-4" />}>
                    Ver ficha de la película
                  </Button>
                </Link>
                <Button
                  onClick={handleShare}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="flex-1"
                  iconLeft={<Icon.Share className="w-4 h-4" />}
                >
                  {showCopied ? 'Copiado' : 'Compartir'}
                </Button>
              </div>

              <button
                onClick={goToThemes}
                className="mt-4 inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 font-bold text-sm transition-colors"
              >
                <Icon.Refresh className="w-4 h-4" />
                <span>Jugar de nuevo</span>
              </button>

              {renderBracketTree()}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
