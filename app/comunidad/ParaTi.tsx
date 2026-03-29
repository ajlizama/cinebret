'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
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

const PLATAFORMAS = [
  { id: 'netflix',         nombre: 'Netflix',     logo: '/netflix.png' },
  { id: 'disney_plus',    nombre: 'Disney+',     logo: '/disney_plus.svg' },
  { id: 'hbo_max',        nombre: 'HBO',          logo: '/hbo_max.png' },
  { id: 'amazon_prime',   nombre: 'Prime',        logo: '/amazon_prime.png' },
  { id: 'apple_tv',       nombre: 'Apple TV+',    logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+',   logo: '/paramount_plus.svg' },
  { id: 'mubi',           nombre: 'MUBI',          logo: '/mubi.png' },
]

const CATS = [
  { key: "Pa'l domingo de bajón",                       emoji: '😔', short: 'Bajón' },
  { key: "Pa' saltar del sillón",                       emoji: '🎢', short: 'Del sillón' },
  { key: "Pa' quedar con el cerebro como licuadora",    emoji: '🧠', short: 'Licuadora' },
  { key: "Pa' llorar a moco tendido",                   emoji: '😭', short: 'A moco tendido' },
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
      className="shrink-0 w-36 text-left cursor-pointer">
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
  const [recs, setRecs] = useState<Rec[]>([])
  const [cargando, setCargando] = useState(false)
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userMap, setUserMap] = useState<Record<string, UserState>>({})
  const [sinPerfil, setSinPerfil] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Cache key for sessionStorage
  const cacheKey = user ? `cinebret-recs-${user.id}` : 'cinebret-recs-anon'
  const scrollKey = `${cacheKey}-scroll`
  const interactedKey = `${cacheKey}-dirty`

  useEffect(() => {
    if (!user && !preferenciasExternas) return

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
          // Restore scroll position after render
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
    compute()
  }, [user, preferenciasExternas])

  useEffect(() => {
    if (!user || recs.length === 0) return
    supabase
      .from('user_peliculas')
      .select('pelicula_id, visto, rating, watchlist')
      .eq('user_id', user.id)
      .in('pelicula_id', recs.map(r => r.id))
      .then(({ data }) => {
        const map: Record<string, UserState> = {}
        ;(data ?? []).forEach((r: any) => {
          map[r.pelicula_id] = { visto: r.visto, watchlist: r.watchlist, rating: r.rating }
        })
        setUserMap(map)
      })
  }, [user, recs])

  const upsert = async (peliculaId: string, campos: Partial<UserState>) => {
    if (!user) return
    // Mark as dirty so recs recalculate on next visit
    try { sessionStorage.setItem(interactedKey, '1') } catch {}
    const actual = userMap[peliculaId] ?? { visto: false, watchlist: false, rating: null }
    const nuevo = { ...actual, ...campos }
    setUserMap(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: nuevo.rating },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  const compute = async () => {
    setCargando(true)

    // 1. Candidatos: películas del catálogo de hoy
    const allCandidatoIds = await fetchCandidatosHoy()
    if (allCandidatoIds.length === 0) { setCargando(false); return }

    // 2. Vistas del usuario para excluir
    let vistasRaw: any[] = []
    if (user) {
      const { data } = await supabase
        .from('user_peliculas')
        .select('pelicula_id, rating')
        .eq('user_id', user.id)
        .eq('visto', true)
      vistasRaw = data ?? []
    }
    const vistasSet = new Set(vistasRaw.map((v: any) => v.pelicula_id))
    const candidatoIds = allCandidatoIds.filter(id => !vistasSet.has(id))
    if (candidatoIds.length === 0) { setCargando(false); return }

    // 3. Preferencias: usar las pasadas por prop (ya frescas) o fetch desde Supabase
    let perfil: UserProfile | null = preferenciasExternas !== undefined ? (preferenciasExternas ?? null) : null
    if (preferenciasExternas === undefined && user) {
      const { data: prefData } = await supabase
        .from('perfil_preferencias')
        .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores, peso_director, peso_actores, peso_historial')
        .eq('user_id', user.id)
        .maybeSingle()
      perfil = prefData as UserProfile | null
    }
    const tienePerfilCompleto = !!perfil

    // Si no tiene perfil y no tiene historial, mostrar banner
    const hasHistory = vistasRaw.length >= 5
    if (!tienePerfilCompleto && !hasHistory) {
      setSinPerfil(true)
    } else {
      setSinPerfil(false)
    }

    // 4. Fetch películas y enriquecimiento en paralelo por chunks
    const pelMap: Record<string, any> = {}
    const enrMap: Record<string, any> = {}
    for (let i = 0; i < candidatoIds.length; i += 50) {
      const chunk = candidatoIds.slice(i, i + 50)
      const [{ data: pels }, { data: enrs }] = await Promise.all([
        supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, poster_path, backdrop_path, categoria, imdb_id')
          .in('id', chunk),
        supabase.from('enriquecimiento')
          .select('pelicula_id, generos, director, actores, compositor, sinopsis_chilensis, youtube_trailer_key, es_review_autor')
          .in('pelicula_id', chunk),
      ])
      ;(pels ?? []).forEach((p: any) => { pelMap[p.id] = p })
      ;(enrs ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
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

    // 6b. Director clusters — fetch all clusters and build user preference
    const clusterMap: Record<string, number> = {} // director → cluster_id
    const { data: clusterData } = await supabase
      .from('director_clusters').select('director, cluster_id')
    ;(clusterData ?? []).forEach((c: any) => { clusterMap[c.director] = c.cluster_id })

    const userClusterWeights: Record<number, number> = {}
    for (const fd of favDirectors) {
      const cid = clusterMap[fd]
      if (cid !== undefined) userClusterWeights[cid] = (userClusterWeights[cid] ?? 0) + 2
    }

    // 6c. Actor clusters
    const actorClusterMap: Record<string, number> = {} // actor → cluster_id
    const { data: actorClusterData } = await supabase
      .from('actor_clusters').select('actor, cluster_id')
    ;(actorClusterData ?? []).forEach((c: any) => { actorClusterMap[c.actor] = c.cluster_id })

    const userActorClusterWeights: Record<number, number> = {}
    // Seed from fav movies' actors
    if (favMovieIds.length > 0) {
      const { data: favActEnr } = await supabase
        .from('enriquecimiento').select('actores').in('pelicula_id', favMovieIds)
      ;(favActEnr ?? []).forEach((e: any) => {
        ;(e.actores ?? '').split(',').map((a: string) => a.trim()).filter(Boolean).forEach((a: string) => {
          const cid = actorClusterMap[a]
          if (cid !== undefined) userActorClusterWeights[cid] = (userActorClusterWeights[cid] ?? 0) + 1
        })
      })
    }

    // 7. Scoring con historial del usuario
    let normGenre: Record<string, number> = {}
    let directorAvg: Record<string, number> = {}
    let eraAvg = 2005

    if (hasHistory) {
      const ratingMap: Record<string, number> = {}
      vistasRaw.forEach((v: any) => { ratingMap[v.pelicula_id] = v.rating ?? 6 })

      const [{ data: pelisVistas }, { data: enrVistas }] = await Promise.all([
        supabase.from('peliculas').select('id, anio').in('id', Array.from(vistasSet)),
        supabase.from('enriquecimiento').select('pelicula_id, generos, director').in('pelicula_id', Array.from(vistasSet)),
      ])

      const evMap: Record<string, any> = {}
      ;(enrVistas ?? []).forEach((e: any) => { evMap[e.pelicula_id] = e })

      const genreWeight: Record<string, number> = {}
      const dirRatings: Record<string, number[]> = {}
      const years: number[] = []

      ;(pelisVistas ?? []).forEach((p: any) => {
        const r = ratingMap[p.id] ?? 6
        const enr = evMap[p.id]
        enr?.generos?.forEach((g: string) => { genreWeight[g] = (genreWeight[g] ?? 0) + r })
        if (enr?.director) {
          dirRatings[enr.director] = [...(dirRatings[enr.director] ?? []), r]
          // Add cluster weight from watch history (weighted by rating)
          const cid = clusterMap[enr.director]
          if (cid !== undefined) userClusterWeights[cid] = (userClusterWeights[cid] ?? 0) + (r / 10)
        }
        // Actor cluster weights from history
        const actoresStr = enr?.actores ?? ''
        actoresStr.split(',').map((a: string) => a.trim()).filter(Boolean).forEach((a: string) => {
          const acid = actorClusterMap[a]
          if (acid !== undefined) userActorClusterWeights[acid] = (userActorClusterWeights[acid] ?? 0) + (r / 10)
        })
        if (p.anio) years.push(p.anio)
      })

      const maxW = Math.max(...Object.values(genreWeight), 1)
      normGenre = Object.fromEntries(Object.entries(genreWeight).map(([g, w]) => [g, w / maxW]))
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
          director: enr?.director ?? null, actores: enr?.actores ?? null,
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
    const poolGenre: Rec[] = []
    if (genPrefs.length > 0) {
      for (const rec of allRecs) {
        const matchCount = rec.generos.filter(g => genPrefsNorm.includes(genNorm(g))).length
        if (matchCount > 0) {
          const matched = rec.generos.filter(g => genPrefsNorm.includes(genNorm(g))).slice(0, 2)
          poolGenre.push({ ...rec, score: matchCount * 3 + qualityOf(rec), razon: matched.join(', ') })
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
      const actors = (rec.actores ?? '').split(',').map(a => a.trim()).filter(Boolean)
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
      const isHighQuality = (rec.nota_imdb ?? 0) >= 7.5
      if (isNewGenre && isHighQuality) {
        poolDiscovery.push({ ...rec, score: qualityOf(rec) * 2, razon: 'Algo nuevo para ti' })
      }
    }
    poolDiscovery.sort((a, b) => b.score - a.score)

    // ── INTERLEAVE: mezclar los pools
    // Proporción: Genre(40%), Director(20%), Mood(15%), History(10%), Followers(10%), Discovery(5%)
    const pools = [
      { items: poolGenre.slice(0, 60), weight: 40 },
      { items: poolDirector.slice(0, 30), weight: 20 },
      { items: poolMood.slice(0, 25), weight: 15 },
      { items: poolHistory.slice(0, 20), weight: 10 },
      { items: poolFollowers.slice(0, 15), weight: 10 },
      { items: poolDiscovery.slice(0, 10), weight: 5 },
    ]
    // Normalize weights for pools that have items
    const activePools = pools.filter(p => p.items.length > 0)
    const totalWeight = activePools.reduce((s, p) => s + p.weight, 0)

    const seen = new Set<string>()
    const balanced: Rec[] = []
    const cursors = activePools.map(() => 0)
    const maxTotal = 150

    while (balanced.length < maxTotal) {
      let added = false
      for (let i = 0; i < activePools.length; i++) {
        const pool = activePools[i]
        // How many items this pool contributes per round
        const take = Math.max(1, Math.round((pool.weight / totalWeight) * 5))
        for (let t = 0; t < take && cursors[i] < pool.items.length; t++) {
          const rec = pool.items[cursors[i]]
          cursors[i]++
          if (!seen.has(rec.id)) {
            seen.add(rec.id)
            balanced.push(rec)
            added = true
            if (balanced.length >= maxTotal) break
          }
        }
        if (balanced.length >= maxTotal) break
      }
      if (!added) break // all pools exhausted
    }

    // 10. Plataformas
    const platMap = await fetchCatalogosHoy(balanced.map(r => r.id))
    balanced.forEach(r => { r.plataformas = platMap[r.id] ?? [] })

    // Aplicar penalidad por skips + jitter aleatorio
    const final = balanced.map(r => ({
      ...r,
      score: r.score * getSkipPenalty(r.id) * (0.92 + Math.random() * 0.16)
    }))
    const sorted = final.sort((a, b) => b.score - a.score)
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
  const PAGE_SIZE = 100
  const displayed = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hayMas = filtered.length > (page + 1) * PAGE_SIZE
  const expandedRec = expandedId ? displayed.find(r => r.id === expandedId) ?? null : null

  const cambiarFiltro = (key: string | null) => {
    setCatFiltro(key === catFiltro ? null : key)
    setPage(0)
    setExpandedId(null)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white">🎬 Para ti</h2>
        {onEditPreferences && (
          <button type="button" onClick={onEditPreferences}
            className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors">
            ⚙️ Editar recomendaciones
          </button>
        )}
      </div>

      {sinPerfil && miUsername && (
        <div className="mb-3 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-300">✨ Completa tu perfil para mejores recomendaciones</span>
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
          <div ref={scrollRef} onScroll={() => {
            try { if (scrollRef.current) sessionStorage.setItem(scrollKey, String(scrollRef.current.scrollLeft)) } catch {}
          }} className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-3 px-3">
            {displayed.map(rec => {
              const platsActivas = PLATAFORMAS.filter(p => rec.plataformas.includes(p.id))
              return (
                <TrackedCard key={rec.id} movieId={rec.id}
                  onClick={() => { recordEngagement(rec.id); onMovieExpand?.(rec) }}>
                  <div className="relative w-36 h-52 rounded-2xl overflow-hidden bg-zinc-800 mb-2 ring-2 ring-transparent hover:ring-yellow-400/50 transition-all">
                    {rec.poster_path
                      ? <Image src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`} alt={rec.titulo_ingles || rec.titulo} fill className="object-cover" sizes="144px" />
                      : <div className="absolute inset-0 flex items-center justify-center p-2"><span className="text-zinc-600 text-xs text-center">{rec.titulo_ingles || rec.titulo}</span></div>
                    }
                    {rec.nota_imdb && (
                      <div className="absolute top-2 left-2 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400">⭐ {rec.nota_imdb}</div>
                    )}
                    {platsActivas.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-6 pb-2 px-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {platsActivas.map(p => (
                            <div key={p.id} className="bg-white rounded px-1 py-0.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img loading="lazy" src={p.logo} alt={p.nombre} className="h-3 w-auto object-contain block" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold leading-snug line-clamp-2 mb-0.5">{rec.titulo_ingles || rec.titulo}</p>
                  <p className="text-zinc-500 text-xs leading-snug line-clamp-1">{rec.razon}</p>
                </TrackedCard>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-zinc-600 text-xs">{filtered.length} películas</p>
            <div className="flex gap-2">
              {page > 0 && (
                <button type="button" onClick={() => { setPage(p => { const np = p - 1; try { sessionStorage.setItem(`${cacheKey}-page`, String(np)) } catch {}; return np }) }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors">← Anteriores</button>
              )}
              {hayMas && (
                <button type="button" onClick={() => { setPage(p => { const np = p + 1; try { sessionStorage.setItem(`${cacheKey}-page`, String(np)) } catch {}; return np }) }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors">Ver otras 100 →</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
