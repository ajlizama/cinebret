'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  SearchInput,
  Section,
  Pill,
  IconButton,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
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

type SectionData = {
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

async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    results.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

export default function TrailersPage() {
  const [movies, setMovies] = useState<TrailerMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchTrailer, setSearchTrailer] = useState('')

  useEffect(() => {
    ;(async () => {
      // Parallelize the two big fetches: enriquecimiento clips + peliculas with trailers
      const [clipRows, baseMovies] = await Promise.all([
        fetchAllPages<{ pelicula_id: string; video_clip_url: string }>((from, to) =>
          supabase
            .from('enriquecimiento')
            .select('pelicula_id, video_clip_url')
            .not('video_clip_url', 'is', null)
            .range(from, to) as any,
        ),
        fetchAllPages<TrailerMovie>((from, to) =>
          supabase
            .from('peliculas')
            .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio, youtube_trailer_key')
            .not('youtube_trailer_key', 'is', null)
            .range(from, to) as any,
        ),
      ])

      const clipMap: Record<string, string> = {}
      clipRows.forEach((c) => {
        clipMap[c.pelicula_id] = c.video_clip_url
      })

      const seen = new Set<string>()
      const allMovies: TrailerMovie[] = baseMovies.map((m) => {
        seen.add(m.id)
        return { ...m, video_clip_url: clipMap[m.id] || null }
      })

      // Add movies that only have video_clip_url but no youtube_trailer_key
      const clipOnlyIds = Object.keys(clipMap).filter((id) => !seen.has(id))
      const chunks: Promise<void>[] = []
      for (let i = 0; i < clipOnlyIds.length; i += 100) {
        const chunk = clipOnlyIds.slice(i, i + 100)
        chunks.push(
          (async () => {
            const { data } = await supabase
              .from('peliculas')
              .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio, youtube_trailer_key')
              .in('id', chunk)
            ;(data ?? []).forEach((m: any) => {
              allMovies.push({ ...m, video_clip_url: clipMap[m.id] || null })
            })
          })(),
        )
      }
      await Promise.all(chunks)

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchTrailer) return movies
    const q = searchTrailer.toLowerCase()
    return movies.filter(
      (m) =>
        m.titulo.toLowerCase().includes(q) ||
        (m.titulo_ingles || '').toLowerCase().includes(q),
    )
  }, [movies, searchTrailer])

  // Categorize into sections
  const sections: SectionData[] = useMemo(() => {
    const proximamente: TrailerMovie[] = []
    const trending: TrailerMovie[] = []
    const catalogo: TrailerMovie[] = []

    filtered.forEach((m) => {
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

    const result: SectionData[] = []
    if (proximamente.length > 0)
      result.push({ key: 'proximamente', label: 'Próximamente', movies: proximamente })
    if (trending.length > 0)
      result.push({ key: 'trending', label: 'Trending', movies: trending })
    if (catalogo.length > 0)
      result.push({ key: 'catalogo', label: 'Catálogo', movies: catalogo })
    return result
  }, [filtered])

  const totalCount = filtered.length

  return (
    <PageShell maxWidth="7xl">
      <PageHeader
        title="Trailers & Clips"
        subtitle="Mira tráileres y clips exclusivos de las películas del catálogo."
        count={totalCount}
      />

      <div className="mb-8 max-w-md">
        <SearchInput
          value={searchTrailer}
          onChange={setSearchTrailer}
          placeholder="Buscar película..."
        />
      </div>

      {loading ? (
        <LoadingState text="Cargando tráileres..." />
      ) : sections.length === 0 ? (
        <EmptyState
          icon={<Icon.Film className="w-16 h-16" />}
          title="No se encontraron videos"
          description="Prueba a cambiar la búsqueda."
        />
      ) : (
        <div className="space-y-10">
          {sections.map((section) => (
            <Section key={section.key} label={section.label} count={section.movies.length}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {section.movies.map((m) => {
                  const ytId = getYouTubeId(m)
                  const isExpanded = expandedId === m.id
                  return (
                    <div key={m.id} className={isExpanded ? 'col-span-2 md:col-span-3' : ''}>
                      {!isExpanded ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId(m.id)}
                          className="group block w-full text-left cursor-pointer"
                        >
                          <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 ring-1 ring-zinc-800/60 group-hover:ring-yellow-400/40 transition-all mb-2">
                            {ytId ? (
                              <img
                                loading="lazy"
                                src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                                alt={m.titulo}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : m.poster_path ? (
                              <Image
                                src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                alt={m.titulo}
                                fill
                                className="object-cover"
                              />
                            ) : null}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                              <div className="w-14 h-14 rounded-full bg-yellow-400/95 text-zinc-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <Icon.Play className="w-6 h-6" filled />
                              </div>
                            </div>
                            {m.nota_imdb && (
                              <div className="absolute top-2 left-2">
                                <Pill variant="gold" size="sm" icon={<Icon.Star className="w-3 h-3" filled />}>
                                  {m.nota_imdb}
                                </Pill>
                              </div>
                            )}
                            {m.video_clip_url && (
                              <div className="absolute top-2 right-2">
                                <Pill variant="gold" size="sm">CLIP</Pill>
                              </div>
                            )}
                          </div>
                          <p className="text-white text-sm font-semibold line-clamp-1">
                            {m.titulo_ingles || m.titulo}
                          </p>
                          <div className="flex items-center gap-2">
                            {m.titulo_ingles && m.titulo_ingles !== m.titulo && (
                              <p className="text-zinc-500 text-xs line-clamp-1">{m.titulo}</p>
                            )}
                            {m.anio && <p className="text-zinc-600 text-xs tabular-nums">{m.anio}</p>}
                          </div>
                        </button>
                      ) : (
                        <div className="bg-zinc-900 rounded-2xl overflow-hidden my-2 ring-1 ring-yellow-400/30">
                          <div className="relative">
                            {ytId && <YouTubeClip videoId={ytId} />}
                            <div className="absolute top-3 right-3 z-30">
                              <IconButton
                                icon={<Icon.Close className="w-5 h-5" />}
                                label="Cerrar reproductor"
                                onClick={() => setExpandedId(null)}
                                variant="ghost"
                                className="bg-black/70 hover:bg-black/90 text-white"
                              />
                            </div>
                          </div>
                          <div className="p-4 flex items-center gap-3">
                            {m.poster_path && (
                              <div className="relative w-12 h-16 rounded-lg overflow-hidden shrink-0">
                                <Image
                                  src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                                  alt={m.titulo}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">
                                {m.titulo_ingles || m.titulo}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                                {m.anio && <span className="tabular-nums">{m.anio}</span>}
                                {m.nota_imdb && (
                                  <span className="text-yellow-400 font-bold flex items-center gap-0.5 tabular-nums">
                                    <Icon.Star className="w-3 h-3" filled />
                                    {m.nota_imdb}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Link
                              href={`/pelicula/${m.id}`}
                              className="text-xs text-yellow-400 hover:text-yellow-300 font-semibold shrink-0 inline-flex items-center gap-1"
                            >
                              Ver ficha
                              <Icon.ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          ))}
        </div>
      )}
    </PageShell>
  )
}
