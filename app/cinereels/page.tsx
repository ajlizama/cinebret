'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
}

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

function MovieOverlay({ movie, index, total, muted }: { movie: ReelMovie; index: number; total: number; muted: boolean }) {
  return (
    <>
      <div className="absolute top-4 left-4 z-30 bg-black/50 rounded-full w-9 h-9 flex items-center justify-center">
        <Link href="/catalogo" className="text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-30 bg-black/50 rounded-full px-3 py-1 text-white text-xs">
        {index + 1} / {total}
      </div>
      <div className="absolute top-14 right-4 z-30 bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-white text-xs pointer-events-none">
        {muted ? '🔇' : '🔊'}
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
        </div>
      </div>
    </>
  )
}

export default function CineReelsPage() {
  const [movies, setMovies] = useState<ReelMovie[]>([])
  const [current, setCurrent] = useState(0)
  const [muted, setMuted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0) // px offset during drag
  const [transitioning, setTransitioning] = useState(false)
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
            if (videoId) allMovies.push({ ...m, director: enr.director, videoId })
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

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= movies.length) return
    setTransitioning(true)
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

          <MovieOverlay movie={movie} index={current} total={movies.length} muted={muted} />

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
    </div>
  )
}
