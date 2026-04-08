'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { useGuestLimit } from '@/hooks/useGuestLimit'
import GuestLimitModal from '@/components/GuestLimitModal'
import EnrichedDetails from '@/components/EnrichedDetails'
import ShareButton from '@/components/ShareButton'
import {
  PageShell,
  IconButton,
  Pill,
  PlatformLogo,
  LoadingState,
  Sheet,
  Icon,
  type Platform,
} from '@/components/ui'

const PLATFORM_KEYS: Platform[] = [
  'netflix',
  'disney_plus',
  'hbo_max',
  'amazon_prime',
  'apple_tv',
  'paramount_plus',
  'mubi',
  'crunchyroll',
]

type ReelMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  anio: number | null
  categoria: string | null
  poster_path: string | null
  logo_path: string | null
  director: string | null
  videoId: string
  plataformas: string[]
  source: 'upcoming' | 'trending' | 'catalog'
}

function extractYTId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function getSessionSeed(): number {
  if (typeof window === 'undefined') return Date.now()
  const key = 'cinereels-session-seed'
  const stored = sessionStorage.getItem(key)
  if (stored) return parseInt(stored, 10)
  const seed = Date.now() ^ Math.floor(Math.random() * 1000000)
  sessionStorage.setItem(key, seed.toString())
  return seed
}

