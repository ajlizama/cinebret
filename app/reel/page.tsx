'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Loading from '@/components/Loading'
import YouTubeClip from '@/components/YouTubeClip'
import { extractYouTubeId } from '@/lib/youtube'

type Pelicula = {
  id: string; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; rt_score: number | null; metacritic_score: number | null
  oscars: string | null; poster_path: string | null; categoria: string | null
  plataformas: string[]; sinopsis: string | null; generos: string[]
  director: string | null; actores: string | null; compositor: string | null
  runtime: number | null; boxoffice: number | null; video_clip_url: string | null
}

type MiniReview = {
  id: string; username: string; avatar_url: string | null
  rating: number | null; review_text: string; created_at: string
  isAutor?: boolean
}

const PLATFORM_LOGOS: Record<string, string> = {
  netflix: '/netflix.png', disney_plus: '/disney_plus.svg', hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png', apple_tv: '/apple_tv.png', paramount_plus: '/paramount_plus.svg', mubi: '/mubi.png',
}

const SWIPE_THRESHOLD = 80
const TAP_THRESHOLD = 8
const SNOOZE_KEY = 'reel_snoozed'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

function getSnoozed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    const all: Record<string, number> = raw ? JSON.parse(raw) : {}
    const now = Date.now()
    return Object.fromEntries(Object.entries(all).filter(([, ts]) => now - ts < SNOOZE_MS))
  } catch { return {} }
}
function snoozeId(id: string) { try { const s = getSnoozed(); s[id] = Date.now(); localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)) } catch {} }
function isSnoozed(id: string): boolean { return !!getSnoozed()[id] }
function unsnoozeId(id: string) { try { const s = getSnoozed(); delete s[id]; localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)) } catch {} }

const SESSION_KEY = 'reel_session_done'
function getSessionDone(): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]')) } catch { return new Set() } }
function markSessionDone(id: string) { try { const s = getSessionDone(); s.add(id); sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s])) } catch {} }
function unmarkSessionDone(id: string) { try { const s = getSessionDone(); s.delete(id); sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s])) } catch {} }

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

/* ── Onboarding ── */
function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const pasos = [
    { emoji: '👉', color: 'text-pink-400', label: 'Desliza → Watchlist' },
    { emoji: '👈', color: 'text-red-400', label: 'Desliza ← No me interesa' },
    { emoji: '👆', color: 'text-blue-400', label: 'Desliza ↑ Ya la vi' },
    { emoji: '👇', color: 'text-zinc-300', label: 'Desliza ↓ Otra película' },
  ]
  useEffect(() => {
    if (step >= pasos.length) { onDone(); return }
    const t = setTimeout(() => setStep(s => s + 1), 1200)
    return () => clearTimeout(t)
  }, [step])
  if (step >= pasos.length) return null
  const p = pasos[step]
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl cursor-pointer"
      onClick={() => { setStep(pasos.length); onDone() }}>
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <span className="text-6xl">{p.emoji}</span>
        <span className={`text-lg font-semibold ${p.color}`}>{p.label}</span>
      </div>
      <p className="text-zinc-500 text-xs mt-8">Toca para saltar</p>
    </div>
  )
}

/* ── Story bars ── */
function StoryBars({ total, current }: { total: number; current: number }) {
  return (
    <div className="absolute top-2 left-3 right-3 z-30 flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${i === current ? 'bg-white' : i < current ? 'bg-white/50' : 'bg-white/20'}`} />
      ))}
    </div>
  )
}

