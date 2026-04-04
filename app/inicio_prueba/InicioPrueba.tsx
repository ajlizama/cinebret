'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import { useGuestLimit } from '@/hooks/useGuestLimit'
import GuestLimitModal from '@/components/GuestLimitModal'

type SimpleMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  titulo_latino: string | null
  poster_path: string | null
  backdrop_path: string | null
  nota_imdb: number | null
  anio: number | null
  categoria: string | null
  plataformas: string[]
  generos: string[]
  sinopsis: string | null
  _isSerie?: boolean
}

type TinderMovie = {
  id: string; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; poster_path: string | null; categoria: string | null
  plataformas: string[]; sinopsis: string | null; generos: string[]
  director: string | null; actores: string | null
}

const PLAT_LOGOS: Record<string, string> = {
  netflix: '/netflix.png', disney_plus: '/disney_plus.svg', hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png', apple_tv: '/apple_tv.png', paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png', crunchyroll: '/crunchyroll.png',
}

const MOODS = [
  { id: "Pa'l domingo de bajón", label: 'Bajón', icon: '🛋️', color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30' },
  { id: "Pa' saltar del sillón", label: 'Sillón', icon: '⚡', color: 'from-red-500/20 to-red-600/10 border-red-500/30' },
  { id: "Pa' quedar con el cerebro como licuadora", label: 'Licuadora', icon: '🧠', color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30' },
  { id: "Pa' llorar a moco tendido", label: 'Llorar', icon: '💧', color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30' },
]

const TYPEWRITER_PHRASES = [
  '¿Cómo te ayudo?',
  'Una película parecida a Matrix...',
  'Quiero ver ciencia-ficción...',
  'Algo estilo Nolan...',
]

// ── Typewriter animated placeholder ──
function useTypewriter(phrases: string[], typingSpeed = 60, deleteSpeed = 35, pauseMs = 2000) {
  const [text, setText] = useState('')
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const phrase = phrases[phraseIdx]
    if (!deleting) {
      if (charIdx < phrase.length) {
        const t = setTimeout(() => { setCharIdx(c => c + 1); setText(phrase.slice(0, charIdx + 1)) }, typingSpeed)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setDeleting(true), pauseMs)
        return () => clearTimeout(t)
      }
    } else {
      if (charIdx > 0) {
        const t = setTimeout(() => { setCharIdx(c => c - 1); setText(phrase.slice(0, charIdx - 1)) }, deleteSpeed)
        return () => clearTimeout(t)
      } else {
        setDeleting(false)
        setPhraseIdx(i => (i + 1) % phrases.length)
      }
    }
  }, [charIdx, deleting, phraseIdx, phrases, typingSpeed, deleteSpeed, pauseMs])

  return text
}

// ── Snooze helpers ──
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