function getDaySeed(): number {
  const d = new Date()
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

// Fisher-Yates shuffle with seeded PRNG
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let ytReady = false
let ytPromise: Promise<void> | null = null
function loadYT(): Promise<void> {
  if (ytReady) return Promise.resolve()
  if (ytPromise) return ytPromise
  ytPromise = new Promise(resolve => {
    ;(window as any).onYouTubeIframeAPIReady = () => { ytReady = true; resolve() }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return ytPromise
}

function MovieOverlay({ movie, index, total, muted, onShowInfo, visto, watchlist, onVisto, onWatchlist, isSeries = false }: {
  movie: ReelMovie; index: number; total: number; muted: boolean; onShowInfo: () => void
  visto: boolean; watchlist: boolean; onVisto: () => void; onWatchlist: () => void; isSeries?: boolean
}) {
  const isUpcoming = movie.source === 'upcoming'
  const activePlatforms = PLATFORM_KEYS.filter((key) => movie.plataformas.includes(key))

  return (
    <>
      {/* Mute indicator */}
      <div className="absolute top-4 right-4 z-30 pointer-events-none">
        <div className="bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-white">
          {muted ? (
            <Icon.VolumeOff className="w-4 h-4" />
          ) : (
            <Icon.VolumeOn className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Movie logo below nav */}
      {movie.logo_path && (
        <div className="absolute top-16 left-4 z-20 pointer-events-none">
          <img
            loading="lazy"
            src={`https://image.tmdb.org/t/p/w500${movie.logo_path}`}
            alt=""
            className="h-20 md:h-28 w-auto max-w-[75vw] object-contain drop-shadow-2xl"
          />
        </div>
      )}

      {/* Bottom info */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)' }}
      >
        <div className="p-5 pb-8">
          {isUpcoming && (
            <div className="mb-2">
              <Pill variant="gold" size="sm">Próximamente</Pill>
            </div>
          )}
          <Link href={`${isSeries ? '/serie' : '/pelicula'}/${movie.id}`} className="pointer-events-auto">
            <h3
              className={`text-white font-bold drop-shadow-lg ${
                movie.logo_path ? 'text-lg' : 'text-xl'
              }`}
            >
              {movie.titulo_ingles || movie.titulo}
            </h3>
          </Link>
          {movie.titulo_ingles && movie.titulo !== movie.titulo_ingles && (
            <p className="text-zinc-400 text-sm mt-0.5">{movie.titulo}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-300">
            {movie.anio && <span>{movie.anio}</span>}
            {movie.nota_imdb && (
              <span className="text-yellow-400 font-bold inline-flex items-center gap-1">
                <Icon.Star filled className="w-3 h-3" />
                {movie.nota_imdb}
              </span>
            )}
            {movie.director && <span className="text-zinc-400">Dir. {movie.director}</span>}
          </div>
          {movie.categoria && <p className="text-zinc-500 text-xs mt-1">{movie.categoria}</p>}
          {/* Platform logos */}
          {activePlatforms.length > 0 && (
            <div className="flex gap-2 mt-2">
              {activePlatforms.map((key) => (
                <PlatformLogo key={key} platform={key} size="md" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side action buttons (TikTok style) */}
      <div className="absolute right-3 bottom-40 z-30 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <IconButton
            icon={<Icon.Eye className="w-5 h-5" />}
            label={visto ? 'Marcada como vista' : 'Marcar como vista'}
            variant={visto ? 'primary' : 'secondary'}
            size="md"
            onClick={onVisto}
            className="rounded-full"
          />
          <span className="text-white text-[11px]">{visto ? 'Vista' : 'Ya la vi'}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <IconButton
            icon={<Icon.Bookmark filled={watchlist} className="w-5 h-5" />}
            label={watchlist ? 'Quitar de watchlist' : 'Añadir a watchlist'}
            variant={watchlist ? 'primary' : 'secondary'}
            size="md"
            onClick={onWatchlist}
            className="rounded-full"
          />
          <span className="text-white text-[11px]">{watchlist ? 'Guardada' : 'Watchlist'}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <IconButton
            icon={<Icon.Info className="w-5 h-5" />}
            label="Ver información"
            variant="secondary"
            size="md"
            onClick={onShowInfo}
            className="rounded-full"
          />
          <span className="text-white text-[11px]">Info</span>
        </div>
        <ShareButton
          data={{
            title: movie.titulo_ingles || movie.titulo,
            text: `Mira "${movie.titulo_ingles || movie.titulo}" en CineBret`,
            url: `https://cinebret.cl/${isSeries ? 'serie' : 'pelicula'}/${movie.id}`,
          }}
          className="flex flex-col items-center gap-1"
        >
          <span
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-zinc-900 border border-zinc-800 text-white inline-flex items-center justify-center"
            aria-label="Compartir"
          >
            <Icon.Share className="w-5 h-5" />
          </span>
          <span className="text-white text-[11px]">Compartir</span>
        </ShareButton>
      </div>
    </>
  )
}

export default function CineReelsPage() {
  const { user } = useAuth()
  const { mode } = useMediaMode()
  const isSeries = mode === 'series'
  const [movies, setMovies] = useState<ReelMovie[]>([])
  const [current, setCurrent] = useState(0)
  const { blocked: guestBlocked, increment: guestIncrement } = useGuestLimit(user, 'cinereels')
  const [muted, setMuted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const viewStartTime = useRef(Date.now())
  const [userStates, setUserStates] = useState<Record<string, { visto: boolean; watchlist: boolean }>>({})
  const playerRef = useRef<any>(null)
  const playerDivRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchCurrentY = useRef(0)
  const isDragging = useRef(false)

  // Fetch content
  useEffect(() => {
    ;(async () => {
      // SERIES MODE: load series with trailers
      if (isSeries) {
        const { data: seriesData } = await supabase
          .from('series')
          .select('id, titulo, titulo_ingles, nota_imdb, anio_inicio, categoria, poster_path, logo_path, youtube_trailer_key')
          .not('youtube_trailer_key', 'is', null)
          .not('poster_path', 'is', null)
          .order('nota_imdb', { ascending: false, nullsFirst: false })
          .limit(200)

        if (!seriesData || seriesData.length === 0) { setLoading(false); return }

        // Get directors
        const sIds = seriesData.map(s => s.id)
        const dirMap: Record<string, string | null> = {}
        for (let i = 0; i < sIds.length; i += 100) {
          const chunk = sIds.slice(i, i + 100)
          const { data: enr } = await supabase.from('enriquecimiento_series').select('serie_id, director').in('serie_id', chunk)
          ;(enr ?? []).forEach((e: any) => { dirMap[e.serie_id] = e.director })
        }

        // Get platforms
        const { data: wpData } = await supabase.from('watch_providers_series').select('serie_id, platform_key').eq('provider_type', 'flatrate').not('platform_key', 'is', null).in('serie_id', sIds)
        const platMap: Record<string, string[]> = {}
        ;(wpData ?? []).forEach((wp: any) => {
          if (!platMap[wp.serie_id]) platMap[wp.serie_id] = []
          if (!platMap[wp.serie_id].includes(wp.platform_key)) platMap[wp.serie_id].push(wp.platform_key)
        })

        const reels: ReelMovie[] = seriesData.map((s: any) => ({
          id: s.id, titulo: s.titulo, titulo_ingles: s.titulo_ingles,
          nota_imdb: s.nota_imdb, anio: s.anio_inicio, categoria: s.categoria,
          poster_path: s.poster_path, logo_path: s.logo_path,
          director: dirMap[s.id] ?? null, videoId: s.youtube_trailer_key,
          plataformas: platMap[s.id] ?? [], source: 'catalog' as const,
        }))

        // Shuffle
        const rng = mulberry32(getSessionSeed())
        reels.sort(() => rng() - 0.5)

        setMovies(reels)
        setLoading(false)
        return
      }

      // MOVIES MODE (original)
      const allEnr: any[] = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento')
          .select('pelicula_id, video_clip_url, director')
          .not('video_clip_url', 'is', null)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allEnr.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
      const ytEnr = allEnr.filter(e => extractYTId(e.video_clip_url))
      const ids = ytEnr.map(e => e.pelicula_id)
      const clipMap: Record<string, any> = {}
      ytEnr.forEach(e => { clipMap[e.pelicula_id] = e })
      // Fetch platform catalog for today
      const hoy = new Date().toISOString().split('T')[0]
      const { data: fechaRow } = await supabase.from('catalogos').select('fecha').eq('activo', true).order('fecha', { ascending: false }).limit(1).maybeSingle()
      const fecha = (fechaRow as any)?.fecha ?? hoy
      const platData: any[] = []
      let pOffset = 0
      while (true) {
        const { data } = await supabase.from('catalogos').select('pelicula_id, plataforma').eq('fecha', fecha).eq('activo', true).range(pOffset, pOffset + 999)
        if (!data || data.length === 0) break
        platData.push(...data)
        if (data.length < 1000) break
        pOffset += 1000
      }
      const platMap: Record<string, string[]> = {}
      platData.forEach((c: any) => {
        if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
        if (!platMap[c.pelicula_id].includes(c.plataforma)) platMap[c.pelicula_id].push(c.plataforma)
      })

      const catalogMovies: ReelMovie[] = []
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        const { data } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, anio, categoria, poster_path, logo_path')
          .in('id', chunk)
        if (data) {
          data.forEach((m: any) => {
            const enr = clipMap[m.id]
            const videoId = extractYTId(enr.video_clip_url)
            if (videoId) catalogMovies.push({ ...m, director: enr.director, videoId, plataformas: platMap[m.id] ?? [], source: 'catalog' as const })
          })
        }
      }

      // Fetch upcoming movies (anio >= 2026 with youtube_trailer_key)
      const upcomingMovies: ReelMovie[] = []
      {
        const { data: upRows } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, anio, categoria, poster_path, logo_path, youtube_trailer_key')
          .gte('anio', 2026)
          .not('youtube_trailer_key', 'is', null)
          .order('anio', { ascending: false })
          .limit(50)
        if (upRows) {
          // Get directors from enriquecimiento for upcoming movies
          const upIds = upRows.map((m: any) => m.id)
          const upDirMap: Record<string, string | null> = {}
          for (let i = 0; i < upIds.length; i += 50) {
            const chunk = upIds.slice(i, i + 50)
            const { data: enrData } = await supabase.from('enriquecimiento').select('pelicula_id, director').in('pelicula_id', chunk)
            ;(enrData ?? []).forEach((e: any) => { upDirMap[e.pelicula_id] = e.director })
          }
          upRows.forEach((m: any) => {
            const videoId = m.youtube_trailer_key
            if (videoId && !ids.includes(m.id)) {
              upcomingMovies.push({
                id: m.id, titulo: m.titulo, titulo_ingles: m.titulo_ingles,
                nota_imdb: m.nota_imdb, anio: m.anio, categoria: m.categoria,
                poster_path: m.poster_path, logo_path: m.logo_path,
                director: upDirMap[m.id] ?? null, videoId,
                plataformas: platMap[m.id] ?? [], source: 'upcoming' as const,
              })
            }
          })
        }
      }

      // Smart ordering — randomized per session, personalized for logged-in users
      const sessionSeed = getSessionSeed()
      const rng = mulberry32(sessionSeed)

      // Separate trending pool: high IMDB recent movies from catalog
      const trendingPool = catalogMovies
        .filter(m => (m.nota_imdb ?? 0) >= 7.0 && (m.anio ?? 0) >= 2020)
        .map(m => ({ ...m, source: 'trending' as const }))
      const catalogOnly = catalogMovies.filter(m =>
        !trendingPool.some(t => t.id === m.id)
      )

      if (user) {
        // Logged in: preferences + watch history genres + random factor
        const [{ data: prefs }, { data: watchedRows }] = await Promise.all([
          supabase.from('perfil_preferencias')
            .select('generos_preferidos, mood_ranking, fav_movies')
            .eq('user_id', user.id).maybeSingle(),
          supabase.from('user_peliculas')
            .select('pelicula_id')
            .eq('user_id', user.id).eq('visto', true)
            .limit(200),
        ])

        const genPrefs = (prefs?.generos_preferidos ?? []) as string[]
        const moodRanking = (prefs?.mood_ranking ?? []) as string[]
        const genNorm = (g: string) => g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const genPrefsNorm = new Set(genPrefs.map(genNorm))

        // Get genres for reel movies AND watched movies to learn history preferences
        const watchedIds = (watchedRows ?? []).map((r: any) => r.pelicula_id)
        const allIdsForGenres = [...new Set([...ids, ...watchedIds])]
        const enrGenres: Record<string, string[]> = {}
        for (let i = 0; i < allIdsForGenres.length; i += 50) {
          const chunk = allIdsForGenres.slice(i, i + 50)
          const { data: eg } = await supabase.from('enriquecimiento').select('pelicula_id, generos').in('pelicula_id', chunk)
          ;(eg ?? []).forEach((e: any) => { enrGenres[e.pelicula_id] = e.generos ?? [] })
        }

        // Build genre frequency from watch history
        const historyGenreCount: Record<string, number> = {}
        watchedIds.forEach((wid: string) => {
          ;(enrGenres[wid] ?? []).forEach(g => {
            const key = genNorm(g)
            historyGenreCount[key] = (historyGenreCount[key] ?? 0) + 1
          })
        })
        const maxHistCount = Math.max(1, ...Object.values(historyGenreCount))

        // Score personalized catalog movies
        const scoreMovie = (m: ReelMovie) => {
          const genres = enrGenres[m.id] ?? []
          const prefMatch = genres.length > 0
            ? genres.filter(g => genPrefsNorm.has(genNorm(g))).length / Math.max(1, genres.length)
            : 0
          const histAffinity = genres.length > 0
            ? genres.reduce((sum, g) => sum + ((historyGenreCount[genNorm(g)] ?? 0) / maxHistCount), 0) / genres.length
            : 0
          const genreScore = prefMatch * 0.7 + histAffinity * 0.3
          const moodIdx = moodRanking.indexOf(m.categoria ?? '')
          const moodBonus = moodIdx >= 0 ? (4 - moodIdx) * 0.05 : 0
          return (genreScore + moodBonus) * 0.6 + rng() * 0.4
        }
        catalogOnly.forEach(m => { (m as any)._score = scoreMovie(m) })
        catalogOnly.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0))
        trendingPool.forEach(m => { (m as any)._score = scoreMovie(m) })
        trendingPool.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0))
      } else {
        // Not logged in: date-seeded shuffle weighted by IMDB quality
        const dayRng = mulberry32(getDaySeed() ^ sessionSeed)

        const ENGAGEMENT_KEY = 'cinereels-engagement'
        let engagement: Record<string, number> = {}
        try { engagement = JSON.parse(localStorage.getItem(ENGAGEMENT_KEY) ?? '{}') } catch {}

        const scoreMovie = (m: ReelMovie) => {
          const imdbNorm = ((m.nota_imdb ?? 5) - 4) / 6
          const engPenalty = engagement[m.id] ? Math.max(0, 1 - engagement[m.id] * 0.2) : 1
          return imdbNorm * 0.4 * engPenalty + dayRng() * 0.6
        }
        catalogOnly.forEach(m => { (m as any)._score = scoreMovie(m) })
        catalogOnly.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0))
        trendingPool.forEach(m => { (m as any)._score = scoreMovie(m) })
        trendingPool.sort((a, b) => ((b as any)._score ?? 0) - ((a as any)._score ?? 0))
      }

      // Shuffle upcoming with seeded RNG
      const shuffledUpcoming = seededShuffle(upcomingMovies, rng)

      // Interleave: 20% upcoming, 40% trending, 40% catalog
      // Calculate target counts based on total available
      const totalAvailable = shuffledUpcoming.length + trendingPool.length + catalogOnly.length
      const targetUpcoming = Math.min(shuffledUpcoming.length, Math.ceil(totalAvailable * 0.2))
      const targetTrending = Math.min(trendingPool.length, Math.ceil(totalAvailable * 0.4))
      const targetCatalog = Math.min(catalogOnly.length, totalAvailable - targetUpcoming - targetTrending)

      const upcomingSlice = shuffledUpcoming.slice(0, targetUpcoming)
      const trendingSlice = trendingPool.slice(0, targetTrending)
      const catalogSlice = catalogOnly.slice(0, targetCatalog)

      // Interleave: place upcoming roughly every 5th reel, trending and catalog alternate otherwise
      const allMovies: ReelMovie[] = []
      let uIdx = 0, tIdx = 0, cIdx = 0
      let slotCount = 0
      const totalSlots = upcomingSlice.length + trendingSlice.length + catalogSlice.length
      while (allMovies.length < totalSlots) {
        slotCount++
        // Every 5th slot is upcoming (if available)
        if (slotCount % 5 === 0 && uIdx < upcomingSlice.length) {
          allMovies.push(upcomingSlice[uIdx++])
        } else {
          // Alternate trending and catalog for remaining slots
          if (tIdx < trendingSlice.length && (cIdx >= catalogSlice.length || slotCount % 2 === 0)) {
            allMovies.push(trendingSlice[tIdx++])
          } else if (cIdx < catalogSlice.length) {
            allMovies.push(catalogSlice[cIdx++])
          } else if (tIdx < trendingSlice.length) {
            allMovies.push(trendingSlice[tIdx++])
          } else if (uIdx < upcomingSlice.length) {
            allMovies.push(upcomingSlice[uIdx++])
          }
        }
      }

      // Ensure first reel is high quality (IMDB >= 7.5) to hook the user
      const highQualityIdx = allMovies.findIndex(m => (m.nota_imdb ?? 0) >= 7.5)
      if (highQualityIdx > 0) {
        const [hq] = allMovies.splice(highQualityIdx, 1)
        allMovies.unshift(hq)
      }

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  // Initialize player
  useEffect(() => {
    if (movies.length === 0) return
    let destroyed = false
    loadYT().then(() => {
      if (destroyed || !playerDivRef.current) return
      playerRef.current = new (window as any).YT.Player(playerDivRef.current, {
        videoId: movies[0].videoId,
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, modestbranding: 1, rel: 0,
          showinfo: 0, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1,
          loop: 1, playlist: movies[0].videoId, disablekb: 1, fs: 0,
        },
        events: {
          onReady: (e: any) => { if (!destroyed) { setPlayerReady(true); e.target.mute(); e.target.seekTo(5); e.target.playVideo() } },
          onStateChange: (e: any) => { setPlaying(e.data === 1) },
        },
      })
    })
    return () => { destroyed = true }
  }, [movies])

  // Change video
  useEffect(() => {
    const p = playerRef.current
    if (!p || !playerReady || movies.length === 0) return
    const movie = movies[current]
    if (!movie) return
    setPlaying(false)
    try {
      p.loadVideoById({ videoId: movie.videoId, startSeconds: 5 })
      if (muted) p.mute(); else p.unMute()
    } catch {}
  }, [current, playerReady])

  useEffect(() => {
    const p = playerRef.current
    if (!p || !playerReady) return
    if (muted) p.mute(); else p.unMute()
  }, [muted, playerReady])

  const toggleVisto = useCallback((movieId: string) => {
    const cur = userStates[movieId]?.visto ?? false
    setUserStates(prev => ({ ...prev, [movieId]: { ...prev[movieId], visto: !cur, watchlist: prev[movieId]?.watchlist ?? false } }))
    if (user) {
      const table = isSeries ? 'user_series' : 'user_peliculas'
      const idField = isSeries ? 'serie_id' : 'pelicula_id'
      supabase.from(table).upsert({ user_id: user.id, [idField]: movieId, visto: !cur }, { onConflict: isSeries ? 'user_id,serie_id' : 'user_id,pelicula_id' })
    }
  }, [user, userStates, isSeries])

  const toggleWatchlist = useCallback((movieId: string) => {
    const cur = userStates[movieId]?.watchlist ?? false
    setUserStates(prev => ({ ...prev, [movieId]: { visto: prev[movieId]?.visto ?? false, watchlist: !cur } }))
    if (user) {
      const table = isSeries ? 'user_series' : 'user_peliculas'
      const idField = isSeries ? 'serie_id' : 'pelicula_id'
      supabase.from(table).upsert({ user_id: user.id, [idField]: movieId, watchlist: !cur }, { onConflict: isSeries ? 'user_id,serie_id' : 'user_id,pelicula_id' })
    }
  }, [user, userStates, isSeries])

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= movies.length) return
    // Guest limit check
    if (guestIncrement()) return
    // Track engagement for non-logged users
    if (!user && movies[current]) {
      const viewTime = (Date.now() - viewStartTime.current) / 1000
      if (viewTime < 3) {
        // Skipped quickly — penalize
        try {
          const KEY = 'cinereels-engagement'
          const eng = JSON.parse(localStorage.getItem(KEY) ?? '{}')
          eng[movies[current].id] = (eng[movies[current].id] ?? 0) + 1
          localStorage.setItem(KEY, JSON.stringify(eng))
        } catch {}
      }
    }
    viewStartTime.current = Date.now()
    setTransitioning(true)
    setShowInfo(false)
    setCurrent(idx)
    setTimeout(() => setTransitioning(false), 400)
  }, [movies.length, current, user])

  // Touch handlers for TikTok-style drag
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchCurrentY.current = e.touches[0].clientY
    isDragging.current = true
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return
    touchCurrentY.current = e.touches[0].clientY
    const diff = touchStartY.current - touchCurrentY.current
    // Limit drag amount
    const maxDrag = window.innerHeight * 0.4
    const clamped = Math.max(-maxDrag, Math.min(maxDrag, diff))
    setSlideOffset(clamped)
  }

  const handleTouchEnd = () => {
    isDragging.current = false
    const diff = slideOffset
    setSlideOffset(0)
    if (Math.abs(diff) > 80) {
      if (diff > 0) goTo(current + 1)
      else goTo(current - 1)
    }
  }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') goTo(current + 1)
      else if (e.key === 'ArrowUp') goTo(current - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, goTo])

  if (loading) {
    return (
      <PageShell fullBleed>
        <div className="relative w-full bg-black flex items-center justify-center h-[calc(100dvh-3.5rem)]">
          <LoadingState text="Cargando CineReels..." size="lg" />
        </div>
      </PageShell>
    )
  }

  const movie = movies[current]
  const prevMovie = current > 0 ? movies[current - 1] : null
  const nextMovie = current < movies.length - 1 ? movies[current + 1] : null
  if (!movie) return null

  const up = userStates[movie.id] ?? { visto: false, watchlist: false }

  return (
    <PageShell fullBleed>
    <div className="relative w-full bg-black overflow-hidden h-[calc(100dvh-3.5rem)]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sliding container */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${-slideOffset}px)`,
          transition: slideOffset === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {/* Previous movie poster (peeking from top) */}
        {prevMovie && slideOffset < 0 && (
          <div className="absolute inset-x-0 bg-black flex items-center justify-center" style={{ bottom: '100%', height: '100%' }}>
            {prevMovie.poster_path && <img loading="lazy" src={`https://image.tmdb.org/t/p/w780${prevMovie.poster_path}`} alt="" className="h-full object-cover opacity-60" />}
            <div className="absolute bottom-6 left-5 z-10">
              <p className="text-white font-bold text-lg drop-shadow-lg">{prevMovie.titulo_ingles || prevMovie.titulo}</p>
            </div>
          </div>
        )}

        {/* Current video */}
        <div className="absolute inset-0">
          {/* YouTube player fullscreen */}
          <div className="absolute inset-0 overflow-hidden">
            <div ref={playerDivRef} className="absolute" style={{ width: '300%', height: '100%', left: '-100%', top: '0' }} />
          </div>

          {/* Tap for mute */}
          <div className="absolute inset-0 z-10" onClick={() => setMuted(v => !v)} />

          <MovieOverlay movie={movie} index={current} total={movies.length} muted={muted}
            visto={up.visto} watchlist={up.watchlist}
            onVisto={() => toggleVisto(movie.id)} onWatchlist={() => toggleWatchlist(movie.id)}
            onShowInfo={() => setShowInfo(v => !v)} isSeries={isSeries} />

          {/* Poster + loading */}
          {!playing && (
            <div className="absolute inset-0 z-5 flex items-center justify-center bg-black">
              {movie.poster_path && <img loading="lazy" src={`https://image.tmdb.org/t/p/w780${movie.poster_path}`} alt="" className="h-full object-cover opacity-50" />}
              <div className="absolute">
                <video src="/loading.mp4" autoPlay muted loop playsInline className="w-16 h-16 object-contain" style={{ mixBlendMode: 'lighten' }} />
              </div>
            </div>
          )}
        </div>

        {/* Next movie poster (peeking from bottom) */}
        {nextMovie && slideOffset > 0 && (
          <div className="absolute inset-x-0 bg-black flex items-center justify-center" style={{ top: '100%', height: '100%' }}>
            {nextMovie.poster_path && <img loading="lazy" src={`https://image.tmdb.org/t/p/w780${nextMovie.poster_path}`} alt="" className="h-full object-cover opacity-60" />}
            <div className="absolute bottom-6 left-5 z-10">
              <p className="text-white font-bold text-lg drop-shadow-lg">{nextMovie.titulo_ingles || nextMovie.titulo}</p>
            </div>
          </div>
        )}
      </div>

      {guestBlocked && <GuestLimitModal />}
    </div>

    {/* Info panel (slides up from bottom) */}
    <Sheet
      open={showInfo}
      onClose={() => setShowInfo(false)}
      title={movie.titulo_ingles || movie.titulo}
    >
      <EnrichedDetails peliculaId={movie.id} isSerie={isSeries} />
      <Link
        href={`${isSeries ? '/serie' : '/pelicula'}/${movie.id}`}
        className="inline-flex items-center gap-1 mt-3 text-xs text-yellow-400 hover:text-yellow-300 font-medium"
      >
        Ver ficha completa
        <Icon.ArrowRight className="w-3 h-3" />
      </Link>
    </Sheet>
    </PageShell>
  )
}
