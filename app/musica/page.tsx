'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  SearchInput,
  FilterChips,
  Card,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'

type MovieMusic = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  logo_path: string | null
  anio: number | null
  compositor: string | null
  generos: string[]
  spotifyAlbumId: string | null
}

const GENEROS_COMUNES = [
  'Drama',
  'Acción',
  'Comedia',
  'Thriller',
  'Ciencia ficción',
  'Terror',
  'Aventura',
  'Animación',
  'Romance',
]

const GENRE_CHIPS = [
  { key: '', label: 'Todos' },
  ...GENEROS_COMUNES.map((g) => ({ key: g, label: g })),
]

export default function MusicaPage() {
  const [movies, setMovies] = useState<MovieMusic[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [loadingEmbed, setLoadingEmbed] = useState(false)

  useEffect(() => {
    ;(async () => {
      // Fetch enriquecimiento and peliculas in parallel
      const [enrResult, pelResult] = await Promise.all([
        (async () => {
          const all: any[] = []
          let offset = 0
          while (true) {
            const { data } = await supabase
              .from('enriquecimiento')
              .select('pelicula_id, compositor, generos')
              .range(offset, offset + 999)
            if (!data || data.length === 0) break
            all.push(...data)
            if (data.length < 1000) break
            offset += 1000
          }
          return all
        })(),
        (async () => {
          const all: any[] = []
          let offset = 0
          while (true) {
            const { data } = await supabase
              .from('peliculas')
              .select('id, titulo, titulo_ingles, nota_imdb, poster_path, logo_path, anio')
              .range(offset, offset + 999)
            if (!data || data.length === 0) break
            all.push(...data)
            if (data.length < 1000) break
            offset += 1000
          }
          return all
        })(),
      ])

      const enrMap: Record<string, any> = {}
      enrResult.forEach((e) => {
        enrMap[e.pelicula_id] = e
      })

      const result: MovieMusic[] = pelResult
        .filter((p) => p.poster_path)
        .map((p) => ({
          ...p,
          compositor: enrMap[p.id]?.compositor ?? null,
          generos: enrMap[p.id]?.generos ?? [],
          spotifyAlbumId: null,
        }))
        .sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))

      setMovies(result)
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    let list = movies
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          m.titulo.toLowerCase().includes(q) ||
          (m.titulo_ingles || '').toLowerCase().includes(q) ||
          (m.compositor || '').toLowerCase().includes(q),
      )
    }
    if (genreFilter) {
      list = list.filter((m) =>
        m.generos.some((g) => g.toLowerCase().includes(genreFilter.toLowerCase())),
      )
    }
    return list
  }, [movies, search, genreFilter])

  const [albumCache, setAlbumCache] = useState<Record<string, string | null>>({})
  const [playingInline, setPlayingInline] = useState<string | null>(null)

  const fetchAlbum = async (movie: MovieMusic): Promise<string | null> => {
    if (albumCache[movie.id] !== undefined) return albumCache[movie.id]
    try {
      const res = await fetch(
        `/api/spotify-search?q=${encodeURIComponent(movie.titulo_ingles || movie.titulo)}`,
      )
      const data = await res.json()
      const url = data.album?.embedUrl ?? null
      setAlbumCache((prev) => ({ ...prev, [movie.id]: url }))
      return url
    } catch {
      return null
    }
  }

  const handleExpand = async (movie: MovieMusic) => {
    if (expandedId === movie.id) {
      setExpandedId(null)
      setEmbedUrl(null)
      return
    }
    setPlayingInline(null)
    setExpandedId(movie.id)
    setLoadingEmbed(true)
    const url = await fetchAlbum(movie)
    setEmbedUrl(url)
    setLoadingEmbed(false)
  }

  const handleQuickPlay = async (e: React.MouseEvent, movie: MovieMusic) => {
    e.stopPropagation()
    if (playingInline === movie.id) {
      setPlayingInline(null)
      return
    }
    setExpandedId(null)
    setPlayingInline(movie.id)
    await fetchAlbum(movie)
  }

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Música & Soundtracks"
        subtitle="Escucha los soundtracks de las películas, directo desde Spotify."
      />

      {/* Search + filters */}
      <div className="mb-6 space-y-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar película o compositor..."
        />
        <FilterChips
          chips={GENRE_CHIPS}
          value={genreFilter}
          onChange={(v) => setGenreFilter(v as string)}
        />
      </div>

      {loading ? (
        <LoadingState text="Cargando soundtracks..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon.Music className="w-16 h-16" />}
          title="No se encontraron soundtracks"
          description="Prueba a cambiar la búsqueda o los filtros."
        />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 100).map((m) => {
            const isExpanded = expandedId === m.id
            const isPlaying = playingInline === m.id

            return (
              <div key={m.id}>
                <Card
                  padding="none"
                  className={`px-3 py-3 cursor-pointer transition-colors ${
                    isExpanded ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                  }`}
                  onClick={() => handleExpand(m)}
                >
                  <div className="flex items-center gap-3">
                    {/* Play button */}
                    <button
                      type="button"
                      aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                      onClick={(e) => handleQuickPlay(e, m)}
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        isPlaying
                          ? 'bg-yellow-400 text-zinc-950'
                          : 'bg-zinc-800 text-white hover:bg-yellow-400 hover:text-zinc-950'
                      }`}
                    >
                      {isPlaying ? (
                        <Icon.Pause className="w-4 h-4" />
                      ) : (
                        <Icon.Play className="w-4 h-4" filled />
                      )}
                    </button>

                    {/* Poster */}
                    <div className="relative w-14 h-20 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                      {m.poster_path && (
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt={m.titulo}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {m.logo_path ? (
                        <img
                          loading="lazy"
                          src={`https://image.tmdb.org/t/p/w200${m.logo_path}`}
                          alt={m.titulo_ingles || m.titulo}
                          className="h-6 w-auto max-w-[200px] object-contain"
                        />
                      ) : (
                        <p className="text-white text-sm font-semibold truncate">
                          {m.titulo_ingles || m.titulo}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                        {m.anio && <span className="tabular-nums">{m.anio}</span>}
                        {m.compositor && <span className="truncate">{m.compositor}</span>}
                      </div>
                    </div>

                    {/* IMDB rating */}
                    {m.nota_imdb && (
                      <span className="text-yellow-400 font-bold text-sm shrink-0 flex items-center gap-1 tabular-nums">
                        <Icon.Star className="w-3.5 h-3.5" filled />
                        {m.nota_imdb}
                      </span>
                    )}
                  </div>
                </Card>

                {/* Expanded: Spotify embed */}
                {isExpanded && (
                  <Card padding="sm" className="mt-1 mb-2">
                    {loadingEmbed ? (
                      <LoadingState text="Buscando en Spotify..." size="sm" />
                    ) : embedUrl ? (
                      <div className="rounded-xl overflow-hidden">
                        <iframe
                          src={embedUrl}
                          width="100%"
                          height="352"
                          frameBorder="0"
                          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                          loading="lazy"
                          className="rounded-xl"
                          title={`Soundtrack de ${m.titulo}`}
                        />
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm text-center py-4">
                        Soundtrack no encontrado en Spotify
                      </p>
                    )}
                    <Link
                      href={`/pelicula/${m.id}`}
                      className="inline-flex items-center gap-1 mt-3 text-xs text-yellow-400 hover:text-yellow-300 font-semibold transition-colors"
                    >
                      Ver ficha
                      <Icon.ArrowRight className="w-3 h-3" />
                    </Link>
                  </Card>
                )}

                {/* Inline mini player (quick play) */}
                {isPlaying && albumCache[m.id] && (
                  <div className="rounded-xl overflow-hidden mt-1 mb-2">
                    <iframe
                      src={albumCache[m.id]!}
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="rounded-xl"
                      title={`Reproductor de ${m.titulo}`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
