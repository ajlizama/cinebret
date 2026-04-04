'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import { useGuestLimit } from '@/hooks/useGuestLimit'
import GuestLimitModal from '@/components/GuestLimitModal'

type TinderMovie = {
  id: string; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; poster_path: string | null; backdrop_path: string | null
  categoria: string | null; plataformas: string[]; sinopsis: string | null; generos: string[]
  director: string | null; actores: string | null
  _tmdbId?: number | null
}

const PLAT_LOGOS: Record<string, string> = {
  netflix: '/netflix.png', disney_plus: '/disney_plus.svg', hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png', apple_tv: '/apple_tv.png', paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png', crunchyroll: '/crunchyroll.png',
}

// ── Snooze helpers (shared with /reel) ──
const SNOOZE_KEY = 'reel_snoozed'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
function getSnoozed(): Record<string, number> {
  try { const raw = localStorage.getItem(SNOOZE_KEY); const all: Record<string, number> = raw ? JSON.parse(raw) : {}; const now = Date.now(); return Object.fromEntries(Object.entries(all).filter(([, ts]) => now - ts < SNOOZE_MS)) } catch { return {} }
}
function snoozeId(id: string) { try { const s = getSnoozed(); s[id] = Date.now(); localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)) } catch {} }

const SESSION_KEY = 'reel_session_done'
function getSessionDone(): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]')) } catch { return new Set() } }
function markSessionDone(id: string) { try { const s = getSessionDone(); s.add(id); sessionStorage.setItem(SESSION_KEY, JSON.stringify([...s])) } catch {} }

const SWIPE_THRESHOLD = 80
const TAP_THRESHOLD = 8

// ── Story Bars ──
function StoryBars({ total, current }: { total: number; current: number }) {
  return (
    <div className="absolute top-2 left-3 right-3 z-30 flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${i === current ? 'bg-white' : i < current ? 'bg-white/50' : 'bg-white/20'}`} />
      ))}
    </div>
  )
}

// ── Onboarding Overlay ──
function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const pasos = [
    { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>, color: 'text-pink-400', label: 'Desliza → Watchlist' },
    { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>, color: 'text-red-400', label: 'Desliza ← No me interesa' },
    { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>, color: 'text-blue-400', label: 'Desliza ↑ Ya la vi' },
    { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>, color: 'text-zinc-300', label: 'Desliza ↓ Otra película' },
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
        <span className={`${p.color}`}>{p.icon}</span>
        <span className={`text-lg font-semibold ${p.color}`}>{p.label}</span>
      </div>
      <p className="text-zinc-500 text-xs mt-8">Toca para saltar</p>
    </div>
  )
}

