'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Pelicula = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  oscars: string | null
  poster_path: string | null
  categoria: string | null
  plataformas: string[]
  sinopsis: string | null
  generos: string[]
}

type MiniReview = {
  id: string
  username: string
  avatar_url: string | null
  rating: number | null
  review_text: string
  created_at: string
}

type Seguido = {
  user_id: string
  username: string
  avatar_url: string | null
}

const PLATFORM_LOGOS: Record<string, string> = {
  netflix: '/netflix.png',
  disney_plus: '/disney_plus.svg',
  hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png',
  apple_tv: '/apple_tv.png',
  paramount_plus: '/paramount_plus.svg',
}

const SWIPE_THRESHOLD = 80
const TAP_THRESHOLD = 8
const SNOOZE_KEY = 'reel_snoozed' // localStorage: { [id]: timestamp }
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

// Snooze en localStorage (persiste entre sesiones, expira en 30 días)
function getSnoozed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    const all: Record<string, number> = raw ? JSON.parse(raw) : {}
    // Limpiar expirados
    const now = Date.now()
    const vigentes = Object.fromEntries(Object.entries(all).filter(([, ts]) => now - ts < SNOOZE_MS))
    return vigentes
  } catch { return {} }
}
function snoozeId(id: string) {
  try {
    const snoozed = getSnoozed()
    snoozed[id] = Date.now()
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed))
  } catch {}
}
function isSnoozed(id: string): boolean {
  const snoozed = getSnoozed()
  return !!snoozed[id]
}

// Watchlist/vista en sesión (para no reaparecer en la sesión actual tras swipe derecha)
const SESSION_KEY = 'reel_session_done'
function getSessionDone(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]')) } catch { return new Set() }
}
function markSessionDone(id: string) {
  try {
    const set = getSessionDone(); set.add(id)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]))
  } catch {}
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// Onboarding overlay
function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const pasos = [
    { emoji: '👉', color: 'text-emerald-400', label: 'Guardar en watchlist' },
    { emoji: '👈', color: 'text-red-400', label: 'No me importa' },
    { emoji: '👇', color: 'text-zinc-300', label: 'Ver otra' },
  ]
  useEffect(() => {
    if (step >= pasos.length) { onDone(); return }
    const t = setTimeout(() => setStep(s => s + 1), 1200)
    return () => clearTimeout(t)
  }, [step])
  if (step >= pasos.length) return null
  const p = pasos[step]
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl cursor-pointer"
      onClick={() => { setStep(pasos.length); onDone() }}
    >
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <span className="text-6xl">{p.emoji}</span>
        <span className={`text-lg font-semibold ${p.color}`}>{p.label}</span>
      </div>
      <p className="text-zinc-500 text-xs mt-8">Toca para saltar</p>
    </div>
  )
}

