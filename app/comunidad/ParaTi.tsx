'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from '@/app/catalogo/PeliculaDetalle'
import Loading from '@/components/Loading'

// ── Engagement tracking (skip detection) ──────────────────────────────
const ENGAGEMENT_KEY = 'cinebret-engagement'
const SKIP_DECAY_MS = 3 * 24 * 60 * 60 * 1000 // 3 days decay
const MIN_VIEW_MS_MOBILE = 3000 // 3 seconds on mobile
const MIN_VIEW_MS_DESKTOP = 4000 // 4 seconds on desktop

type EngagementEntry = { skips: number; lastSkip: number; engaged: boolean }
type EngagementMap = Record<string, EngagementEntry>

function getEngagement(): EngagementMap {
  try {
    const raw = localStorage.getItem(ENGAGEMENT_KEY)
    if (!raw) return {}
    const map: EngagementMap = JSON.parse(raw)
    // Clean up old entries (> 7 days)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const cleaned: EngagementMap = {}
    for (const [id, entry] of Object.entries(map)) {
      if (entry.lastSkip > cutoff || entry.engaged) cleaned[id] = entry
    }
    return cleaned
  } catch { return {} }
}

function saveEngagement(map: EngagementMap) {
  try { localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(map)) } catch {}
}

function recordSkip(movieId: string) {
  const map = getEngagement()
  const existing = map[movieId] || { skips: 0, lastSkip: 0, engaged: false }
  if (existing.engaged) return // already engaged, don't penalize
  existing.skips = Math.min(existing.skips + 1, 5) // cap at 5
  existing.lastSkip = Date.now()
  map[movieId] = existing
  saveEngagement(map)
}

function recordEngagement(movieId: string) {
  const map = getEngagement()
  map[movieId] = { skips: 0, lastSkip: 0, engaged: true }
  saveEngagement(map)
}

function getSkipPenalty(movieId: string): number {
  const map = getEngagement()
  const entry = map[movieId]
  if (!entry || entry.engaged) return 1.0 // no penalty
  const age = Date.now() - entry.lastSkip
  const decay = Math.min(age / SKIP_DECAY_MS, 1.0) // 0→1 over 3 days
  // Each skip reduces score by 10%, decaying over time
  const penalty = 1.0 - (entry.skips * 0.10 * (1.0 - decay))
  return Math.max(penalty, 0.5) // never penalize more than 50%
}

/** Pick top `topN` items + `randomN` random picks from positions topN..maxDepth for diversity */
function diverseSample<T>(sorted: T[], topN: number, randomN: number, maxDepth: number): T[] {
  const top = sorted.slice(0, topN)
  const deeper = sorted.slice(topN, maxDepth)
  if (deeper.length === 0 || randomN <= 0) return top
  // Fisher-Yates partial shuffle to pick randomN from deeper
  const picks: T[] = []
  const indices = deeper.map((_, i) => i)
  for (let i = 0; i < Math.min(randomN, indices.length); i++) {
    const j = i + Math.floor(Math.random() * (indices.length - i))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
    picks.push(deeper[indices[i]])
  }
  return [...top, ...picks]
}

const PLATAFORMAS = [
  { id: 'netflix',         nombre: 'Netflix',     logo: '/netflix.png' },
  { id: 'disney_plus',    nombre: 'Disney+',     logo: '/disney_plus.svg' },
  { id: 'hbo_max',        nombre: 'HBO',          logo: '/hbo_max.png' },
  { id: 'amazon_prime',   nombre: 'Prime',        logo: '/amazon_prime.png' },
  { id: 'apple_tv',       nombre: 'Apple TV+',    logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+',   logo: '/paramount_plus.svg' },
  { id: 'mubi',           nombre: 'MUBI',          logo: '/mubi.png' },
  { id: 'crunchyroll',   nombre: 'Crunchyroll',   logo: '/crunchyroll.png' },
]

const CATS = [
  { key: "Pa'l domingo de bajón",                       short: 'Bajón' },
  { key: "Pa' saltar del sillón",                       short: 'Del sillón' },
  { key: "Pa' quedar con el cerebro como licuadora",    short: 'Licuadora' },
  { key: "Pa' llorar a moco tendido",                   short: 'A moco tendido' },
]

// Mood bonus multipliers by rank position
const MOOD_BONUS = [1.5, 1.0, 0.5, 0]

type Rec = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  rt_score: number | null
  metacritic_score: number | null
  runtime: number | null
  boxoffice: number | null
  oscars: string | null
  poster_path: string | null
  backdrop_path: string | null
  categoria: string | null
  director: string | null
  actores: string | null
  compositor: string | null
  generos: string[]
  sinopsis: string | null
  razon: string
  score: number
  plataformas: string[]
  imdb_id: string | null
  youtube_trailer_key: string | null
  esReviewAutor: boolean
}

type UserState = { visto: boolean; watchlist: boolean; rating: number | null }

type UserProfile = {
  birth_year: number | null
  fav_movies: string[]
  generos_preferidos: string[]
  mood_ranking: string[]
  peso_critica: number
  peso_seguidores: number
  peso_director?: number
  peso_actores?: number
  peso_historial?: number
}

/**
 * Returns true if the title contains only allowed scripts:
 * ASCII printable, Latin Extended, Japanese (hiragana, katakana, kanji/CJK), CJK symbols.
 * Rejects Devanagari, Arabic, Cyrillic, Bengali, Tamil, etc.
 */
function tituloValido(titulo: string | null): boolean {
  if (!titulo) return false
  // eslint-disable-next-line no-control-regex
  const allowed = /^[\u0020-\u007E\u00C0-\u024F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]+$/
  return allowed.test(titulo)
}

async function getFechaCatalogo(): Promise<string> {
  const { data } = await supabase
    .from('catalogos')
    .select('fecha')
    .eq('activo', true)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const chileDate = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[0]
  return data?.fecha ?? chileDate
}