// ── Embedded Tinder Card ──
function TinderCard({
  movie, isTop, onSwipe,
}: {
  movie: TinderMovie; isTop: boolean
  onSwipe: (dir: 'left' | 'right' | 'down' | 'up') => void
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState<'left' | 'right' | 'down' | 'up' | null>(null)

  const titulo = movie.titulo_ingles || movie.titulo

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isTop) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    setDragging(true)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTop || !dragging) return
    setOffset({ x: e.touches[0].clientX - startX.current, y: e.touches[0].clientY - startY.current })
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isTop) return
    setDragging(false)
    const { x, y } = offset
    const rawDx = (e.changedTouches[0]?.clientX ?? 0) - startX.current
    const rawDy = (e.changedTouches[0]?.clientY ?? 0) - startY.current
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)

    if (rawDist < TAP_THRESHOLD) { setOffset({ x: 0, y: 0 }); return }

    if (Math.abs(x) > SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y)) {
      const dir = x > 0 ? 'right' : 'left'
      setGone(dir); setTimeout(() => onSwipe(dir), 300); return
    }
    if (y > SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
      setGone('down'); setTimeout(() => onSwipe('down'), 300); return
    }
    if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
      setGone('up'); setTimeout(() => onSwipe('up'), 300); return
    }
    setOffset({ x: 0, y: 0 })
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
      style={{
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`,
        transition: dragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        opacity, touchAction: 'none',
      }}
      className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl select-none"
    >
      {movie.poster_path ? (
        <Image src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} alt={titulo} fill className="object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
          <svg className="w-14 h-14 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
        </div>
      )}

      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.3) 100%)'
      }} />

      {/* Swipe indicators */}
      {swipeIndicator === 'right' && (
        <div className="absolute top-8 left-4 z-40 border-4 border-pink-400 rounded-xl px-3 py-1.5 rotate-[-20deg]">
          <span className="text-pink-400 font-black text-xl tracking-wider">WATCHLIST</span>
        </div>
      )}
      {swipeIndicator === 'left' && (
        <div className="absolute top-8 right-4 z-40 border-4 border-red-400 rounded-xl px-3 py-1.5 rotate-[20deg]">
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

      {/* Movie info bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4 z-10">
        {movie.plataformas.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {movie.plataformas.slice(0, 4).map(p => {
              const logo = PLAT_LOGOS[p]
              return logo ? (
                <div key={p} className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center p-1">
                  <img loading="lazy" src={logo} alt={p} className="w-full h-full object-contain" />
                </div>
              ) : null
            })}
          </div>
        )}
        <h3 className="text-white font-bold text-lg leading-tight mb-1">{titulo}</h3>
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {movie.anio && <span className="text-zinc-400 text-sm">{movie.anio}</span>}
          {movie.nota_imdb && (
            <span className="text-yellow-400 text-sm font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
              {movie.nota_imdb}
            </span>
          )}
          {movie.categoria && <span className="bg-white/10 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{movie.categoria}</span>}
        </div>
        {movie.generos.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {movie.generos.slice(0, 3).map(g => (
              <span key={g} className="bg-white/10 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        )}
      </div>

      {/* "Otra" button */}
      <button
        className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-zinc-900/80 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white"
        onTouchEnd={e => { e.stopPropagation(); onSwipe('down') }}
        onClick={() => onSwipe('down')}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}

// ── Embedded Tinder Section ──
function EmbeddedTinder() {
  const { user } = useAuth()
  const { mode, hydrated } = useMediaMode()
  const isSeries = hydrated ? mode === 'series' : false
  const [movies, setMovies] = useState<TinderMovie[]>([])
  const [loading, setLoading] = useState(true)
  const { blocked: guestBlocked, increment: guestIncrement } = useGuestLimit(user, 'tinder')

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
        .select('id, titulo, titulo_ingles, anio_inicio, nota_imdb, poster_path, categoria')
        .in('id', ids).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false }).limit(50)

      const serIds = (sers ?? []).map(s => s.id)
      const { data: enr } = await supabase.from('enriquecimiento_series')
        .select('serie_id, sinopsis_chilensis, generos, director, actores')
        .in('serie_id', serIds)
      const enrMap: Record<string, any> = {}
      ;(enr ?? []).forEach((e: any) => { enrMap[e.serie_id] = e })

      const result = (sers ?? []).map((s: any) => ({
        id: s.id, titulo: s.titulo, titulo_ingles: s.titulo_ingles, anio: s.anio_inicio,
        nota_imdb: s.nota_imdb, poster_path: s.poster_path, categoria: s.categoria,
        plataformas: platMap[s.id] ?? [], sinopsis: enrMap[s.id]?.sinopsis_chilensis ?? null,
        generos: enrMap[s.id]?.generos ?? [], director: enrMap[s.id]?.director ?? null,
        actores: Array.isArray(enrMap[s.id]?.actores) ? enrMap[s.id].actores.join(', ') : (enrMap[s.id]?.actores ?? null),
      }))
      // Shuffle top movies
      for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]] }
      setMovies(result)
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
        .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, categoria')
        .in('id', ids).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false }).limit(80)

      const pelIds = (pels ?? []).map(p => p.id)
      const { data: enr } = await supabase.from('enriquecimiento')
        .select('pelicula_id, sinopsis_chilensis, generos, director, actores')
        .in('pelicula_id', pelIds)
      const enrMap: Record<string, any> = {}
      ;(enr ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })

      const result = (pels ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles, anio: p.anio,
        nota_imdb: p.nota_imdb, poster_path: p.poster_path, categoria: p.categoria,
        plataformas: platMap[p.id] ?? [], sinopsis: enrMap[p.id]?.sinopsis_chilensis ?? null,
        generos: enrMap[p.id]?.generos ?? [], director: enrMap[p.id]?.director ?? null,
        actores: enrMap[p.id]?.actores ?? null,
      }))
      for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]] }
      setMovies(result)
    }
    setLoading(false)
  }, [user, isSeries])

  useEffect(() => { if (hydrated) loadMovies() }, [loadMovies, hydrated])

  const handleSwipe = useCallback((dir: 'left' | 'right' | 'down' | 'up') => {
    if (guestIncrement()) return
    const top = movies[0]
    if (!top) return

    const table = isSeries ? 'user_series' : 'user_peliculas'
    const idField = isSeries ? 'serie_id' : 'pelicula_id'
    const conflict = isSeries ? 'user_id,serie_id' : 'user_id,pelicula_id'

    if (dir === 'right') {
      markSessionDone(top.id)
      setMovies(prev => prev.slice(1))
      if (user) supabase.from(table).upsert({ user_id: user.id, [idField]: top.id, watchlist: true, visto: false }, { onConflict: conflict }).then(() => {})
    } else if (dir === 'left') {
      snoozeId(top.id)
      setMovies(prev => prev.slice(1))
    } else if (dir === 'up') {
      markSessionDone(top.id)
      setMovies(prev => prev.slice(1))
      if (user) supabase.from(table).upsert({ user_id: user.id, [idField]: top.id, visto: true, watchlist: false }, { onConflict: conflict }).then(() => {})
    } else if (dir === 'down') {
      setMovies(prev => {
        const [first, ...rest] = prev
        const pos = Math.min(5, rest.length)
        const next = [...rest]; next.splice(pos, 0, first); return next
      })
    }
  }, [user, movies, isSeries, guestIncrement])

  if (loading) return (
    <div className="w-full aspect-[3/4] max-w-xs mx-auto rounded-2xl bg-zinc-800 animate-pulse" />
  )

  if (movies.length === 0) return (
    <div className="w-full aspect-[3/4] max-w-xs mx-auto rounded-2xl bg-zinc-900 flex items-center justify-center">
      <p className="text-zinc-500 text-sm text-center px-4">No hay más contenido disponible. Vuelve más tarde.</p>
    </div>
  )

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="relative w-full aspect-[3/4]">
        {movies.slice(0, 3).map((m, i) => (
          <div key={m.id} className="absolute inset-0" style={{ transform: `scale(${1 - i * 0.04}) translateY(${i * 8}px)`, zIndex: 3 - i }}>
            <TinderCard movie={m} isTop={i === 0} onSwipe={handleSwipe} />
            {i === 0 && guestBlocked && <GuestLimitModal />}
          </div>
        ))}
      </div>
      {/* Action buttons */}
      <div className="flex items-center justify-center gap-5 mt-3">
        <button onClick={() => handleSwipe('left')} className="w-12 h-12 rounded-full bg-zinc-900 border-2 border-red-500/50 flex items-center justify-center text-red-400 text-xl cursor-pointer hover:border-red-400 transition-colors">
          ✕
        </button>
        <button onClick={() => handleSwipe('up')} className="w-12 h-12 rounded-full bg-zinc-900 border-2 border-blue-500/50 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" className="text-blue-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button onClick={() => handleSwipe('right')} className="w-12 h-12 rounded-full bg-zinc-900 border-2 border-pink-500/50 flex items-center justify-center text-pink-400 text-xl cursor-pointer hover:border-pink-400 transition-colors">
          ♥
        </button>
      </div>
      <div className="flex justify-center gap-6 mt-1.5 text-[10px] font-medium">
        <span className="text-red-400">Paso</span>
        <span className="text-blue-400">Ya la vi</span>
        <span className="text-pink-400">Watchlist</span>
      </div>
    </div>
  )
}

// ── Descubre Widgets (Reels, Mapa, Comunidad) ──
function DescubreWidgets() {
  return (
    <div>
      <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">Descubre</h2>
      <div className="grid grid-cols-3 gap-2">
        <Link href="/cinereels" className="bg-zinc-900 rounded-xl p-3 flex flex-col items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center">
            <svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="text-white text-xs font-semibold">CineReels</span>
        </Link>
        <Link href="/mapa" className="bg-zinc-900 rounded-xl p-3 flex flex-col items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h4m12 0h4M12 2v4m0 12v4"/></svg>
          </div>
          <span className="text-white text-xs font-semibold">Mapa</span>
        </Link>
        <Link href="/comunidad" className="bg-zinc-900 rounded-xl p-3 flex flex-col items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
            <svg width="20" height="20" fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <span className="text-white text-xs font-semibold">Comunidad</span>
        </Link>
      </div>
    </div>
  )
}

// ── Bottom Nav ──
function BottomNav() {
  const router = useRouter()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* Menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64 bg-zinc-900 border border-zinc-700 rounded-2xl p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <Link href="/reel" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-orange-400">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-white text-sm font-medium">Tinder</span>
            </Link>
            <Link href="/comunidad" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-violet-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="text-white text-sm font-medium">Comunidad</span>
            </Link>
            <Link href="/cinereels" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" className="text-pink-400">
                <path d="M8 5v14l11-7z" fill="currentColor"/>
              </svg>
              <span className="text-white text-sm font-medium">CineReels</span>
            </Link>
            <Link href="/mapa" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-emerald-400">
                <circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/>
              </svg>
              <span className="text-white text-sm font-medium">Mapa</span>
            </Link>
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-8 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-full px-8 py-2.5 shadow-2xl">
          {/* Inicio */}
          <Link href="/inicio_prueba" className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-yellow-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <span className="text-yellow-400 text-[10px] font-semibold">Inicio</span>
          </Link>

          {/* Menú */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            <span className="text-zinc-400 text-[10px] font-semibold">Menú</span>
          </button>

          {/* Perfil */}
          <Link href={user ? '/perfil' : '/login'} className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span className="text-zinc-400 text-[10px] font-semibold">Perfil</span>
          </Link>
        </div>
      </div>
    </>
  )
}

// ── Main Component ──
export default function InicioPrueba({ trending, topRated }: { trending: SimpleMovie[]; topRated: SimpleMovie[] }) {
  const { mode, setMode, hydrated } = useMediaMode()
  const activeMode = hydrated ? mode : 'peliculas'
  const router = useRouter()
  const placeholder = useTypewriter(TYPEWRITER_PHRASES)
  const [searchValue, setSearchValue] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      router.push(`/catalogo?q=${encodeURIComponent(searchValue.trim())}`)
    }
  }

  return (
    <div className="pb-24">
      {/* ── Search bar + toggle ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 relative">
            <input
              type="text"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={searchFocused ? 'Buscar...' : placeholder + '|'}
              className="w-full bg-zinc-900/80 backdrop-blur-md text-white rounded-2xl px-5 py-3 text-[16px] placeholder-zinc-500 border-0 outline-none focus:ring-1 focus:ring-yellow-400/30 transition-all"
            />
            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-yellow-400 transition-colors cursor-pointer">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
          </form>
          {/* Mode toggle */}
          <button
            onClick={() => setMode(activeMode === 'peliculas' ? 'series' : 'peliculas')}
            className="shrink-0 bg-zinc-900/80 backdrop-blur-md rounded-xl px-3 py-2.5 text-xs font-bold border border-zinc-700/50 transition-colors cursor-pointer hover:border-yellow-400/30"
          >
            {activeMode === 'peliculas' ? (
              <span className="text-yellow-400">Pelis</span>
            ) : (
              <span className="text-blue-400">Series</span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 max-w-7xl mx-auto space-y-5">
        {/* ── Mood buttons ── */}
        <div>
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">Mood</h2>
          <div className="grid grid-cols-4 gap-2">
            {MOODS.map(mood => (
              <Link key={mood.id} href={`/catalogo`}
                className={`bg-gradient-to-br ${mood.color} border rounded-xl py-3 flex flex-col items-center gap-1 hover:scale-105 transition-transform cursor-pointer`}
              >
                <span className="text-xl">{mood.icon}</span>
                <span className="text-white text-[10px] font-semibold">{mood.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Platforms ── */}
        <div>
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">Plataformas</h2>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {Object.entries(PLAT_LOGOS).map(([key, logo]) => (
              <div key={key} className="shrink-0 h-10 w-16 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer transition-colors">
                <img src={logo} alt={key} className="h-4 w-auto object-contain" />
              </div>
            ))}
          </div>
        </div>

        {/* ── Embedded Tinder ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-orange-400">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Tinder
            </h2>
            <Link href="/reel" className="text-zinc-500 text-xs hover:text-yellow-400 transition-colors">Pantalla completa →</Link>
          </div>
          <EmbeddedTinder />
        </div>

        {/* ── Trending ── */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Trending</h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {trending.map((m, i) => (
              <Link key={m.id} href={`/pelicula/${m.id}`} className="shrink-0 w-32 group cursor-pointer">
                <div className="relative w-32 h-48 rounded-xl overflow-hidden bg-zinc-800 mb-1.5 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                  {m.poster_path && (
                    <Image src={`https://image.tmdb.org/t/p/w342${m.poster_path}`} alt={m.titulo} fill className="object-cover" sizes="128px" />
                  )}
                  <div className="absolute top-0 left-0 bg-zinc-950/80 rounded-br-lg px-2 py-1">
                    <span className="text-white font-black text-lg leading-none">{i + 1}</span>
                  </div>
                  {m.plataformas.length > 0 && (
                    <div className="absolute bottom-1 left-1 flex gap-0.5">
                      {m.plataformas.slice(0, 2).map(p => (
                        PLAT_LOGOS[p] && <div key={p} className="bg-white rounded px-0.5 py-0.5" style={{ height: 14 }}>
                          <img src={PLAT_LOGOS[p]} alt={p} className="h-2.5 w-auto object-contain" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{m.titulo_ingles || m.titulo}</p>
                {m.nota_imdb && <p className="text-yellow-400 text-[10px] font-bold flex items-center gap-0.5"><svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>{m.nota_imdb}</p>}
              </Link>
            ))}
          </div>
        </div>

        {/* ── Descubre ── */}
        <DescubreWidgets />

        {/* ── Top Rated ── */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Mejor evaluadas</h2>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {topRated.map(m => (
              <Link key={m.id} href={`/pelicula/${m.id}`} className="shrink-0 w-28 group cursor-pointer">
                <div className="relative w-28 h-40 rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                  {m.poster_path && (
                    <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo} fill className="object-cover" sizes="112px" />
                  )}
                  {m.nota_imdb && (
                    <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 flex items-center gap-0.5">
                      <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                      {m.nota_imdb}
                    </div>
                  )}
                </div>
                <p className="text-white text-[10px] font-semibold leading-snug line-clamp-2">{m.titulo_ingles || m.titulo}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Nav ── */}
      <BottomNav />
    </div>
  )
}
