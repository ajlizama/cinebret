'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

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

// Load YouTube IFrame API
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

function ReelItem({ movie, isActive, onMuteToggle, isMuted }: {
  movie: ReelMovie; isActive: boolean; onMuteToggle: () => void; isMuted: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let destroyed = false
    loadYT().then(() => {
      if (destroyed || !containerRef.current) return
      playerRef.current = new (window as any).YT.Player(containerRef.current, {
        videoId: movie.videoId,
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, modestbranding: 1, rel: 0,
          showinfo: 0, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1,
          loop: 1, playlist: movie.videoId, disablekb: 1, fs: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (e: any) => {
            if (destroyed) return
            setReady(true)
            e.target.mute()
            e.target.playVideo()
          },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true) // PLAYING
            else if (e.data === 2 || e.data === 0) setPlaying(false) // PAUSED or ENDED
          },
        },
      })
    })
    return () => { destroyed = true; playerRef.current?.destroy?.() }
  }, [movie.videoId])

  useEffect(() => {
    const p = playerRef.current
    if (!p || !ready) return
    if (isMuted) p.mute()
    else p.unMute()
  }, [isMuted, ready])

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {/* YouTube player */}
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Transparent overlay for tap = mute toggle */}
      <div className="absolute inset-0 z-10" onClick={onMuteToggle} />

      {/* Gradient bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)' }}>
        <div className="p-4 pb-6">
          <Link href={`/pelicula/${movie.id}`} className="pointer-events-auto">
            <h3 className="text-white font-bold text-lg drop-shadow-lg">{movie.titulo_ingles || movie.titulo}</h3>
          </Link>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-300">
            {movie.anio && <span>{movie.anio}</span>}
            {movie.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {movie.nota_imdb}</span>}
            {movie.director && <span className="text-zinc-400">Dir. {movie.director}</span>}
          </div>
          {movie.categoria && <p className="text-zinc-500 text-xs mt-1">{movie.categoria}</p>}
        </div>
      </div>

      {/* Mute indicator */}
      <div className="absolute top-4 right-4 z-20 bg-black/50 rounded-full w-8 h-8 flex items-center justify-center text-white text-xs pointer-events-none">
        {isMuted ? '🔇' : '🔊'}
      </div>

      {/* Poster + loading until video is actually playing */}
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

export default function CineReelsPage() {
  const { user } = useAuth()
  const [movies, setMovies] = useState<ReelMovie[]>([])
  const [current, setCurrent] = useState(0)
  const [muted, setMuted] = useState(true)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)

  useEffect(() => {
    ;(async () => {
      // Fetch movies with YouTube clips
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

      // Filter YouTube only
      const ytEnr = allEnr.filter(e => extractYTId(e.video_clip_url))
      const ids = ytEnr.map(e => e.pelicula_id)
      const clipMap: Record<string, any> = {}
      ytEnr.forEach(e => { clipMap[e.pelicula_id] = e })

      // Fetch movie details
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
            if (videoId) {
              allMovies.push({ ...m, director: enr.director, videoId })
            }
          })
        }
      }

      // Shuffle for variety
      for (let i = allMovies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allMovies[i], allMovies[j]] = [allMovies[j], allMovies[i]]
      }

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= movies.length) return
    setCurrent(idx)
    scrollRef.current?.children[idx]?.scrollIntoView({ behavior: 'smooth' })
  }, [movies.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY
    if (Math.abs(diff) > 60) {
      if (diff > 0) goTo(current + 1) // swipe up = next
      else goTo(current - 1) // swipe down = previous
    }
  }

  // Keyboard navigation
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

  return (
    <div className="fixed inset-0 bg-black z-50"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Back button */}
      <Link href="/catalogo" className="absolute top-4 left-4 z-40 bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      {/* Counter */}
      <div className="absolute top-4 right-14 z-40 bg-black/50 rounded-full px-3 py-1 text-white text-xs">
        {current + 1} / {movies.length}
      </div>

      {/* Single active reel — only renders current video */}
      <div className="h-full w-full">
        {movies[current] && (
          <ReelItem
            key={movies[current].id}
            movie={movies[current]}
            isActive={true}
            isMuted={muted}
            onMuteToggle={() => setMuted(v => !v)}
          />
        )}
      </div>
    </div>
  )
}
