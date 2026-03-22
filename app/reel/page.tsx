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
}

const PLATAFORMAS: Record<string, string> = {
  netflix: 'Netflix',
  disney_plus: 'Disney+',
  hbo_max: 'HBO Max',
  amazon_prime: 'Prime',
  apple_tv: 'Apple TV+',
  paramount_plus: 'Paramount+',
}

const SWIPE_THRESHOLD = 80

// Onboarding overlay
function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)

  const pasos = [
    { dir: 'right', emoji: '👉', color: 'text-emerald-400', label: 'Guardar en watchlist' },
    { dir: 'left',  emoji: '👈', color: 'text-red-400',     label: 'No me importa' },
    { dir: 'down',  emoji: '👇', color: 'text-zinc-300',    label: 'Ver otra' },
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
  pelicula,
  onSwipe,
  isTop,
}: {
  pelicula: Pelicula
  onSwipe: (dir: 'left' | 'right' | 'down') => void
  isTop: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState<'left' | 'right' | 'down' | null>(null)

  const titulo = pelicula.titulo_ingles || pelicula.titulo

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
    setOffset({ x: dx, y: dy })
  }

  const handleTouchEnd = () => {
    if (!isTop) return
    setDragging(false)
    const { x, y } = offset
    if (Math.abs(x) > SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y)) {
      const dir = x > 0 ? 'right' : 'left'
      setGone(dir)
      setTimeout(() => onSwipe(dir), 300)
    } else if (y > SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
      setGone('down')
      setTimeout(() => onSwipe('down'), 300)
    } else {
      setOffset({ x: 0, y: 0 })
    }
  }

  const rotation = offset.x / 20
  const opacity = gone ? 0 : 1
  const translateX = gone === 'left' ? -400 : gone === 'right' ? 400 : offset.x
  const translateY = gone === 'down' ? 400 : offset.y

  const swipeIndicator = offset.x > 40 ? 'right' : offset.x < -40 ? 'left' : offset.y > 40 ? 'down' : null

  return (
    <div
      ref={cardRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`,
        transition: dragging ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        opacity,
        touchAction: 'none',
      }}
      className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl select-none"
    >
      {/* Poster */}
      {pelicula.poster_path ? (
        <Image
          src={`https://image.tmdb.org/t/p/w500${pelicula.poster_path}`}
          alt={titulo}
          fill
          className="object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
          <span className="text-5xl">🎬</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

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

      {/* Info panel inferior */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h2 className="text-white font-bold text-xl leading-tight mb-1">{titulo}</h2>
        {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
          <p className="text-zinc-400 text-sm mb-1">{pelicula.titulo}</p>
        )}
        <div className="flex items-center gap-3 mb-3">
          {pelicula.anio && <span className="text-zinc-400 text-sm">{pelicula.anio}</span>}
          {pelicula.nota_imdb && (
            <span className="text-yellow-400 text-sm font-medium">⭐ {pelicula.nota_imdb}</span>
          )}
          {pelicula.oscars && pelicula.oscars !== 'N/A' && (
            <span className="text-amber-300 text-xs">🏆 {pelicula.oscars}</span>
          )}
        </div>
        {pelicula.plataformas.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {pelicula.plataformas.map(p => (
              <span key={p} className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full">
                {PLATAFORMAS[p] || p}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Botones acción laterales */}
      <div className="absolute right-3 bottom-32 flex flex-col gap-4">
        <Link
          href={`/pelicula/${pelicula.id}`}
          className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
          onClick={e => e.stopPropagation()}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

export default function ReelPage() {
  const { user } = useAuth()
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [cargando, setCargando] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const penalizadas = useRef<Map<string, number>>(new Map()) // id → penalización (cuántos puestos al fondo)

  useEffect(() => {
    const visto = localStorage.getItem('reel_onboarding')
    if (!visto) setShowOnboarding(true)
  }, [])

  const cargarPeliculas = useCallback(async () => {
    setCargando(true)

    // IDs excluidos (vistas + watchlist del usuario)
    let excluidos = new Set<string>()
    if (user) {
      const { data } = await supabase
        .from('user_peliculas')
        .select('pelicula_id')
        .eq('user_id', user.id)
        .or('visto.eq.true,watchlist.eq.true')
      ;(data ?? []).forEach((r: any) => excluidos.add(r.pelicula_id))
    }

    // Traer películas del catálogo activo ordenadas por nota_imdb
    const { data: cats } = await supabase
      .from('catalogos')
      .select('pelicula_id, plataforma')
      .eq('activo', true)

    // Agrupar plataformas por pelicula_id
    const platMap: Record<string, string[]> = {}
    ;(cats ?? []).forEach((c: any) => {
      if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
      platMap[c.pelicula_id].push(c.plataforma)
    })

    const ids = Object.keys(platMap).filter(id => !excluidos.has(id))
    if (ids.length === 0) { setCargando(false); return }

    // Traer info de películas en chunks
    const CHUNK = 100
    const todas: Pelicula[] = []
    for (let i = 0; i < Math.min(ids.length, 300); i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const { data: pels } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, anio, nota_imdb, oscars, poster_path, categoria')
        .in('id', chunk)
        .not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false, nullsFirst: false })
      ;(pels ?? []).forEach((p: any) => {
        todas.push({ ...p, plataformas: platMap[p.id] ?? [] })
      })
    }

    // Ordenar por nota
    todas.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
    setPeliculas(todas)
    setCargando(false)
  }, [user])

  useEffect(() => { cargarPeliculas() }, [cargarPeliculas])

  const handleSwipe = useCallback((dir: 'left' | 'right' | 'down') => {
    setPeliculas(prev => {
      if (prev.length === 0) return prev
      const [top, ...rest] = prev

      if (dir === 'right') {
        // Guardar en watchlist
        if (user) {
          supabase.from('user_peliculas').upsert(
            { user_id: user.id, pelicula_id: top.id, watchlist: true },
            { onConflict: 'user_id,pelicula_id' }
          ).then(() => {})
        }
        return rest
      }

      if (dir === 'left') {
        // Penalizar más — manda al fondo (posición máxima)
        return [...rest, top]
      }

      if (dir === 'down') {
        // Penalizar menos — manda 5 posiciones al fondo
        const pos = Math.min(5, rest.length)
        const next = [...rest]
        next.splice(pos, 0, top)
        return next
      }

      return rest
    })
  }, [user])

  const onboardingDone = () => {
    localStorage.setItem('reel_onboarding', '1')
    setShowOnboarding(false)
  }

  if (cargando) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <Nav active="reel" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">Cargando películas...</p>
        </div>
      </main>
    )
  }

  if (peliculas.length === 0) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <Nav active="reel" />
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-zinc-500 text-sm text-center">No hay películas disponibles por ahora.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <Nav active="reel" />

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        {/* Stack de cartas */}
        <div className="relative w-full max-w-sm" style={{ height: '72vh' }}>
          {/* Mostrar solo las 3 primeras (apiladas) */}
          {peliculas.slice(0, 3).map((p, i) => (
            <div
              key={p.id}
              className="absolute inset-0"
              style={{
                transform: `scale(${1 - i * 0.04}) translateY(${i * 10}px)`,
                zIndex: 3 - i,
              }}
            >
              <ReelCard
                pelicula={p}
                onSwipe={handleSwipe}
                isTop={i === 0}
              />
              {i === 0 && showOnboarding && (
                <OnboardingOverlay onDone={onboardingDone} />
              )}
            </div>
          ))}
        </div>

        {/* Botones de acción (para quien no quiera swipe) */}
        <div className="flex items-center gap-8 mt-4">
          <button
            onClick={() => handleSwipe('left')}
            className="w-14 h-14 rounded-full bg-zinc-800 border border-red-500/50 flex items-center justify-center text-2xl hover:bg-red-950/40 transition-colors"
          >
            ✕
          </button>
          <button
            onClick={() => handleSwipe('down')}
            className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-lg hover:bg-zinc-700 transition-colors"
          >
            ↓
          </button>
          <button
            onClick={() => handleSwipe('right')}
            className="w-14 h-14 rounded-full bg-zinc-800 border border-emerald-500/50 flex items-center justify-center text-2xl hover:bg-emerald-950/40 transition-colors"
          >
            ♥
          </button>
        </div>

        <p className="text-zinc-600 text-xs mt-3">{peliculas.length} películas disponibles</p>
      </div>
    </main>
  )
}
