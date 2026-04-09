'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  IconButton,
  FilterChips,
  Pill,
  Tabs,
  Modal,
  LoadingState,
  EmptyState,
  ErrorState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

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

// Legacy fixed tier ids — kept as the default seed for `tierConfig`.
type TierName = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

type TierConfigItem = {
  id: string
  name: string
  /** Color key from TIER_COLOR_PRESETS */
  color: string
}

// Dark-mode-friendly tier color presets. Each entry carries text/bg/border
// Tailwind classes so tier visuals match the previous hardcoded palette.
const TIER_COLOR_PRESETS: Record<string, { label: string; swatch: string; text: string; bg: string; border: string }> = {
  gold:   { label: 'Oro',     swatch: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/40' },
  green:  { label: 'Verde',   swatch: 'bg-green-400',  text: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/40' },
  blue:   { label: 'Azul',    swatch: 'bg-blue-400',   text: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/40' },
  cream:  { label: 'Crema',   swatch: 'bg-yellow-300', text: 'text-yellow-300', bg: 'bg-yellow-300/10', border: 'border-yellow-300/40' },
  orange: { label: 'Naranja', swatch: 'bg-orange-400', text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/40' },
  red:    { label: 'Rojo',    swatch: 'bg-red-400',    text: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/40' },
  silver: { label: 'Plata',   swatch: 'bg-zinc-300',   text: 'text-zinc-200',   bg: 'bg-zinc-300/10',   border: 'border-zinc-300/40' },
  bronze: { label: 'Bronce',  swatch: 'bg-amber-600',  text: 'text-amber-500',  bg: 'bg-amber-600/10',  border: 'border-amber-600/40' },
  slate:  { label: 'Pizarra', swatch: 'bg-slate-400',  text: 'text-slate-300',  bg: 'bg-slate-400/10',  border: 'border-slate-400/40' },
  white:  { label: 'Blanco',  swatch: 'bg-white',      text: 'text-white',      bg: 'bg-white/10',      border: 'border-white/40' },
  purple: { label: 'Púrpura', swatch: 'bg-purple-400', text: 'text-purple-300', bg: 'bg-purple-400/10', border: 'border-purple-400/40' },
  pink:   { label: 'Rosa',    swatch: 'bg-pink-400',   text: 'text-pink-300',   bg: 'bg-pink-400/10',   border: 'border-pink-400/40' },
}

const DEFAULT_TIER_CONFIG: TierConfigItem[] = [
  { id: 'S', name: 'S', color: 'gold' },
  { id: 'A', name: 'A', color: 'green' },
  { id: 'B', name: 'B', color: 'blue' },
  { id: 'C', name: 'C', color: 'cream' },
  { id: 'D', name: 'D', color: 'orange' },
  { id: 'F', name: 'F', color: 'red' },
]

// Kept as the default seed for `tierConfig` — see DEFAULT_TIER_CONFIG above.
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

// ============================================================================
// Supabase `user_creations` types — feature 3
// ============================================================================

type SavedTierPayload = {
  id: string
  name: string
  color: string
  movieIds: string[]
}

type UserCreationRow = {
  id: string
  user_id: string
  type: 'poster' | 'tierlist'
  title: string
  movie_ids: string[]
  tiers: SavedTierPayload[] | null
  theme_id: string | null
  is_public: boolean
  likes_count: number
  created_at: string
}

type CreationWithProfile = UserCreationRow & {
  _username?: string | null
  _avatar_url?: string | null
}

type MainTab = 'cinebret' | 'crear' | 'comunidad' | 'mis'

export default function TierListPage() {
  const { user } = useAuth()
  const [mainTab, setMainTab] = useState<MainTab>('cinebret')

  const [phase, setPhase] = useState<'theme' | 'personalizado' | 'tierlist' | 'done'>('theme')
  const [allMovies, setAllMovies] = useState<TierMovie[]>([])
  const [allLoading, setAllLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<ThemeConfig | null>(null)

  // Custom filter
  const [customGenres, setCustomGenres] = useState<string[]>([])
  const [customDecade, setCustomDecade] = useState<{ min: number; max: number } | null>(null)

  // Tier configuration (editable — feature 2)
  const [tierConfig, setTierConfig] = useState<TierConfigItem[]>(DEFAULT_TIER_CONFIG)

  // Tier state: keyed by tierConfig[].id
  const [tiers, setTiers] = useState<Record<string, TierMovie[]>>(() => {
    const init: Record<string, TierMovie[]> = {}
    for (const t of DEFAULT_TIER_CONFIG) init[t.id] = []
    return init
  })
  const [unranked, setUnranked] = useState<TierMovie[]>([])
  const [selectedMovie, setSelectedMovie] = useState<TierMovie | null>(null)
  const [showCopied, setShowCopied] = useState(false)

  // Drag state (desktop HTML5 drag)
  const [draggedMovie, setDraggedMovie] = useState<TierMovie | null>(null)
  const [dragSource, setDragSource] = useState<string | 'unranked' | null>(null)

  // Touch drag state (feature 1)
  const [touchDragging, setTouchDragging] = useState(false)
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null)
  const [touchOverTier, setTouchOverTier] = useState<string | 'unranked' | null>(null)
  const touchDragRef = useRef<{ movie: TierMovie; source: string | 'unranked' } | null>(null)

  // Editar tiers modal (feature 2)
  const [tierEditorOpen, setTierEditorOpen] = useState(false)

  // Save/publish modal (feature 3)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveMode, setSaveMode] = useState<'save' | 'publish'>('save')
  const [saveTitle, setSaveTitle] = useState('')
  const [savingInFlight, setSavingInFlight] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // Comunidad / Mis creaciones data (feature 3)
  const [communityList, setCommunityList] = useState<CreationWithProfile[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [myList, setMyList] = useState<CreationWithProfile[]>([])
  const [myLoading, setMyLoading] = useState(false)

  // Load all movies
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

  // ------------------------------------------------------------------
  // Tier helpers (work off tierConfig)
  // ------------------------------------------------------------------

  const resetTiersForConfig = useCallback((config: TierConfigItem[]) => {
    const fresh: Record<string, TierMovie[]> = {}
    for (const t of config) fresh[t.id] = []
    setTiers(fresh)
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

    const target = Math.min(pool.length, 16)
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, target)
    setUnranked(shuffled)
    resetTiersForConfig(tierConfig)
    setPhase('tierlist')
    setMainTab('crear')
  }, [resetTiersForConfig, tierConfig])

  const handleThemeSelect = useCallback((theme: ThemeConfig) => {
    if (theme.filter === 'personalizado') {
      setSelectedTheme(theme)
      setPhase('personalizado')
      setMainTab('crear')
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
    setMainTab('cinebret')
  }

  // Move movie to a tier
  const placeMovieInTier = (movie: TierMovie, tierId: string, source: string | 'unranked') => {
    if (source === 'unranked') {
      setUnranked(prev => prev.filter(m => m.id !== movie.id))
    } else {
      setTiers(prev => ({
        ...prev,
        [source]: (prev[source] ?? []).filter(m => m.id !== movie.id),
      }))
    }
    setTiers(prev => ({
      ...prev,
      [tierId]: [...(prev[tierId] ?? []), movie],
    }))
    setSelectedMovie(null)
  }

  // Move movie back to unranked
  const moveToUnranked = (movie: TierMovie, fromTier: string) => {
    setTiers(prev => ({
      ...prev,
      [fromTier]: (prev[fromTier] ?? []).filter(m => m.id !== movie.id),
    }))
    setUnranked(prev => [...prev, movie])
    setSelectedMovie(null)
  }

  // Mobile: tap to select, tap tier to place (kept as fallback)
  const handleMovieTap = (movie: TierMovie, source: string | 'unranked') => {
    if (selectedMovie?.id === movie.id) {
      setSelectedMovie(null)
      if (source !== 'unranked') {
        moveToUnranked(movie, source)
      }
    } else {
      setSelectedMovie(movie)
      setDragSource(source)
    }
  }

  const handleTierTap = (tierId: string) => {
    if (selectedMovie && dragSource !== null) {
      placeMovieInTier(selectedMovie, tierId, dragSource)
    }
  }

  // Desktop drag handlers
  const handleDragStart = (movie: TierMovie, source: string | 'unranked') => {
    setDraggedMovie(movie)
    setDragSource(source)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnTier = (tierId: string) => {
    if (draggedMovie && dragSource !== null) {
      placeMovieInTier(draggedMovie, tierId, dragSource)
    }
    setDraggedMovie(null)
    setDragSource(null)
  }

  const handleDropOnUnranked = () => {
    if (draggedMovie && dragSource !== null && dragSource !== 'unranked') {
      moveToUnranked(draggedMovie, dragSource)
    }
    setDraggedMovie(null)
    setDragSource(null)
  }

  // ------------------------------------------------------------------
  // Touch drag (feature 1)
  // ------------------------------------------------------------------

  const resolveDropTargetFromPoint = (x: number, y: number): string | 'unranked' | null => {
    if (typeof document === 'undefined') return null
    const els = document.elementsFromPoint(x, y)
    for (const el of els) {
      const target = (el as HTMLElement).closest('[data-droptarget]') as HTMLElement | null
      if (target) {
        const type = target.getAttribute('data-droptarget')
        if (type === 'unranked') return 'unranked'
        if (type === 'tier') {
          const id = target.getAttribute('data-tier-id')
          if (id) return id
        }
      }
    }
    return null
  }

  const handleTouchStart = (e: React.TouchEvent, movie: TierMovie, source: string | 'unranked') => {
    const t = e.touches[0]
    if (!t) return
    touchDragRef.current = { movie, source }
    setTouchDragging(true)
    setTouchPos({ x: t.clientX, y: t.clientY })
    setTouchOverTier(null)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchDragRef.current) return
    const t = e.touches[0]
    if (!t) return
    // Prevent page scrolling while dragging a poster
    if (e.cancelable) e.preventDefault()
    setTouchPos({ x: t.clientX, y: t.clientY })
    const target = resolveDropTargetFromPoint(t.clientX, t.clientY)
    setTouchOverTier(target)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchDragRef.current) return
    const drag = touchDragRef.current
    const last = e.changedTouches[0]
    const target = last ? resolveDropTargetFromPoint(last.clientX, last.clientY) : touchOverTier

    if (target === 'unranked') {
      if (drag.source !== 'unranked') {
        moveToUnranked(drag.movie, drag.source)
      }
    } else if (target) {
      placeMovieInTier(drag.movie, target, drag.source)
    }

    touchDragRef.current = null
    setTouchDragging(false)
    setTouchPos(null)
    setTouchOverTier(null)
  }

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------

  const totalPlaced = tierConfig.reduce((sum, t) => sum + (tiers[t.id]?.length ?? 0), 0)
  const totalMovies = totalPlaced + unranked.length
  const allPlaced = totalMovies > 0 && unranked.length === 0

  const handleShare = async () => {
    if (!selectedTheme) return
    let text = `Mi Tier List CineBret: ${selectedTheme.title}\n`
    for (const t of tierConfig) {
      const movies = tiers[t.id] ?? []
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

  // ------------------------------------------------------------------
  // Save / publish (feature 3)
  // ------------------------------------------------------------------

  const openSaveModal = (mode: 'save' | 'publish') => {
    if (!user) {
      setSaveToast('Inicia sesión para guardar tu tier list.')
      setTimeout(() => setSaveToast(null), 3000)
      return
    }
    setSaveMode(mode)
    setSaveTitle(selectedTheme?.title ?? 'Mi tier list')
    setSaveModalOpen(true)
  }

  const handleConfirmSave = async () => {
    if (!user) return
    setSavingInFlight(true)
    try {
      const payloadTiers: SavedTierPayload[] = tierConfig.map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        movieIds: (tiers[t.id] ?? []).map(m => m.id),
      }))
      const allIds = payloadTiers.flatMap(t => t.movieIds)

      const { error: insertError } = await supabase
        .from('user_creations')
        .insert({
          user_id: user.id,
          type: 'tierlist',
          title: saveTitle.trim() || 'Mi tier list',
          movie_ids: allIds,
          tiers: payloadTiers,
          theme_id: selectedTheme?.id ?? null,
          is_public: saveMode === 'publish',
        })

      if (insertError) throw insertError
      setSaveModalOpen(false)
      setSaveToast(saveMode === 'publish' ? 'Publicada en Comunidad' : 'Guardada en Mis creaciones')
      setTimeout(() => setSaveToast(null), 3000)
      // refresh lists if we're viewing them
      if (mainTab === 'mis') loadMyCreations()
      if (mainTab === 'comunidad') loadCommunity()
    } catch (e: any) {
      setSaveToast('No se pudo guardar. Intenta de nuevo.')
      setTimeout(() => setSaveToast(null), 3000)
    } finally {
      setSavingInFlight(false)
    }
  }

  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('user_creations')
        .select('*')
        .eq('type', 'tierlist')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(0, 49)
      if (err || !data) {
        setCommunityList([])
        return
      }
      // Fetch profile info for unique authors
      const uniqueIds = Array.from(new Set(data.map(d => d.user_id)))
      const profilesMap = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (uniqueIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', uniqueIds)
        for (const p of profs ?? []) {
          profilesMap.set((p as any).user_id, {
            username: (p as any).username ?? null,
            avatar_url: (p as any).avatar_url ?? null,
          })
        }
      }
      setCommunityList(
        data.map((d: any) => ({
          ...d,
          _username: profilesMap.get(d.user_id)?.username ?? null,
          _avatar_url: profilesMap.get(d.user_id)?.avatar_url ?? null,
        })),
      )
    } finally {
      setCommunityLoading(false)
    }
  }, [])

  const loadMyCreations = useCallback(async () => {
    if (!user) {
      setMyList([])
      return
    }
    setMyLoading(true)
    try {
      const { data } = await supabase
        .from('user_creations')
        .select('*')
        .eq('type', 'tierlist')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, 99)
      setMyList((data ?? []) as CreationWithProfile[])
    } finally {
      setMyLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (mainTab === 'comunidad') loadCommunity()
    if (mainTab === 'mis') loadMyCreations()
  }, [mainTab, loadCommunity, loadMyCreations])

  // Fork an existing creation into the editor
  const handleLoadCreation = (row: CreationWithProfile) => {
    if (allMovies.length === 0) return
    const byId = new Map(allMovies.map(m => [m.id, m]))
    const savedTiers = (row.tiers ?? []) as SavedTierPayload[]

    const newConfig: TierConfigItem[] = savedTiers.length >= 3
      ? savedTiers.map(t => ({ id: t.id, name: t.name, color: t.color in TIER_COLOR_PRESETS ? t.color : 'gold' }))
      : DEFAULT_TIER_CONFIG

    const newTiers: Record<string, TierMovie[]> = {}
    const placedIds = new Set<string>()
    for (const t of newConfig) {
      const saved = savedTiers.find(s => s.id === t.id)
      const movies = (saved?.movieIds ?? []).map(id => byId.get(id)).filter(Boolean) as TierMovie[]
      newTiers[t.id] = movies
      movies.forEach(m => placedIds.add(m.id))
    }

    // Anything in movie_ids but not placed goes to unranked (defensive)
    const poolIds = row.movie_ids ?? []
    const extras = poolIds.filter(id => !placedIds.has(id)).map(id => byId.get(id)).filter(Boolean) as TierMovie[]

    setTierConfig(newConfig)
    setTiers(newTiers)
    setUnranked(extras)
    setSelectedTheme({
      id: row.theme_id ?? 'forked',
      title: row.title,
      description: 'Fork editable',
      filter: 'personalizado',
    })
    setPhase('tierlist')
    setMainTab('crear')
  }

  // ------------------------------------------------------------------
  // Tier editor helpers (feature 2)
  // ------------------------------------------------------------------

  const applyTierConfig = (next: TierConfigItem[]) => {
    // When the user removes or renames tiers, any movies under removed ids
    // are pushed back to unranked. Renames/reorders preserve contents.
    setTierConfig(next)
    setTiers(prev => {
      const out: Record<string, TierMovie[]> = {}
      const rescued: TierMovie[] = []
      for (const t of next) {
        out[t.id] = prev[t.id] ?? []
      }
      for (const [id, list] of Object.entries(prev)) {
        if (!out[id]) rescued.push(...list)
      }
      if (rescued.length > 0) {
        setUnranked(prevU => [...prevU, ...rescued])
      }
      return out
    })
  }

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const renderMovieCard = (movie: TierMovie, source: string | 'unranked', compact = false) => {
    const isSelected = selectedMovie?.id === movie.id
    const isBeingTouchDragged = touchDragging && touchDragRef.current?.movie.id === movie.id
    return (
      <div
        key={movie.id}
        draggable
        onDragStart={() => handleDragStart(movie, source)}
        onClick={() => handleMovieTap(movie, source)}
        onTouchStart={(e) => handleTouchStart(e, movie, source)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`
          relative flex-shrink-0 cursor-grab active:cursor-grabbing select-none transition-all duration-150 touch-none
          ${compact ? 'w-16 h-24 md:w-20 md:h-28' : 'w-24 h-36 md:w-28 md:h-40'}
          rounded-lg overflow-hidden border-2
          ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400 scale-105 z-10' : 'border-zinc-700 hover:border-zinc-500'}
          ${isBeingTouchDragged ? 'opacity-40' : ''}
        `}
      >
        {movie.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
            alt={movie.titulo}
            fill
            className="object-cover pointer-events-none"
            sizes="112px"
          />
        ) : (
          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 text-center p-1 pointer-events-none">
            {movie.titulo}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1 pointer-events-none">
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

  const tabs = [
    { key: 'cinebret' as const, label: 'CineBret' },
    { key: 'crear' as const, label: 'Crea el tuyo' },
    { key: 'comunidad' as const, label: 'Comunidad' },
    ...(user ? [{ key: 'mis' as const, label: 'Mis creaciones' }] : []),
  ]

  // ------------------------------------------------------------------
  // JSX
  // ------------------------------------------------------------------

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Tier List"
        subtitle="Clasifica películas de S a F según tu criterio."
        icon={<Icon.Trophy className="w-8 h-8" />}
      />

      <div className="mb-6">
        <Tabs tabs={tabs} value={mainTab} onChange={(k) => setMainTab(k as MainTab)} />
      </div>

      {allLoading && <LoadingState text="Cargando películas..." size="lg" />}

      {/* ============================= CINEBRET TAB ============================= */}
      {!allLoading && mainTab === 'cinebret' && (
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

      {/* ============================= CREAR TAB ============================= */}
      {!allLoading && mainTab === 'crear' && (
        <>
          {/* PERSONALIZADO */}
          {phase === 'personalizado' && (
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

          {/* Empty state when no tierlist in progress */}
          {phase === 'theme' && (
            <EmptyState
              icon={<Icon.Sparkles className="w-16 h-16" />}
              title="Empieza una tier list"
              description="Elige un tema en CineBret o crea una personalizada aquí."
              action={
                <div className="flex gap-3">
                  <Button onClick={() => setMainTab('cinebret')}>Ver temas</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedTheme({ id: 'personalizado', title: 'Personalizado', description: '', filter: 'personalizado' })
                      setPhase('personalizado')
                    }}
                  >
                    Personalizada
                  </Button>
                </div>
              }
            />
          )}

          {/* TIER LIST */}
          {(phase === 'tierlist' || phase === 'done') && (
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
                  {/* Theme badge + tier editor */}
                  <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
                    {selectedTheme && (
                      <Pill variant="gold" size="md" icon={<Icon.Film className="w-4 h-4" />}>
                        {selectedTheme.title}
                      </Pill>
                    )}
                    <Button variant="ghost" size="sm" onClick={goToThemes}>
                      Cambiar tema
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTierEditorOpen(true)}
                      iconLeft={<Icon.Edit className="w-4 h-4" />}
                    >
                      Editar tiers
                    </Button>
                  </div>

                  {!allPlaced && (
                    <p className="text-center text-zinc-500 text-xs mb-4">
                      <span className="hidden md:inline">Arrastra las películas a los tiers</span>
                      <span className="md:hidden">Arrastra con el dedo las películas a los tiers</span>
                      {' · '}
                      <span className="text-yellow-400 font-semibold tabular-nums">{totalPlaced}/{totalMovies}</span>
                      {' clasificadas'}
                    </p>
                  )}

                  {/* Tier rows */}
                  <div className="space-y-2 mb-6">
                    {tierConfig.map(tier => {
                      const preset = TIER_COLOR_PRESETS[tier.color] ?? TIER_COLOR_PRESETS.gold
                      const list = tiers[tier.id] ?? []
                      const isTouchOver = touchOverTier === tier.id
                      return (
                        <div
                          key={tier.id}
                          data-droptarget="tier"
                          data-tier-id={tier.id}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDropOnTier(tier.id)}
                          onClick={() => handleTierTap(tier.id)}
                          className={`
                            flex items-stretch min-h-[72px] md:min-h-[88px] rounded-lg border transition-colors
                            ${preset.border} ${preset.bg}
                            ${selectedMovie ? 'cursor-pointer hover:brightness-125' : ''}
                            ${isTouchOver ? 'ring-2 ring-yellow-400 brightness-125' : ''}
                          `}
                        >
                          <div className={`flex items-center justify-center w-12 md:w-16 flex-shrink-0 font-black text-2xl md:text-3xl ${preset.text} border-r ${preset.border}`}>
                            {tier.name}
                          </div>
                          <div className="flex items-center gap-1.5 p-1.5 flex-wrap flex-1 min-h-[72px] md:min-h-[88px]">
                            {list.length === 0 && (
                              <span className="text-zinc-600 text-xs px-2">
                                {selectedMovie ? 'Toca para colocar aquí' : ''}
                              </span>
                            )}
                            {list.map(movie => renderMovieCard(movie, tier.id, true))}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Unranked pool */}
                  {unranked.length > 0 && (
                    <Card padding="md" className="border border-zinc-800" onClick={undefined}>
                      <div
                        data-droptarget="unranked"
                        onDragOver={handleDragOver}
                        onDrop={handleDropOnUnranked}
                        className={touchOverTier === 'unranked' ? 'ring-2 ring-yellow-400 rounded' : ''}
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

                  {/* Done state — compact action bar */}
                  {allPlaced && (
                    <Card padding="md" className="mt-8 max-w-xl mx-auto border border-yellow-400/30 bg-yellow-400/5">
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <Icon.Trophy className="w-5 h-5 text-yellow-400" />
                        <h2 className="text-base font-black text-yellow-400">
                          Tier list completa
                        </h2>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          onClick={() => openSaveModal('save')}
                          iconLeft={<Icon.Bookmark className="w-4 h-4" />}
                        >
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          fullWidth
                          onClick={() => openSaveModal('publish')}
                          iconLeft={<Icon.Sparkles className="w-4 h-4" />}
                        >
                          Publicar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          onClick={handleShare}
                          iconLeft={showCopied ? <Icon.Check className="w-4 h-4" /> : <Icon.Share className="w-4 h-4" />}
                        >
                          {showCopied ? 'Copiado' : 'Compartir'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          fullWidth
                          onClick={goToThemes}
                          iconLeft={<Icon.Refresh className="w-4 h-4" />}
                        >
                          Jugar de nuevo
                        </Button>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ============================= COMUNIDAD TAB ============================= */}
      {!allLoading && mainTab === 'comunidad' && (
        <Section label="Tier lists de la comunidad">
          {communityLoading ? (
            <LoadingState text="Cargando creaciones..." />
          ) : communityList.length === 0 ? (
            <EmptyState
              icon={<Icon.Users className="w-16 h-16" />}
              title="Aún no hay tier lists publicadas"
              description="Sé la primera persona en publicar una."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {communityList.map(row => (
                <CreationCard
                  key={row.id}
                  row={row}
                  allMovies={allMovies}
                  onLoad={() => handleLoadCreation(row)}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ============================= MIS CREACIONES TAB ============================= */}
      {!allLoading && mainTab === 'mis' && user && (
        <Section label="Mis creaciones">
          {myLoading ? (
            <LoadingState text="Cargando tus creaciones..." />
          ) : myList.length === 0 ? (
            <EmptyState
              icon={<Icon.Bookmark className="w-16 h-16" />}
              title="Todavía no has guardado nada"
              description="Completa una tier list y guárdala desde el botón Guardar."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myList.map(row => (
                <CreationCard
                  key={row.id}
                  row={row}
                  allMovies={allMovies}
                  showVisibility
                  onLoad={() => handleLoadCreation(row)}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ============================= TOUCH DRAG GHOST ============================= */}
      {touchDragging && touchPos && touchDragRef.current && (
        <div
          className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-1/2 w-20 h-28 rounded-lg overflow-hidden border-2 border-yellow-400 shadow-2xl opacity-90"
          style={{ left: touchPos.x, top: touchPos.y }}
        >
          {touchDragRef.current.movie.poster_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w185${touchDragRef.current.movie.poster_path}`}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800" />
          )}
        </div>
      )}

      {/* ============================= SAVE MODAL ============================= */}
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title={saveMode === 'publish' ? 'Publicar en Comunidad' : 'Guardar tier list'}
        size="sm"
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-zinc-300">
            Título
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              maxLength={80}
              className="mt-2 w-full rounded-lg bg-zinc-800 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-white px-3 py-2 text-sm"
              placeholder="Mi tier list"
            />
          </label>
          <p className="text-xs text-zinc-500">
            {saveMode === 'publish'
              ? 'Será visible para toda la comunidad.'
              : 'Solo tú podrás verla en Mis creaciones.'}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setSaveModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSave} loading={savingInFlight}>
              {saveMode === 'publish' ? 'Publicar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ============================= TIER EDITOR MODAL ============================= */}
      <TierEditorModal
        open={tierEditorOpen}
        initial={tierConfig}
        onClose={() => setTierEditorOpen(false)}
        onSave={(next) => {
          applyTierConfig(next)
          setTierEditorOpen(false)
        }}
      />

      {/* ============================= TOAST ============================= */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-lg bg-zinc-900 border border-yellow-400/40 text-sm text-white shadow-xl">
          {saveToast}
        </div>
      )}
    </PageShell>
  )
}

// ============================================================================
// CreationCard — thumbnail grid of tier rows for Comunidad / Mis creaciones
// ============================================================================

function CreationCard({
  row,
  allMovies,
  onLoad,
  showVisibility = false,
}: {
  row: CreationWithProfile
  allMovies: TierMovie[]
  onLoad: () => void
  showVisibility?: boolean
}) {
  const byId = new Map(allMovies.map(m => [m.id, m]))
  const tiersPayload = (row.tiers ?? []) as SavedTierPayload[]

  return (
    <Card
      as="button"
      interactive
      padding="md"
      onClick={onLoad}
      className="text-left border border-zinc-800 hover:border-yellow-400/60"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{row.title}</h3>
          <p className="text-[11px] text-zinc-500 truncate">
            {row._username ? `@${row._username}` : 'Anónimo'}
          </p>
        </div>
        {showVisibility && (
          <Pill variant={row.is_public ? 'gold' : 'default'} size="sm">
            {row.is_public ? 'Pública' : 'Privada'}
          </Pill>
        )}
      </div>
      <div className="space-y-1">
        {tiersPayload.slice(0, 6).map(t => {
          const preset = TIER_COLOR_PRESETS[t.color] ?? TIER_COLOR_PRESETS.gold
          const posters = t.movieIds.slice(0, 8).map(id => byId.get(id)).filter(Boolean) as TierMovie[]
          return (
            <div key={t.id} className={`flex items-stretch rounded border ${preset.border} ${preset.bg} overflow-hidden`}>
              <div className={`flex items-center justify-center w-8 flex-shrink-0 font-black text-sm ${preset.text} border-r ${preset.border}`}>
                {t.name}
              </div>
              <div className="flex items-center gap-1 p-1 flex-1 overflow-hidden">
                {posters.length === 0 ? (
                  <span className="text-[10px] text-zinc-600 px-1">vacío</span>
                ) : (
                  posters.map(m => (
                    <div key={m.id} className="relative w-6 h-9 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
                      {m.poster_path && (
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="24px"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ============================================================================
// TierEditorModal — edit names, colors, order of tiers
// ============================================================================

function TierEditorModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial: TierConfigItem[]
  onClose: () => void
  onSave: (next: TierConfigItem[]) => void
}) {
  const [draft, setDraft] = useState<TierConfigItem[]>(initial)

  // Reset draft whenever the modal opens
  useEffect(() => {
    if (open) setDraft(initial)
  }, [open, initial])

  // Desktop reorder via drag handle
  const dragIndexRef = useRef<number | null>(null)
  const handleDragHandleStart = (i: number) => {
    dragIndexRef.current = i
  }
  const handleRowDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  const handleRowDrop = (targetIdx: number) => {
    const from = dragIndexRef.current
    dragIndexRef.current = null
    if (from === null || from === targetIdx) return
    setDraft(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(targetIdx, 0, moved)
      return next
    })
  }

  const moveUp = (i: number) => {
    if (i === 0) return
    setDraft(prev => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moveDown = (i: number) => {
    setDraft(prev => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      return next
    })
  }

  const addTier = () => {
    if (draft.length >= 8) return
    const used = new Set(draft.map(t => t.id))
    let idNum = 1
    while (used.has(`t${idNum}`)) idNum++
    setDraft(prev => [...prev, { id: `t${idNum}`, name: 'NEW', color: 'slate' }])
  }

  const removeTier = (i: number) => {
    if (draft.length <= 3) return
    setDraft(prev => prev.filter((_, idx) => idx !== i))
  }

  const updateTier = (i: number, patch: Partial<TierConfigItem>) => {
    setDraft(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }

  const colorKeys = Object.keys(TIER_COLOR_PRESETS)

  return (
    <Modal open={open} onClose={onClose} title="Editar tiers" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Mínimo 3 tiers, máximo 8. Al eliminar un tier sus películas vuelven a &quot;Sin clasificar&quot;.
        </p>

        <div className="space-y-2">
          {draft.map((tier, i) => {
            const preset = TIER_COLOR_PRESETS[tier.color] ?? TIER_COLOR_PRESETS.gold
            return (
              <div
                key={tier.id}
                onDragOver={handleRowDragOver}
                onDrop={() => handleRowDrop(i)}
                className={`flex items-center gap-2 p-3 rounded-lg border ${preset.border} ${preset.bg}`}
              >
                {/* Desktop drag handle */}
                <div
                  draggable
                  onDragStart={() => handleDragHandleStart(i)}
                  className="hidden md:flex cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 px-1"
                  title="Arrastrar para reordenar"
                >
                  <Icon.Menu className="w-4 h-4" />
                </div>

                {/* Mobile up/down */}
                <div className="flex md:hidden flex-col">
                  <IconButton
                    icon={<Icon.ChevronUp className="w-4 h-4" />}
                    label="Subir"
                    size="sm"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                  />
                  <IconButton
                    icon={<Icon.ChevronDown className="w-4 h-4" />}
                    label="Bajar"
                    size="sm"
                    onClick={() => moveDown(i)}
                    disabled={i === draft.length - 1}
                  />
                </div>

                {/* Name input */}
                <input
                  type="text"
                  value={tier.name}
                  maxLength={4}
                  onChange={(e) => updateTier(i, { name: e.target.value.toUpperCase() })}
                  className={`w-16 px-2 py-2 rounded bg-zinc-900 border border-zinc-700 font-black text-center ${preset.text} focus:outline-none focus:border-yellow-400`}
                />

                {/* Color picker */}
                <div className="flex items-center gap-1 flex-wrap flex-1">
                  {colorKeys.map(ck => {
                    const p = TIER_COLOR_PRESETS[ck]
                    const active = tier.color === ck
                    return (
                      <button
                        key={ck}
                        type="button"
                        onClick={() => updateTier(i, { color: ck })}
                        aria-label={p.label}
                        title={p.label}
                        className={`w-6 h-6 rounded-full ${p.swatch} border-2 cursor-pointer ${active ? 'border-white ring-2 ring-yellow-400' : 'border-zinc-700'}`}
                      />
                    )
                  })}
                </div>

                {/* Delete */}
                <IconButton
                  icon={<Icon.Trash className="w-4 h-4" />}
                  label="Eliminar tier"
                  size="sm"
                  onClick={() => removeTier(i)}
                  disabled={draft.length <= 3}
                />
              </div>
            )
          })}
        </div>

        <Button
          variant="secondary"
          onClick={addTier}
          disabled={draft.length >= 8}
          iconLeft={<Icon.Plus className="w-4 h-4" />}
          fullWidth
        >
          Añadir tier
        </Button>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(draft)}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}