// Card individual
function ReelCard({
  pelicula, onSwipe, isTop, onVista, onWatchlist, currentUserId,
}: {
  pelicula: Pelicula
  onSwipe: (dir: 'left' | 'right' | 'down') => void
  isTop: boolean
  onVista: () => void
  onWatchlist: () => void
  currentUserId: string | undefined
}) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState<'left' | 'right' | 'down' | null>(null)

  // Overlays
  const [showInfo, setShowInfo] = useState(false)
  const [showReviews, setShowReviews] = useState(false)
  const [showRecomendar, setShowRecomendar] = useState(false)

  // Data
  const [seguidosCount, setSeguidosCount] = useState<number | null>(null)
  const [reviews, setReviews] = useState<MiniReview[]>([])
  const [reviewsCargando, setReviewsCargando] = useState(false)
  const [seguidosList, setSeguidosList] = useState<Seguido[]>([])
  const [seguidosCargando, setSeguidosCargando] = useState(false)
  const [recomendadoA, setRecomendadoA] = useState<Set<string>>(new Set())
  const [pendingRec, setPendingRec] = useState<Seguido | null>(null)
  const [mensajeRec, setMensajeRec] = useState('')

  // Button feedback
  const [vistaOk, setVistaOk] = useState(false)
  const [watchlistOk, setWatchlistOk] = useState(false)

  const titulo = pelicula.titulo_ingles || pelicula.titulo

  // Cargar contador de seguidos cuando es la carta top
  useEffect(() => {
    if (!isTop || !currentUserId || seguidosCount !== null) return
    ;(async () => {
      const { data: follows } = await supabase
        .from('follows').select('following_id').eq('follower_id', currentUserId)
      if (!follows || follows.length === 0) { setSeguidosCount(0); return }
      const ids = follows.map((f: any) => f.following_id)
      const { count } = await supabase
        .from('user_peliculas')
        .select('*', { count: 'exact', head: true })
        .eq('pelicula_id', pelicula.id).eq('visto', true).in('user_id', ids)
      setSeguidosCount(count ?? 0)
    })()
  }, [isTop, currentUserId, pelicula.id, seguidosCount])

  // Cargar reviews cuando se abre el overlay
  useEffect(() => {
    if (!showReviews || reviews.length > 0) return
    setReviewsCargando(true)
    ;(async () => {
      const { data: rawReviews } = await supabase
        .from('user_reviews')
        .select('id, review_text, created_at, user_id, rating')
        .eq('pelicula_id', pelicula.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (!rawReviews || rawReviews.length === 0) { setReviewsCargando(false); return }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', rawReviews.map((r: any) => r.user_id))
      const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
      ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = p })
      setReviews(rawReviews
        .filter((r: any) => profileMap[r.user_id])
        .map((r: any) => ({
          id: r.id,
          username: profileMap[r.user_id].username,
          avatar_url: profileMap[r.user_id].avatar_url,
          rating: r.rating,
          review_text: r.review_text,
          created_at: r.created_at,
        }))
      )
      setReviewsCargando(false)
    })()
  }, [showReviews, pelicula.id, reviews.length])

  // Cargar lista de seguidos cuando se abre recomendar
  useEffect(() => {
    if (!showRecomendar || seguidosList.length > 0 || !currentUserId) return
    setSeguidosCargando(true)
    ;(async () => {
      const { data: follows } = await supabase
        .from('follows').select('following_id').eq('follower_id', currentUserId)
      if (!follows || follows.length === 0) { setSeguidosCargando(false); return }
      const ids = follows.map((f: any) => f.following_id)
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, username, avatar_url').in('user_id', ids)
      setSeguidosList((profiles ?? []).map((p: any) => ({
        user_id: p.user_id, username: p.username, avatar_url: p.avatar_url,
      })))
      setSeguidosCargando(false)
    })()
  }, [showRecomendar, currentUserId, seguidosList.length])

  const recomendar = async (seguido: Seguido, mensaje: string) => {
    if (!currentUserId || recomendadoA.has(seguido.user_id)) return
    await supabase.from('notifications').insert({
      user_id: seguido.user_id,
      type: 'recomendacion',
      from_user_id: currentUserId,
      meta: {
        pelicula_id: pelicula.id,
        pelicula_titulo: pelicula.titulo_ingles || pelicula.titulo,
        mensaje: mensaje.trim() || null,
        redirect_url: `/pelicula/${pelicula.id}`,
      },
    })
    setRecomendadoA(prev => new Set([...prev, seguido.user_id]))
    setPendingRec(null)
    setMensajeRec('')
  }

  // Touch handlers
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
  const handleTouchEnd = () => {
    if (!isTop) return
    setDragging(false)
    const { x, y } = offset
    const dist = Math.sqrt(x * x + y * y)
    if (dist < TAP_THRESHOLD) {
      setOffset({ x: 0, y: 0 })
      if (!showInfo && !showReviews && !showRecomendar) setShowInfo(true)
      return
    }
    if (Math.abs(x) > SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y)) {
      const dir = x > 0 ? 'right' : 'left'
      setGone(dir); setTimeout(() => onSwipe(dir), 300); return
    }
    if (y > SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
      setGone('down'); setTimeout(() => onSwipe('down'), 300); return
    }
    setOffset({ x: 0, y: 0 })
  }

  const closeAll = (e: React.TouchEvent) => {
    e.stopPropagation()
    setShowInfo(false); setShowReviews(false); setShowRecomendar(false); setPendingRec(null); setMensajeRec('')
  }

  const rotation = offset.x / 20
  const opacity = gone ? 0 : 1
  const translateX = gone === 'left' ? -400 : gone === 'right' ? 400 : offset.x
  const translateY = gone === 'down' ? 400 : offset.y
  const anyOverlay = showInfo || showReviews || showRecomendar
  const swipeIndicator = !anyOverlay && (offset.x > 40 ? 'right' : offset.x < -40 ? 'left' : offset.y > 40 ? 'down' : null)

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
      {/* Poster */}
      {pelicula.poster_path ? (
        <Image src={`https://image.tmdb.org/t/p/w500${pelicula.poster_path}`} alt={titulo} fill className="object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><span className="text-5xl">🎬</span></div>
      )}

      {/* Gradients */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 35%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%)' }} />

      {/* Platform logos — top left, más grandes */}
      {pelicula.plataformas.length > 0 && (
        <div className="absolute top-3 left-3 flex gap-2">
          {pelicula.plataformas.map(p => {
            const logo = PLATFORM_LOGOS[p]
            return logo ? (
              <div key={p} className="w-11 h-11 rounded-xl overflow-hidden bg-black/50 backdrop-blur-sm flex items-center justify-center p-1.5">
                <img src={logo} alt={p} className="w-full h-full object-contain" />
              </div>
            ) : null
          })}
        </div>
      )}

      {/* Categoria — top right, más grande */}
      {pelicula.categoria && (
        <div className="absolute top-3 right-3 max-w-[55%]">
          <span className="bg-black/60 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl leading-tight block text-right">
            {pelicula.categoria}
          </span>
        </div>
      )}

      {/* Swipe indicators */}
      {swipeIndicator === 'right' && (
        <div className="absolute top-8 left-6 border-4 border-emerald-400 rounded-xl px-4 py-2 rotate-[-20deg]">
          <span className="text-emerald-400 font-black text-2xl tracking-wider">WATCHLIST</span>
        </div>
      )}
      {swipeIndicator === 'left' && (
        <div className="absolute top-8 right-6 border-4 border-red-400 rounded-xl px-4 py-2 rotate-[20deg]">
          <span className="text-red-400 font-black text-2xl tracking-wider">PASO</span>
        </div>
      )}
      {swipeIndicator === 'down' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-zinc-300 rounded-xl px-4 py-2">
          <span className="text-zinc-300 font-black text-2xl tracking-wider">SIGUIENTE</span>
        </div>
      )}

      {/* Info normal */}
      {!anyOverlay && (
        <>
          {pelicula.sinopsis && (
            <div className="absolute left-4 right-16 bottom-[165px]">
              <p className="text-white/80 text-[11px] italic leading-snug line-clamp-2">{pelicula.sinopsis}</p>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-16 p-4">
            <h2 className="text-white font-bold text-lg leading-tight mb-0.5">{titulo}</h2>
            {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
              <p className="text-zinc-400 text-xs mb-1">{pelicula.titulo}</p>
            )}
            <div className="flex items-center gap-2 mb-2">
              {pelicula.anio && <span className="text-zinc-400 text-xs">{pelicula.anio}</span>}
              {pelicula.nota_imdb && <span className="text-yellow-400 text-xs font-medium">⭐ {pelicula.nota_imdb}</span>}
              {pelicula.oscars && pelicula.oscars !== 'N/A' && <span className="text-amber-300 text-[10px]">🏆 {pelicula.oscars}</span>}
            </div>
            {pelicula.generos.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {pelicula.generos.slice(0, 3).map(g => (
                  <span key={g} className="bg-white/10 text-zinc-300 text-[9px] px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── OVERLAY: INFO ── */}
      {showInfo && (
        <div className="absolute inset-0 flex flex-col justify-end" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0.3) 100%)' }} onTouchEnd={closeAll}>
          <div className="p-5 pb-6" onTouchEnd={e => e.stopPropagation()}>
            <p className="text-zinc-600 text-[10px] text-center mb-4">Toca para cerrar</p>
            <h2 className="text-white font-bold text-xl leading-tight mb-1">{titulo}</h2>
            {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
              <p className="text-zinc-400 text-sm mb-2">{pelicula.titulo}</p>
            )}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {pelicula.anio && <span className="text-zinc-400 text-sm">{pelicula.anio}</span>}
              {pelicula.nota_imdb && <span className="text-yellow-400 text-sm font-medium">⭐ {pelicula.nota_imdb}</span>}
              {pelicula.oscars && pelicula.oscars !== 'N/A' && <span className="text-amber-300 text-xs">🏆 {pelicula.oscars}</span>}
            </div>
            {pelicula.generos.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-3">
                {pelicula.generos.map(g => (
                  <span key={g} className="bg-white/10 text-zinc-300 text-[10px] px-2.5 py-1 rounded-full">{g}</span>
                ))}
              </div>
            )}
            {pelicula.sinopsis && (
              <p className="text-zinc-300 text-sm italic leading-relaxed mb-4">{pelicula.sinopsis}</p>
            )}
            {pelicula.categoria && <p className="text-zinc-500 text-xs mb-4">{pelicula.categoria}</p>}
            <Link href={`/pelicula/${pelicula.id}`} className="flex items-center gap-2 text-zinc-400 text-sm" onClick={e => e.stopPropagation()}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ver ficha completa
            </Link>
          </div>
        </div>
      )}

      {/* ── OVERLAY: REVIEWS ── */}
      {showReviews && (
        <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }} onTouchEnd={closeAll}>
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <p className="text-white font-semibold text-sm">Reseñas</p>
            <button onTouchEnd={e => { e.stopPropagation(); setShowReviews(false) }} className="text-zinc-500 text-xs">Cerrar</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4" onTouchEnd={e => e.stopPropagation()}>
            {reviewsCargando && <p className="text-zinc-500 text-xs text-center pt-4">Cargando...</p>}
            {!reviewsCargando && reviews.length === 0 && (
              <p className="text-zinc-500 text-xs text-center pt-4">Sin reseñas aún.</p>
            )}
            {reviews.map(r => (
              <div key={r.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 overflow-hidden">
                  {r.avatar_url ? <img src={r.avatar_url} alt={r.username} className="w-full h-full object-cover" /> : r.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-xs font-medium">@{r.username}</span>
                    {r.rating && <span className="text-yellow-400 text-[10px]">{r.rating}/10</span>}
                    <span className="text-zinc-600 text-[10px]">{tiempoRelativo(r.created_at)}</span>
                  </div>
                  <p className="text-zinc-300 text-xs leading-snug">{r.review_text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-5" onTouchEnd={e => e.stopPropagation()}>
            <Link href={`/pelicula/${pelicula.id}#reviews`} className="block text-center text-zinc-500 text-xs">
              Ver todas en la ficha →
            </Link>
          </div>
        </div>
      )}

      {/* ── OVERLAY: RECOMENDAR ── */}
      {showRecomendar && (
        <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }} onTouchEnd={closeAll}>
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            {pendingRec ? (
              <button
                onTouchEnd={e => { e.stopPropagation(); setPendingRec(null); setMensajeRec('') }}
                className="text-zinc-400 text-xs flex items-center gap-1"
              >
                ← @{pendingRec.username}
              </button>
            ) : (
              <p className="text-white font-semibold text-sm">Recomendar a...</p>
            )}
            <button onTouchEnd={e => { e.stopPropagation(); setShowRecomendar(false); setPendingRec(null); setMensajeRec('') }} className="text-zinc-500 text-xs">Cerrar</button>
          </div>

          {pendingRec ? (
            /* Step 2: mensaje */
            <div className="flex-1 flex flex-col px-4 pb-4 gap-3" onTouchEnd={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 bg-zinc-800/60 rounded-xl px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 overflow-hidden">
                  {pendingRec.avatar_url ? <img src={pendingRec.avatar_url} alt={pendingRec.username} className="w-full h-full object-cover" /> : pendingRec.username[0]?.toUpperCase()}
                </div>
                <span className="text-white text-sm">@{pendingRec.username}</span>
              </div>
              <textarea
                value={mensajeRec}
                onChange={e => setMensajeRec(e.target.value)}
                placeholder="¿Qué le querés decir? (opcional)"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              />
              <button
                onTouchEnd={e => { e.stopPropagation(); recomendar(pendingRec, mensajeRec) }}
                className="w-full bg-yellow-400 text-zinc-950 font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Enviar
              </button>
            </div>
          ) : (
            /* Step 1: lista de seguidos */
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2" onTouchEnd={e => e.stopPropagation()}>
              {seguidosCargando && <p className="text-zinc-500 text-xs text-center pt-4">Cargando...</p>}
              {!seguidosCargando && seguidosList.length === 0 && (
                <p className="text-zinc-500 text-xs text-center pt-4">No seguís a nadie todavía.</p>
              )}
              {seguidosList.map(s => {
                const enviado = recomendadoA.has(s.user_id)
                return (
                  <button
                    key={s.user_id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${enviado ? 'border-emerald-700 bg-emerald-950/40' : 'border-zinc-800 bg-zinc-900/60 active:bg-zinc-800'}`}
                    onTouchEnd={e => { e.stopPropagation(); if (!enviado) setPendingRec(s) }}
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 overflow-hidden">
                      {s.avatar_url ? <img src={s.avatar_url} alt={s.username} className="w-full h-full object-cover" /> : s.username[0]?.toUpperCase()}
                    </div>
                    <span className="text-white text-sm flex-1 text-left">@{s.username}</span>
                    {enviado ? (
                      <span className="text-emerald-400 text-xs">Enviado ✓</span>
                    ) : (
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Botones derecha ── */}
      <div className="absolute right-3 bottom-4 flex flex-col gap-2.5">
        {/* Watchlist */}
        <button
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${watchlistOk ? 'bg-emerald-600 border-emerald-500' : 'bg-black/50 backdrop-blur-sm border-white/15'} text-white`}
          onTouchEnd={e => { e.stopPropagation(); setWatchlistOk(true); onWatchlist() }}
        >
          <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        {/* Vista */}
        <button
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${vistaOk ? 'bg-blue-600 border-blue-500' : 'bg-black/50 backdrop-blur-sm border-white/15'} text-white`}
          onTouchEnd={e => { e.stopPropagation(); setVistaOk(true); onVista() }}
        >
          <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        {/* Reviews (lupa) */}
        <button
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${showReviews ? 'bg-zinc-600 border-zinc-400' : 'bg-black/50 backdrop-blur-sm border-white/15'} text-white`}
          onTouchEnd={e => { e.stopPropagation(); setShowReviews(v => !v); setShowInfo(false); setShowRecomendar(false) }}
        >
          <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeLinecap="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        {/* Seguidos que vieron */}
        <button
          className="w-11 h-11 rounded-full flex flex-col items-center justify-center border bg-black/50 backdrop-blur-sm border-white/15 text-white relative"
          onTouchEnd={e => { e.stopPropagation(); setShowInfo(true); setShowReviews(false); setShowRecomendar(false) }}
        >
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {seguidosCount !== null && seguidosCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {seguidosCount > 9 ? '9+' : seguidosCount}
            </span>
          )}
        </button>
        {/* Recomendar (avión) */}
        <button
          className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${showRecomendar ? 'bg-zinc-600 border-zinc-400' : 'bg-black/50 backdrop-blur-sm border-white/15'} text-white`}
          onTouchEnd={e => { e.stopPropagation(); setShowRecomendar(v => !v); setShowInfo(false); setShowReviews(false); setPendingRec(null); setMensajeRec('') }}
        >
          <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function ReelPage() {
  const { user } = useAuth()
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [cargando, setCargando] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

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
    const platMap: Record<string, string[]> = {}
    ;(cats ?? []).forEach((c: any) => {
      if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
      platMap[c.pelicula_id].push(c.plataforma)
    })
    const ids = Object.keys(platMap).filter(id => !excluidos.has(id))
    if (ids.length === 0) { setCargando(false); return }

    const CHUNK = 100
    const todas: Pelicula[] = []
    for (let i = 0; i < Math.min(ids.length, 300); i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { data: pels } = await supabase
        .from('peliculas').select('id, titulo, titulo_ingles, anio, nota_imdb, oscars, poster_path, categoria')
        .in('id', chunk).not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false })
      ;(pels ?? []).forEach((p: any) => {
        todas.push({ ...p, plataformas: platMap[p.id] ?? [], sinopsis: null, generos: [] })
      })
    }

    const todosIds = todas.map(p => p.id)
    const enrMap: Record<string, { sinopsis: string | null; generos: string[] }> = {}
    for (let i = 0; i < todosIds.length; i += CHUNK) {
      const chunk = todosIds.slice(i, i + CHUNK)
      const { data: enr } = await supabase
        .from('enriquecimiento').select('pelicula_id, sinopsis_chilensis, generos').in('pelicula_id', chunk)
      ;(enr ?? []).forEach((e: any) => {
        enrMap[e.pelicula_id] = { sinopsis: e.sinopsis_chilensis, generos: e.generos ?? [] }
      })
    }

    const final = todas.map(p => ({
      ...p, sinopsis: enrMap[p.id]?.sinopsis ?? null, generos: enrMap[p.id]?.generos ?? [],
    }))
    final.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
    setPeliculas(final)
    setCargando(false)
  }, [user])

  useEffect(() => { cargarPeliculas() }, [cargarPeliculas])

  const handleSwipe = useCallback((dir: 'left' | 'right' | 'down') => {
    setPeliculas(prev => {
      if (prev.length === 0) return prev
      const [top, ...rest] = prev
      if (dir === 'right') {
        markSessionDone(top.id)
        if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: top.id, watchlist: true }, { onConflict: 'user_id,pelicula_id' }).then(() => {})
        return rest
      }
      if (dir === 'left') {
        snoozeId(top.id) // persiste 30 días en localStorage
        return rest      // desaparece del feed actual también
      }
      if (dir === 'down') {
        const pos = Math.min(5, rest.length); const next = [...rest]; next.splice(pos, 0, top); return next
      }
      return rest
    })
  }, [user])

  const handleVista = useCallback((pelicula: Pelicula) => {
    markSessionDone(pelicula.id)
    if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: pelicula.id, visto: true }, { onConflict: 'user_id,pelicula_id' }).then(() => {})
    setPeliculas(prev => prev.filter(p => p.id !== pelicula.id))
  }, [user])

  const handleWatchlist = useCallback((pelicula: Pelicula) => {
    markSessionDone(pelicula.id)
    if (user) supabase.from('user_peliculas').upsert({ user_id: user.id, pelicula_id: pelicula.id, watchlist: true }, { onConflict: 'user_id,pelicula_id' }).then(() => {})
    setPeliculas(prev => prev.filter(p => p.id !== pelicula.id))
  }, [user])

  const onboardingDone = () => {
    localStorage.setItem('reel_onboarding', '1')
    setShowOnboarding(false)
  }

  if (cargando) return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <Nav active="reel" />
      <div className="flex-1 flex items-center justify-center"><p className="text-zinc-500 text-sm">Cargando películas...</p></div>
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
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <div className="relative w-full max-w-sm" style={{ height: '72vh' }}>
          {peliculas.slice(0, 3).map((p, i) => (
            <div key={p.id} className="absolute inset-0" style={{ transform: `scale(${1 - i * 0.04}) translateY(${i * 10}px)`, zIndex: 3 - i }}>
              <ReelCard
                pelicula={p} onSwipe={handleSwipe} isTop={i === 0}
                onVista={() => handleVista(p)} onWatchlist={() => handleWatchlist(p)}
                currentUserId={user?.id}
              />
              {i === 0 && showOnboarding && <OnboardingOverlay onDone={onboardingDone} />}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-8 mt-4">
          <button onClick={() => handleSwipe('left')} className="w-14 h-14 rounded-full bg-zinc-800 border border-red-500/50 flex items-center justify-center text-2xl hover:bg-red-950/40 transition-colors">✕</button>
          <button onClick={() => handleSwipe('down')} className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-lg hover:bg-zinc-700 transition-colors">↓</button>
          <button onClick={() => handleSwipe('right')} className="w-14 h-14 rounded-full bg-zinc-800 border border-emerald-500/50 flex items-center justify-center text-2xl hover:bg-emerald-950/40 transition-colors">♥</button>
        </div>
        <p className="text-zinc-600 text-xs mt-3">{peliculas.length} películas disponibles</p>
      </div>
    </main>
  )
}
