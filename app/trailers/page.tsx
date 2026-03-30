'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import YouTubeClip from '@/components/YouTubeClip'
import { extractYouTubeId } from '@/lib/youtube'
import { supabase } from '@/lib/supabase'

type TrailerMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  anio: number | null
  video_clip_url: string | null
  youtube_trailer_key: string | null
}

type Section = {
  key: string
  label: string
  movies: TrailerMovie[]
}

function getYouTubeId(movie: TrailerMovie): string | null {
  if (movie.video_clip_url) {
    const id = extractYouTubeId(movie.video_clip_url)
    if (id) return id
  }
  return movie.youtube_trailer_key || null
}

export default function TrailersPage() {
  const [movies, setMovies] = useState<TrailerMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchTrailer, setSearchTrailer] = useState('')

  useEffect(() => {
    ;(async () => {
      // 1. Fetch all enriquecimiento rows with video_clip_url
      const clipMap: Record<string, string> = {}
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento')
          .select('pelicula_id, video_clip_url')
          .not('video_clip_url', 'is', null)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        data.forEach((e: any) => { clipMap[e.pelicula_id] = e.video_clip_url })
        if (data.length < 1000) break
        offset += 1000
      }

      // 2. Fetch all peliculas with youtube_trailer_key
      const allMovies: TrailerMovie[] = []
      const seen = new Set<string>()
      offset = 0
      while (true) {
        const { data } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio, youtube_trailer_key')
          .not('youtube_trailer_key', 'is', null)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        data.forEach((m: any) => {
          seen.add(m.id)
          allMovies.push({
            ...m,
            video_clip_url: clipMap[m.id] || null,
          })
        })
        if (data.length < 1000) break
        offset += 1000
      }

      // 3. Add movies that only have video_clip_url but no youtube_trailer_key
      const clipOnlyIds = Object.keys(clipMap).filter(id => !seen.has(id))
      for (let i = 0; i < clipOnlyIds.length; i += 50) {
        const chunk = clipOnlyIds.slice(i, i + 50)
        const { data } = await supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio, youtube_trailer_key')
          .in('id', chunk)
        if (data) {
          data.forEach((m: any) => {
            allMovies.push({
              ...m,
              video_clip_url: clipMap[m.id] || null,
            })
          })
        }
      }

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTrailer) return movies
    const q = searchTrailer.toLowerCase()
    return movies.filter(m =>
      m.titulo.toLowerCase().includes(q) || (m.titulo_ingles || '').toLowerCase().includes(q)
    )
  }, [movies, searchTrailer])

  // Categorize into sections
  const sections: Section[] = useMemo(() => {
    const proximamente: TrailerMovie[] = []
    const trending: TrailerMovie[] = []
    const catalogo: TrailerMovie[] = []

    filtered.forEach(m => {
      if ((m.anio && m.anio >= 2026) || (m.anio && m.anio >= 2025 && !m.nota_imdb)) {
        proximamente.push(m)
      } else if (m.nota_imdb && m.nota_imdb >= 7.5 && m.anio && m.anio >= 2020) {
        trending.push(m)
      } else {
        catalogo.push(m)
      }
    })

    proximamente.sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0))
    trending.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
    catalogo.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))

    const result: Section[] = []
    if (proximamente.length > 0) result.push({ key: 'proximamente', label: 'Proximamente', movies: proximamente })
    if (trending.length > 0) result.push({ key: 'trending', label: 'Trending', movies: trending })
    if (catalogo.length > 0) result.push({ key: 'catalogo', label: 'Catalogo', movies: catalogo })
    return result
  }, [filtered])

  const totalCount = filtered.length

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 mb-1">Trailers & Clips</h1>
        <p className="text-zinc-500 text-sm mb-4">{totalCount} peliculas con video</p>

        <input
          type="text"
          placeholder="Buscar pelicula..."
          value={searchTrailer}
          onChange={e => setSearchTrailer(e.target.value)}
          className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 mb-6"
        />

        {loading ? (
          <div className="flex justify-center py-12">
            <video src="/loading.mp4" autoPlay muted loop playsInline className="w-14 h-14 object-contain" style={{ mixBlendMode: 'lighten' }} />
          </div>
        ) : (
          <div className="space-y-10">
            {sections.map(section => (
              <div key={section.key}>
                <div className="flex items-baseline gap-3 mb-4">
                  <h2 className="text-lg font-bold text-white">{section.label}</h2>
                  <span className="text-sm text-zinc-500">{section.movies.length}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {section.movies.map(m => {
                    const ytId = getYouTubeId(m)
                    const isExpanded = expandedId === m.id
                    return (
                      <div key={m.id} className={isExpanded ? 'col-span-2 md:col-span-3' : ''}>
                        {!isExpanded ? (
                          <div className="cursor-pointer group" onClick={() => setExpandedId(m.id)}>
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-800 mb-2">
                              {ytId ? (
                                <img loading="lazy" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              ) : m.poster_path ? (
                                <Image src={`https://image.tmdb.org/t/p/w342${m.poster_path}`} alt="" fill className="object-cover" />
                              ) : null}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                  <svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                              </div>
                              {m.nota_imdb && (
                                <div className="absolute top-2 left-2 bg-zinc-900/90 rounded-full px-2 py-0.5 text-xs font-bold text-yellow-400 flex items-center gap-0.5">
                                  <svg className="w-3 h-3 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {m.nota_imdb}
                                </div>
                              )}
                              {m.video_clip_url && (
                                <div className="absolute top-2 right-2 bg-yellow-500/90 rounded-full px-2 py-0.5 text-[10px] font-bold text-black">CLIP</div>
                              )}
                            </div>
                            <p className="text-white text-sm font-semibold line-clamp-1">{m.titulo_ingles || m.titulo}</p>
                            <div className="flex items-center gap-2">
                              {m.titulo_ingles && m.titulo_ingles !== m.titulo && (
                                <p className="text-zinc-500 text-xs line-clamp-1">{m.titulo}</p>
                              )}
                              {m.anio && <p className="text-zinc-600 text-xs">{m.anio}</p>}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-zinc-900 rounded-2xl overflow-hidden my-2">
                            <div className="relative">
                              {ytId && <YouTubeClip videoId={ytId} />}
                              <button onClick={() => setExpandedId(null)} className="absolute top-3 right-3 z-30 bg-black/60 hover:bg-black/80 text-white rounded-full w-11 h-11 flex items-center justify-center text-sm">✕</button>
                            </div>
                            <div className="p-4 flex items-center gap-3">
                              {m.poster_path && (
                                <div className="relative w-12 h-16 rounded-lg overflow-hidden shrink-0">
                                  <Image src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" fill className="object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm">{m.titulo_ingles || m.titulo}</p>
                                <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                                  {m.anio && <span>{m.anio}</span>}
                                  {m.nota_imdb && (
                                    <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                                      <svg className="w-3 h-3 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {m.nota_imdb}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Link href={`/pelicula/${m.id}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium shrink-0">Ver ficha</Link>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {sections.length === 0 && !loading && (
              <p className="text-zinc-500 text-center py-12">No se encontraron videos</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