/* ── Reel Card ── */
function ReelCard({
  pelicula, onSwipe, isTop, onVista, onWatchlist, currentUserId,
}: {
  pelicula: Pelicula
  onSwipe: (dir: 'left' | 'right' | 'down' | 'up') => void
  isTop: boolean
  onVista: () => void
  onWatchlist: () => void
  currentUserId: string | undefined
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState<'left' | 'right' | 'down' | 'up' | null>(null)
  const [slide, setSlide] = useState(0) // 0=poster, 1=info, 2=reviews

  const [reviews, setReviews] = useState<MiniReview[]>([])
  const [reviewsCargando, setReviewsCargando] = useState(false)
  const [reviewsFetched, setReviewsFetched] = useState(false)

  const titulo = pelicula.titulo_ingles || pelicula.titulo

  // Load reviews when slide 2 is shown
  useEffect(() => {
    if (slide !== 2 || reviewsFetched || reviewsCargando) return
    setReviewsCargando(true)
    ;(async () => {
      // Author review
      const { data: enrData } = await supabase
        .from('enriquecimiento').select('review_autor, es_review_autor')
        .eq('pelicula_id', pelicula.id).maybeSingle()

      // User reviews
      const { data: rawReviews } = await supabase
        .from('user_reviews').select('id, review_text, created_at, user_id, rating')
        .eq('pelicula_id', pelicula.id).order('created_at', { ascending: false }).limit(10)

      const allReviews: MiniReview[] = []

      if (enrData?.es_review_autor && enrData?.review_autor) {
        allReviews.push({
          id: 'autor', username: 'CineBret', avatar_url: null,
          rating: null, review_text: enrData.review_autor, created_at: '', isAutor: true,
        })
      }

      if (rawReviews && rawReviews.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('user_id, username, avatar_url')
          .in('user_id', rawReviews.map((r: any) => r.user_id))
        const pm: Record<string, any> = {}
        ;(profiles ?? []).forEach((p: any) => { pm[p.user_id] = p })
        rawReviews.filter((r: any) => pm[r.user_id]).forEach((r: any) => {
          allReviews.push({
            id: r.id, username: pm[r.user_id].username, avatar_url: pm[r.user_id].avatar_url,
            rating: r.rating, review_text: r.review_text, created_at: r.created_at,
          })
        })
      }

      setReviews(allReviews)
      setReviewsFetched(true)
      setReviewsCargando(false)
    })()
  }, [slide, pelicula.id, reviewsFetched, reviewsCargando])

  // Touch handlers — on slides 1/2, only handle taps + horizontal swipes (vertical = scroll)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isTop) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    setDragging(true)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTop || !dragging) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    // On slides 1/2: only track horizontal movement, let vertical scroll naturally
    if (slide > 0) {
      if (Math.abs(dx) > Math.abs(dy)) {
        setOffset({ x: dx, y: 0 })
      }
      // don't set vertical offset — browser handles scroll
    } else {
      setOffset({ x: dx, y: dy })
    }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isTop) return
    setDragging(false)
    const { x, y } = offset
    const rawDx = (e.changedTouches[0]?.clientX ?? 0) - startX.current
    const rawDy = (e.changedTouches[0]?.clientY ?? 0) - startY.current
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)

    // Tap → navigate slides
    if (rawDist < TAP_THRESHOLD) {
      setOffset({ x: 0, y: 0 })
      const touchX = e.changedTouches[0]?.clientX ?? 0
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const relX = touchX - rect.left
      if (relX > rect.width * 0.5) {
        setSlide(s => Math.min(pelicula.video_clip_url ? 3 : 2, s + 1))
      } else {
        setSlide(s => Math.max(0, s - 1))
      }
      return
    }

    // Swipe horizontal (works on all slides)
    if (Math.abs(x) > SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y)) {
      const dir = x > 0 ? 'right' : 'left'
      setGone(dir); setTimeout(() => onSwipe(dir), 300); return
    }

    // Swipe vertical (only on slide 0 — slides 1/2 use native scroll)
    if (slide === 0) {
      if (y > SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
        setGone('down'); setTimeout(() => onSwipe('down'), 300); return
      }
      if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
        setGone('up'); setTimeout(() => onSwipe('up'), 300); return
      }
    }
    setOffset({ x: 0, y: 0 })
  }

  const rotation = offset.x / 20
  const opacity = gone ? 0 : 1
  const translateX = gone === 'left' ? -400 : gone === 'right' ? 400 : offset.x
  const translateY = gone === 'down' ? 400 : gone === 'up' ? -400 : offset.y
  const swipeIndicator = offset.x > 40 ? 'right' : offset.x < -40 ? 'left' : offset.y > 40 ? 'down' : offset.y < -40 ? 'up' : null

  // Desktop click handler for slide navigation
  const handleClick = (e: React.MouseEvent) => {
    if (!isTop) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const relX = e.clientX - rect.left
    const maxSlide = pelicula.video_clip_url ? 3 : 2
    if (relX > rect.width * 0.5) {
      setSlide(s => Math.min(maxSlide, s + 1))
    } else {
      setSlide(s => Math.max(0, s - 1))
    }
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      style={{
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`,
        transition: dragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        opacity, touchAction: 'none',
      }}
      className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl select-none"
    >
      {/* Poster background — always visible */}
      {pelicula.poster_path ? (
        <Image src={`https://image.tmdb.org/t/p/w500${pelicula.poster_path}`} alt={titulo} fill className="object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><span className="text-5xl">🎬</span></div>
      )}

      {/* Dark overlay — stronger for slides 1 & 2 */}
      <div className="absolute inset-0 transition-colors duration-300" style={{
        background: slide === 0
          ? 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.3) 100%)'
          : 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.92) 60%, rgba(0,0,0,0.7) 100%)'
      }} />

      {/* Story bars */}
      <StoryBars total={pelicula.video_clip_url ? 4 : 3} current={slide} />

      {/* Swipe indicators */}
      {swipeIndicator === 'right' && (
        <div className="absolute top-12 left-6 z-40 border-4 border-pink-400 rounded-xl px-4 py-2 rotate-[-20deg]">
          <span className="text-pink-400 font-black text-2xl tracking-wider">WATCHLIST</span>
        </div>
      )}
      {swipeIndicator === 'left' && (
        <div className="absolute top-12 right-6 z-40 border-4 border-red-400 rounded-xl px-4 py-2 rotate-[20deg]">
          <span className="text-red-400 font-black text-2xl tracking-wider">PASO</span>
        </div>
      )}
      {swipeIndicator === 'up' && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-40 border-4 border-blue-400 rounded-xl px-4 py-2">
          <span className="text-blue-400 font-black text-2xl tracking-wider">YA LA VI</span>
        </div>
      )}
      {swipeIndicator === 'down' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 border-4 border-zinc-300 rounded-xl px-4 py-2">
          <span className="text-zinc-300 font-black text-2xl tracking-wider">OTRA</span>
        </div>
      )}

      {/* ══ SLIDE 0: Poster + basic info ══ */}
      {slide === 0 && (
        <div className="absolute inset-x-0 bottom-24 p-4 z-10">
          {/* Platforms top */}
          {pelicula.plataformas.length > 0 && (
            <div className="flex gap-2 mb-3">
              {pelicula.plataformas.map(p => {
                const logo = PLATFORM_LOGOS[p]
                return logo ? (
                  <div key={p} className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center p-1.5">
                    <img src={logo} alt={p} className="w-full h-full object-contain" />
                  </div>
                ) : null
              })}
            </div>
          )}
          <h2 className="text-white font-bold text-xl leading-tight mb-1">{titulo}</h2>
          {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
            <p className="text-zinc-400 text-xs mb-1">{pelicula.titulo}</p>
          )}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {pelicula.anio && <span className="text-zinc-400 text-sm">{pelicula.anio}</span>}
            {pelicula.nota_imdb && <span className="text-yellow-400 text-sm font-medium">⭐ {pelicula.nota_imdb}</span>}
            {pelicula.oscars && pelicula.oscars !== 'N/A' && <span className="text-amber-300 text-xs">🏆 {pelicula.oscars}</span>}
          </div>
          {pelicula.categoria && (
            <span className="inline-block bg-white/10 backdrop-blur-sm text-zinc-300 text-xs px-2.5 py-1 rounded-full mb-2">{pelicula.categoria}</span>
          )}
          {pelicula.generos.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {pelicula.generos.slice(0, 3).map(g => (
                <span key={g} className="bg-white/10 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ SLIDE 1: Detailed info ══ */}
      {slide === 1 && (
        <div className="absolute inset-x-0 bottom-24 top-10 overflow-y-auto p-4 z-10 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <h2 className="text-white font-bold text-lg leading-tight mb-1">{titulo}</h2>
          {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
            <p className="text-zinc-400 text-xs mb-3">{pelicula.titulo}</p>
          )}

          {/* Scores */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {pelicula.nota_imdb != null && (
              <div className="flex items-center gap-1">
                <div className="w-9 h-9 rounded-full border-2 border-yellow-400 bg-black/40 flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-xs">{pelicula.nota_imdb}</span>
                </div>
                <span className="text-zinc-500 text-[10px]">IMDB</span>
              </div>
            )}
            {pelicula.rt_score != null && (
              <div className="flex items-center gap-1">
                <div className="w-9 h-9 rounded-full border-2 border-red-400 bg-black/40 flex items-center justify-center">
                  <span className="text-red-400 font-bold text-xs">{pelicula.rt_score}%</span>
                </div>
                <span className="text-zinc-500 text-[10px]">RT</span>
              </div>
            )}
            {pelicula.metacritic_score != null && (
              <div className="flex items-center gap-1">
                <div className="w-9 h-9 rounded-full border-2 border-green-400 bg-black/40 flex items-center justify-center">
                  <span className="text-green-400 font-bold text-xs">{pelicula.metacritic_score}</span>
                </div>
                <span className="text-zinc-500 text-[10px]">MC</span>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400 mb-3">
            {pelicula.anio && <span>{pelicula.anio}</span>}
            {pelicula.runtime != null && <span>· {Math.floor(pelicula.runtime / 60)}h {pelicula.runtime % 60}min</span>}
            {pelicula.categoria && <span>· {pelicula.categoria}</span>}
          </div>

          {/* Genres */}
          {pelicula.generos.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {pelicula.generos.map(g => (
                <span key={g} className="bg-white/10 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>
          )}

          {/* Oscars */}
          {pelicula.oscars && pelicula.oscars !== 'N/A' && (
            <p className="text-amber-300 text-xs mb-3">🏆 {pelicula.oscars}</p>
          )}

          {/* Sinopsis */}
          {pelicula.sinopsis && (
            <div className="mb-3">
              <p className="text-zinc-500 text-[10px] uppercase tracking-wide mb-1 font-medium">Sinopsis</p>
              <p className="text-zinc-300 text-sm leading-relaxed italic">{pelicula.sinopsis}</p>
            </div>
          )}

          {/* Team */}
          {pelicula.director && (
            <div className="mb-2">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Director: </span>
              <span className="text-zinc-200 text-sm">{pelicula.director}</span>
            </div>
          )}
          {pelicula.actores && (
            <div className="mb-2">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Reparto: </span>
              <span className="text-zinc-200 text-sm">{pelicula.actores}</span>
            </div>
          )}
          {pelicula.compositor && (
            <div className="mb-2">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Compositor: </span>
              <span className="text-zinc-200 text-sm">{pelicula.compositor}</span>
            </div>
          )}
          {pelicula.boxoffice != null && (
            <div className="mb-2">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Taquilla: </span>
              <span className="text-zinc-200 text-sm">${(pelicula.boxoffice / 1_000_000).toFixed(0)}M</span>
            </div>
          )}

          {/* Platforms */}
          {pelicula.plataformas.length > 0 && (
            <div className="flex gap-1.5 mt-3">
              {pelicula.plataformas.map(p => {
                const logo = PLATFORM_LOGOS[p]
                return logo ? (
                  <div key={p} className="w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center p-1">
                    <img src={logo} alt={p} className="w-full h-full object-contain" />
                  </div>
                ) : null
              })}
            </div>
          )}

          <Link href={`/pelicula/${pelicula.id}`} className="block mt-4 text-yellow-400 text-xs font-medium">Ver ficha completa →</Link>
        </div>
      )}

      {/* ══ SLIDE 2: Reviews ══ */}
      {slide === 2 && (
        <div className="absolute inset-x-0 bottom-24 top-10 overflow-y-auto p-4 z-10 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <h3 className="text-white font-bold text-base mb-3">Reviews</h3>
          {reviewsCargando && <p className="text-zinc-500 text-xs text-center pt-4">Cargando reviews...</p>}
          {!reviewsCargando && reviews.length === 0 && (
            <p className="text-zinc-500 text-sm text-center pt-8">Sin reviews aún para esta película.</p>
          )}
          {reviews.map(r => (
            <div key={r.id} className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                {r.isAutor ? (
                  <span className="text-xs bg-yellow-400 text-zinc-950 font-bold px-2 py-0.5 rounded-full">✍️ CineBret</span>
                ) : (
                  <>
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 overflow-hidden">
                      {r.avatar_url ? <img src={r.avatar_url} alt={r.username} className="w-full h-full object-cover" /> : r.username[0]?.toUpperCase()}
                    </div>
                    <span className="text-white text-xs font-medium">@{r.username}</span>
                  </>
                )}
                {r.rating && <span className="text-yellow-400 text-[10px]">{r.rating}/10</span>}
                {r.created_at && <span className="text-zinc-600 text-[10px]">{tiempoRelativo(r.created_at)}</span>}
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{r.review_text}</p>
            </div>
          ))}
          <Link href={`/pelicula/${pelicula.id}#reviews`} className="block mt-2 text-yellow-400 text-xs font-medium">Ver todas en la ficha →</Link>
        </div>
      )}

      {/* ══ SLIDE 3: Video clip (only if available) ══ */}
      {slide === 3 && pelicula.video_clip_url && (() => {
        const ytId = extractYouTubeId(pelicula.video_clip_url!)
        return (
          <div className="absolute inset-x-0 bottom-24 top-10 flex flex-col items-center justify-center p-4 z-10">
            <p className="text-white font-bold text-base mb-3">Clip</p>
            <div className="w-full max-w-sm">
              {ytId ? (
                <YouTubeClip videoId={ytId} />
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black">
                  <video
                    src={pelicula.video_clip_url!}
                    autoPlay muted loop playsInline
                    className="w-full max-h-[50vh] object-contain"
                    onClick={e => { e.currentTarget.muted = !e.currentTarget.muted }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── "Otra película" button top-right ── */}
      <button
        className="absolute top-8 right-3 z-30 w-11 h-11 rounded-full bg-zinc-900/80 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-lg"
        onTouchEnd={e => { e.stopPropagation(); onSwipe('down') }}
        onClick={() => onSwipe('down')}
        title="Otra película"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}

type LastAction = {
  pelicula: Pelicula
  action: 'left' | 'right' | 'up' | 'vista' | 'watchlist'
}

export default function ReelPage() {
  const { user } = useAuth()
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [cargando, setCargando] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)

  useEffect(() => {
    const visto = localStorage.getItem('reel_onboarding')
    if (!visto) setShowOnboarding(true)
  }, [])

  const cargarPeliculas = useCallback(async () => {
    setCargando(true)
    const snoozed = getSnoozed()
    const sessionDone = getSessionDone()
    const excluidos = new Set<string>([...Object.keys(snoozed), ...sessionDone])
    if (user) {
      const { data } = await supabase
        .from('user_peliculas').select('pelicula_id')
        .eq('user_id', user.id).or('visto.eq.true,watchlist.eq.true')
      ;(data ?? []).forEach((r: any) => excluidos.add(r.pelicula_id))
    }

    const { data: cats } = await supabase.from('catalogos').select('pelicula_id, plataforma').eq('activo', true)
    const platSets: Record<string, Set<string>> = {}
    ;(cats ?? []).forEach((c: any) => {
      if (!platSets[c.pelicula_id]) platSets[c.pelicula_id] = new Set()
      platSets[c.pelicula_id].add(c.plataforma)
    })
    const platMap: Record<string, string[]> = {}
    Object.entries(platSets).forEach(([id, set]) => { platMap[id] = [...set] })
    const ids = Object.keys(platMap).filter(id => !excluidos.has(id))
    if (ids.length === 0) { setCargando(false); return }

    const CHUNK = 100
    const todas: Pelicula[] = []
    for (let i = 0; i < Math.min(ids.length, 300); i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { data: pels } = await supabase
        .from('peliculas').select('id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, oscars, poster_path, categoria, runtime, boxoffice')
        .in('id', chunk).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false })
      ;(pels ?? []).forEach((p: any) => {
        todas.push({ ...p, plataformas: platMap[p.id] ?? [], sinopsis: null, generos: [], director: null, actores: null, compositor: null, video_clip_url: null })
      })
    }

    const todosIds = todas.map(p => p.id)
    const enrMap: Record<string, any> = {}
    for (let i = 0; i < todosIds.length; i += CHUNK) {
      const chunk = todosIds.slice(i, i + CHUNK)
      const { data: enr } = await supabase
        .from('enriquecimiento').select('pelicula_id, sinopsis_chilensis, generos, director, actores, compositor, video_clip_url')
        .in('pelicula_id', chunk)
      ;(enr ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
    }

    const final = todas.map(p => ({
      ...p,
      sinopsis: enrMap[p.id]?.sinopsis_chilensis ?? null,
      generos: enrMap[p.id]?.generos ?? [],
      director: enrMap[p.id]?.director ?? null,
      actores: enrMap[p.id]?.actores ?? null,
      compositor: enrMap[p.id]?.compositor ?? null,
      video_clip_url: enrMap[p.id]?.video_clip_url ?? null,
    }))
    final.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
    setPeliculas(final)
    setCargando(false)
  }, [user])

  useEffect(() => { cargarPeliculas() }, [cargarPeliculas])

  const handleSwipe = useCallback((dir: 'left' | 'right' | 'down' | 'up') => {
    setPeliculas(prev => {
      if (prev.length === 0) return prev
      const [top, ...rest] = prev
      if (dir === 'right') {
        setLastAction({ pelicula: top, action: 'right' })
        markSessionDone(top.id)
        if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: top.id, watchlist: true, visto: false }, { onConflict: 'user_id,pelicula_id' }).then(({ error }) => { if (error) console.error('watchlist upsert error:', error) })
        return rest
      }
      if (dir === 'left') {
        setLastAction({ pelicula: top, action: 'left' })
        snoozeId(top.id)
        return rest
      }
      if (dir === 'up') {
        setLastAction({ pelicula: top, action: 'up' })
        markSessionDone(top.id)
        if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: top.id, visto: true, watchlist: false }, { onConflict: 'user_id,pelicula_id' }).then(({ error }) => { if (error) console.error('visto upsert error:', error) })
        return rest
      }
      if (dir === 'down') {
        const pos = Math.min(5, rest.length); const next = [...rest]; next.splice(pos, 0, top); return next
      }
      return rest
    })
  }, [user])

  const handleUndo = useCallback(() => {
    if (!lastAction) return
    const { pelicula, action } = lastAction
    setPeliculas(prev => [pelicula, ...prev.filter(p => p.id !== pelicula.id)])
    unmarkSessionDone(pelicula.id)
    if (action === 'left') unsnoozeId(pelicula.id)
    else if (action === 'right') { if (user) supabase.from('user_peliculas').update({ watchlist: false }).eq('user_id', user.id).eq('pelicula_id', pelicula.id) }
    else if (action === 'up') { if (user) supabase.from('user_peliculas').update({ visto: false }).eq('user_id', user.id).eq('pelicula_id', pelicula.id) }
    setLastAction(null)
  }, [lastAction, user])

  const onboardingDone = () => {
    localStorage.setItem('reel_onboarding', '1')
    setShowOnboarding(false)
  }

  if (cargando) return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <Nav active="reel" />
      <div className="flex-1 flex items-center justify-center"><Loading text="Cargando películas..." size="lg" /></div>
    </main>
  )

  if (peliculas.length === 0) return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <Nav active="reel" />
      <div className="flex-1 flex items-center justify-center px-6"><p className="text-zinc-500 text-sm text-center">No hay más películas disponibles.</p></div>
    </main>
  )

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <Nav active="reel" />
      <div className="flex-1 flex flex-col items-center px-4 pt-1 pb-1">
        <div className="relative w-full max-w-sm flex-1" style={{ maxHeight: '70vh' }}>
          {peliculas.slice(0, 3).map((p, i) => (
            <div key={p.id} className="absolute inset-0" style={{ transform: `scale(${1 - i * 0.04}) translateY(${i * 10}px)`, zIndex: 3 - i }}>
              <ReelCard
                pelicula={p} onSwipe={handleSwipe} isTop={i === 0}
                onVista={() => handleSwipe('up')} onWatchlist={() => handleSwipe('right')}
                currentUserId={user?.id}
              />
              {i === 0 && showOnboarding && <OnboardingOverlay onDone={onboardingDone} />}
            </div>
          ))}
        </div>

        {/* ── Bottom action buttons (overlapping poster) ── */}
        <div className="flex items-start gap-6 -mt-20 relative z-10">
          <button onClick={() => handleSwipe('left')} className="flex flex-col items-center gap-1">
            <div className="w-16 h-16 rounded-full bg-zinc-900/90 border-2 border-red-500/60 flex items-center justify-center text-red-400 text-3xl shadow-lg backdrop-blur-sm">✕</div>
            <span className="text-red-400 text-[10px] font-semibold leading-tight text-center">No me<br/>interesa</span>
          </button>
          <button onClick={() => handleSwipe('up')} className="flex flex-col items-center gap-1">
            <div className="w-16 h-16 rounded-full bg-zinc-900/90 border-2 border-blue-500/60 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <span className="text-blue-400 text-[10px] font-semibold">Ya la vi</span>
          </button>
          <button onClick={() => handleSwipe('right')} className="flex flex-col items-center gap-1">
            <div className="w-16 h-16 rounded-full bg-zinc-900/90 border-2 border-pink-500/60 flex items-center justify-center text-pink-400 text-3xl shadow-lg backdrop-blur-sm">♥</div>
            <span className="text-pink-400 text-[10px] font-semibold">Watchlist</span>
          </button>
        </div>
        <button onClick={handleUndo} disabled={!lastAction}
          className="mt-1 text-zinc-600 text-[10px] disabled:opacity-20 hover:text-zinc-400 transition-colors">↩ Deshacer</button>
      </div>
    </main>
  )
}