// ── Tinder Card ──
function TinderCard({
  movie, isTop, onSwipe, slide, setSlide, logoPath,
}: {
  movie: TinderMovie; isTop: boolean; logoPath?: string | null
  onSwipe: (dir: 'left' | 'right' | 'down' | 'up') => void
  slide: number; setSlide: (s: number) => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState<'left' | 'right' | 'down' | 'up' | null>(null)

  const titulo = movie.titulo_ingles || movie.titulo
  const maxSlide = 3 // poster, info, reviews, ficha
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewsLoaded, setReviewsLoaded] = useState(false)

  // Lazy load reviews on slide 2
  useEffect(() => {
    if (slide !== 2 || reviewsLoaded) return
    ;(async () => {
      const { data: enrData } = await supabase.from('enriquecimiento').select('review_autor, es_review_autor').eq('pelicula_id', movie.id).maybeSingle()
      const { data: rawReviews } = await supabase.from('user_reviews').select('id, review_text, created_at, user_id, rating').eq('pelicula_id', movie.id).order('created_at', { ascending: false }).limit(5)
      const all: any[] = []
      if (enrData?.es_review_autor && enrData?.review_autor) all.push({ id: 'autor', username: 'CineBret', review_text: enrData.review_autor, isAutor: true })
      if (rawReviews && rawReviews.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', rawReviews.map((r: any) => r.user_id))
        const pm: Record<string, any> = {}; (profiles ?? []).forEach((p: any) => { pm[p.user_id] = p })
        rawReviews.filter((r: any) => pm[r.user_id]).forEach((r: any) => all.push({ ...r, username: pm[r.user_id].username }))
      }
      setReviews(all)
      setReviewsLoaded(true)
    })()
  }, [slide, movie.id, reviewsLoaded])

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
    if (slide > 0) {
      if (Math.abs(dx) > Math.abs(dy)) setOffset({ x: dx, y: 0 })
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

    if (rawDist < TAP_THRESHOLD) {
      setOffset({ x: 0, y: 0 })
      touchedRef.current = true // prevent synthetic click from also firing
      const touchX = e.changedTouches[0]?.clientX ?? 0
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const relX = touchX - rect.left
      if (relX > rect.width * 0.5) setSlide(Math.min(maxSlide, slide + 1))
      else setSlide(Math.max(0, slide - 1))
      return
    }

    if (Math.abs(x) > SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y)) {
      const dir = x > 0 ? 'right' : 'left'
      setGone(dir); setTimeout(() => onSwipe(dir), 300); return
    }
    if (slide === 0) {
      if (y > SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) { setGone('down'); setTimeout(() => onSwipe('down'), 300); return }
      if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) { setGone('up'); setTimeout(() => onSwipe('up'), 300); return }
    }
    setOffset({ x: 0, y: 0 })
  }

  // Prevent click from firing after touch (causes double slide advance)
  const touchedRef = useRef(false)
  const handleClick = (e: React.MouseEvent) => {
    if (!isTop) return
    if (touchedRef.current) { touchedRef.current = false; return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const relX = e.clientX - rect.left
    if (relX > rect.width * 0.5) setSlide(Math.min(maxSlide, slide + 1))
    else setSlide(Math.max(0, slide - 1))
  }

  const rotation = offset.x / 20
  const opacity = gone ? 0 : 1
  const translateX = gone === 'left' ? -400 : gone === 'right' ? 400 : offset.x
  const translateY = gone === 'down' ? 400 : gone === 'up' ? -400 : offset.y
  const swipeIndicator = offset.x > 40 ? 'right' : offset.x < -40 ? 'left' : offset.y > 40 ? 'down' : offset.y < -40 ? 'up' : null

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
      {(movie.backdrop_path || movie.poster_path) ? (
        <Image
          src={movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : `https://image.tmdb.org/t/p/w500${movie.poster_path}`}
          alt={titulo} fill className="object-cover" draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
          <svg className="w-14 h-14 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
        </div>
      )}

      <div className="absolute inset-0 transition-colors duration-300" style={{
        background: slide === 0
          ? 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.3) 100%)'
          : 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.92) 60%, rgba(0,0,0,0.7) 100%)'
      }} />

      {/* Story bars */}
      <StoryBars total={maxSlide + 1} current={slide} />

      {/* Swipe indicators */}
      {swipeIndicator === 'right' && (
        <div className="absolute top-10 left-4 z-40 border-4 border-pink-400 rounded-xl px-3 py-1.5 rotate-[-20deg]">
          <span className="text-pink-400 font-black text-xl tracking-wider">WATCHLIST</span>
        </div>
      )}
      {swipeIndicator === 'left' && (
        <div className="absolute top-10 right-4 z-40 border-4 border-red-400 rounded-xl px-3 py-1.5 rotate-[20deg]">
          <span className="text-red-400 font-black text-xl tracking-wider">PASO</span>
        </div>
      )}
      {swipeIndicator === 'up' && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-40 border-4 border-blue-400 rounded-xl px-3 py-1.5">
          <span className="text-blue-400 font-black text-xl tracking-wider">YA LA VI</span>
        </div>
      )}
      {swipeIndicator === 'down' && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-40 border-4 border-zinc-300 rounded-xl px-3 py-1.5">
          <span className="text-zinc-300 font-black text-xl tracking-wider">OTRA</span>
        </div>
      )}

      {/* ── SLIDE 0: Poster + basic info ── */}
      {slide === 0 && (
        <div className="absolute inset-x-0 bottom-24 p-4 z-10">
          {movie.plataformas.length > 0 && (
            <div className="flex gap-1.5 mb-2">
              {movie.plataformas.slice(0, 4).map(p => {
                const logo = PLAT_LOGOS[p]
                return logo ? (
                  <div key={p} className="w-9 h-9 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center p-1.5">
                    <img loading="lazy" src={logo} alt={p} className="w-full h-full object-contain" />
                  </div>
                ) : null
              })}
            </div>
          )}
          {logoPath ? (
            <img src={`https://image.tmdb.org/t/p/w300${logoPath}`} alt={titulo} className="h-10 md:h-12 w-auto max-w-[70%] object-contain mb-1 drop-shadow-lg" />
          ) : (
            <h3 className="text-white font-bold text-xl leading-tight mb-1 drop-shadow-lg">{titulo}</h3>
          )}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {movie.anio && <span className="text-zinc-400 text-sm">{movie.anio}</span>}
            {movie.nota_imdb && (
              <span className="text-yellow-400 text-sm font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                {movie.nota_imdb}
              </span>
            )}
            {movie.categoria && <span className="bg-white/10 text-zinc-300 text-xs px-2.5 py-1 rounded-full">{movie.categoria}</span>}
          </div>
          {movie.generos.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {movie.generos.slice(0, 3).map(g => (
                <span key={g} className="bg-white/10 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{g}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SLIDE 1: Detailed info ── */}
      {slide === 1 && (
        <div className="absolute inset-x-0 bottom-24 top-10 overflow-y-auto p-4 z-10 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <h3 className="text-white font-bold text-lg leading-tight mb-1">{titulo}</h3>
          <div className="flex items-center gap-2 mb-2 flex-wrap text-sm">
            {movie.anio && <span className="text-zinc-400">{movie.anio}</span>}
            {movie.nota_imdb && <span className="text-yellow-400 font-medium flex items-center gap-1"><svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>{movie.nota_imdb}</span>}
          </div>
          {movie.generos.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {movie.generos.map(g => (<span key={g} className="bg-white/10 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{g}</span>))}
            </div>
          )}
          {movie.sinopsis && (
            <div className="mb-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1 font-medium">Sinopsis</p>
              <p className="text-zinc-300 text-sm leading-relaxed italic">{movie.sinopsis}</p>
            </div>
          )}
          {movie.director && (
            <div className="mb-2"><span className="text-zinc-500 text-xs uppercase tracking-wide">Director: </span><span className="text-zinc-200 text-sm">{movie.director}</span></div>
          )}
          {movie.actores && (
            <div className="mb-2"><span className="text-zinc-500 text-xs uppercase tracking-wide">Reparto: </span><span className="text-zinc-200 text-sm">{movie.actores}</span></div>
          )}
        </div>
      )}

      {/* ── SLIDE 2: Reviews ── */}
      {slide === 2 && (
        <div className="absolute inset-x-0 bottom-24 top-10 overflow-y-auto p-4 z-10 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <h3 className="text-white font-bold text-base mb-3">Reviews</h3>
          {!reviewsLoaded && <p className="text-zinc-500 text-xs text-center pt-4">Cargando reviews...</p>}
          {reviewsLoaded && reviews.length === 0 && <p className="text-zinc-500 text-sm text-center pt-8">Sin reviews aún.</p>}
          {reviews.map(r => (
            <div key={r.id} className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                {r.isAutor ? (
                  <span className="text-xs bg-yellow-400 text-zinc-950 font-bold px-2 py-0.5 rounded-full">Review CineBret</span>
                ) : (
                  <span className="text-white text-xs font-medium">@{r.username}</span>
                )}
                {r.rating && <span className="text-yellow-400 text-xs">{r.rating}/10</span>}
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{r.review_text}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── SLIDE 3: Ver ficha ── */}
      {slide === 3 && (
        <div className="absolute inset-x-0 bottom-24 top-10 flex flex-col items-center justify-center p-4 z-10">
          <h3 className="text-white font-bold text-lg mb-2">{titulo}</h3>
          <p className="text-zinc-400 text-sm mb-6 text-center">Visita la ficha completa para más detalles, trailers y más.</p>
          <Link href={`/pelicula/${movie.id}`} className="bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
            Ver ficha completa
          </Link>
        </div>
      )}

      {/* "Otra" button */}
      <button
        className="absolute top-8 right-3 z-30 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white"
        onTouchEnd={e => { e.stopPropagation(); onSwipe('down') }}
        onClick={e => { e.stopPropagation(); onSwipe('down') }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}

// ── Main Embedded Tinder ──
export default function EmbeddedTinder({ categorias = [], plataformas = [], trendingIds = [] }: { categorias?: string[]; plataformas?: string[]; trendingIds?: number[] }) {
  const { user } = useAuth()
  const { mode, hydrated } = useMediaMode()
  const isSeries = hydrated ? mode === 'series' : false
  const [movies, setMovies] = useState<TinderMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [slide, setSlide] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const { blocked: guestBlocked, increment: guestIncrement } = useGuestLimit(user, 'tinder')

  useEffect(() => {
    const visto = localStorage.getItem('reel_onboarding')
    if (!visto) setShowOnboarding(true)
  }, [])

  const loadMovies = useCallback(async () => {
    setLoading(true)
    const snoozed = getSnoozed()
    const sessionDone = getSessionDone()
    const excluidos = new Set<string>([...Object.keys(snoozed), ...sessionDone])

    if (user) {
      const table = isSeries ? 'user_series' : 'user_peliculas'
      const idField = isSeries ? 'serie_id' : 'pelicula_id'
      const { data } = await supabase.from(table).select(idField).eq('user_id', user.id).or('visto.eq.true,watchlist.eq.true')
      ;(data ?? []).forEach((r: any) => excluidos.add(r[idField]))
    }

    if (isSeries) {
      const { data: wpData } = await supabase.from('watch_providers_series').select('serie_id, platform_key').eq('provider_type', 'flatrate').not('platform_key', 'is', null)
      const platMap: Record<string, string[]> = {}
      ;(wpData ?? []).forEach((wp: any) => {
        if (!platMap[wp.serie_id]) platMap[wp.serie_id] = []
        if (!platMap[wp.serie_id].includes(wp.platform_key)) platMap[wp.serie_id].push(wp.platform_key)
      })
      const ids = Object.keys(platMap).filter(id => !excluidos.has(id)).slice(0, 100)
      if (ids.length === 0) { setLoading(false); return }

      const { data: sers } = await supabase.from('series')
        .select('id, titulo, titulo_ingles, anio_inicio, nota_imdb, tmdb_id, poster_path, backdrop_path, categoria')
        .in('id', ids).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false }).limit(50)

      const serIds = (sers ?? []).map(s => s.id)
      const { data: enr } = await supabase.from('enriquecimiento_series')
        .select('serie_id, sinopsis_chilensis, generos, director, actores')
        .in('serie_id', serIds)
      const enrMap: Record<string, any> = {}
      ;(enr ?? []).forEach((e: any) => { enrMap[e.serie_id] = e })

      const result: TinderMovie[] = (sers ?? []).map((s: any) => ({
        id: s.id, titulo: s.titulo, titulo_ingles: s.titulo_ingles, anio: s.anio_inicio,
        nota_imdb: s.nota_imdb, poster_path: s.poster_path, backdrop_path: s.backdrop_path, categoria: s.categoria,
        plataformas: platMap[s.id] ?? [], sinopsis: enrMap[s.id]?.sinopsis_chilensis ?? null,
        generos: enrMap[s.id]?.generos ?? [], director: enrMap[s.id]?.director ?? null,
        actores: Array.isArray(enrMap[s.id]?.actores) ? enrMap[s.id].actores.join(', ') : (enrMap[s.id]?.actores ?? null),
        _tmdbId: s.tmdb_id,
      }))
      const trendingSet = new Set(trendingIds)
      const trending = result.filter(m => m._tmdbId && trendingSet.has(m._tmdbId))
      const rest = result.filter(m => !m._tmdbId || !trendingSet.has(m._tmdbId))
      const final: TinderMovie[] = []
      let ti = 0, ri = 0
      while (ti < trending.length || ri < rest.length) {
        for (let k = 0; k < 2 && ri < rest.length; k++) final.push(rest[ri++])
        if (ti < trending.length) final.push(trending[ti++])
      }
      setMovies(final)
    } else {
      const { data: wpData } = await supabase.from('watch_providers').select('pelicula_id, platform_key').eq('provider_type', 'flatrate').not('platform_key', 'is', null)
      const platMap: Record<string, string[]> = {}
      ;(wpData ?? []).forEach((wp: any) => {
        if (!platMap[wp.pelicula_id]) platMap[wp.pelicula_id] = []
        if (!platMap[wp.pelicula_id].includes(wp.platform_key)) platMap[wp.pelicula_id].push(wp.platform_key)
      })
      const ids = Object.keys(platMap).filter(id => !excluidos.has(id)).slice(0, 200)
      if (ids.length === 0) { setLoading(false); return }

      const { data: pels } = await supabase.from('peliculas')
        .select('id, titulo, titulo_ingles, anio, nota_imdb, tmdb_id, poster_path, backdrop_path, categoria')
        .in('id', ids).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false }).limit(200)

      const pelIds = (pels ?? []).map(p => p.id)
      const CHUNK = 100
      const enrMap: Record<string, any> = {}
      for (let i = 0; i < pelIds.length; i += CHUNK) {
        const chunk = pelIds.slice(i, i + CHUNK)
        const { data: enr } = await supabase.from('enriquecimiento')
          .select('pelicula_id, sinopsis_chilensis, generos, director, actores')
          .in('pelicula_id', chunk)
        ;(enr ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
      }

      const all: TinderMovie[] = (pels ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles, anio: p.anio,
        nota_imdb: p.nota_imdb, poster_path: p.poster_path, backdrop_path: p.backdrop_path, categoria: p.categoria,
        plataformas: platMap[p.id] ?? [], sinopsis: enrMap[p.id]?.sinopsis_chilensis ?? null,
        generos: enrMap[p.id]?.generos ?? [], director: enrMap[p.id]?.director ?? null,
        actores: enrMap[p.id]?.actores ?? null,
        _tmdbId: p.tmdb_id,
      }))

      // Split: trending (30%) + rest by IMDB (70%)
      const trendingSet = new Set(trendingIds)
      const trending = all.filter(m => m._tmdbId && trendingSet.has(m._tmdbId))
        .sort((a, b) => trendingIds.indexOf(a._tmdbId!) - trendingIds.indexOf(b._tmdbId!))
      const rest = all.filter(m => !m._tmdbId || !trendingSet.has(m._tmdbId))
      // Interleave: every ~3 movies, insert a trending one
      const final: TinderMovie[] = []
      let ti = 0, ri = 0
      while (ti < trending.length || ri < rest.length) {
        // 2 from rest, 1 from trending
        for (let k = 0; k < 2 && ri < rest.length; k++) final.push(rest[ri++])
        if (ti < trending.length) final.push(trending[ti++])
      }
      setMovies(final)
    }
    setLoading(false)
  }, [user, isSeries])

  useEffect(() => { if (hydrated) loadMovies() }, [loadMovies, hydrated])

  // Fetch logo for current top movie
  const topMovie = movies.length > 0 ? movies.filter(m => {
    if (categorias.length > 0 && !categorias.includes(m.categoria ?? '')) return false
    if (plataformas.length > 0 && !plataformas.some(p => m.plataformas.includes(p))) return false
    return true
  })[0] : null
  useEffect(() => {
    if (!topMovie?._tmdbId) { setLogoPath(null); return }
    const type = isSeries ? 'tv' : 'movie'
    fetch(`/api/tmdb-logo?id=${topMovie._tmdbId}&type=${type}`)
      .then(r => r.json())
      .then(d => setLogoPath(d.logo || null))
      .catch(() => setLogoPath(null))
  }, [topMovie?.id, topMovie?._tmdbId, isSeries])

  // Apply mood/platform filters on top of loaded movies
  const filteredMovies = movies.filter(m => {
    if (categorias.length > 0 && !categorias.includes(m.categoria ?? '')) return false
    if (plataformas.length > 0 && !plataformas.some(p => m.plataformas.includes(p))) return false
    return true
  })

  const handleSwipe = useCallback((dir: 'left' | 'right' | 'down' | 'up') => {
    if (guestIncrement()) return
    const top = filteredMovies[0]
    if (!top) return

    const table = isSeries ? 'user_series' : 'user_peliculas'
    const idField = isSeries ? 'serie_id' : 'pelicula_id'
    const conflict = isSeries ? 'user_id,serie_id' : 'user_id,pelicula_id'

    if (dir === 'right') {
      markSessionDone(top.id)
      setMovies(prev => prev.slice(1))
      setSlide(0)
      if (user) supabase.from(table).upsert({ user_id: user.id, [idField]: top.id, watchlist: true, visto: false }, { onConflict: conflict }).then(() => {})
    } else if (dir === 'left') {
      snoozeId(top.id)
      setMovies(prev => prev.slice(1))
      setSlide(0)
    } else if (dir === 'up') {
      markSessionDone(top.id)
      setMovies(prev => prev.slice(1))
      setSlide(0)
      if (user) supabase.from(table).upsert({ user_id: user.id, [idField]: top.id, visto: true, watchlist: false }, { onConflict: conflict }).then(() => {})
    } else if (dir === 'down') {
      setMovies(prev => {
        const [first, ...rest] = prev
        const pos = Math.min(5, rest.length)
        const next = [...rest]; next.splice(pos, 0, first); return next
      })
      setSlide(0)
    }
  }, [user, filteredMovies, isSeries, guestIncrement])

  // If guest dismissed the modal, hide tinder entirely so they can browse catalog
  if (dismissed) return null

  if (loading) return (
    <div className="mb-4">
      <div className="w-full aspect-[5/4] rounded-2xl bg-zinc-800 animate-pulse" />
    </div>
  )

  if (filteredMovies.length === 0) return (
    <div className="mb-4">
      <div className="w-full aspect-[5/4] rounded-2xl bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-500 text-sm text-center px-4">{loading ? '' : 'No hay más contenido disponible.'}</p>
      </div>
    </div>
  )

  return (
    <div className="mb-4">
      <div className="w-full">
        <div className="relative w-full aspect-[5/4]">
          {filteredMovies.slice(0, 3).map((m, i) => (
            <div key={m.id} className="absolute inset-0" style={{ transform: `scale(${1 - i * 0.04}) translateY(${i * 8}px)`, zIndex: 3 - i }}>
              <TinderCard movie={m} isTop={i === 0} onSwipe={handleSwipe} slide={i === 0 ? slide : 0} setSlide={i === 0 ? setSlide : () => {}} logoPath={i === 0 ? logoPath : null} />
              {i === 0 && showOnboarding && <OnboardingOverlay onDone={() => { localStorage.setItem('reel_onboarding', '1'); setShowOnboarding(false) }} />}
              {i === 0 && guestBlocked && <GuestLimitModal onDismiss={() => setDismissed(true)} />}
            </div>
          ))}

          {/* Action buttons — glass bar overlapping bottom */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-0.5 bg-black/40 backdrop-blur-xl rounded-full px-1 py-1 shadow-2xl border border-white/10">
              <button onClick={() => handleSwipe('left')} className="group flex flex-col items-center gap-0.5 w-16 py-1 rounded-full cursor-pointer transition-all hover:bg-red-500/20 active:scale-90">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-red-400 group-hover:text-red-300 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                <span className="text-red-400/80 text-[9px] font-medium">Paso</span>
              </button>
              <button onClick={() => handleSwipe('up')} className="group flex flex-col items-center gap-0.5 w-16 py-1 rounded-full cursor-pointer transition-all hover:bg-blue-500/20 active:scale-90">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-blue-400 group-hover:text-blue-300 transition-colors"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <span className="text-blue-400/80 text-[9px] font-medium">Ya la vi</span>
              </button>
              <button onClick={() => handleSwipe('right')} className="group flex flex-col items-center gap-0.5 w-16 py-1 rounded-full cursor-pointer transition-all hover:bg-pink-500/20 active:scale-90">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-pink-400 group-hover:text-pink-300 transition-colors"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <span className="text-pink-400/80 text-[9px] font-medium">Watchlist</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
