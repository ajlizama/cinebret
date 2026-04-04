'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import SmartSearchBar from '@/components/SmartSearchBar'
import FeatureWidgets from '@/components/FeatureWidgets'

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

// Hero spotlight — auto-rotating backdrop with movie info
function HeroSpotlight({ movies }: { movies: SimpleMovie[] }) {
  const [current, setCurrent] = useState(0)
  const featured = movies.filter(m => m.backdrop_path && m.nota_imdb && m.nota_imdb >= 7).slice(0, 5)

  useEffect(() => {
    if (featured.length === 0) return
    const t = setInterval(() => setCurrent(c => (c + 1) % featured.length), 6000)
    return () => clearInterval(t)
  }, [featured.length])

  if (featured.length === 0) return null
  const movie = featured[current]

  return (
    <div className="relative w-full h-[55vh] md:h-[60vh] overflow-hidden">
      {/* Backdrop image */}
      {featured.map((m, i) => (
        <div key={m.id} className={`absolute inset-0 transition-opacity duration-1000 ${i === current ? 'opacity-100' : 'opacity-0'}`}>
          <Image
            src={`https://image.tmdb.org/t/p/w1280${m.backdrop_path}`}
            alt=""
            fill
            className="object-cover"
            priority={i === 0}
          />
        </div>
      ))}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-transparent to-zinc-950/40" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
        <div className="max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-black text-white leading-tight mb-2 drop-shadow-lg">
            {movie.titulo_ingles || movie.titulo}
          </h2>
          {movie.titulo !== movie.titulo_ingles && (
            <p className="text-zinc-300 text-sm mb-3">{movie.titulo}</p>
          )}
          <div className="flex items-center gap-3 mb-3">
            {movie.nota_imdb && (
              <span className="text-yellow-400 font-bold text-lg flex items-center gap-1">
                <svg className="w-5 h-5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                {movie.nota_imdb}
              </span>
            )}
            {movie.anio && <span className="text-zinc-400">{movie.anio}</span>}
            {movie.generos.slice(0, 3).map(g => (
              <span key={g} className="text-zinc-400 text-sm bg-zinc-800/60 px-2 py-0.5 rounded">{g}</span>
            ))}
          </div>
          {movie.sinopsis && (
            <p className="text-zinc-300 text-sm leading-relaxed line-clamp-2 mb-4 max-w-xl">{movie.sinopsis}</p>
          )}
          <div className="flex items-center gap-3">
            <Link href={`/pelicula/${movie.id}`} className="bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Ver ficha
            </Link>
            {movie.plataformas.length > 0 && (
              <div className="flex gap-1.5">
                {movie.plataformas.slice(0, 3).map(p => (
                  PLAT_LOGOS[p] && <div key={p} className="bg-white rounded-lg px-1.5 py-1" style={{ height: 28 }}>
                    <img src={PLAT_LOGOS[p]} alt={p} className="h-4 w-auto object-contain" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-3 right-6 flex gap-1.5">
        {featured.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-yellow-400 w-5' : 'bg-zinc-600'}`}
          />
        ))}
      </div>
    </div>
  )
}

export default function InicioPrueba({ trending, topRated }: { trending: SimpleMovie[]; topRated: SimpleMovie[] }) {
  const { mode } = useMediaMode()
  const [searchValue, setSearchValue] = useState('')

  return (
    <div>
      {/* Hero Spotlight */}
      <HeroSpotlight movies={trending} />

      {/* Search bar — overlapping hero bottom */}
      <div className="relative -mt-6 z-10 px-4 md:px-8 max-w-3xl mx-auto">
        <SmartSearchBar
          value={searchValue}
          onChange={setSearchValue}
          onScrollToCatalog={() => {}}
          onSmartFilters={() => {}}
          placeholder="Buscar película o pedir recomendación..."
        />
      </div>

      <div className="px-4 md:px-8 max-w-7xl mx-auto pt-6 space-y-6">

        {/* Mood buttons — compact horizontal */}
        <div>
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">¿Qué mood?</h2>
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

        {/* Trending — horizontal scroll with big posters */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Trending</h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {trending.map((m, i) => (
              <Link key={m.id} href={`/pelicula/${m.id}`} className="shrink-0 w-36 group">
                <div className="relative w-36 h-52 rounded-xl overflow-hidden bg-zinc-800 mb-1.5 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                  {m.poster_path && (
                    <Image src={`https://image.tmdb.org/t/p/w342${m.poster_path}`} alt={m.titulo} fill className="object-cover" sizes="144px" />
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
                {m.nota_imdb && <p className="text-yellow-400 text-[10px] font-bold">⭐ {m.nota_imdb}</p>}
              </Link>
            ))}
          </div>
        </div>

        {/* Feature Widgets */}
        <FeatureWidgets />

        {/* Top Rated — compact horizontal scroll */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Mejor evaluadas</h2>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2">
            {topRated.map(m => (
              <Link key={m.id} href={`/pelicula/${m.id}`} className="shrink-0 w-28 group">
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

        {/* Platforms quick access */}
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

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  )
}
