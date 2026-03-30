'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

// Load YouTube IFrame API once globally
let ytApiReady = false
let ytApiPromise: Promise<void> | null = null

function loadYTApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve()
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return
    const existing = (window as any).onYouTubeIframeAPIReady
    ;(window as any).onYouTubeIframeAPIReady = () => {
      ytApiReady = true
      existing?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return ytApiPromise
}

// Singleton: only one clip plays at a time
let activePlayer: { pause: () => void } | null = null
function registerActive(p: { pause: () => void }) {
  if (activePlayer && activePlayer !== p) activePlayer.pause()
  activePlayer = p
}

type Props = {
  videoId: string
  className?: string
}

export default function YouTubeClip({ videoId, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerDivRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const lastClickRef = useRef(0)

  // Initialize player
  useEffect(() => {
    let destroyed = false
    loadYTApi().then(() => {
      if (destroyed || !playerDivRef.current) return
      playerRef.current = new (window as any).YT.Player(playerDivRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          playsinline: 1,
          loop: 1,
          playlist: videoId, // required for loop to work
          disablekb: 1,
          fs: 0,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: () => {
            if (!destroyed) setReady(true)
          },
          onStateChange: (e: any) => {
            if (destroyed) return
            // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0
            setPlaying(e.data === 1)
          },
        },
      })
    })
    return () => {
      destroyed = true
      playerRef.current?.destroy?.()
    }
  }, [videoId])

  // Autoplay when visible, pause when not
  useEffect(() => {
    const el = containerRef.current
    if (!el || !ready) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const p = playerRef.current
        if (!p) return
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          p.mute()
          p.playVideo()
          setMuted(true)
          registerActive({ pause: () => { p.pauseVideo(); setPlaying(false) } })
        } else {
          p.pauseVideo()
          setPlaying(false)
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready])

  // Handle clicks: single = toggle mute, double = toggle play/pause
  const handleClick = useCallback(() => {
    const now = Date.now()
    const p = playerRef.current
    if (!p) return

    if (now - lastClickRef.current < 350) {
      // Double click: toggle play/pause
      if (playing) {
        p.pauseVideo()
      } else {
        p.playVideo()
        registerActive({ pause: () => { p.pauseVideo(); setPlaying(false) } })
      }
      lastClickRef.current = 0
    } else {
      // Single click: toggle mute (delayed to check for double)
      lastClickRef.current = now
      setTimeout(() => {
        if (lastClickRef.current !== now) return // was double click
        if (muted) {
          p.unMute()
          setMuted(false)
        } else {
          p.mute()
          setMuted(true)
        }
      }, 360)
    }
  }, [playing, muted])

  return (
    <div ref={containerRef} className={`relative rounded-xl overflow-hidden bg-black ${className}`}>
      <div className="aspect-video">
        <div ref={playerDivRef} className="w-full h-full" />
      </div>
      {/* Transparent overlay to capture clicks */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleClick}
      />
      {/* Mute indicator */}
      {playing && (
        <div className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-white text-xs pointer-events-none transition-opacity">
          {muted ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round"/><line x1="23" y1="9" x2="17" y2="15" strokeLinecap="round"/><line x1="17" y1="9" x2="23" y2="15" strokeLinecap="round"/></svg> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      )}
      {/* Thumbnail before autoplay */}
      {!playing && !ready && (
        <div className="absolute inset-0 z-5">
          <img loading="lazy" src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  )
}
