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

export default function CineReelsPage() {
  const [movies, setMovies] = useState<ReelMovie[]>([])
  const [current, setCurrent] = useState(0)
  const [muted, setMuted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const playerRef = useRef<any>(null)
  const playerDivRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const swipeLocked = useRef(false)

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

      // Shuffle
      for (let i = allMovies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allMovies[i], allMovies[j]] = [allMovies[j], allMovies[i]]
      }

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  // Initialize YouTube player once
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
          onReady: (e: any) => {
            if (destroyed) return
            setPlayerReady(true)
            e.target.mute()
            e.target.playVideo()
          },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true)
            else setPlaying(false)
          },
        },
      })
    })
    return () => { destroyed = true }
  }, [movies])

  // Change video when current changes
  useEffect(() => {
    const p = playerRef.current
    if (!p || !playerReady || movies.length === 0) return
    const movie = movies[current]
    if (!movie) return
    setPlaying(false)
    try {
      p.loadVideoById({ videoId: movie.videoId })
      if (muted) p.mute()
      else p.unMute()
    } catch {}
  }, [current, playerReady])

  // Mute/unmute
  useEffect(() => {
    const p = playerRef.current
    if (!p || !playerReady) return
    if (muted) p.mute()
    else p.unMute()
  }, [muted, playerReady])

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= movies.length || swipeLocked.current) return
    swipeLocked.current = true
    setCurrent(idx)
    setTimeout(() => { swipeLocked.current = false }, 500)
  }, [movies.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(diff) > 50) {
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

  // Detect iPhone volume button (unmute on volume up)
  useEffect(() => {
    const audio = new Audio()
    audio.volume = 0.01
    const checkVolume = () => {
      if (audio.volume > 0.01 && muted) {
        setMuted(false)
      }
    }
    audio.addEventListener('volumechange', checkVolume)
    return () => audio.removeEventListener('volumechange', checkVolume)
  }, [muted])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <video src="/loading.mp4" autoPlay muted loop playsInline className="w-20 h-20 object-contain" style={{ mixBlendMode: 'lighten' }} />
      </div>
    )
  }

  const movie = movies[current]
  if (!movie) return null

  return (
    <div className="fixed inset-0 bg-black z-50"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* YouTube player — fullscreen cover */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          ref={playerDivRef}
          className="absolute"
          style={{
            // Make 16:9 video cover vertical screen by scaling up
            width: '300%',
            height: '100%',
            left: '-100%',
            top: '0',
          }}
        />
      </div>

      {/* Tap overlay for mute toggle */}
      <div className="absolute inset-0 z-10" onClick={() => setMuted(v => !v)} />

      {/* Back button */}
      <Link href="/catalogo" className="absolute top-4 left-4 z-40 bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      {/* Counter */}
      <div className="absolute top-4 right-4 z-40 bg-black/50 rounded-full px-3 py-1 text-white text-xs">
        {current + 1} / {movies.length}
      </div>

      {/* Mute indicator */}
      <div className="absolute top-14 right-4 z-40 bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-white text-xs pointer-events-none">
        {muted ? '🔇' : '🔊'}
      </div>

      {/* Movie info — bottom */}
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

      {/* Poster + loading until video plays */}
      {!playing && (
        <div className="absolute inset-0 z-5 flex items-center justify-center bg-black">
          {movie.poster_path && <img src={`https://image.tmdb.org/t/p/w780${movie.poster_path}`} alt="" className="h-full object-cover opacity-50" />}
          <div className="absolute">
            <video src="/loading.mp4" autoPlay muted loop playsInline className="w-16 h-16 object-contain" style={{ mixBlendMode: 'lighten' }} />
          </div>
        </div>
      )}
    </div>
  )
}
