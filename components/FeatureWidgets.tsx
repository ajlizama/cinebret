'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type WidgetMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
  nota_imdb: number | null
  anio: number | null
  categoria: string | null
  director: string | null
  generos: string[]
  plataformas: string[]
}

const PLAT_LOGOS: Record<string, string> = {
  netflix: '/netflix.png', disney_plus: '/disney_plus.svg', hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png', apple_tv: '/apple_tv.png', paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png', crunchyroll: '/crunchyroll.png',
}

export default function FeatureWidgets() {
  const [tinderMovie, setTinderMovie] = useState<WidgetMovie | null>(null)
  const [reelMovie, setReelMovie] = useState<WidgetMovie | null>(null)

  useEffect(() => {
    // Fetch a random high-rated movie for Tinder preview
    ;(async () => {
      const { data } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, poster_path, nota_imdb, anio, categoria')
        .gte('nota_imdb', 8)
        .not('poster_path', 'is', null)
        .limit(50)
      if (data && data.length > 0) {
        const rand = data[Math.floor(Math.random() * data.length)]
        // Get enrichment
        const { data: enr } = await supabase.from('enriquecimiento').select('director, generos').eq('pelicula_id', rand.id).maybeSingle()
        // Get platforms
        const { data: wp } = await supabase.from('watch_providers').select('platform_key').eq('pelicula_id', rand.id).eq('provider_type', 'flatrate').not('platform_key', 'is', null)
        setTinderMovie({
          ...rand,
          director: enr?.director || null,
          generos: enr?.generos || [],
          plataformas: [...new Set((wp || []).map((w: any) => w.platform_key))],
        })
      }
    })()
    // Fetch a random movie with trailer for Reels preview
    ;(async () => {
      const { data } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, poster_path, nota_imdb, anio, categoria')
        .gte('nota_imdb', 7.5)
        .not('poster_path', 'is', null)
        .not('youtube_trailer_key', 'is', null)
        .limit(50)
      if (data && data.length > 0) {
        const rand = data[Math.floor(Math.random() * data.length)]
        const { data: enr } = await supabase.from('enriquecimiento').select('director, generos').eq('pelicula_id', rand.id).maybeSingle()
        const { data: wp } = await supabase.from('watch_providers').select('platform_key').eq('pelicula_id', rand.id).eq('provider_type', 'flatrate').not('platform_key', 'is', null)
        setReelMovie({
          ...rand,
          director: enr?.director || null,
          generos: enr?.generos || [],
          plataformas: [...new Set((wp || []).map((w: any) => w.platform_key))],
        })
      }
    })()
  }, [])

  return (
    <div className="mb-4">
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-3 px-3">

        {/* Tinder Widget */}
        <Link href="/reel" className="shrink-0 w-60 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-white text-sm font-bold">Tinder</span>
            <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" />
            </svg>
          </div>
          {tinderMovie?.poster_path && (
            <div className="relative">
              <Image
                src={`https://image.tmdb.org/t/p/w342${tinderMovie.poster_path}`}
                alt={tinderMovie.titulo_ingles || tinderMovie.titulo}
                width={240}
                height={140}
                className="w-full h-36 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-3 right-3">
                <p className="text-white text-xs font-bold leading-tight">{tinderMovie.titulo_ingles || tinderMovie.titulo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {tinderMovie.nota_imdb && <span className="text-yellow-400 text-[10px] font-bold">⭐ {tinderMovie.nota_imdb}</span>}
                  {tinderMovie.anio && <span className="text-zinc-400 text-[10px]">{tinderMovie.anio}</span>}
                </div>
              </div>
            </div>
          )}
          <div className="px-3 py-2 flex justify-center gap-4">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <span className="text-red-400 text-sm">✕</span>
              </div>
              <span className="text-zinc-600 text-[8px] mt-0.5">No</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round"/></svg>
              </div>
              <span className="text-zinc-600 text-[8px] mt-0.5">Vista</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center">
                <span className="text-pink-400 text-sm">♥</span>
              </div>
              <span className="text-zinc-600 text-[8px] mt-0.5">Watchlist</span>
            </div>
          </div>
        </Link>

        {/* Reels Widget */}
        <Link href="/cinereels" className="shrink-0 w-60 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-white text-sm font-bold">Reels</span>
            <img src="/cinereels-icon.png" alt="CineReels" className="w-4 h-4 object-contain opacity-50" />
          </div>
          {reelMovie?.poster_path && (
            <div className="relative">
              <Image
                src={`https://image.tmdb.org/t/p/w342${reelMovie.poster_path}`}
                alt={reelMovie.titulo_ingles || reelMovie.titulo}
                width={240}
                height={180}
                className="w-full h-44 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div className="absolute bottom-2 left-3 right-3">
                <p className="text-white text-xs font-bold leading-tight">{reelMovie.titulo_ingles || reelMovie.titulo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {reelMovie.nota_imdb && <span className="text-yellow-400 text-[10px] font-bold">⭐ {reelMovie.nota_imdb}</span>}
                  {reelMovie.director && <span className="text-zinc-400 text-[10px]">Dir. {reelMovie.director.split(',')[0]}</span>}
                </div>
                {reelMovie.plataformas.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {reelMovie.plataformas.slice(0, 3).map(p => (
                      PLAT_LOGOS[p] ? <div key={p} className="bg-white rounded px-0.5 py-0.5" style={{ height: 14 }}><img src={PLAT_LOGOS[p]} alt={p} className="h-2.5 w-auto object-contain" /></div> : null
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Link>

        {/* Mapa Widget */}
        <Link href="/mapa" className="shrink-0 w-60 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group hover:border-zinc-700 transition-colors">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-white text-sm font-bold">Mapa</span>
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2"/></svg>
          </div>
          <div className="relative h-52 bg-zinc-950 overflow-hidden">
            {/* Static preview of the graph */}
            <img
              src="/movie-graph-preview.png"
              alt="Mapa de conexiones"
              className="w-full h-full object-cover opacity-80"
              onError={(e) => {
                // Fallback: draw colored dots
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
            {/* Fallback overlay with colored dots */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-32 h-32">
                {[
                  { x: 50, y: 30, color: '#facc15', size: 8 },
                  { x: 25, y: 50, color: '#ef4444', size: 6 },
                  { x: 75, y: 45, color: '#3b82f6', size: 7 },
                  { x: 40, y: 70, color: '#a855f7', size: 5 },
                  { x: 65, y: 65, color: '#facc15', size: 6 },
                  { x: 35, y: 35, color: '#ef4444', size: 4 },
                  { x: 55, y: 55, color: '#3b82f6', size: 5 },
                  { x: 80, y: 25, color: '#a855f7', size: 4 },
                ].map((dot, i) => (
                  <div key={i} className="absolute rounded-full" style={{
                    left: `${dot.x}%`, top: `${dot.y}%`,
                    width: dot.size, height: dot.size,
                    backgroundColor: dot.color,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 ${dot.size * 2}px ${dot.color}40`,
                  }} />
                ))}
                {/* Connection lines */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                  <line x1="50" y1="30" x2="25" y2="50" stroke="#facc1540" strokeWidth="0.5" />
                  <line x1="50" y1="30" x2="75" y2="45" stroke="#facc1540" strokeWidth="0.5" />
                  <line x1="50" y1="30" x2="55" y2="55" stroke="#facc1540" strokeWidth="0.5" />
                  <line x1="25" y1="50" x2="40" y2="70" stroke="#ef444440" strokeWidth="0.5" />
                  <line x1="75" y1="45" x2="65" y2="65" stroke="#3b82f640" strokeWidth="0.5" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-2 left-3 right-3">
              <p className="text-zinc-400 text-[10px]">Explora conexiones entre películas</p>
            </div>
          </div>
        </Link>

      </div>
    </div>
  )
}
