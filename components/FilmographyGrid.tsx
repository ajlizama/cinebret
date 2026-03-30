'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import EnrichedDetails from './EnrichedDetails'
import { useAuth } from '@/context/AuthContext'

type Movie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
}

type FullMovie = Movie & {
  rt_score: number | null
  metacritic_score: number | null
  oscars: string | null
  categoria: string | null
  runtime: number | null
  backdrop_path: string | null
  sinopsis: string | null
  director: string | null
  compositor: string | null
  video_clip_url: string | null
  youtube_trailer_key: string | null
  imdb_id: string | null
  generos: string[]
  plataformas: string[]
}

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', logo: '/paramount_plus.svg' },
  { id: 'mubi', nombre: 'MUBI', logo: '/mubi.png' },
]

export default function FilmographyGrid({ movies, musicFirst = false }: { movies: Movie[]; musicFirst?: boolean }) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fullData, setFullData] = useState<FullMovie | null>(null)
  const [loading, setLoading] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState<string | null>(null)
  const [musicUrls, setMusicUrls] = useState<Record<string, string | null>>({})

  useEffect(() => {
    if (!expanded) { setFullData(null); return }
    setLoading(true)
    ;(async () => {
      const [{ data: pel }, { data: enr }] = await Promise.all([
        supabase.from('peliculas').select('*, catalogos(plataforma, fecha, activo)').eq('id', expanded).single(),
        supabase.from('enriquecimiento').select('*').eq('pelicula_id', expanded).maybeSingle(),
      ])
      if (!pel) { setLoading(false); return }
      const hoy = new Date().toISOString().split('T')[0]
      const plats = (pel.catalogos || []).filter((c: any) => c.fecha === hoy && c.activo).map((c: any) => c.plataforma)
      setFullData({
        ...pel,
        rt_score: pel.rt_score ?? null,
        metacritic_score: pel.metacritic_score ?? null,
        sinopsis: enr?.sinopsis_chilensis ?? null,
        director: enr?.director ?? null,
        compositor: enr?.compositor ?? null,
        video_clip_url: enr?.video_clip_url ?? null,
        youtube_trailer_key: pel.youtube_trailer_key ?? null,
        imdb_id: pel.imdb_id ?? null,
        generos: enr?.generos ?? [],
        plataformas: plats,
      })
      setLoading(false)
    })()
  }, [expanded])

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-4">Filmografía</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {movies.map(m => {
          const isExpanded = expanded === m.id
          return (
            <div key={m.id} className={isExpanded ? 'col-span-3 sm:col-span-4 md:col-span-5 lg:col-span-6' : ''}>
              {!isExpanded ? (
                <div className="cursor-pointer group" onClick={async () => {
                  if (musicFirst) {
                    if (musicPlaying === m.id) {
                      // Second click: expand detail
                      setMusicPlaying(null)
                      setExpanded(m.id)
                    } else {
                      // First click: play music
                      setExpanded(null)
                      setMusicPlaying(m.id)
                      if (!musicUrls[m.id]) {
                        try {
                          const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(m.titulo_ingles || m.titulo)}`)
                          const data = await res.json()
                          setMusicUrls(prev => ({ ...prev, [m.id]: data.album?.embedUrl ?? null }))
                        } catch { setMusicUrls(prev => ({ ...prev, [m.id]: null })) }
                      }
                    }
                  } else {
                    setExpanded(m.id)
                  }
                }}>
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                    {m.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="150px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <span className="text-zinc-600 text-xs text-center">{m.titulo_ingles || m.titulo}</span>
                      </div>
                    )}
                    {m.nota_imdb && (
                      <div className="absolute top-1.5 left-1.5 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400 flex items-center gap-0.5"><svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {m.nota_imdb}</div>
                    )}
                    {musicFirst && musicPlaying === m.id && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857z"/></svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{m.titulo_ingles || m.titulo}</p>
                  <p className="text-zinc-500 text-xs">{m.anio}</p>
                  {/* Mini Spotify embed */}
                  {musicFirst && musicPlaying === m.id && musicUrls[m.id] && (
                    <div className="mt-1 rounded-lg overflow-hidden">
                      <iframe src={musicUrls[m.id]!} width="100%" height="80" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media" loading="lazy" className="rounded-lg" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-zinc-900 rounded-2xl overflow-hidden my-2 shadow-2xl">
                  {/* Banner */}
                  <div className="relative h-32 md:h-44 overflow-hidden">
                    {(fullData?.backdrop_path || m.poster_path) && (
                      <>
                        <img loading="lazy" src={`https://image.tmdb.org/t/p/w780${fullData?.backdrop_path || m.poster_path}`} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/30 via-transparent to-zinc-900" />
                      </>
                    )}
                    <button onClick={() => setExpanded(null)} className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full w-11 h-11 flex items-center justify-center text-sm">✕</button>
                  </div>

                  {/* Content */}
                  <div className="px-4 -mt-12 relative z-10">
                    <div className="flex gap-3 items-end">
                      <Link href={`/pelicula/${m.id}`} className="relative w-20 md:w-24 shrink-0 rounded-lg overflow-hidden shadow-2xl border-2 border-zinc-900 block" style={{ aspectRatio: '2/3' }}>
                        {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="96px" />}
                      </Link>
                      <div className="flex-1 min-w-0 pb-1">
                        <h3 className="text-lg font-bold text-white leading-tight">
                          {m.titulo_ingles || m.titulo}
                          {m.anio && <span className="text-zinc-400 font-normal ml-1 text-base">({m.anio})</span>}
                        </h3>
                        {m.titulo_ingles && m.titulo !== m.titulo_ingles && (
                          <p className="text-zinc-500 text-xs">{m.titulo}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pt-3 pb-4 space-y-3">
                    {loading ? (
                      <p className="text-zinc-500 text-xs animate-pulse">Cargando...</p>
                    ) : fullData && (
                      <>
                        {/* Ratings */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {fullData.nota_imdb != null && (
                            <div className="flex items-center gap-1">
                              <div className="w-9 h-9 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                                <span className="text-yellow-400 font-bold text-xs">{fullData.nota_imdb}</span>
                              </div>
                              <span className="text-zinc-500 text-xs">IMDB</span>
                            </div>
                          )}
                          {fullData.rt_score != null && (
                            <div className="flex items-center gap-1">
                              <div className="w-9 h-9 rounded-full border-2 border-red-400 flex items-center justify-center">
                                <span className="text-red-400 font-bold text-xs">{fullData.rt_score}%</span>
                              </div>
                              <span className="text-zinc-500 text-xs">RT</span>
                            </div>
                          )}
                          {fullData.oscars && fullData.oscars !== 'N/A' && (
                            <div className="flex items-center gap-1">
                              <img loading="lazy" src="/oscar.png" alt="Oscar" className="h-8 w-auto" />
                              <span className="text-xs font-bold text-yellow-400">{fullData.oscars.match(/\d+/)?.[0]}</span>
                            </div>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="text-xs text-zinc-400 flex flex-wrap gap-1">
                          {fullData.generos.length > 0 && <span>{fullData.generos.join(', ')}</span>}
                          {fullData.runtime != null && <span>· {Math.floor(fullData.runtime / 60)}h {fullData.runtime % 60}min</span>}
                          {fullData.categoria && <span>· {fullData.categoria}</span>}
                        </div>

                        {/* Platforms */}
                        {fullData.plataformas.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {PLATAFORMAS.filter(pl => fullData.plataformas.includes(pl.id)).map(pl => (
                              <div key={pl.id} className="rounded-md bg-white px-1.5 py-0.5 flex items-center">
                                <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Synopsis */}
                        {fullData.sinopsis && (
                          <p className="text-sm text-zinc-300 leading-relaxed">{fullData.sinopsis}</p>
                        )}

                        {/* Director + Compositor */}
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                          {fullData.director && (
                            <Link href={`/director/${encodeURIComponent(fullData.director)}`} className="hover:text-yellow-400 transition-colors">
                              <p className="text-white text-sm font-medium">{fullData.director}</p>
                              <p className="text-zinc-500 text-xs">Director</p>
                            </Link>
                          )}
                          {fullData.compositor && (
                            <Link href={`/compositor/${encodeURIComponent(fullData.compositor)}`} className="hover:text-yellow-400 transition-colors">
                              <p className="text-white text-sm font-medium">{fullData.compositor}</p>
                              <p className="text-zinc-500 text-xs">Compositor</p>
                            </Link>
                          )}
                        </div>

                        {/* Links */}
                        <div className="flex flex-wrap gap-2">
                          {fullData.youtube_trailer_key && (
                            <a href={`https://www.youtube.com/watch?v=${fullData.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-white bg-zinc-800 rounded-lg px-3 py-1.5">▶ Tráiler</a>
                          )}
                          {fullData.imdb_id && (
                            <a href={`https://www.imdb.com/title/${fullData.imdb_id}/`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center bg-yellow-400 text-zinc-950 font-black text-xs px-1.5 py-0.5 rounded">IMDb</a>
                          )}
                          <Link href={`/pelicula/${m.id}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium px-3 py-1.5">Ver ficha completa →</Link>
                        </div>

                        {/* Enriched details */}
                        <EnrichedDetails peliculaId={m.id} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
