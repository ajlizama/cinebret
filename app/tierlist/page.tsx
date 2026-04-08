'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  FilterChips,
  Pill,
  LoadingState,
  ErrorState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'

type TierMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  generos: string[]
  director: string | null
  compositor: string | null
  oscars: string | null
  sinopsis: string | null
  keywords: string | null
}

type TierName = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

const TIERS: { name: TierName; color: string; bg: string; border: string }[] = [
  { name: 'S', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/40' },
  { name: 'A', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/40' },
  { name: 'B', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/40' },
  { name: 'C', color: 'text-yellow-300', bg: 'bg-yellow-300/10', border: 'border-yellow-300/40' },
  { name: 'D', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/40' },
  { name: 'F', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/40' },
]

type ThemeConfig = {
  id: string
  title: string
  description: string
  filter: 'custom' | 'personalizado' | ((m: TierMovie) => boolean)
}

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

const THEME_LIST: ThemeConfig[] = [
  {
    id: 'drama90s',
    title: 'Drama de los 90s',
    description: 'Los mejores dramas de la década dorada',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('drama')) && (m.anio ?? 0) >= 1990 && (m.anio ?? 0) <= 1999,
  },
  {
    id: 'oscar_winners',
    title: 'Ganadoras de Mejor Película',
    description: 'Las que ganaron el Oscar principal',
    filter: (m) => !!(m.oscars && m.oscars.toLowerCase().startsWith('gan')),
  },
  {
    id: 'tarantino',
    title: 'Películas de Tarantino',
    description: 'Diálogos, estilo y bandas sonoras',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('tarantino')),
  },
  {
    id: 'nolan',
    title: 'Películas de Nolan',
    description: 'Tiempo, espacio y mente',
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
    title: 'Terror clásico',
    description: 'Las que quitan el sueño',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('terror') || g.toLowerCase().includes('horror')) && (m.anio ?? 0) < 2010,
  },
  {
    id: 'scifi',
    title: 'Ciencia ficción',
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
    title: 'Thrillers psicológicos',
    description: 'Para pensar hasta el final',
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
    title: 'Romance épico',
    description: 'Historias de amor inolvidables',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('romance') || g.toLowerCase().includes('romanc')) && (m.nota_imdb ?? 0) >= 7,
  },
  {
    id: 'action80s',
    title: 'Acción de los 80s',
    description: 'Explosiones y adrenalina',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('acci') || g.toLowerCase().includes('action')) && (m.anio ?? 0) >= 1980 && (m.anio ?? 0) <= 1989,
  },
  {
    id: 'docs_top',
    title: 'Documentales top',
    description: 'La realidad supera la ficción',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('documental') || g.toLowerCase().includes('documentary')) && (m.nota_imdb ?? 0) >= 8,
  },
  {
    id: 'imdb9',
    title: 'Películas con IMDb +9',
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
    title: 'Guerra y conflicto',
    description: 'Batallas que marcaron la historia',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('guerra') || g.toLowerCase().includes('war') || g.toLowerCase().includes('belic')),
  },
  {
    id: 'biography',
    title: 'Biografías épicas',
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
    title: 'Estrenos recientes',
    description: 'Lo más nuevo del cine',
    filter: (m) => (m.anio ?? 0) >= 2023,
  },
  {
    id: 'random',
    title: 'Aleatorio',
    description: 'Hasta 16 películas al azar',
    filter: 'custom',
  },
  {
    id: 'personalizado',
    title: 'Personalizado',
    description: 'Elige género y década',
    filter: 'personalizado',
  },
]