async function fetchCatalogosHoy(ids: string[]): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {}
  const fecha = await getFechaCatalogo()
  const platMap: Record<string, string[]> = {}
  const moviesWithTmdbProviders = new Set<string>()

  // Primary source: watch_providers (TMDB — more accurate)
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data } = await supabase
      .from('watch_providers')
      .select('pelicula_id, platform_key')
      .eq('provider_type', 'flatrate')
      .not('platform_key', 'is', null)
      .in('pelicula_id', chunk)
    ;(data ?? []).forEach((wp: any) => {
      if (!wp.platform_key) return
      if (!platMap[wp.pelicula_id]) platMap[wp.pelicula_id] = []
      if (!platMap[wp.pelicula_id].includes(wp.platform_key)) {
        platMap[wp.pelicula_id].push(wp.platform_key)
      }
      moviesWithTmdbProviders.add(wp.pelicula_id)
    })
  }

  // Fallback: catalogos (scraping) only for movies WITHOUT TMDB data
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data } = await supabase
      .from('catalogos')
      .select('pelicula_id, plataforma')
      .eq('fecha', fecha)
      .eq('activo', true)
      .in('pelicula_id', chunk)
    ;(data ?? []).forEach((c: any) => {
      if (moviesWithTmdbProviders.has(c.pelicula_id)) return
      if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
      if (!platMap[c.pelicula_id].includes(c.plataforma)) platMap[c.pelicula_id].push(c.plataforma)
    })
  }

  return platMap
}

/** Fetch candidate IDs from catalogos + watch_providers + recent quality movies */
async function fetchCandidatosHoy(): Promise<string[]> {
  const fecha = await getFechaCatalogo()
  const ids = new Set<string>()
  const batchSize = 1000

  // Source 1: catalogos (streaming platforms — scraping)
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('catalogos')
      .select('pelicula_id')
      .eq('fecha', fecha)
      .eq('activo', true)
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.add(r.pelicula_id))
    if (data.length < batchSize) break
    offset += batchSize
  }

  // Source 2: watch_providers (TMDB — includes rent/buy/flatrate)
  offset = 0
  while (true) {
    const { data } = await supabase
      .from('watch_providers')
      .select('pelicula_id')
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.add(r.pelicula_id))
    if (data.length < batchSize) break
    offset += batchSize
  }

  // Source 3: recent quality movies (theaters / now playing)
  const currentYear = new Date().getFullYear()
  offset = 0
  while (true) {
    const { data } = await supabase
      .from('peliculas')
      .select('id')
      .gte('nota_imdb', 7.0)
      .gte('anio', currentYear)
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.add(r.id))
    if (data.length < batchSize) break
    offset += batchSize
  }

  return Array.from(ids)
}

/** Fetch series candidate IDs (with watch providers or high quality) */
async function fetchCandidatosSeries(): Promise<string[]> {
  const ids = new Set<string>()
  const batchSize = 1000
  let offset = 0
  while (true) {
    const { data } = await supabase.from('watch_providers_series').select('serie_id').range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.add(r.serie_id))
    if (data.length < batchSize) break
    offset += batchSize
  }
  // Add high quality series
  offset = 0
  while (true) {
    const { data } = await supabase.from('series').select('id').gte('nota_imdb', 8.0).range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.add(r.id))
    if (data.length < batchSize) break
    offset += batchSize
  }
  return Array.from(ids)
}

async function fetchCatalogosSeries(ids: string[]): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {}
  const platMap: Record<string, string[]> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data } = await supabase.from('watch_providers_series').select('serie_id, platform_key')
      .eq('provider_type', 'flatrate').not('platform_key', 'is', null).in('serie_id', chunk)
    ;(data ?? []).forEach((wp: any) => {
      if (!platMap[wp.serie_id]) platMap[wp.serie_id] = []
      if (!platMap[wp.serie_id].includes(wp.platform_key)) platMap[wp.serie_id].push(wp.platform_key)
    })
  }
  return platMap
}

export type RecExport = Rec

// ── Tracked card: detects skips via IntersectionObserver ──────────────
function TrackedCard({ movieId, onClick, children }: {
  movieId: string; onClick: () => void; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const enteredAt = useRef<number | null>(null)
  const clicked = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          enteredAt.current = Date.now()
        } else if (enteredAt.current && !clicked.current) {
          const viewTime = Date.now() - enteredAt.current
          const threshold = window.innerWidth >= 768 ? MIN_VIEW_MS_DESKTOP : MIN_VIEW_MS_MOBILE
          if (viewTime < threshold) recordSkip(movieId)
          enteredAt.current = null
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [movieId])

  return (
    <div ref={ref}
      onClick={() => { clicked.current = true; onClick() }}
      className="text-left cursor-pointer">
      {children}
    </div>
  )
}

