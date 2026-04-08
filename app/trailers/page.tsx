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
import { buildHaystack, tokenize, matchTokens } from '@/lib/smartSearch'

type TrailerMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  anio: number | null
  video_clip_url: string | null
  youtube_trailer_key: string | null
  // Smart search fields (filled from enriquecimiento)
  director: string | null
  compositor: string | null
  generos: string[]
  categoria: string | null
  keywords: string[]
  cast: string[]
  haystack: string
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
      // Parallelize the three big fetches
      const [enrRows, baseMovies] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase
            .from('enriquecimiento')
            .select('pelicula_id, video_clip_url, director, compositor, generos, categoria, keywords, cast_json')
            .range(from, to) as any,
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from('peliculas')
            .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio, youtube_trailer_key')
            .not('youtube_trailer_key', 'is', null)
            .range(from, to) as any,
        ),
      ])

      const enrMap: Record<string, any> = {}
      enrRows.forEach((e) => {
        enrMap[e.pelicula_id] = e
      })

      const seen = new Set<string>()
      const allMovies: TrailerMovie[] = []
      const buildEntry = (m: any): TrailerMovie => {
        const enr = enrMap[m.id] ?? {}
        const cast: string[] = Array.isArray(enr.cast_json)
          ? enr.cast_json.slice(0, 8).map((c: any) => c?.name).filter(Boolean)
          : []
        const generos: string[] = enr.generos ?? []
        const keywords: string[] = enr.keywords ?? []
        const haystack = buildHaystack([
          m.titulo,
          m.titulo_ingles,
          String(m.anio ?? ''),
          enr.director ?? null,
          enr.compositor ?? null,
          enr.categoria ?? null,
          generos,
          keywords,
          cast,
        ])
        return {
          id: m.id,
          titulo: m.titulo,
          titulo_ingles: m.titulo_ingles,
          nota_imdb: m.nota_imdb,
          poster_path: m.poster_path,
          anio: m.anio,
          youtube_trailer_key: m.youtube_trailer_key,
          video_clip_url: enr.video_clip_url ?? null,
          director: enr.director ?? null,
          compositor: enr.compositor ?? null,
          generos,
          categoria: enr.categoria ?? null,
          keywords,
          cast,
          haystack,
        }
      }

      baseMovies.forEach((m) => {
        seen.add(m.id)
        allMovies.push(buildEntry(m))
      })

      // Movies with clip but no youtube_trailer_key
      const clipOnlyIds = enrRows
        .filter((e) => e.video_clip_url && !seen.has(e.pelicula_id))
        .map((e) => e.pelicula_id)

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
              allMovies.push(buildEntry(m))
            })
          })(),
        )
      }
      await Promise.all(chunks)

      setMovies(allMovies)
      setLoading(false)
    })()
  }, [])

  // Smart filter
  const filtered = useMemo(() => {
    const tokens = tokenize(searchTrailer)
    if (tokens.length === 0) return movies
    return movies.filter((m) => matchTokens(m.haystack, tokens))
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

  function renderCard(m: TrailerMovie) {
    const ytId = getYouTubeId(m)
    const isClip = !!m.video_clip_url
    return (
      <button
        type="button"
        onClick={() => setExpandedId(m.id)}
        className="group block text-left cursor-pointer w-full"
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
            <div className="w-12 h-12 rounded-full bg-yellow-400/95 text-zinc-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Icon.Play className="w-5 h-5" filled />
            </div>
          </div>
          {m.nota_imdb && (
            <div className="absolute top-2 left-2">
              <Pill variant="gold" size="sm" icon={<Icon.Star className="w-3 h-3" filled />}>
                {m.nota_imdb}
              </Pill>
            </div>
          )}
          <div className="absolute top-2 right-2">
            <Pill variant={isClip ? 'gold' : 'default'} size="sm">
              {isClip ? 'CLIP' : 'TRÁILER'}
            </Pill>
          </div>
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
    )
  }

  function renderExpanded(m: TrailerMovie) {
    const ytId = getYouTubeId(m)
    return (
      <div className="bg-zinc-900 rounded-2xl overflow-hidden ring-1 ring-yellow-400/30 mb-6">
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
            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 flex-wrap">
              {m.anio && <span className="tabular-nums">{m.anio}</span>}
              {m.nota_imdb && (
                <span className="text-yellow-400 font-bold flex items-center gap-0.5 tabular-nums">
                  <Icon.Star className="w-3 h-3" filled />
                  {m.nota_imdb}
                </span>
              )}
              {m.director && <span className="text-zinc-500">· {m.director}</span>}
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
    )
  }

  // The expanded clip is rendered ABOVE the carousel of its section so it
  // doesn't break the 2-row grid flow.
  const expandedMovie = useMemo(
    () => (expandedId ? movies.find((m) => m.id === expandedId) ?? null : null),
    [expandedId, movies],
  )

  return (
    <PageShell maxWidth="7xl">
      <PageHeader
        title="Trailers & Clips"
        subtitle="Mira tráileres y clips exclusivos. Buscá por título, director, género, actor o palabra clave."
        count={totalCount}
      />

      <div className="mb-8 max-w-xl">
        <SearchInput
          value={searchTrailer}
          onChange={setSearchTrailer}
          placeholder="Ej: Nolan, terror, viajes en el tiempo, Margot Robbie..."
        />
      </div>

      {expandedMovie && renderExpanded(expandedMovie)}

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
              {/* 2-row horizontal scrollable carousel.
                  grid-flow-col + grid-rows-2 = first 2 cards in column 1,
                  next 2 in column 2, etc. snap-x for tactile scroll. */}
              <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto no-scrollbar pb-2">
                <div
                  className="grid grid-flow-col grid-rows-2 gap-3 sm:gap-4 snap-x"
                  style={{ gridAutoColumns: 'clamp(150px, 42vw, 240px)' }}
                >
                  {section.movies.map((m) => (
                    <div key={m.id} className="snap-start">
                      {renderCard(m)}
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          ))}
        </div>
      )}
    </PageShell>
  )
}
