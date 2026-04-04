'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type WidgetMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
  nota_imdb: number | null
  anio: number | null
  youtube_trailer_key: string | null
  plataformas: string[]
  director: string | null
}

const PLAT_LOGOS: Record<string, string> = {
  netflix: '/netflix.png', disney_plus: '/disney_plus.svg', hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png', apple_tv: '/apple_tv.png', paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png', crunchyroll: '/crunchyroll.png',
}

// ── Reels Widget with autoplay trailer ──
function ReelsWidget({ movie }: { movie: WidgetMovie | null }) {
  if (!movie?.youtube_trailer_key) return null

  return (
    <Link href="/cinereels" className="shrink-0 w-56 bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-white text-sm font-bold">CineReels</span>
        <img src="/cinereels-icon.png" alt="" className="w-4 h-4 object-contain opacity-50" />
      </div>
      <div className="relative h-48 bg-black overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${movie.youtube_trailer_key}?autoplay=1&mute=1&loop=1&playlist=${movie.youtube_trailer_key}&controls=0&showinfo=0&modestbranding=1&playsinline=1&rel=0`}
          className="absolute inset-0 w-full h-full pointer-events-none"
          allow="autoplay; encrypted-media"
          style={{ border: 0 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent pointer-events-none" />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round"/></svg>
          </div>
          <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="absolute bottom-2 left-3 right-10 pointer-events-none">
          <p className="text-white text-xs font-bold leading-tight">{movie.titulo_ingles || movie.titulo}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {movie.nota_imdb && <span className="text-yellow-400 text-[10px] font-bold">⭐ {movie.nota_imdb}</span>}
            {movie.director && <span className="text-zinc-400 text-[10px]">Dir. {movie.director.split(',')[0]}</span>}
          </div>
          {movie.plataformas.length > 0 && (
            <div className="flex gap-1 mt-1">
              {movie.plataformas.slice(0, 3).map(p => (
                PLAT_LOGOS[p] ? <div key={p} className="bg-white rounded px-0.5 py-0.5" style={{ height: 14 }}><img src={PLAT_LOGOS[p]} alt={p} className="h-2.5 w-auto object-contain" /></div> : null
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Mapa Widget with real movie preview ──
function MapaWidget({ movie }: { movie: WidgetMovie | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [graphData, setGraphData] = useState<any>(null)

  useEffect(() => {
    fetch('/movie-graph.json').then(r => r.json()).then(setGraphData).catch(() => {})
  }, [])

  useEffect(() => {
    if (!canvasRef.current || !graphData || !movie) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const nodeMap = new Map(graphData.nodes.map((n: any) => [n.id, n]))
    const selectedNode = nodeMap.get(movie.id) as any
    if (!selectedNode) return

    const connectedIds = new Set<string>()
    graphData.edges.forEach((e: any) => {
      if (e.source === movie.id) connectedIds.add(e.target)
      if (e.target === movie.id) connectedIds.add(e.source)
    })

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    ctx.globalAlpha = 0.1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.3
    const sampleEdges = graphData.edges.slice(0, 200)
    for (const e of sampleEdges) {
      const s = nodeMap.get(e.source) as any
      const t = nodeMap.get(e.target) as any
      if (!s || !t) continue
      const sx = ((s.id.charCodeAt(0) * 7 + s.id.charCodeAt(1) * 13) % w)
      const sy = ((s.id.charCodeAt(2) * 11 + s.id.charCodeAt(3) * 5) % h)
      const tx = ((t.id.charCodeAt(0) * 7 + t.id.charCodeAt(1) * 13) % w)
      const ty = ((t.id.charCodeAt(2) * 11 + t.id.charCodeAt(3) * 5) % h)
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke()
    }

    ctx.globalAlpha = 0.15
    for (const n of graphData.nodes.slice(0, 300)) {
      const x = ((n.id.charCodeAt(0) * 7 + n.id.charCodeAt(1) * 13) % w)
      const y = ((n.id.charCodeAt(2) * 11 + n.id.charCodeAt(3) * 5) % h)
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = n.color || '#666'; ctx.fill()
    }

    const cx = w / 2
    const cy = h / 2
    ctx.globalAlpha = 1
    const connArr = [...connectedIds].slice(0, 8)
    const angleStep = (Math.PI * 2) / connArr.length
    const radius = Math.min(w, h) * 0.35

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)'
    ctx.lineWidth = 1.5
    connArr.forEach((id, i) => {
      const angle = angleStep * i - Math.PI / 2
      const nx = cx + Math.cos(angle) * radius
      const ny = cy + Math.sin(angle) * radius
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke()
    })

    connArr.forEach((id, i) => {
      const n = nodeMap.get(id) as any
      if (!n) return
      const angle = angleStep * i - Math.PI / 2
      const nx = cx + Math.cos(angle) * radius
      const ny = cy + Math.sin(angle) * radius
      ctx.beginPath(); ctx.arc(nx, ny, 5, 0, Math.PI * 2)
      ctx.fillStyle = n.color || '#facc15'; ctx.fill()
      ctx.strokeStyle = n.color || '#facc15'; ctx.lineWidth = 1; ctx.stroke()
    })

    if (movie.poster_path) {
      const posterImg = new window.Image()
      posterImg.crossOrigin = 'anonymous'
      posterImg.src = `https://image.tmdb.org/t/p/w92${movie.poster_path}`
      posterImg.onload = () => {
        ctx.fillStyle = '#facc15'
        ctx.beginPath(); ctx.roundRect(cx - 13, cy - 18, 26, 36, 3); ctx.fill()
        ctx.save(); ctx.beginPath(); ctx.roundRect(cx - 11, cy - 16, 22, 32, 2); ctx.clip()
        ctx.drawImage(posterImg, cx - 11, cy - 16, 22, 32); ctx.restore()
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(movie.titulo_ingles || movie.titulo, cx, cy + 24)
      }
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fillStyle = '#facc15'; ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(movie.titulo_ingles || movie.titulo, cx, cy + 16)
    }
  }, [graphData, movie])

  return (
    <Link href="/mapa" className="shrink-0 w-56 bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-white text-sm font-bold">Mapa</span>
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>
      </div>
      <div className="relative h-48 bg-zinc-950">
        <canvas ref={canvasRef} width={224} height={192} className="w-full h-full" />
      </div>
    </Link>
  )
}

// ── Comunidad Widget ──
function ComunidadWidget() {
  return (
    <Link href="/comunidad" className="shrink-0 w-56 bg-zinc-900 rounded-2xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-white text-sm font-bold">Comunidad</span>
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      </div>
      <div className="relative h-48 bg-zinc-950 flex items-center justify-center overflow-hidden">
        {/* Decorative community elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-6 left-8 w-8 h-8 rounded-full bg-violet-500" />
          <div className="absolute top-10 right-10 w-6 h-6 rounded-full bg-indigo-500" />
          <div className="absolute bottom-12 left-12 w-5 h-5 rounded-full bg-purple-500" />
          <div className="absolute bottom-8 right-8 w-7 h-7 rounded-full bg-blue-500" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-violet-400" />
          {/* Lines connecting */}
          <svg className="absolute inset-0 w-full h-full">
            <line x1="44" y1="30" x2="112" y2="96" stroke="#8b5cf6" strokeWidth="1" opacity="0.5"/>
            <line x1="170" y1="46" x2="112" y2="96" stroke="#6366f1" strokeWidth="1" opacity="0.5"/>
            <line x1="60" y1="140" x2="112" y2="96" stroke="#a855f7" strokeWidth="1" opacity="0.5"/>
            <line x1="164" y1="150" x2="112" y2="96" stroke="#3b82f6" strokeWidth="1" opacity="0.5"/>
          </svg>
        </div>
        <div className="text-center z-10">
          <p className="text-zinc-400 text-xs">Reviews, listas y rankings</p>
          <p className="text-zinc-500 text-[10px] mt-1">de la comunidad CineBret</p>
        </div>
      </div>
    </Link>
  )
}

function usePrefetch() {
  useEffect(() => {
    ['/cinereels', '/mapa', '/comunidad'].forEach(href => {
      const link = document.createElement('link')
      link.rel = 'prefetch'; link.href = href; document.head.appendChild(link)
    })
    if (!sessionStorage.getItem('graph-prefetched')) {
      setTimeout(() => { fetch('/movie-graph.json').then(() => sessionStorage.setItem('graph-prefetched', '1')) }, 2000)
    }
  }, [])
}

export default function FeatureWidgetsNuevo() {
  usePrefetch()
  const [reelMovie, setReelMovie] = useState<WidgetMovie | null>(null)
  const [mapaMovie, setMapaMovie] = useState<WidgetMovie | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('peliculas')
        .select('id, titulo, titulo_ingles, poster_path, nota_imdb, anio, youtube_trailer_key')
        .gte('nota_imdb', 7.5).not('poster_path', 'is', null).not('youtube_trailer_key', 'is', null).limit(30)
      if (data && data.length > 0) {
        const rand = data[Math.floor(Math.random() * data.length)]
        const { data: enr } = await supabase.from('enriquecimiento').select('director').eq('pelicula_id', rand.id).maybeSingle()
        const { data: wp } = await supabase.from('watch_providers').select('platform_key').eq('pelicula_id', rand.id).eq('provider_type', 'flatrate').not('platform_key', 'is', null)
        setReelMovie({ ...rand, director: enr?.director || null, plataformas: [...new Set((wp || []).map((w: any) => w.platform_key))] })
      }
    })()

    ;(async () => {
      const { data } = await supabase.from('peliculas')
        .select('id, titulo, titulo_ingles, poster_path, nota_imdb, anio')
        .in('titulo_ingles', ['Inception', 'The Dark Knight', 'Interstellar', 'Gladiator', 'Fight Club', 'The Departed'])
        .limit(6)
      if (data && data.length > 0) {
        const rand = data[Math.floor(Math.random() * data.length)]
        setMapaMovie({ ...rand, youtube_trailer_key: null, plataformas: [], director: null })
      }
    })()
  }, [])

  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-white mb-2">Descubre</h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-3 px-3">
        <ReelsWidget movie={reelMovie} />
        <MapaWidget movie={mapaMovie} />
        <ComunidadWidget />
      </div>
    </div>
  )
}
