'use client'

import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  Pill,
  Tabs,
  Modal,
  SearchInput,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { svgElementToPngDataUrl, sharePngOrDownload } from '@/lib/svgToPng'

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

function pickRandomN(pool: BattleMovie[], size: number): BattleMovie[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, size)
}

// Bracket sizes — must be powers of 2 so the tree closes cleanly.
const BRACKET_SIZES = [8, 16, 32, 64] as const
type BracketSize = (typeof BRACKET_SIZES)[number]

// Share PNG dimensions — Instagram-friendly portrait card.
const SHARE_W = 1080
const SHARE_H = 1350

type CommunityRow = {
  id: string
  user_id: string
  type: string
  title: string
  movie_ids: string[]
  tiers: any
  theme_id: string | null
  is_public: boolean
  created_at: string
  _username?: string | null
  _avatar_url?: string | null
}

type SaveMode = 'save' | 'publish'

export default function BatallaPage() {
  const { user, username } = useAuth()
  const [mainTab, setMainTab] = useState<'cinebret' | 'crear' | 'comunidad' | 'mis'>('cinebret')
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

  // Manual builder state ("Crea el tuyo")
  const [builderTitle, setBuilderTitle] = useState('')
  const [builderSize, setBuilderSize] = useState<BracketSize>(16)
  const [builderPicks, setBuilderPicks] = useState<BattleMovie[]>([])
  const [builderQuery, setBuilderQuery] = useState('')

  // Save / publish state
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>('save')
  const [saveTitle, setSaveTitle] = useState('')
  const [savingInFlight, setSavingInFlight] = useState(false)
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // Comunidad / Mis creaciones
  const [communityList, setCommunityList] = useState<CommunityRow[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [myList, setMyList] = useState<CommunityRow[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Share / download (PNG via offscreen SVG)
  const shareSvgRef = useRef<SVGSVGElement>(null)
  const [shareInFlight, setShareInFlight] = useState(false)
  const [downloadInFlight, setDownloadInFlight] = useState(false)

  // The original 16 (or N) ids that the bracket started with — needed for save
  const [bracketSeed, setBracketSeed] = useState<string[]>([])

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

  const startBattle = useCallback((pool: BattleMovie[], theme: ThemeConfig, sizeArg?: BracketSize) => {
    setError(null)
    setChampion(null)
    setChosen(null)
    setCurrentRound(0)
    setCurrentMatch(0)
    setRounds([])
    setSelectedTheme(theme)

    // Pick the largest bracket size that fits in the pool — falls back to 8.
    let size: BracketSize = sizeArg ?? 16
    if (!sizeArg) {
      const fits = ([...BRACKET_SIZES].reverse() as BracketSize[]).find((s) => pool.length >= s)
      size = fits ?? 8
    }

    if (pool.length < size) {
      setError(`Solo hay ${pool.length} películas para "${theme.title}". Se necesitan al menos ${size}.`)
      setPhase('battle')
      setLoading(false)
      return
    }

    const selected = pickRandomN(pool, size)
    setMovies(selected)
    setBracketSeed(selected.map((m) => m.id))

    const initialMatches: BracketMatch[] = []
    for (let i = 0; i < size; i += 2) {
      initialMatches.push({ a: selected[i], b: selected[i + 1], winner: null })
    }
    setRounds([initialMatches])
    setPhase('battle')
    setMainTab('cinebret')
    setLoading(false)
  }, [])

  // Start a battle from an explicit list of movies (Crea el tuyo or
  // loaded from Comunidad / Mis creaciones). Skips the random pick.
  const startBattleFromMovies = useCallback((selected: BattleMovie[], theme: ThemeConfig) => {
    setError(null)
    setChampion(null)
    setChosen(null)
    setCurrentRound(0)
    setCurrentMatch(0)
    setRounds([])
    setSelectedTheme(theme)
    setMovies(selected)
    setBracketSeed(selected.map((m) => m.id))

    const initialMatches: BracketMatch[] = []
    for (let i = 0; i < selected.length; i += 2) {
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

  // ── Share / Download as PNG ──────────────────────────────────────
  const generateSharePng = useCallback(async (): Promise<string | null> => {
    const svg = shareSvgRef.current
    if (!svg) return null
    try {
      return await svgElementToPngDataUrl(svg, SHARE_W, SHARE_H, '#0c0a09')
    } catch (e) {
      console.error('Batalla PNG generation failed', e)
      return null
    }
  }, [])

  const handleShare = async () => {
    if (!champion || shareInFlight) return
    setShareInFlight(true)
    try {
      const dataUrl = await generateSharePng()
      if (!dataUrl) {
        setSaveToast('No pudimos generar la imagen.')
        setTimeout(() => setSaveToast(null), 3000)
        return
      }
      await sharePngOrDownload(
        dataUrl,
        `cinebret-batalla-${selectedTheme?.id || 'tema'}.png`,
        {
          title: 'Mi Batalla CineBret',
          text: `${selectedTheme?.title ?? 'Batalla'} · cinebret.cl/batalla`,
        },
      )
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } finally {
      setShareInFlight(false)
    }
  }

  const handleDownload = async () => {
    if (!champion || downloadInFlight) return
    setDownloadInFlight(true)
    try {
      const dataUrl = await generateSharePng()
      if (!dataUrl) {
        setSaveToast('No pudimos generar la imagen.')
        setTimeout(() => setSaveToast(null), 3000)
        return
      }
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `cinebret-batalla-${selectedTheme?.id || 'tema'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      setDownloadInFlight(false)
    }
  }

  // ── Save / publish ───────────────────────────────────────────────
  const openSaveModal = (mode: SaveMode) => {
    if (!user) {
      setSaveToast('Iniciá sesión para guardar tu batalla.')
      setTimeout(() => setSaveToast(null), 3000)
      return
    }
    setSaveMode(mode)
    setSaveTitle(selectedTheme?.title || 'Mi batalla')
    setSaveModalOpen(true)
  }

  const handleConfirmSave = async () => {
    if (!user || savingInFlight) return
    setSavingInFlight(true)
    try {
      const { error: insertError } = await supabase
        .from('user_creations')
        .insert({
          user_id: user.id,
          type: 'batalla',
          title: saveTitle.trim() || 'Mi batalla',
          movie_ids: bracketSeed,
          tiers: champion ? { champion_id: champion.id } : null,
          theme_id: selectedTheme?.id ?? null,
          is_public: saveMode === 'publish',
        })
      if (insertError) throw insertError
      setSaveModalOpen(false)
      setSaveToast(saveMode === 'publish' ? 'Publicada en Comunidad' : 'Guardada en Mis creaciones')
      setTimeout(() => setSaveToast(null), 3000)
      if (mainTab === 'mis') loadMyCreations()
      if (mainTab === 'comunidad') loadCommunity()
    } catch {
      setSaveToast('No se pudo guardar. Intenta de nuevo.')
      setTimeout(() => setSaveToast(null), 3000)
    } finally {
      setSavingInFlight(false)
    }
  }

  // ── Comunidad / Mis creaciones loaders ───────────────────────────
  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true)
    try {
      const { data } = await supabase
        .from('user_creations')
        .select('*')
        .eq('type', 'batalla')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(0, 49)
      if (!data) { setCommunityList([]); return }
      const userIds = Array.from(new Set(data.map((r: any) => r.user_id)))
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds)
      const profMap = new Map<string, { username: string | null; avatar_url: string | null }>()
      ;(profs ?? []).forEach((p: any) => profMap.set(p.user_id, { username: p.username, avatar_url: p.avatar_url }))
      setCommunityList(data.map((r: any) => ({
        ...r,
        _username: profMap.get(r.user_id)?.username ?? null,
        _avatar_url: profMap.get(r.user_id)?.avatar_url ?? null,
      })))
    } finally {
      setCommunityLoading(false)
    }
  }, [])

  const loadMyCreations = useCallback(async () => {
    if (!user) return
    setMyLoading(true)
    try {
      const { data } = await supabase
        .from('user_creations')
        .select('*')
        .eq('type', 'batalla')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(0, 99)
      setMyList((data ?? []) as CommunityRow[])
    } finally {
      setMyLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (mainTab === 'comunidad') loadCommunity()
    if (mainTab === 'mis') loadMyCreations()
  }, [mainTab, loadCommunity, loadMyCreations])

  const handleDeleteCreation = async (rowId: string) => {
    if (!user) return
    setMyList((prev) => prev.filter((r) => r.id !== rowId))
    setCommunityList((prev) => prev.filter((r) => r.id !== rowId))
    setPendingDeleteId(null)
    const { error: delErr } = await supabase
      .from('user_creations')
      .delete()
      .eq('id', rowId)
      .eq('user_id', user.id)
    if (delErr) {
      setSaveToast('No se pudo eliminar. Intenta de nuevo.')
      setTimeout(() => setSaveToast(null), 3000)
      loadMyCreations()
    } else {
      setSaveToast('Creación eliminada.')
      setTimeout(() => setSaveToast(null), 2500)
    }
  }

  // Fork an existing creation: rebuild the bracket from its movie_ids
  const handleLoadCreation = (row: CommunityRow) => {
    if (allMovies.length === 0) return
    const byId = new Map(allMovies.map((m) => [m.id, m]))
    const selected = (row.movie_ids ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean) as BattleMovie[]
    if (selected.length < 8 || selected.length % 2 !== 0) {
      setSaveToast('Esta batalla ya no se puede reconstruir.')
      setTimeout(() => setSaveToast(null), 3000)
      return
    }
    const theme: ThemeConfig = {
      id: row.theme_id ?? 'forked',
      title: row.title,
      description: 'Batalla guardada',
      filter: 'personalizado',
    }
    startBattleFromMovies(selected, theme)
    setMainTab('cinebret')
  }

  // ── Manual builder helpers ───────────────────────────────────────
  const builderResults = useMemo(() => {
    if (builderQuery.trim().length < 2) return [] as BattleMovie[]
    const q = builderQuery.toLowerCase()
    const pickedIds = new Set(builderPicks.map((p) => p.id))
    return allMovies
      .filter((m) => !pickedIds.has(m.id))
      .filter((m) =>
        m.titulo.toLowerCase().includes(q) ||
        (m.titulo_ingles ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [builderQuery, allMovies, builderPicks])

  const addBuilderPick = (m: BattleMovie) => {
    if (builderPicks.length >= builderSize) return
    if (builderPicks.some((p) => p.id === m.id)) return
    setBuilderPicks((prev) => [...prev, m])
    setBuilderQuery('')
  }

  const removeBuilderPick = (id: string) => {
    setBuilderPicks((prev) => prev.filter((m) => m.id !== id))
  }

  const handleBuilderStart = () => {
    if (builderPicks.length !== builderSize) return
    const customTheme: ThemeConfig = {
      id: `custom_${Date.now()}`,
      title: builderTitle.trim() || `Mi batalla (${builderSize})`,
      description: 'Batalla personalizada',
      filter: 'personalizado',
    }
    startBattleFromMovies([...builderPicks], customTheme)
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
    setMainTab('cinebret')
  }

  const totalMatchesInRound = rounds[currentRound]?.length ?? 0

  // Split round into left/right halves for the mirrored bracket
  const splitRoundWeb = (round: BracketMatch[]): [BracketMatch[], BracketMatch[]] => {
    const mid = Math.ceil(round.length / 2)
    return [round.slice(0, mid), round.slice(mid)]
  }

  const renderBracketTree = () => {
    if (rounds.length === 0) return null

    return (
      <div className="mt-10 overflow-x-auto pb-4 w-full">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 text-center">Cuadro del torneo</h3>
        <div className="flex items-stretch justify-center gap-1 md:gap-2 min-w-[700px] mx-auto">
          {/* Left bracket half — outer to inner */}
          {rounds.map((round, ri) => {
            const [leftMatches] = splitRoundWeb(round)
            return (
              <div key={`L${ri}`} className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 10}px` }}>
                {ri === 0 && (
                  <div className="text-[9px] text-zinc-500 text-center mb-0.5 font-medium uppercase tracking-wide">
                    {ROUND_NAMES[ri] ?? `R${ri + 1}`}
                  </div>
                )}
                {leftMatches.map((match, mi) => (
                  <div key={mi} className="flex flex-col border border-zinc-800 rounded-lg bg-zinc-900/80 overflow-hidden text-[10px]">
                    <div className={`flex items-center gap-1.5 px-1.5 py-1 truncate border-b border-zinc-800 ${match.winner?.id === match.a?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                      {match.a?.poster_path && (
                        <div className="relative w-5 h-7 rounded-sm overflow-hidden bg-zinc-800 shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${match.a.poster_path}`} alt="" fill className="object-cover" sizes="20px" />
                        </div>
                      )}
                      <span className="truncate">{match.a?.titulo ?? '—'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-1.5 py-1 truncate ${match.winner?.id === match.b?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                      {match.b?.poster_path && (
                        <div className="relative w-5 h-7 rounded-sm overflow-hidden bg-zinc-800 shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${match.b.poster_path}`} alt="" fill className="object-cover" sizes="20px" />
                        </div>
                      )}
                      <span className="truncate">{match.b?.titulo ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Champion center */}
          {champion && (
            <div className="flex flex-col justify-center shrink-0 px-2">
              <div className="text-[9px] text-zinc-500 text-center mb-1 font-medium uppercase tracking-wide">
                Campeón
              </div>
              <div className="relative w-20 mx-auto rounded-lg overflow-hidden border-2 border-yellow-400" style={{ aspectRatio: '2/3' }}>
                {champion.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w185${champion.poster_path}`} alt={champion.titulo} fill className="object-cover" sizes="80px" />
                )}
              </div>
              <p className="text-yellow-400 font-bold text-[10px] text-center mt-1 max-w-[90px] truncate mx-auto">
                {champion.titulo}
              </p>
            </div>
          )}

          {/* Right bracket half — outer to inner (mirrored: rightmost is ri=0) */}
          {[...rounds].reverse().map((round, reversedIdx) => {
            const ri = rounds.length - 1 - reversedIdx
            const [, rightMatches] = splitRoundWeb(round)
            if (!rightMatches || rightMatches.length === 0) return null
            return (
              <div key={`R${ri}`} className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 10}px` }}>
                {ri === 0 && (
                  <div className="text-[9px] text-zinc-500 text-center mb-0.5 font-medium uppercase tracking-wide">
                    {ROUND_NAMES[ri] ?? `R${ri + 1}`}
                  </div>
                )}
                {rightMatches.map((match, mi) => (
                  <div key={mi} className="flex flex-col border border-zinc-800 rounded-lg bg-zinc-900/80 overflow-hidden text-[10px]">
                    <div className={`flex items-center gap-1.5 px-1.5 py-1 truncate border-b border-zinc-800 ${match.winner?.id === match.a?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                      {match.a?.poster_path && (
                        <div className="relative w-5 h-7 rounded-sm overflow-hidden bg-zinc-800 shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${match.a.poster_path}`} alt="" fill className="object-cover" sizes="20px" />
                        </div>
                      )}
                      <span className="truncate">{match.a?.titulo ?? '—'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-1.5 py-1 truncate ${match.winner?.id === match.b?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                      {match.b?.poster_path && (
                        <div className="relative w-5 h-7 rounded-sm overflow-hidden bg-zinc-800 shrink-0">
                          <Image src={`https://image.tmdb.org/t/p/w92${match.b.poster_path}`} alt="" fill className="object-cover" sizes="20px" />
                        </div>
                      )}
                      <span className="truncate">{match.b?.titulo ?? '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
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

  const showTabs = phase === 'theme' && !allLoading

  const tabs = useMemo(
    () => {
      const base = [
        { key: 'cinebret', label: 'CineBret' },
        { key: 'crear', label: 'Crea el tuyo' },
        { key: 'comunidad', label: 'Comunidad' },
      ]
      if (user) base.push({ key: 'mis', label: 'Mis creaciones' })
      return base
    },
    [user],
  )

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Batalla CineBret"
        subtitle="Películas entran al torneo. Solo una alcanza la gloria."
        icon={<Icon.Trophy className="w-8 h-8" />}
      />

      {/* Loading all movies */}
      {allLoading && <LoadingState text="Cargando películas..." />}

      {/* Tabs — only on the theme/landing screen */}
      {showTabs && (
        <div className="mb-6">
          <Tabs
            tabs={tabs}
            value={mainTab}
            onChange={(k) => setMainTab(k as typeof mainTab)}
          />
        </div>
      )}

      {/* THEME SELECTION (CineBret tab) */}
      {!allLoading && phase === 'theme' && mainTab === 'cinebret' && (
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

      {/* CREA EL TUYO TAB */}
      {!allLoading && phase === 'theme' && mainTab === 'crear' && (
        <div className="max-w-2xl mx-auto">
          <Section label="Título de tu batalla">
            <input
              type="text"
              value={builderTitle}
              onChange={(e) => setBuilderTitle(e.target.value)}
              placeholder="Ej: Mis favoritas de los 90, Nolan vs Villeneuve..."
              maxLength={60}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 min-h-[44px]"
            />
          </Section>

          <Section label={`Tamaño del torneo`}>
            <div className="flex flex-wrap gap-2">
              {BRACKET_SIZES.map((s) => (
                <Pill
                  key={s}
                  variant="filter"
                  active={builderSize === s}
                  onClick={() => {
                    setBuilderSize(s)
                    // Trim picks if shrinking
                    setBuilderPicks((prev) => prev.slice(0, s))
                  }}
                >
                  {s} películas
                </Pill>
              ))}
            </div>
          </Section>

          <Section label={`Tu selección · ${builderPicks.length}/${builderSize}`}>
            {builderPicks.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                Buscá y elegí {builderSize} películas para armar tu propio bracket.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {builderPicks.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => removeBuilderPick(m.id)}
                    className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full pl-1 pr-3 py-1 text-xs text-white hover:border-yellow-400/40 cursor-pointer min-h-[36px]"
                  >
                    {m.poster_path && (
                      <div className="relative w-6 h-9 rounded overflow-hidden bg-zinc-800 shrink-0">
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt={m.titulo}
                          fill
                          className="object-cover"
                          sizes="24px"
                        />
                      </div>
                    )}
                    <span className="truncate max-w-[140px]">{m.titulo}</span>
                    <Icon.Close className="w-3 h-3 text-zinc-500" />
                  </button>
                ))}
              </div>
            )}
          </Section>

          {builderPicks.length < builderSize && (
            <div className="mt-4">
              <SearchInput
                value={builderQuery}
                onChange={setBuilderQuery}
                placeholder="Buscar película para agregar..."
              />
              {builderResults.length > 0 && (
                <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {builderResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => addBuilderPick(m)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 border-b border-zinc-800/60 last:border-0 cursor-pointer min-h-[44px]"
                    >
                      {m.poster_path && (
                        <div className="relative w-8 h-12 rounded overflow-hidden bg-zinc-800 shrink-0">
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                            alt={m.titulo}
                            fill
                            className="object-cover"
                            sizes="32px"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{m.titulo}</p>
                        <p className="text-zinc-500 text-[11px] tabular-nums">
                          {m.anio} · IMDb {m.nota_imdb ?? '—'}
                        </p>
                      </div>
                      <Icon.Plus className="w-4 h-4 text-yellow-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleBuilderStart}
            disabled={builderPicks.length !== builderSize}
            fullWidth
            size="lg"
            className="mt-6"
            iconLeft={<Icon.Trophy className="w-4 h-4" />}
          >
            {builderPicks.length === builderSize
              ? `Iniciar batalla con ${builderSize} películas`
              : `Faltan ${builderSize - builderPicks.length} películas`}
          </Button>
        </div>
      )}

      {/* COMUNIDAD TAB */}
      {!allLoading && phase === 'theme' && mainTab === 'comunidad' && (
        <Section label="Batallas de la comunidad">
          {communityLoading ? (
            <LoadingState text="Cargando batallas..." />
          ) : communityList.length === 0 ? (
            <EmptyState
              icon={<Icon.Trophy className="w-16 h-16" />}
              title="Aún no hay batallas publicadas"
              description="Sé la primera persona en publicar una."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {communityList.map((row) => (
                <BatallaCreationCard
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

      {/* MIS CREACIONES TAB */}
      {!allLoading && phase === 'theme' && mainTab === 'mis' && user && (
        <Section label="Mis batallas">
          {myLoading ? (
            <LoadingState text="Cargando tus batallas..." />
          ) : myList.length === 0 ? (
            <EmptyState
              icon={<Icon.Bookmark className="w-16 h-16" />}
              title="Todavía no guardaste ninguna batalla"
              description="Termina una batalla y pulsa Guardar o Publicar."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myList.map((row) => (
                <BatallaCreationCard
                  key={row.id}
                  row={row}
                  allMovies={allMovies}
                  showVisibility
                  canDelete
                  pendingDelete={pendingDeleteId === row.id}
                  onRequestDelete={() => setPendingDeleteId(row.id)}
                  onConfirmDelete={() => handleDeleteCreation(row.id)}
                  onCancelDelete={() => setPendingDeleteId(null)}
                  onLoad={() => handleLoadCreation(row)}
                />
              ))}
            </div>
          )}
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

              {/* Action grid: Save / Publish / Share / Download / Ficha / Jugar de nuevo */}
              <Card padding="md" className="mt-6 max-w-lg w-full border border-yellow-400/30 bg-yellow-400/5">
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
                    loading={shareInFlight}
                    onClick={handleShare}
                    iconLeft={showCopied ? <Icon.Check className="w-4 h-4" /> : <Icon.Share className="w-4 h-4" />}
                  >
                    {showCopied ? 'Listo' : 'Compartir'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    loading={downloadInFlight}
                    onClick={handleDownload}
                    iconLeft={<Icon.Download className="w-4 h-4" />}
                  >
                    Descargar
                  </Button>
                  <Link href={`/pelicula/${champion.id}`} className="col-span-2">
                    <Button variant="ghost" size="sm" fullWidth iconLeft={<Icon.Film className="w-4 h-4" />}>
                      Ver ficha de la película
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    className="col-span-2"
                    onClick={goToThemes}
                    iconLeft={<Icon.Refresh className="w-4 h-4" />}
                  >
                    Jugar de nuevo
                  </Button>
                </div>
              </Card>

              {renderBracketTree()}
            </div>
          )}
        </>
      )}

      {/* ─── Save / Publish modal ─── */}
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title={saveMode === 'publish' ? 'Publicar en Comunidad' : 'Guardar batalla'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest font-bold text-zinc-500 mb-2">
              Título
            </label>
            <input
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              maxLength={60}
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 min-h-[44px]"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setSaveModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              fullWidth
              loading={savingInFlight}
              onClick={handleConfirmSave}
            >
              {saveMode === 'publish' ? 'Publicar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Offscreen share SVG */}
      {phase === 'battle' && selectedTheme && rounds.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            width: SHARE_W,
            height: SHARE_H,
            pointerEvents: 'none',
            opacity: 0,
          }}
        >
          <BatallaShareSVG
            ref={shareSvgRef}
            theme={selectedTheme}
            rounds={rounds}
            champion={champion}
            username={username ?? null}
          />
        </div>
      )}

      {/* Toast */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-lg bg-zinc-900 border border-yellow-400/40 text-sm text-white shadow-xl">
          {saveToast}
        </div>
      )}
    </PageShell>
  )
}

// ============================================================================
// BatallaCreationCard — thumbnail for Comunidad / Mis creaciones
// ============================================================================

function BatallaCreationCard({
  row,
  allMovies,
  onLoad,
  showVisibility = false,
  canDelete = false,
  pendingDelete = false,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  row: CommunityRow
  allMovies: BattleMovie[]
  onLoad: () => void
  showVisibility?: boolean
  canDelete?: boolean
  pendingDelete?: boolean
  onRequestDelete?: () => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
}) {
  const byId = new Map(allMovies.map((m) => [m.id, m]))
  const previewMovies = (row.movie_ids ?? [])
    .slice(0, 8)
    .map((id) => byId.get(id))
    .filter(Boolean) as BattleMovie[]

  return (
    <div className="relative">
      <Card
        as="button"
        interactive
        padding="md"
        onClick={onLoad}
        className="text-left border border-zinc-800 hover:border-yellow-400/60 w-full"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate">{row.title}</h3>
            <p className="text-[11px] text-zinc-500 truncate">
              {row._username ? `@${row._username}` : 'Anónimo'}
              {' · '}
              {(row.movie_ids ?? []).length} películas
            </p>
          </div>
          {showVisibility && (
            <Pill variant={row.is_public ? 'gold' : 'default'} size="sm">
              {row.is_public ? 'Pública' : 'Privada'}
            </Pill>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {previewMovies.map((m) => (
            <div key={m.id} className="relative aspect-[2/3] rounded overflow-hidden bg-zinc-800">
              {m.poster_path && (
                <Image
                  src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                  alt={m.titulo}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {canDelete && !pendingDelete && (
        <button
          type="button"
          aria-label="Eliminar batalla"
          onClick={(e) => { e.stopPropagation(); onRequestDelete?.() }}
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-zinc-950/80 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-400/40 cursor-pointer transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
      {canDelete && pendingDelete && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-zinc-950/95 backdrop-blur-sm rounded-2xl border border-red-400/40 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-white text-sm font-semibold mr-2">¿Eliminar?</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirmDelete?.() }}
            className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-400/40 text-red-400 text-xs font-bold hover:bg-red-500/25 cursor-pointer min-h-[36px]"
          >
            Sí, eliminar
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancelDelete?.() }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold hover:bg-zinc-700 cursor-pointer min-h-[36px]"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// BatallaShareSVG — Instagram-portrait card with bracket + champion
// ============================================================================

/**
 * BatallaShareSVG — Instagram-portrait bracket card.
 *
 * Layout: bracket grows from both sides toward the center.
 *   Left half:  round 0 (top half) → round 1 → ... → semifinal left
 *   Center:     champion poster (large)
 *   Right half: round 0 (bottom half) → round 1 → ... → semifinal right
 *
 * Each match box shows a small poster thumbnail for both movies (via
 * /api/tmdb-image proxy so the canvas raster doesn't break on CORS).
 */
const BatallaShareSVG = forwardRef<
  SVGSVGElement,
  {
    theme: ThemeConfig
    rounds: BracketMatch[][]
    champion: BattleMovie | null
    username: string | null
  }
>(function BatallaShareSVG({ theme, rounds, champion, username }, ref) {
  const W = SHARE_W
  const H = SHARE_H
  const PAD = 48
  const HEADER_H = 180
  const FOOTER_H = 100
  const innerW = W - PAD * 2
  const treeAreaH = H - HEADER_H - FOOTER_H

  const numRounds = rounds.length || 1
  // The champion column sits in the center; bracket halves on each side.
  const champColW = champion ? 220 : 0
  const sideW = (innerW - champColW) / 2
  const colW = sideW / Math.max(numRounds, 1)

  // Split round 0 into left/right halves; later rounds stay whole but
  // their matches correspond to the left or right half of the bracket.
  // For rendering: left side shows rounds left-to-right (outer→inner),
  // right side shows rounds right-to-left (outer→inner, mirrored).
  function renderMatch(
    match: BracketMatch,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const posterW = Math.min(32, h * 0.35)
    const posterH = posterW * 1.5
    const aWon = match.winner?.id === match.a?.id
    const bWon = match.winner?.id === match.b?.id
    const halfH = h / 2
    const fontSize = Math.max(9, Math.min(13, halfH / 3))
    const textX = posterW + 8

    return (
      <g transform={`translate(${x}, ${y})`}>
        <rect x={0} y={0} width={w} height={h} rx={6} fill="rgba(24,24,27,0.85)" stroke="rgba(63,63,70,0.5)" />
        {/* A */}
        <rect x={0} y={0} width={w} height={halfH} rx={6} fill={aWon ? 'rgba(250,204,21,0.15)' : 'transparent'} />
        {match.a?.poster_path && (
          <image
            href={`/api/tmdb-image?path=${encodeURIComponent(match.a.poster_path)}&size=w92`}
            x={4}
            y={(halfH - posterH) / 2}
            width={posterW}
            height={posterH}
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        <text x={textX} y={halfH / 2 + fontSize / 3} fontFamily="Inter,sans-serif" fontSize={fontSize} fontWeight={aWon ? 800 : 500} fill={aWon ? '#facc15' : '#a1a1aa'}>
          {(match.a?.titulo ?? '—').slice(0, 18)}
        </text>
        {/* divider */}
        <line x1={0} y1={halfH} x2={w} y2={halfH} stroke="rgba(63,63,70,0.5)" />
        {/* B */}
        <rect x={0} y={halfH} width={w} height={halfH} rx={6} fill={bWon ? 'rgba(250,204,21,0.15)' : 'transparent'} />
        {match.b?.poster_path && (
          <image
            href={`/api/tmdb-image?path=${encodeURIComponent(match.b.poster_path)}&size=w92`}
            x={4}
            y={halfH + (halfH - posterH) / 2}
            width={posterW}
            height={posterH}
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        <text x={textX} y={halfH + halfH / 2 + fontSize / 3} fontFamily="Inter,sans-serif" fontSize={fontSize} fontWeight={bWon ? 800 : 500} fill={bWon ? '#facc15' : '#a1a1aa'}>
          {(match.b?.titulo ?? '—').slice(0, 18)}
        </text>
      </g>
    )
  }

  // Split each round's matches into left/right halves.
  function splitRound(round: BracketMatch[]): [BracketMatch[], BracketMatch[]] {
    const mid = Math.ceil(round.length / 2)
    return [round.slice(0, mid), round.slice(mid)]
  }

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ background: '#0c0a09' }}
    >
      <rect x={0} y={0} width={W} height={H} fill="#0c0a09" />
      <defs>
        <linearGradient id="goldFade2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={6} fill="url(#goldFade2)" />

      {/* Header */}
      <text x={PAD} y={72} fontFamily="Inter,sans-serif" fontSize={24} fontWeight={700} fill="#facc15" letterSpacing="5">
        CINEBRET · BATALLA
      </text>
      <text x={PAD} y={136} fontFamily="Inter,sans-serif" fontSize={48} fontWeight={900} fill="#fafaf9">
        {theme.title.length > 30 ? theme.title.slice(0, 28) + '…' : theme.title}
      </text>

      {/* Bracket area */}
      <g transform={`translate(${PAD}, ${HEADER_H})`}>
        {/* Left half — rounds go left (outer) to right (inner) */}
        {rounds.map((round, ri) => {
          const [leftMatches] = splitRound(round)
          const matchH = treeAreaH / Math.max(leftMatches.length, 1)
          const boxH = Math.min(72, matchH - 6)
          const x = ri * colW
          return (
            <g key={`L${ri}`}>
              {leftMatches.map((match, mi) => {
                const y = mi * matchH + (matchH - boxH) / 2
                return <g key={mi}>{renderMatch(match, x, y, colW - 8, boxH)}</g>
              })}
            </g>
          )
        })}

        {/* Champion center */}
        {champion && (
          <g transform={`translate(${sideW}, 0)`}>
            <text
              x={champColW / 2}
              y={24}
              textAnchor="middle"
              fontFamily="Inter,sans-serif"
              fontSize={16}
              fontWeight={800}
              fill="#facc15"
              letterSpacing="3"
            >
              CAMPEÓN
            </text>
            {champion.poster_path && (
              <image
                href={`/api/tmdb-image?path=${encodeURIComponent(champion.poster_path)}&size=w342`}
                x={(champColW - 160) / 2}
                y={treeAreaH / 2 - 140}
                width={160}
                height={240}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            <rect
              x={(champColW - 160) / 2}
              y={treeAreaH / 2 - 140}
              width={160}
              height={240}
              fill="none"
              stroke="#facc15"
              strokeWidth={3}
              rx={8}
            />
            <text
              x={champColW / 2}
              y={treeAreaH / 2 + 120}
              textAnchor="middle"
              fontFamily="Inter,sans-serif"
              fontSize={20}
              fontWeight={900}
              fill="#fafaf9"
            >
              {champion.titulo.length > 20 ? champion.titulo.slice(0, 18) + '…' : champion.titulo}
            </text>
          </g>
        )}

        {/* Right half — rounds go right (outer) to left (inner), mirrored */}
        {rounds.map((round, ri) => {
          const [, rightMatches] = splitRound(round)
          if (!rightMatches || rightMatches.length === 0) return null
          const matchH = treeAreaH / Math.max(rightMatches.length, 1)
          const boxH = Math.min(72, matchH - 6)
          // Position from the right: the outermost round (ri=0) sits at the far right.
          const x = innerW - (ri + 1) * colW + 8
          return (
            <g key={`R${ri}`}>
              {rightMatches.map((match, mi) => {
                const y = mi * matchH + (matchH - boxH) / 2
                return <g key={mi}>{renderMatch(match, x, y, colW - 8, boxH)}</g>
              })}
            </g>
          )
        })}
      </g>

      {/* Footer */}
      <line x1={PAD} y1={H - FOOTER_H} x2={W - PAD} y2={H - FOOTER_H} stroke="#facc15" strokeWidth={2} opacity={0.6} />
      <text x={PAD} y={H - FOOTER_H + 45} fontFamily="Inter,sans-serif" fontSize={24} fontWeight={700} fill="#fafaf9">
        {username ? `@${username}` : 'Tu batalla'}
      </text>
      <text x={W - PAD} y={H - FOOTER_H + 45} textAnchor="end" fontFamily="Inter,sans-serif" fontSize={24} fontWeight={700} fill="#facc15">
        cinebret.cl
      </text>
    </svg>
  )
})
