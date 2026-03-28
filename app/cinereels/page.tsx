'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import Nav from '@/components/Nav'
import EnrichedDetails from '@/components/EnrichedDetails'

type ReelMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  anio: number | null
  categoria: string | null
  poster_path: string | null
  director: string | null
  videoId: string
  plataformas: string[]
}

const PLATAFORMAS = [
  { id: 'netflix', logo: '/netflix.png' },
  { id: 'disney_plus', logo: '/disney_plus.svg' },
  { id: 'hbo_max', logo: '/hbo_max.png' },
  { id: 'amazon_prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', logo: '/apple_tv.png' },
  { id: 'paramount_plus', logo: '/paramount_plus.svg' },
  { id: 'mubi', logo: '/mubi.png' },
]

function extractYTId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
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

function MovieOverlay({ movie, index, total, muted, onShowInfo, visto, watchlist, onVisto, onWatchlist }: {
  movie: ReelMovie; index: number; total: number; muted: boolean; onShowInfo: () => void
  visto: boolean; watchlist: boolean; onVisto: () => void; onWatchlist: () => void
}) {
  return (
    <>
      {/* Counter + mute below nav */}
      <div className="absolute top-24 right-4 z-30 flex flex-col items-end gap-2">
        <div className="bg-black/50 rounded-full px-3 py-1 text-white text-xs">
          {index + 1} / {total}
        </div>
        <div className="bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-white text-xs pointer-events-none">
          {muted ? '🔇' : '🔊'}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)' }}>
        <div className="p-5 pb-8">
          <Link href={`/pelicula/${movie.id}`} className="pointer-events-auto">
            <h3 className="text-white font-bold text-xl drop-shadow-lg">{movie.titulo_ingles || movie.titulo}</h3>
          </Link>
          {movie.titulo_ingles && movie.titulo !== movie.titulo_ingles && (
            <p className="text-zinc-400 text-sm mt-0.5">{movie.titulo}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-300">
            {movie.anio && <span>{movie.anio}</span>}
            {movie.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {movie.nota_imdb}</span>}
            {movie.director && <span className="text-zinc-400">Dir. {movie.director}</span>}
          </div>
          {movie.categoria && <p className="text-zinc-500 text-xs mt-1">{movie.categoria}</p>}
          {/* Platform logos */}
          {movie.plataformas.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {PLATAFORMAS.filter(pl => movie.plataformas.includes(pl.id)).map(pl => (
                <div key={pl.id} className="bg-white/90 rounded px-1 py-0.5">
                  <img src={pl.logo} alt="" className="h-3 w-auto object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Right side action buttons (TikTok style) */}
      <div className="absolute right-3 bottom-40 z-30 flex flex-col items-center gap-4">
        <button onClick={onVisto} className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${visto ? 'bg-emerald-500' : 'bg-black/50'}`}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-white text-[9px]">{visto ? 'Vista' : 'Ya la vi'}</span>
        </button>
        <button onClick={onWatchlist} className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${watchlist ? 'bg-yellow-400' : 'bg-black/50'}`}>
            <svg className={`w-5 h-5 ${watchlist ? 'text-zinc-950' : 'text-white'}`} fill={watchlist ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <span className="text-white text-[9px]">{watchlist ? 'Guardada' : 'Watchlist'}</span>
        </button>
        <button onClick={onShowInfo} className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-white text-[9px]">Info</span>
        </button>
      </div>
    </>
  )
}

export default function CineReelsPage() {
  const { user } = useAuth()
  const [movies, setMovies] = useState<ReelMovie[]>([])
  const [current, setCurrent] = useState(0)
  const [muted, setMuted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [userStates, setUserStates] = useState<Record<string, { visto: boolean; watchlist: boolean }>>({})
  const playerRef = useRef<any>(null)
  const playerDivRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchCurrentY = useRef(0)
  const isDragging = useRef(false)

  // Fetch movies
  useEffect(() => {
    ;(async () => {
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

      const allMovies: ReelMovie[] = []
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50)
        const { data } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, anio, categoria, poster_path')
          .in('id', chunk)
        if (data) {
          data.forEach((m: any) => {
            const enr = clipMap[m.id]
            const videoId = extractYTId(enr.video_clip_url)
            if (videoId) allMovies.push({ ...m, director: enr.director, videoId, plataformas: platMap[m.id] ?? [] })
          })
        }
      }
      for (let i = allMovies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allMovies[i], allMovies[j]] = [allMovies[j], allMovies[i]]
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
    if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: movieId, visto: !cur }, { onConflict: 'user_id,pelicula_id' })
  }, [user, userStates])

  const toggleWatchlist = useCallback((movieId: string) => {
    const cur = userStates[movieId]?.watchlist ?? false
    setUserStates(prev => ({ ...prev, [movieId]: { visto: prev[movieId]?.visto ?? false, watchlist: !cur } }))
    if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: movieId, watchlist: !cur }, { onConflict: 'user_id,pelicula_id' })
  }, [user, userStates])

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= movies.length) return
    setTransitioning(true)
    setShowInfo(false)
    setCurrent(idx)
    setTimeout(() => setTransitioning(false), 400)
  }, [movies.length])

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
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <video src="/loading.mp4" autoPlay muted loop playsInline className="w-20 h-20 object-contain" style={{ mixBlendMode: 'lighten' }} />
      </div>
    )
  }

  const movie = movies[current]
  const prevMovie = current > 0 ? movies[current - 1] : null
  const nextMovie = current < movies.length - 1 ? movies[current + 1] : null
  if (!movie) return null

  const up = userStates[movie.id] ?? { visto: false, watchlist: false }

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden"
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
            {prevMovie.poster_path && <img src={`https://image.tmdb.org/t/p/w780${prevMovie.poster_path}`} alt="" className="h-full object-cover opacity-60" />}
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
            onShowInfo={() => setShowInfo(v => !v)} />

          {/* Poster + loading */}
          {!playing && (
            <div className="absolute inset-0 z-5 flex items-center justify-center bg-black">
              {movie.poster_path && <img src={`https://image.tmdb.org/t/p/w780${movie.poster_path}`} alt="" className="h-full object-cover opacity-50" />}
              <div className="absolute">
                <video src="/loading.mp4" autoPlay muted loop playsInline className="w-16 h-16 object-contain" style={{ mixBlendMode: 'lighten' }} />
              </div>
            </div>
          )}
        </div>

        {/* Next movie poster (peeking from bottom) */}
        {nextMovie && slideOffset > 0 && (
          <div className="absolute inset-x-0 bg-black flex items-center justify-center" style={{ top: '100%', height: '100%' }}>
            {nextMovie.poster_path && <img src={`https://image.tmdb.org/t/p/w780${nextMovie.poster_path}`} alt="" className="h-full object-cover opacity-60" />}
            <div className="absolute bottom-6 left-5 z-10">
              <p className="text-white font-bold text-lg drop-shadow-lg">{nextMovie.titulo_ingles || nextMovie.titulo}</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav overlay */}
      <div className="absolute top-0 left-0 right-0 z-40">
        <Nav active="cinereels" />
      </div>

      {/* Info panel (slides up like TikTok comments) */}
      {showInfo && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setShowInfo(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-2xl max-h-[60vh] overflow-y-auto"
            style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className="sticky top-0 bg-zinc-900 px-4 pt-3 pb-2 flex items-center justify-between border-b border-zinc-800">
              <h3 className="text-white font-bold text-sm">{movie.titulo_ingles || movie.titulo}</h3>
              <button onClick={() => setShowInfo(false)} className="text-zinc-500 hover:text-white text-lg">✕</button>
            </div>
            <div className="px-4 py-3">
              <EnrichedDetails peliculaId={movie.id} />
              <Link href={`/pelicula/${movie.id}`} className="inline-block mt-3 text-xs text-yellow-400 hover:text-yellow-300 font-medium">
                Ver ficha completa →
              </Link>
            </div>
          </div>
          <style jsx>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
        </>
      )}
    </div>
  )
}
