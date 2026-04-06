'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Nav from '@/components/Nav'
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
  emoji: string
  title: string
  description: string
  filter: 'custom' | 'personalizado' | ((m: TierMovie) => boolean)
}

const GENRE_OPTIONS = [
  'Drama', 'Comedia', 'Accion', 'Terror', 'Ciencia ficcion', 'Animacion',
  'Thriller', 'Romance', 'Documental', 'Western', 'Guerra', 'Biografia',
  'Crimen', 'Aventura', 'Fantasia', 'Misterio', 'Musical', 'Historia',
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
    emoji: '\u{1F3AD}',
    title: 'Drama de los 90s',
    description: 'Los mejores dramas de la decada dorada',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('drama')) && (m.anio ?? 0) >= 1990 && (m.anio ?? 0) <= 1999,
  },
  {
    id: 'oscar_winners',
    emoji: '\u{1F3C6}',
    title: 'Ganadoras de Mejor Pelicula',
    description: 'Las que se llevaron el Oscar gordo',
    filter: (m) => !!(m.oscars && m.oscars.toLowerCase().startsWith('gan')),
  },
  {
    id: 'tarantino',
    emoji: '\u{1F52A}',
    title: 'Peliculas de Tarantino',
    description: 'Sangre, dialogos y soundtracks',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('tarantino')),
  },
  {
    id: 'nolan',
    emoji: '\u{1F570}\u{FE0F}',
    title: 'Peliculas de Nolan',
    description: 'Tiempo, espacio y la mente',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('nolan')),
  },
  {
    id: 'zimmer',
    emoji: '\u{1F3B5}',
    title: 'Soundtracks de Hans Zimmer',
    description: 'Las mejores bandas sonoras',
    filter: (m) => !!(m.compositor && m.compositor.toLowerCase().includes('zimmer')),
  },
  {
    id: 'comedy2000s',
    emoji: '\u{1F923}',
    title: 'Comedias de los 2000s',
    description: 'Risas del nuevo milenio',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('comedia') || g.toLowerCase().includes('comedy')) && (m.anio ?? 0) >= 2000 && (m.anio ?? 0) <= 2009,
  },
  {
    id: 'horror_classic',
    emoji: '\u{1F47B}',
    title: 'Terror Clasico',
    description: 'Las que te quitaron el sueno',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('terror') || g.toLowerCase().includes('horror')) && (m.anio ?? 0) < 2010,
  },
  {
    id: 'scifi',
    emoji: '\u{1F680}',
    title: 'Ciencia Ficcion',
    description: 'Futuros posibles e imposibles',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('ciencia ficci') || g.toLowerCase().includes('sci-fi') || g.toLowerCase().includes('science fiction')),
  },
  {
    id: 'animation_adult',
    emoji: '\u{1F3A8}',
    title: 'Animacion para adultos',
    description: 'Animacion con nota alta en IMDb',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('animaci') || g.toLowerCase().includes('animation')) && (m.nota_imdb ?? 0) >= 7.5,
  },
  {
    id: 'thriller_psych',
    emoji: '\u{1F9E0}',
    title: 'Thrillers Psicologicos',
    description: 'Te vuelan la cabeza',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('thriller') || g.toLowerCase().includes('suspense')),
  },
  {
    id: 'spielberg',
    emoji: '\u{1F3AC}',
    title: 'Peliculas de Spielberg',
    description: 'El maestro del cine popular',
    filter: (m) => !!(m.director && m.director.toLowerCase().includes('spielberg')),
  },
  {
    id: 'romance_epic',
    emoji: '\u{2764}\u{FE0F}',
    title: 'Romance Epico',
    description: 'Historias de amor inolvidables',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('romance') || g.toLowerCase().includes('romanc')) && (m.nota_imdb ?? 0) >= 7,
  },
  {
    id: 'action80s',
    emoji: '\u{1F4A5}',
    title: 'Accion de los 80s',
    description: 'Explosiones y musculos',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('acci') || g.toLowerCase().includes('action')) && (m.anio ?? 0) >= 1980 && (m.anio ?? 0) <= 1989,
  },
  {
    id: 'docs_top',
    emoji: '\u{1F4F9}',
    title: 'Documentales Top',
    description: 'La realidad supera la ficcion',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('documental') || g.toLowerCase().includes('documentary')) && (m.nota_imdb ?? 0) >= 8,
  },
  {
    id: 'imdb9',
    emoji: '\u{2B50}',
    title: 'Peliculas con +9 IMDB',
    description: 'Lo mejor de lo mejor',
    filter: (m) => (m.nota_imdb ?? 0) >= 9,
  },
  {
    id: 'western',
    emoji: '\u{1F920}',
    title: 'Western',
    description: 'Duelos al atardecer',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('western')),
  },
  {
    id: 'war',
    emoji: '\u{2694}\u{FE0F}',
    title: 'Guerra y Conflicto',
    description: 'Batallas que marcaron la historia',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('guerra') || g.toLowerCase().includes('war') || g.toLowerCase().includes('belic')),
  },
  {
    id: 'biography',
    emoji: '\u{1F4D6}',
    title: 'Biografias Epicas',
    description: 'Vidas que merecen una pelicula',
    filter: (m) => (m.generos ?? []).some(g => g.toLowerCase().includes('biograf') || g.toLowerCase().includes('biography')),
  },
  {
    id: 'classics',
    emoji: '\u{1F39E}\u{FE0F}',
    title: 'Clasicos (+30 anos)',
    description: 'Las que resisten el paso del tiempo',
    filter: (m) => (m.anio ?? 2000) < 1996,
  },
  {
    id: 'recent',
    emoji: '\u{1F195}',
    title: 'Estrenos Recientes',
    description: 'Lo mas nuevo del cine',
    filter: (m) => (m.anio ?? 0) >= 2023,
  },
  {
    id: 'random',
    emoji: '\u{1F3B2}',
    title: 'Aleatorio',
    description: '16 peliculas al azar',
    filter: 'custom',
  },
  {
    id: 'personalizado',
    emoji: '\u{1F527}',
    title: 'Personalizado',
    description: 'Elige genero + decada',
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

    if (pool.length < 16) {
      setError(`Solo hay ${pool.length} peliculas para "${theme.title}". Se necesitan al menos 16.`)
      setPhase('tierlist')
      return
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 16)
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
      emoji: '\u{1F527}',
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
  const allPlaced = totalPlaced === 16 && unranked.length === 0

  const handleShare = async () => {
    if (!selectedTheme) return
    let text = `\u{1F3AC} Mi Tier List CineBret: ${selectedTheme.title}\n`
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav active="inicio" />

      <main className="max-w-5xl mx-auto px-4 pt-4 pb-20">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-4xl font-black">
            <span className="text-yellow-400">Tier List</span> CineBret
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Clasifica 16 peliculas de S a F</p>
        </div>

        {/* Loading */}
        {allLoading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">Cargando peliculas...</p>
          </div>
        )}

        {/* THEME SELECTION */}
        {!allLoading && phase === 'theme' && (
          <div>
            <h2 className="text-lg md:text-xl font-bold text-center mb-6 text-zinc-200">
              Elige un tema para tu tier list
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {THEME_LIST.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme)}
                  className="flex flex-col items-center text-center p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-yellow-400/60 hover:bg-zinc-800/80 transition-all duration-200 group cursor-pointer active:scale-95"
                >
                  <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">{theme.emoji}</span>
                  <span className="text-sm font-bold text-white group-hover:text-yellow-400 transition-colors leading-tight">
                    {theme.title}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1 leading-tight">{theme.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PERSONALIZADO */}
        {!allLoading && phase === 'personalizado' && (
          <div className="max-w-lg mx-auto">
            <button onClick={goToThemes} className="text-yellow-400 text-sm mb-4 hover:underline">
              {'<'} Volver a temas
            </button>
            <h2 className="text-lg font-bold mb-4 text-zinc-200">Crear tier list personalizada</h2>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">Generos (opcional)</h3>
              <div className="flex flex-wrap gap-2">
                {GENRE_OPTIONS.map(g => (
                  <button
                    key={g}
                    onClick={() => setCustomGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      customGenres.includes(g)
                        ? 'bg-yellow-400 text-black border-yellow-400 font-bold'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wide">Decada (opcional)</h3>
              <div className="flex flex-wrap gap-2">
                {DECADE_OPTIONS.map(d => (
                  <button
                    key={d.label}
                    onClick={() => setCustomDecade(prev => prev?.min === d.min ? null : { min: d.min, max: d.max })}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      customDecade?.min === d.min
                        ? 'bg-yellow-400 text-black border-yellow-400 font-bold'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCustomStart}
              className="w-full bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition text-sm"
            >
              Crear tier list
            </button>
          </div>
        )}

        {/* TIER LIST */}
        {!allLoading && (phase === 'tierlist' || phase === 'done') && (
          <>
            {error && (
              <div className="text-center py-20">
                <p className="text-red-400 mb-4">{error}</p>
                <button onClick={goToThemes} className="bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg hover:bg-yellow-300 transition">
                  Elegir otro tema
                </button>
              </div>
            )}

            {!error && (
              <div>
                {/* Theme badge */}
                {selectedTheme && (
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span className="text-lg">{selectedTheme.emoji}</span>
                    <span className="text-sm font-bold text-yellow-400">{selectedTheme.title}</span>
                    <button onClick={goToThemes} className="text-zinc-500 text-xs hover:text-zinc-300 ml-2 underline">
                      cambiar
                    </button>
                  </div>
                )}

                {/* Instructions */}
                {!allPlaced && (
                  <p className="text-center text-zinc-500 text-xs mb-4">
                    <span className="hidden md:inline">Arrastra peliculas a los tiers</span>
                    <span className="md:hidden">Toca una pelicula, luego toca un tier para colocarla</span>
                    {' '} &middot; {totalPlaced}/16 clasificadas
                  </p>
                )}

                {/* Tier rows */}
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
                            {selectedMovie ? 'Toca para colocar aqui' : ''}
                          </span>
                        )}
                        {tiers[tier.name].map(movie => renderMovieCard(movie, tier.name, true))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Unranked pool */}
                {unranked.length > 0 && (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnUnranked}
                    className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/50"
                  >
                    <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wide">
                      Sin clasificar ({unranked.length})
                    </h3>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {unranked.map(movie => renderMovieCard(movie, 'unranked'))}
                    </div>
                  </div>
                )}

                {/* Done state */}
                {allPlaced && (
                  <div className="text-center mt-8 space-y-4">
                    <h2 className="text-xl md:text-2xl font-black text-yellow-400">
                      Tier List completa!
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                      <button
                        onClick={handleShare}
                        className="flex-1 bg-yellow-400 text-black font-bold py-3 px-6 rounded-xl hover:bg-yellow-300 transition text-sm"
                      >
                        {showCopied ? 'Copiado!' : 'Compartir'}
                      </button>
                      <button
                        onClick={goToThemes}
                        className="flex-1 bg-zinc-800 text-white font-bold py-3 px-6 rounded-xl hover:bg-zinc-700 transition text-sm"
                      >
                        Jugar de nuevo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