export default function ParaTi({
  onEditPreferences,
  preferenciasExternas,
  onMovieExpand,
  filtrosCategorias,
  filtrosPlataformas,
}: {
  onEditPreferences?: () => void
  preferenciasExternas?: UserProfile | null
  onMovieExpand?: (rec: Rec) => void
  filtrosCategorias?: string[]
  filtrosPlataformas?: string[]
}) {
  const { user, username: miUsername } = useAuth()
  const { mode } = useMediaMode()
  const isSeries = mode === 'series'
  const [recs, setRecs] = useState<Rec[]>([])
  const [cargando, setCargando] = useState(false)
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [visibleCount, setVisibleCount] = useState(150)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userMap, setUserMap] = useState<Record<string, UserState>>({})
  const [sinPerfil, setSinPerfil] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Cache key for sessionStorage (includes mode)
  const cacheKey = user ? `cinebret-recs-${user.id}-${mode}` : `cinebret-recs-anon-${mode}`
  const scrollKey = `${cacheKey}-scroll`
  const interactedKey = `${cacheKey}-dirty`

  const computeIdRef = useRef(0)

  useEffect(() => {
    if (!user && !preferenciasExternas) return

    // Cancel any previous compute by incrementing the ID
    const thisComputeId = ++computeIdRef.current

    // Try to restore from cache if user hasn't interacted
    try {
      const dirty = sessionStorage.getItem(interactedKey) === '1'
      const cached = sessionStorage.getItem(cacheKey)
      const cachedPage = sessionStorage.getItem(`${cacheKey}-page`)
      if (!dirty && cached) {
        const parsed: Rec[] = JSON.parse(cached)
        if (parsed.length > 0) {
          setRecs(parsed)
          if (cachedPage) setPage(parseInt(cachedPage, 10))
          requestAnimationFrame(() => {
            const savedScroll = sessionStorage.getItem(scrollKey)
            if (savedScroll && scrollRef.current) {
              scrollRef.current.scrollLeft = parseInt(savedScroll, 10)
            }
          })
          return
        }
      }
    } catch {}

    // Clear dirty flag and compute fresh
    try { sessionStorage.removeItem(interactedKey) } catch {}
    // Pass computeId so compute can check if it's still the current one
    compute(thisComputeId)
  }, [user, preferenciasExternas, mode])

  useEffect(() => {
    if (!user || recs.length === 0) return
    const table = isSeries ? 'user_series' : 'user_peliculas'
    const idField = isSeries ? 'serie_id' : 'pelicula_id'
    supabase
      .from(table)
      .select(`${idField}, visto, rating, watchlist`)
      .eq('user_id', user.id)
      .in(idField, recs.map(r => r.id))
      .then(({ data }) => {
        const map: Record<string, UserState> = {}
        ;(data ?? []).forEach((r: any) => {
          map[r[idField]] = { visto: r.visto, watchlist: r.watchlist, rating: r.rating }
        })
        setUserMap(map)
      })
  }, [user, recs, isSeries])

  const upsert = async (itemId: string, campos: Partial<UserState>) => {
    if (!user) return
    try { sessionStorage.setItem(interactedKey, '1') } catch {}
    const actual = userMap[itemId] ?? { visto: false, watchlist: false, rating: null }
    const nuevo = { ...actual, ...campos }
    setUserMap(prev => ({ ...prev, [itemId]: nuevo }))
    const table = isSeries ? 'user_series' : 'user_peliculas'
    const idField = isSeries ? 'serie_id' : 'pelicula_id'
    await supabase.from(table).upsert(
      { user_id: user.id, [idField]: itemId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: nuevo.rating },
      { onConflict: isSeries ? 'user_id,serie_id' : 'user_id,pelicula_id' }
    )
  }

  const compute = async (computeId?: number) => {
    setCargando(true)

    // 1. Candidatos según modo
    const allCandidatoIds = isSeries ? await fetchCandidatosSeries() : await fetchCandidatosHoy()
    if (allCandidatoIds.length === 0) { setCargando(false); return }

    // 2. Vistas del usuario (MIXTO: películas + series para el perfil)
    const excludeSet = new Set<string>()
    let vistasRaw: any[] = []
    let vistasSeriesRaw: any[] = []
    if (user) {
      const [{ data: pelVistas }, { data: serVistas }, { data: pelWL }, { data: serWL }] = await Promise.all([
        supabase.from('user_peliculas').select('pelicula_id, rating, created_at').eq('user_id', user.id).eq('visto', true),
        supabase.from('user_series').select('serie_id, rating, created_at').eq('user_id', user.id).eq('visto', true),
        supabase.from('user_peliculas').select('pelicula_id').eq('user_id', user.id).or('visto.eq.true,watchlist.eq.true'),
        supabase.from('user_series').select('serie_id').eq('user_id', user.id).or('visto.eq.true,watchlist.eq.true'),
      ])
      vistasRaw = pelVistas ?? []
      vistasSeriesRaw = serVistas ?? []
      // Exclude ALL interacted items (visto + watchlist)
      if (isSeries) {
        (serWL ?? []).forEach((r: any) => excludeSet.add(r.serie_id))
      } else {
        (pelWL ?? []).forEach((r: any) => excludeSet.add(r.pelicula_id))
      }
    }
    // Excluir del tipo actual — visto AND watchlist
    const idField = isSeries ? 'serie_id' : 'pelicula_id'
    const vistasActual = isSeries ? vistasSeriesRaw : vistasRaw
    const vistasSet = excludeSet

    // 2b. Fetch similar_ids from BOTH movies and series the user liked (mixed profile)
    let userSimilarTmdbIds: number[] = []
    const userSimilarReasons: Record<string, string> = {}

    // Seeds from movies
    if (vistasRaw.length > 0) {
      const highRated = vistasRaw.filter((v: any) => v.rating && v.rating >= 8).map((v: any) => v.pelicula_id)
      const recentSorted = [...vistasRaw].sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 10).map((v: any) => v.pelicula_id)
      const seedIds = [...new Set([...highRated, ...recentSorted])]
      if (seedIds.length > 0) {
        const { data: seedEnr } = await supabase.from('enriquecimiento').select('pelicula_id, similar_ids').in('pelicula_id', seedIds.slice(0, 30)).not('similar_ids', 'is', null)
        if (seedEnr && seedEnr.length > 0) {
          const { data: seedMovies } = await supabase.from('peliculas').select('id, titulo_ingles, titulo').in('id', seedEnr.map((e: any) => e.pelicula_id))
          const seedTitleMap = new Map((seedMovies || []).map((m: any) => [m.id, m.titulo_ingles || m.titulo]))
          for (const enr of seedEnr as any[]) {
            const seedTitle = seedTitleMap.get(enr.pelicula_id) || ''
            for (const tmdbId of (enr.similar_ids || []) as number[]) {
              if (!userSimilarTmdbIds.includes(tmdbId)) { userSimilarTmdbIds.push(tmdbId); userSimilarReasons[tmdbId] = `Similar a ${seedTitle}` }
            }
          }
        }
      }
    }
    // Seeds from series
    if (vistasSeriesRaw.length > 0) {
      const highRatedS = vistasSeriesRaw.filter((v: any) => v.rating && v.rating >= 8).map((v: any) => v.serie_id)
      const recentS = [...vistasSeriesRaw].sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 10).map((v: any) => v.serie_id)
      const seedIdsS = [...new Set([...highRatedS, ...recentS])]
      if (seedIdsS.length > 0) {
        const { data: seedEnrS } = await supabase.from('enriquecimiento_series').select('serie_id, similar_ids').in('serie_id', seedIdsS.slice(0, 30)).not('similar_ids', 'is', null)
        if (seedEnrS && seedEnrS.length > 0) {
          const { data: seedSeries } = await supabase.from('series').select('id, titulo_ingles, titulo').in('id', seedEnrS.map((e: any) => e.serie_id))
          const seedTitleMapS = new Map((seedSeries || []).map((s: any) => [s.id, s.titulo_ingles || s.titulo]))
          for (const enr of seedEnrS as any[]) {
            const seedTitle = seedTitleMapS.get(enr.serie_id) || ''
            for (const tmdbId of (enr.similar_ids || []) as number[]) {
              if (!userSimilarTmdbIds.includes(tmdbId)) { userSimilarTmdbIds.push(tmdbId); userSimilarReasons[tmdbId] = `Similar a ${seedTitle}` }
            }
          }
        }
      }
    }

    // Add similar items to candidate pool
    if (userSimilarTmdbIds.length > 0) {
      const simTable = isSeries ? 'series' : 'peliculas'
      const { data: simItems } = await supabase.from(simTable).select('id').in('tmdb_id', userSimilarTmdbIds.slice(0, 500))
      if (simItems) {
        for (const p of simItems) {
          if (!allCandidatoIds.includes(p.id)) allCandidatoIds.push(p.id)
        }
      }
    }

    const candidatoIds = allCandidatoIds.filter(id => !vistasSet.has(id))
    if (candidatoIds.length === 0) { setCargando(false); return }

    // 3. Preferencias: usar las pasadas por prop (ya frescas) o fetch desde Supabase
    let perfil: UserProfile | null = preferenciasExternas !== undefined ? (preferenciasExternas ?? null) : null
    if (preferenciasExternas === undefined && user) {
      const { data: prefData } = await supabase
        .from('perfil_preferencias')
        .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores, peso_director, peso_actores, peso_historial, series_fav, series_generos, series_mood_ranking, series_peso_critica, series_peso_seguidores')
        .eq('user_id', user.id)
        .maybeSingle()

      if (isSeries && prefData?.series_generos?.length) {
        // Use series-specific prefs, fall back to movie prefs for missing fields
        perfil = {
          birth_year: prefData.birth_year,
          fav_movies: prefData.series_fav ?? prefData.fav_movies ?? [],
          generos_preferidos: prefData.series_generos,
          mood_ranking: prefData.series_mood_ranking ?? prefData.mood_ranking ?? [],
          peso_critica: prefData.series_peso_critica ?? prefData.peso_critica ?? 0.5,
          peso_seguidores: prefData.series_peso_seguidores ?? prefData.peso_seguidores ?? 0.5,
          peso_director: 0, // No director clusters for series
          peso_actores: 0,  // No actor clusters for series
          peso_historial: prefData.peso_historial,
        }
      } else {
        perfil = prefData as UserProfile | null
      }
    }
    const tienePerfilCompleto = !!perfil || (isSeries && (vistasRaw.length + vistasSeriesRaw.length) >= 5)

    // Si no tiene perfil y no tiene historial, mostrar banner
    const hasHistory = (vistasRaw.length + vistasSeriesRaw.length) >= 5
    if (!tienePerfilCompleto && !hasHistory) {
      setSinPerfil(true)
    } else {
      setSinPerfil(false)
    }

    // 4. Fetch contenido y enriquecimiento según modo
    const pelMap: Record<string, any> = {}
    const enrMap: Record<string, any> = {}
    for (let i = 0; i < candidatoIds.length; i += 50) {
      const chunk = candidatoIds.slice(i, i + 50)
      if (isSeries) {
        const [{ data: sers }, { data: enrs }] = await Promise.all([
          supabase.from('series')
            .select('id, titulo, titulo_ingles, anio_inicio, nota_imdb, episode_runtime, num_temporadas, poster_path, backdrop_path, categoria, imdb_id, tmdb_id, youtube_trailer_key')
            .in('id', chunk),
          supabase.from('enriquecimiento_series')
            .select('serie_id, generos, director, actores, compositor, sinopsis_chilensis, keywords')
            .in('serie_id', chunk),
        ])
        ;(sers ?? []).forEach((s: any) => { pelMap[s.id] = { ...s, anio: s.anio_inicio, runtime: s.episode_runtime, rt_score: null, metacritic_score: null, boxoffice: null, oscars: null } })
        ;(enrs ?? []).forEach((e: any) => { enrMap[e.serie_id] = { ...e, pelicula_id: e.serie_id, youtube_trailer_key: null, es_review_autor: false } })
      } else {
        const [{ data: pels }, { data: enrs }] = await Promise.all([
          supabase.from('peliculas')
            .select('id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, poster_path, backdrop_path, categoria, imdb_id, tmdb_id')
            .in('id', chunk),
          supabase.from('enriquecimiento')
            .select('pelicula_id, generos, director, actores, compositor, sinopsis_chilensis, youtube_trailer_key, es_review_autor, keywords')
            .in('pelicula_id', chunk),
        ])
        ;(pels ?? []).forEach((p: any) => { pelMap[p.id] = p })
        ;(enrs ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
      }
    }

    // 5. Señal de seguidores
    const followersMap: Record<string, number> = {}
    let followingIds: string[] = []
    if (user) {
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      followingIds = (followsData ?? []).map((f: any) => f.following_id)
    }

    if (followingIds.length > 0) {
      for (let i = 0; i < followingIds.length; i += 50) {
        const chunk = followingIds.slice(i, i + 50)
        const { data: fvistas } = await supabase
          .from('user_peliculas')
          .select('pelicula_id')
          .in('user_id', chunk)
          .eq('visto', true)
        ;(fvistas ?? []).forEach((r: any) => {
          followersMap[r.pelicula_id] = (followersMap[r.pelicula_id] ?? 0) + 1
        })
      }
    }
    const maxFollowers = Math.max(...Object.values(followersMap), 1)

    // 6. Géneros y directores de películas favoritas del cuestionario
    let favGenres: string[] = []
    let favDirectors: string[] = []
    const favMovieIds = perfil?.fav_movies ?? []
    if (favMovieIds.length > 0) {
      const { data: favEnr } = await supabase
        .from('enriquecimiento')
        .select('pelicula_id, generos, director')
        .in('pelicula_id', favMovieIds)
      ;(favEnr ?? []).forEach((e: any) => {
        ;(e.generos ?? []).forEach((g: string) => favGenres.push(g))
        if (e.director) favDirectors.push(e.director)
      })
      favGenres = [...new Set(favGenres)]
      favDirectors = [...new Set(favDirectors)]
    }

    // 6b. Director clusters — only for movies
    const clusterMap: Record<string, number> = {}
    if (!isSeries) {
      const { data: clusterData } = await supabase.from('director_clusters').select('director, cluster_id')
      ;(clusterData ?? []).forEach((c: any) => { clusterMap[c.director] = c.cluster_id })
    }

    const userClusterWeights: Record<number, number> = {}
    for (const fd of favDirectors) {
      const cid = clusterMap[fd]
      if (cid !== undefined) userClusterWeights[cid] = (userClusterWeights[cid] ?? 0) + 2
    }

    // 6c. Actor clusters — only for movies
    const actorClusterMap: Record<string, number> = {}
    if (!isSeries) {
      const { data: actorClusterData } = await supabase.from('actor_clusters').select('actor, cluster_id')
      ;(actorClusterData ?? []).forEach((c: any) => { actorClusterMap[c.actor] = c.cluster_id })
    }

    const userActorClusterWeights: Record<number, number> = {}
    // Seed from fav movies' actors
    if (favMovieIds.length > 0) {
      const { data: favActEnr } = await supabase
        .from('enriquecimiento').select('actores').in('pelicula_id', favMovieIds)
      ;(favActEnr ?? []).forEach((e: any) => {
        const actList = Array.isArray(e.actores) ? e.actores : (e.actores ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)
        ;actList.forEach((a: string) => {
          const cid = actorClusterMap[a]
          if (cid !== undefined) userActorClusterWeights[cid] = (userActorClusterWeights[cid] ?? 0) + 1
        })
      })
    }

    // 7. Scoring con historial del usuario
    let normGenre: Record<string, number> = {}
    let normKeywords: Record<string, number> = {}
    let directorAvg: Record<string, number> = {}
    let eraAvg = 2005

    if (hasHistory) {
      // MIXED profile: ratings from both movies and series
      const ratingMap: Record<string, number> = {}
      vistasRaw.forEach((v: any) => { ratingMap[v.pelicula_id] = v.rating ?? 6 })
      vistasSeriesRaw.forEach((v: any) => { ratingMap[v.serie_id] = v.rating ?? 6 })

      const allVistaMovieIds = vistasRaw.map((v: any) => v.pelicula_id)
      const allVistaSerieIds = vistasSeriesRaw.map((v: any) => v.serie_id)

      const [{ data: pelisVistas }, { data: enrVistas }, { data: seriesVistas }, { data: enrSeriesVistas }] = await Promise.all([
        allVistaMovieIds.length > 0 ? supabase.from('peliculas').select('id, anio').in('id', allVistaMovieIds) : { data: [] },
        allVistaMovieIds.length > 0 ? supabase.from('enriquecimiento').select('pelicula_id, generos, director, actores, keywords').in('pelicula_id', allVistaMovieIds) : { data: [] },
        allVistaSerieIds.length > 0 ? supabase.from('series').select('id, anio_inicio').in('id', allVistaSerieIds) : { data: [] },
        allVistaSerieIds.length > 0 ? supabase.from('enriquecimiento_series').select('serie_id, generos, director, actores, keywords').in('serie_id', allVistaSerieIds) : { data: [] },
      ])

      const evMap: Record<string, any> = {}
      ;(enrVistas ?? []).forEach((e: any) => { evMap[e.pelicula_id] = e })
      ;(enrSeriesVistas ?? []).forEach((e: any) => { evMap[e.serie_id] = { ...e, pelicula_id: e.serie_id } })

      // Merge all watched items
      const allWatchedItems = [
        ...((pelisVistas ?? []) as any[]).map((p: any) => ({ id: p.id, anio: p.anio })),
        ...((seriesVistas ?? []) as any[]).map((s: any) => ({ id: s.id, anio: s.anio_inicio })),
      ]

      const genreWeight: Record<string, number> = {}
      const keywordWeight: Record<string, number> = {}
      const dirRatings: Record<string, number[]> = {}
      const years: number[] = []

      allWatchedItems.forEach((p: any) => {
        const r = ratingMap[p.id] ?? 6
        const enr = evMap[p.id]
        enr?.generos?.forEach((g: string) => { genreWeight[g] = (genreWeight[g] ?? 0) + r })
        ;(enr?.keywords ?? []).forEach((k: string) => { keywordWeight[k] = (keywordWeight[k] ?? 0) + r })
        if (enr?.director) {
          dirRatings[enr.director] = [...(dirRatings[enr.director] ?? []), r]
          // Add cluster weight from watch history (weighted by rating)
          const cid = clusterMap[enr.director]
          if (cid !== undefined) userClusterWeights[cid] = (userClusterWeights[cid] ?? 0) + (r / 10)
        }
        // Actor cluster weights from history
        const actList2 = Array.isArray(enr?.actores) ? enr.actores : (enr?.actores ?? '').split(',').map((a: string) => a.trim()).filter(Boolean)
        actList2.forEach((a: string) => {
          const acid = actorClusterMap[a]
          if (acid !== undefined) userActorClusterWeights[acid] = (userActorClusterWeights[acid] ?? 0) + (r / 10)
        })
        if (p.anio) years.push(p.anio)
      })

      const maxW = Math.max(...Object.values(genreWeight), 1)
      normGenre = Object.fromEntries(Object.entries(genreWeight).map(([g, w]) => [g, w / maxW]))
      // Normalize keyword weights
      const maxKW = Math.max(...Object.values(keywordWeight), 1)
      normKeywords = Object.fromEntries(Object.entries(keywordWeight).map(([k, w]) => [k, w / maxKW]))
      directorAvg = Object.fromEntries(
        Object.entries(dirRatings).map(([d, rs]) => [d, rs.reduce((a, b) => a + b, 0) / rs.length])
      )
      if (years.length > 0) {
        eraAvg = Math.round(years.reduce((a, b) => a + b, 0) / years.length)
      }
    }

    // 8. Era preferida desde birth_year o historial
    const anoActual = new Date().getFullYear()
    let preferredYear: number | null = null
    if (perfil?.birth_year) {
      const edad = anoActual - perfil.birth_year
      preferredYear = anoActual - edad + 15
    }

    // Pesos dinámicos controlados por el cuestionario
    // peso_critica 0→1: cuánto importa la nota IMDB (rango de aporte: 5%..35%)
    // peso_seguidores 0→1: cuánto importa lo que vieron tus seguidos (rango: 0%..20%)
    const pesoCritica = perfil?.peso_critica ?? 0.5
    const pesoSeguidores = perfil?.peso_seguidores ?? 0.5
    const wCritica = 0.05 + pesoCritica * 0.30        // [0.05, 0.35]
    const wSeguidores = pesoSeguidores * 0.20          // [0.00, 0.20]
    const pesoDir = perfil?.peso_director ?? 0.5
    const wDirector = 0.02 + pesoDir * 0.16            // [0.02, 0.18] — director + cluster combined
    const pesoAct = perfil?.peso_actores ?? 0.5
    const wActores = 0.02 + pesoAct * 0.12             // [0.02, 0.14] — actor + cluster combined

    // ── 9. POOL-BASED SCORING (Spotify-style) ──
    // Each pool picks the best movies for a specific reason.
    // Then we interleave them for variety.

    const genNorm = (g: string) => g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const genPrefs = perfil?.generos_preferidos ?? []
    const genPrefsNorm = genPrefs.map(genNorm)
    const moodRanking = perfil?.mood_ranking ?? []

    // Build all candidates as Rec objects first
    const allRecs: Rec[] = candidatoIds
      .filter(id => pelMap[id] && tituloValido(pelMap[id].titulo_ingles))
      .map(id => {
        const movie = pelMap[id]
        const enr = enrMap[id]
        return {
          id, titulo: movie.titulo, titulo_ingles: movie.titulo_ingles,
          anio: movie.anio, nota_imdb: movie.nota_imdb,
          rt_score: movie.rt_score ?? null, metacritic_score: movie.metacritic_score ?? null,
          runtime: movie.runtime ?? null, boxoffice: movie.boxoffice ?? null,
          oscars: movie.oscars ?? null, poster_path: movie.poster_path, backdrop_path: movie.backdrop_path ?? null, categoria: movie.categoria,
          director: enr?.director ?? null, actores: Array.isArray(enr?.actores) ? enr.actores.join(', ') : (enr?.actores ?? null),
          compositor: enr?.compositor ?? null, generos: enr?.generos ?? [],
          sinopsis: enr?.sinopsis_chilensis ?? null, razon: '', score: 0, plataformas: [],
          imdb_id: movie.imdb_id, youtube_trailer_key: enr?.youtube_trailer_key ?? null,
          esReviewAutor: enr?.es_review_autor ?? false,
        }
      })

    // Helper: quality score for sorting within pools
    const qualityOf = (r: Rec) => {
      const imdb = (r.nota_imdb ?? 5) / 10
      const followers = (followersMap[r.id] ?? 0) / maxFollowers
      return imdb * (0.5 + pesoCritica * 0.5) + followers * pesoSeguidores * 0.3
    }

    // ── POOL A: Géneros preferidos (del cuestionario)
    // "Porque te gustan los thrillers"
    // "Animación" is treated as a format, not a real genre — reduced weight
    const FORMAT_GENRES = new Set(['animación', 'animacion', 'animation'])
    const poolGenre: Rec[] = []
    if (genPrefs.length > 0) {
      for (const rec of allRecs) {
        const substantiveMatches = rec.generos.filter(g => {
          const norm = genNorm(g)
          return genPrefsNorm.includes(norm) && !FORMAT_GENRES.has(norm)
        })
        const formatMatches = rec.generos.filter(g => {
          const norm = genNorm(g)
          return genPrefsNorm.includes(norm) && FORMAT_GENRES.has(norm)
        })
        const matchScore = substantiveMatches.length * 3 + formatMatches.length * 0.5
        if (matchScore > 0) {
          const matched = [...substantiveMatches, ...formatMatches].slice(0, 2).map(g => g)
          poolGenre.push({ ...rec, score: matchScore + qualityOf(rec), razon: matched.join(', ') })
        }
      }
      poolGenre.sort((a, b) => b.score - a.score)
    }

    // ── POOL B: Director/Actor afinidad (favs + clusters)
    // "Porque te gusta Nolan" / "Porque te gusta Scorsese"
    const poolDirector: Rec[] = []
    const maxClusterW = Math.max(...Object.values(userClusterWeights), 1)
    const maxActClusterW = Math.max(...Object.values(userActorClusterWeights), 1)
    for (const rec of allRecs) {
      let dirScore = 0
      let reason = ''
      // Fav director match
      if (rec.director && favDirectors.includes(rec.director)) {
        dirScore += 5
        reason = `Dir. ${rec.director.split(' ').pop()}`
      }
      // Director cluster
      if (rec.director && clusterMap[rec.director] !== undefined) {
        const cid = clusterMap[rec.director]
        dirScore += ((userClusterWeights[cid] ?? 0) / maxClusterW) * 3
        if (!reason && dirScore > 1) reason = `Dir. ${rec.director.split(' ').pop()}`
      }
      // Actor cluster
      const actors = Array.isArray(rec.actores) ? rec.actores : (rec.actores ?? '').split(',').map(a => a.trim()).filter(Boolean)
      for (const a of actors) {
        const acid = actorClusterMap[a]
        if (acid !== undefined) {
          dirScore += ((userActorClusterWeights[acid] ?? 0) / maxActClusterW) * 2
        }
      }
      // History director match
      if (rec.director && directorAvg[rec.director]) {
        dirScore += directorAvg[rec.director] / 5
        if (!reason) reason = `Dir. ${rec.director.split(' ').pop()}`
      }
      if (dirScore > 0.5) {
        poolDirector.push({ ...rec, score: dirScore + qualityOf(rec), razon: reason || 'Directores afines' })
      }
    }
    poolDirector.sort((a, b) => b.score - a.score)

    // ── POOL C: Mood preferido (del cuestionario)
    // "Porque te gusta el cine cerebral"
    const poolMood: Rec[] = []
    if (moodRanking.length > 0) {
      for (const rec of allRecs) {
        const idx = moodRanking.indexOf(rec.categoria ?? '')
        if (idx >= 0 && idx < 2) { // Top 2 moods
          const cat = CATS.find(c => c.key === rec.categoria)
          poolMood.push({ ...rec, score: (2 - idx) * 3 + qualityOf(rec), razon: cat?.short ?? '' })
        }
      }
      poolMood.sort((a, b) => b.score - a.score)
    }

    // ── POOL D: Historial de vistas (géneros que has visto y disfrutado)
    // "Porque te gustaron películas similares"
    const poolHistory: Rec[] = []
    if (hasHistory) {
      for (const rec of allRecs) {
        const histMatch = rec.generos.reduce((s: number, g: string) => s + (normGenre[g] ?? 0), 0)
        if (histMatch > 0.3) {
          const matched = rec.generos.filter(g => (normGenre[g] ?? 0) > 0.2).slice(0, 2)
          poolHistory.push({ ...rec, score: histMatch * 2 + qualityOf(rec), razon: matched.length ? matched.join(', ') : 'Por tu historial' })
        }
      }
      poolHistory.sort((a, b) => b.score - a.score)
    }

    // ── POOL H: Keywords (temas que disfrutas)
    // "Porque te gustan temas como 'dark fantasy', 'revenge'"
    const poolKeywords: Rec[] = []
    if (Object.keys(normKeywords).length > 0) {
      for (const rec of allRecs) {
        const recKws = (enrMap[rec.id]?.keywords ?? []) as string[]
        if (recKws.length === 0) continue
        const kwMatch = recKws.reduce((s: number, k: string) => s + (normKeywords[k] ?? 0), 0)
        if (kwMatch > 0.5) {
          const topKws = recKws.filter(k => (normKeywords[k] ?? 0) > 0.3).slice(0, 2)
          poolKeywords.push({ ...rec, score: kwMatch * 2.5 + qualityOf(rec), razon: topKws.length ? topKws.join(', ') : 'Temas afines' })
        }
      }
      poolKeywords.sort((a, b) => b.score - a.score)
    }

    // ── POOL E: Seguidores (lo que ven tus seguidos)
    // "Porque tus amigos la vieron"
    const poolFollowers: Rec[] = []
    if (followingIds.length > 0) {
      for (const rec of allRecs) {
        const fCount = followersMap[rec.id] ?? 0
        if (fCount > 0) {
          poolFollowers.push({ ...rec, score: fCount * 3 + qualityOf(rec), razon: 'Tus seguidos la vieron' })
        }
      }
      poolFollowers.sort((a, b) => b.score - a.score)
    }

    // ── POOL F: Descubrimiento (alta calidad, géneros diferentes)
    // "Algo nuevo para ti"
    const poolDiscovery: Rec[] = []
    for (const rec of allRecs) {
      const isNewGenre = genPrefs.length > 0 && !rec.generos.some(g => genPrefsNorm.includes(genNorm(g)))
      const isHighQuality = (rec.nota_imdb ?? 0) >= (isSeries ? 8.5 : 7.5)
      if (isNewGenre && isHighQuality) {
        poolDiscovery.push({ ...rec, score: qualityOf(rec) * 2, razon: 'Algo nuevo para ti' })
      }
    }
    poolDiscovery.sort((a, b) => b.score - a.score)

    // ── POOL G: Similar a tus favoritas (based on similar_ids)
    // "Similar a Inception" / "Similar a The Dark Knight"
    const poolSimilar: Rec[] = []
    if (userSimilarTmdbIds.length > 0) {
      for (const rec of allRecs) {
        const tmdbId = pelMap[rec.id]?.tmdb_id
        if (tmdbId && userSimilarReasons[tmdbId]) {
          poolSimilar.push({ ...rec, score: qualityOf(rec) * 2.5, razon: userSimilarReasons[tmdbId] })
        }
      }
      poolSimilar.sort((a, b) => b.score - a.score)
    }

    // ── INTERLEAVE: mezclar los pools
    // Proporción: Genre(25%), Keywords(15%), Similar(20%), Director(10%), Mood(8%), History(8%), Followers(7%), Discovery(7%)
    const pools = [
      { items: diverseSample(poolGenre, 18, 15, 80), weight: 25 },
      { items: diverseSample(poolKeywords, 15, 10, 60), weight: 15 },
      { items: diverseSample(poolSimilar, 20, 15, 60), weight: 20 },
      { items: diverseSample(poolDirector, 12, 8, 50), weight: isSeries ? 5 : 10 },
      { items: diverseSample(poolMood, 10, 6, 40), weight: 8 },
      { items: diverseSample(poolHistory, 8, 6, 40), weight: 8 },
      { items: diverseSample(poolFollowers, 8, 7, 30), weight: 7 },
      { items: diverseSample(poolDiscovery, 5, 8, 30), weight: 7 },
    ]
    const activePools = pools.filter(p => p.items.length > 0)
    const totalWeight = activePools.reduce((s, p) => s + p.weight, 0)

    const seen = new Set<string>()
    const balanced: Rec[] = []
    const cursors = activePools.map(() => 0)
    const maxTotal = 150

    // Track consecutive same-format count for interleaving
    let consecutiveAnimation = 0
    const MAX_CONSECUTIVE_SAME_FORMAT = 3

    while (balanced.length < maxTotal) {
      let added = false
      for (let i = 0; i < activePools.length; i++) {
        const pool = activePools[i]
        const take = Math.max(1, Math.round((pool.weight / totalWeight) * 5))
        for (let t = 0; t < take && cursors[i] < pool.items.length; t++) {
          const rec = pool.items[cursors[i]]
          cursors[i]++
          if (seen.has(rec.id)) continue

          // Check if adding this would create too many consecutive same-format items
          const isAnim = rec.generos.some(g => FORMAT_GENRES.has(genNorm(g)))
          if (isAnim && consecutiveAnimation >= MAX_CONSECUTIVE_SAME_FORMAT) {
            // Skip this one for now, it'll come back in next rounds
            continue
          }

          seen.add(rec.id)
          balanced.push(rec)
          consecutiveAnimation = isAnim ? consecutiveAnimation + 1 : 0
          added = true
          if (balanced.length >= maxTotal) break
        }
        if (balanced.length >= maxTotal) break
      }
      if (!added) break
    }

    // 10. Plataformas según modo
    const platMap = isSeries
      ? await fetchCatalogosSeries(balanced.map(r => r.id))
      : await fetchCatalogosHoy(balanced.map(r => r.id))
    balanced.forEach(r => { r.plataformas = platMap[r.id] ?? [] })

    // Aplicar penalidad por skips + jitter aleatorio
    const final = balanced.map(r => ({
      ...r,
      score: r.score * getSkipPenalty(r.id) * (0.92 + Math.random() * 0.16)
    }))
    const sorted = final.sort((a, b) => b.score - a.score)
    // Only apply results if this compute is still the current one (prevents race condition)
    if (computeId !== undefined && computeId !== computeIdRef.current) return
    setRecs(sorted)
    try { sessionStorage.setItem(cacheKey, JSON.stringify(sorted)) } catch {}
    setCargando(false)
  }

  if (!user && !preferenciasExternas) return null

  const filtered = recs.filter(r => {
    if (filtrosCategorias && filtrosCategorias.length > 0 && !filtrosCategorias.includes(r.categoria ?? '')) return false
    if (filtrosPlataformas && filtrosPlataformas.length > 0 && !filtrosPlataformas.some(pl => r.plataformas.includes(pl))) return false
    return true
  })
  const displayed = filtered.slice(0, visibleCount)
  const hayMas = filtered.length > visibleCount
  const expandedRec = expandedId ? displayed.find(r => r.id === expandedId) ?? null : null

  const cambiarFiltro = (key: string | null) => {
    setCatFiltro(key === catFiltro ? null : key)
    setPage(0)
    setVisibleCount(150)
    setExpandedId(null)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white">Para ti</h2>
        {onEditPreferences && (
          <button type="button" onClick={onEditPreferences}
            className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors">
            Editar recomendaciones
          </button>
        )}
      </div>

      {sinPerfil && miUsername && (
        <div className="mb-3 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-300">Completa tu perfil para mejores recomendaciones</span>
          <Link href={`/perfil/${miUsername}`}
            className="text-xs font-medium text-yellow-400 hover:text-yellow-300 transition-colors whitespace-nowrap ml-auto">
            Personalizar →
          </Link>
        </div>
      )}

      {cargando ? (
        <Loading text="Calculando recomendaciones..." />
      ) : displayed.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sin películas recomendadas aún.</p>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-3 px-3">
            {displayed.map(rec => {
              const platsActivas = PLATAFORMAS.filter(p => rec.plataformas.includes(p.id))
              return (
                <TrackedCard key={rec.id} movieId={rec.id}
                  onClick={() => { recordEngagement(rec.id); onMovieExpand?.(rec) }}>
                  <div className="shrink-0 w-32">
                    <div className="relative w-32 h-48 rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent hover:ring-yellow-400/50 transition-all">
                      {rec.poster_path
                        ? <Image src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`} alt={rec.titulo_ingles || rec.titulo} fill className="object-cover" sizes="128px" />
                        : <div className="absolute inset-0 flex items-center justify-center p-2"><span className="text-zinc-600 text-xs text-center">{rec.titulo_ingles || rec.titulo}</span></div>
                      }
                      {rec.nota_imdb && (
                        <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400 flex items-center gap-0.5"><svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {rec.nota_imdb}</div>
                      )}
                      {platsActivas.length > 0 ? (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-4 pb-1 px-1">
                          <div className="flex items-center gap-0.5">
                            {platsActivas.slice(0, 3).map(p => (
                              <div key={p.id} className="bg-white rounded px-0.5 py-0.5" style={{ height: 12 }}>
                                <img loading="lazy" src={p.logo} alt={p.nombre} className="h-2 w-auto object-contain" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-white text-xs font-semibold leading-snug line-clamp-2 mb-0.5">{rec.titulo_ingles || rec.titulo}</p>
                    <p className="text-zinc-500 text-[11px] leading-snug line-clamp-1">{rec.razon}</p>
                  </div>
                </TrackedCard>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