async function fetchAllMoviesWithEnrichment(): Promise<TierMovie[]> {
  const allMovies: TierMovie[] = []
  const pageSize = 1000
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('peliculas')
      .select(`
        id, titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars,
        enriquecimiento (director, compositor, generos, sinopsis_chilensis, keywords)
      `)
      .not('poster_path', 'is', null)
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

export default function TierListPage() {
  const [phase, setPhase] = useState<'theme' | 'personalizado' | 'tierlist' | 'done'>('theme')
  const [allMovies, setAllMovies] = useState<TierMovie[]>([])
  const [allLoading, setAllLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | null>(null)

  // Custom filter
  const [customGenres, setCustomGenres] = useState<string[]>([])
  const [customDecade, setCustomDecade] = useState<{ min: number; max: number } | null>(null)

  // Tier state
  const [tiers, setTiers] = useState<Record<TierName, TierMovie[]>>({ S: [], A: [], B: [], C: [], D: [], F: [] })
  const [unranked, setUnranked] = useState<TierMovie[]>([])
  const [selectedMovie, setSelectedMovie] = useState<TierMovie | null>(null)
  const [showCopied, setShowCopied] = useState(false)

  // Drag state
  const [draggedMovie, setDraggedMovie] = useState<TierMovie | null>(null)
  const [dragSource, setDragSource] = useState<TierName | 'unranked' | null>(null)

  // Load movies
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

  const startTierList = useCallback((pool: TierMovie[], theme: ThemeConfig) => {
    setError(null)
    setSelectedTheme(theme)
    setSelectedMovie(null)

    if (pool.length < 6) {
      setError(`Solo hay ${pool.length} películas para "${theme.title}". Se necesitan al menos 6.`)
      setPhase('tierlist')
      return
    }

    // Use up to 16 movies, but accept any pool size from 6 upward
    const target = Math.min(pool.length, 16)
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, target)
    setUnranked(shuffled)
    setTiers({ S: [], A: [], B: [], C: [], D: [], F: [] })
    setPhase('tierlist')
  }, [])

  const handleThemeSelect = useCallback((theme: ThemeConfig) => {
    if (theme.filter === 'personalizado') {
      setSelectedTheme(theme)
      setPhase('personalizado')
      return
    }

    if (theme.filter === 'custom') {
      const pool = allMovies.filter(m => (m.nota_imdb ?? 0) >= 7.5)
      startTierList(pool, theme)
    } else {
      const filterFn = theme.filter as (m: TierMovie) => boolean
      const pool = allMovies.filter(filterFn)
      startTierList(pool, theme)
    }
  }, [allMovies, startTierList])

  const handleCustomStart = useCallback(() => {
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
      description: 'Tier list personalizada',
      filter: 'personalizado',
    }

    startTierList(pool, customTheme)
  }, [allMovies, customGenres, customDecade, startTierList])

  const goToThemes = () => {
    setPhase('theme')
    setError(null)
    setSelectedMovie(null)
  }

  // Move movie to a tier
  const placeMovieInTier = (movie: TierMovie, tier: TierName, source: TierName | 'unranked') => {
    if (source === 'unranked') {
      setUnranked(prev => prev.filter(m => m.id !== movie.id))
    } else {
      setTiers(prev => ({ ...prev, [source]: prev[source].filter(m => m.id !== movie.id) }))
    }
    setTiers(prev => ({ ...prev, [tier]: [...prev[tier], movie] }))
    setSelectedMovie(null)
  }

  // Move movie back to unranked
  const moveToUnranked = (movie: TierMovie, fromTier: TierName) => {
    setTiers(prev => ({ ...prev, [fromTier]: prev[fromTier].filter(m => m.id !== movie.id) }))
    setUnranked(prev => [...prev, movie])
    setSelectedMovie(null)
  }

  // Mobile: tap to select, tap tier to place
  const handleMovieTap = (movie: TierMovie, source: TierName | 'unranked') => {
    if (selectedMovie?.id === movie.id) {
      setSelectedMovie(null)
      // If tapping again on a placed movie, move back to unranked
      if (source !== 'unranked') {
        moveToUnranked(movie, source)
      }
    } else {
      setSelectedMovie(movie)
      setDragSource(source)
    }
  }

  const handleTierTap = (tier: TierName) => {
    if (selectedMovie && dragSource !== null) {
      placeMovieInTier(selectedMovie, tier, dragSource)
    }
  }

  // Drag handlers
  const handleDragStart = (movie: TierMovie, source: TierName | 'unranked') => {
    setDraggedMovie(movie)
    setDragSource(source)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnTier = (tier: TierName) => {
    if (draggedMovie && dragSource !== null) {
      placeMovieInTier(draggedMovie, tier, dragSource)
    }
    setDraggedMovie(null)
    setDragSource(null)
  }

  const handleDropOnUnranked = () => {
    if (draggedMovie && dragSource !== null && dragSource !== 'unranked') {
      moveToUnranked(draggedMovie, dragSource as TierName)
    }
    setDraggedMovie(null)
    setDragSource(null)
  }

  const totalPlaced = TIERS.reduce((sum, t) => sum + tiers[t.name].length, 0)
  const totalMovies = totalPlaced + unranked.length
  const allPlaced = totalMovies > 0 && unranked.length === 0

  const handleShare = async () => {
    if (!selectedTheme) return
    let text = `Mi Tier List CineBret: ${selectedTheme.title}\n`
    for (const t of TIERS) {
      const movies = tiers[t.name]
      if (movies.length > 0) {
        text += `${t.name}: ${movies.map(m => m.titulo).join(', ')}\n`
      }
    }
    text += 'cinebret.cl/tierlist'

    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(text)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 2000)
  }

  const renderMovieCard = (movie: TierMovie, source: TierName | 'unranked', compact = false) => {
    const isSelected = selectedMovie?.id === movie.id
    return (
      <div
        key={movie.id}
        draggable
        onDragStart={() => handleDragStart(movie, source)}
        onClick={() => handleMovieTap(movie, source)}
        className={`
          relative flex-shrink-0 cursor-grab active:cursor-grabbing select-none transition-all duration-150
          ${compact ? 'w-16 h-24 md:w-20 md:h-28' : 'w-24 h-36 md:w-28 md:h-40'}
          rounded-lg overflow-hidden border-2
          ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400 scale-105 z-10' : 'border-zinc-700 hover:border-zinc-500'}
        `}
      >
        {movie.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
            alt={movie.titulo}
            fill
            className="object-cover"
            sizes="112px"
          />
        ) : (
          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 text-center p-1">
            {movie.titulo}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1">
          <p className="text-[9px] md:text-[10px] text-white font-bold leading-tight truncate">{movie.titulo}</p>
          {!compact && movie.anio && (
            <p className="text-[8px] text-zinc-400">{movie.anio}</p>
          )}
        </div>
      </div>
    )
  }

  const genreChips = GENRE_OPTIONS.map(g => ({ key: g, label: g }))
  const decadeChips = DECADE_OPTIONS.map(d => ({ key: String(d.min), label: d.label }))

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Tier List"
        subtitle="Clasifica películas de S a F según tu criterio."
        icon={<Icon.Trophy className="w-8 h-8" />}
      />

      {allLoading && <LoadingState text="Cargando películas..." size="lg" />}

      {/* THEME SELECTION */}
      {!allLoading && phase === 'theme' && (
        <Section label="Elige un tema">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {THEME_LIST.map((theme) => (
              <Card
                key={theme.id}
                as="button"
                interactive
                padding="md"
                onClick={() => handleThemeSelect(theme)}
                className="text-left border border-zinc-800 hover:border-yellow-400/60 min-h-[44px]"
              >
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-white leading-tight">
                    {theme.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 leading-snug">
                    {theme.description}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* PERSONALIZADO */}
      {!allLoading && phase === 'personalizado' && (
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={goToThemes}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-yellow-400 transition-colors text-sm font-semibold cursor-pointer mb-6 min-h-[44px]"
          >
            <Icon.ArrowLeft className="w-4 h-4" />
            <span>Volver a temas</span>
          </button>

          <h2 className="text-2xl font-black text-white mb-6">
            Crear tier list personalizada
          </h2>

          <Section label="Géneros (opcional)">
            <FilterChips
              chips={genreChips}
              value={customGenres}
              onChange={(val) => setCustomGenres(Array.isArray(val) ? val : [val])}
              multi
            />
          </Section>

          <Section label="Década (opcional)">
            <FilterChips
              chips={decadeChips}
              value={customDecade ? String(customDecade.min) : ''}
              onChange={(val) => {
                const key = Array.isArray(val) ? val[0] : val
                const match = DECADE_OPTIONS.find(d => String(d.min) === key)
                setCustomDecade(prev => {
                  if (!match) return null
                  if (prev?.min === match.min) return null
                  return { min: match.min, max: match.max }
                })
              }}
            />
          </Section>

          <Button onClick={handleCustomStart} size="lg" fullWidth>
            Crear tier list
          </Button>
        </div>
      )}

      {/* TIER LIST */}
      {!allLoading && (phase === 'tierlist' || phase === 'done') && (
        <>
          {error && (
            <ErrorState
              title="No hay suficientes películas"
              description={error}
              onRetry={goToThemes}
            />
          )}

          {!error && (
            <div>
              {/* Theme badge */}
              {selectedTheme && (
                <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
                  <Pill variant="gold" size="md" icon={<Icon.Film className="w-4 h-4" />}>
                    {selectedTheme.title}
                  </Pill>
                  <Button variant="ghost" size="sm" onClick={goToThemes}>
                    Cambiar tema
                  </Button>
                </div>
              )}

              {/* Instructions */}
              {!allPlaced && (
                <p className="text-center text-zinc-500 text-xs mb-4">
                  <span className="hidden md:inline">Arrastra las películas a los tiers</span>
                  <span className="md:hidden">Toca una película, luego toca un tier para colocarla</span>
                  {' · '}
                  <span className="text-yellow-400 font-semibold tabular-nums">{totalPlaced}/{totalMovies}</span>
                  {' clasificadas'}
                </p>
              )}

              {/* Tier rows — colors retained because they encode rank meaning */}
              <div className="space-y-2 mb-6">
                {TIERS.map(tier => (
                  <div
                    key={tier.name}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDropOnTier(tier.name)}
                    onClick={() => handleTierTap(tier.name)}
                    className={`
                      flex items-stretch min-h-[72px] md:min-h-[88px] rounded-lg border transition-colors
                      ${tier.border} ${tier.bg}
                      ${selectedMovie ? 'cursor-pointer hover:brightness-125' : ''}
                    `}
                  >
                    {/* Tier label */}
                    <div className={`flex items-center justify-center w-12 md:w-16 flex-shrink-0 font-black text-2xl md:text-3xl ${tier.color} border-r ${tier.border}`}>
                      {tier.name}
                    </div>
                    {/* Movies in tier */}
                    <div className="flex items-center gap-1.5 p-1.5 flex-wrap flex-1 min-h-[72px] md:min-h-[88px]">
                      {tiers[tier.name].length === 0 && (
                        <span className="text-zinc-600 text-xs px-2">
                          {selectedMovie ? 'Toca para colocar aquí' : ''}
                        </span>
                      )}
                      {tiers[tier.name].map(movie => renderMovieCard(movie, tier.name, true))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Unranked pool */}
              {unranked.length > 0 && (
                <Card
                  padding="md"
                  className="border border-zinc-800"
                  onClick={undefined}
                >
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnUnranked}
                  >
                    <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">
                      Sin clasificar ({unranked.length})
                    </h3>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {unranked.map(movie => renderMovieCard(movie, 'unranked'))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Done state */}
              {allPlaced && (
                <div className="text-center mt-10 space-y-5">
                  <div className="flex items-center justify-center gap-3">
                    <Icon.Trophy className="w-8 h-8 text-yellow-400" />
                    <h2 className="text-2xl md:text-3xl font-black text-yellow-400">
                      Tier list completa
                    </h2>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                    <Button
                      onClick={handleShare}
                      size="lg"
                      fullWidth
                      iconLeft={showCopied ? <Icon.Check className="w-4 h-4" /> : <Icon.Share className="w-4 h-4" />}
                    >
                      {showCopied ? 'Copiado' : 'Compartir'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      onClick={goToThemes}
                      iconLeft={<Icon.Refresh className="w-4 h-4" />}
                    >
                      Jugar de nuevo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
