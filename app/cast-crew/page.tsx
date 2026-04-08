'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  PageShell,
  PageHeader,
  Tabs,
  SearchInput,
  PersonCard,
  Card,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import EnrichedDetails from '@/components/EnrichedDetails'
import { buildHaystack, tokenize, matchTokens } from '@/lib/smartSearch'

type PersonMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  anio: number | null
}

type Person = {
  name: string
  photo: string | null
  movieCount: number
  avgImdb: number
  score: number
  oscars: number
  type: 'actor' | 'director' | 'compositor'
  topMovies: PersonMovie[]
  haystack: string
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

export default function CastCrewPage() {
  const [tab, setTab] = useState<'actor' | 'director' | 'compositor'>('actor')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedMovies, setExpandedMovies] = useState<PersonMovie[]>([])
  const [expandedMovie, setExpandedMovie] = useState<string | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)
  const [searchCrew, setSearchCrew] = useState('')
  const [musicPlaying, setMusicPlaying] = useState<string | null>(null)
  const [musicUrls, setMusicUrls] = useState<Record<string, string | null>>({})

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      // Parallelize the two big fetches. Enriquecimiento now also pulls
      // generos / categoria / keywords so smart search can match them.
      const [allEnr, allPels] = await Promise.all([
        fetchAllPages<any>((from, to) =>
          supabase
            .from('enriquecimiento')
            .select('pelicula_id, director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, cast_json, generos, categoria, keywords')
            .range(from, to) as any,
        ),
        fetchAllPages<any>((from, to) =>
          supabase
            .from('peliculas')
            .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio')
            .range(from, to) as any,
        ),
      ])

      const enrMap: Record<string, any> = {}
      allEnr.forEach((e) => {
        enrMap[e.pelicula_id] = e
      })

      const pelMap: Record<string, any> = {}
      allPels.forEach((p) => {
        pelMap[p.id] = p
      })

      const actors: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}
      const directors: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}
      const composers: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}

      // First pass: collect all cast photos by name for cross-referencing
      const photoByName: Record<string, string> = {}
      for (const enr of allEnr) {
        if (enr.cast_json) {
          for (const c of enr.cast_json) {
            if (c.profile_path && !photoByName[c.name]) photoByName[c.name] = c.profile_path
          }
        }
      }

      for (const enr of allEnr) {
        if (enr.director) {
          if (!directors[enr.director])
            directors[enr.director] = { photo: photoByName[enr.director] ?? null, movies: [], oscars: enr.director_oscars ?? 0 }
          directors[enr.director].movies.push(enr.pelicula_id)
          if ((enr.director_oscars ?? 0) > directors[enr.director].oscars)
            directors[enr.director].oscars = enr.director_oscars
        }
        if (enr.compositor) {
          if (!composers[enr.compositor])
            composers[enr.compositor] = { photo: photoByName[enr.compositor] ?? null, movies: [], oscars: enr.compositor_oscars ?? 0 }
          composers[enr.compositor].movies.push(enr.pelicula_id)
          if ((enr.compositor_oscars ?? 0) > composers[enr.compositor].oscars)
            composers[enr.compositor].oscars = enr.compositor_oscars
        }
        if (enr.cast_json) {
          for (const c of enr.cast_json) {
            if (!actors[c.name]) {
              const personalOscars = enr.actores_oscars?.[c.name] ?? 0
              actors[c.name] = { photo: c.profile_path, movies: [], oscars: personalOscars }
            }
            actors[c.name].movies.push(enr.pelicula_id)
            if (!actors[c.name].photo && c.profile_path) actors[c.name].photo = c.profile_path
            const po = enr.actores_oscars?.[c.name] ?? 0
            if (po > actors[c.name].oscars) actors[c.name].oscars = po
          }
        }
      }

      const INVALID_NAMES = ['desconocido', 'unknown', 'n/a', 'no data', '', 'none', 'sin datos', 'sin información']
      const buildList = (
        map: Record<string, { movies: string[]; photo?: string | null; oscars: number }>,
        type: 'actor' | 'director' | 'compositor',
      ): Person[] => {
        return Object.entries(map)
          .filter(([name, v]) => v.movies.length >= 2 && !INVALID_NAMES.includes(name.toLowerCase().trim()))
          .map(([name, v]) => {
            const movieData = v.movies.map((id) => pelMap[id]).filter(Boolean)
            const scores = movieData.filter((m: any) => m.nota_imdb).map((m: any) => m.nota_imdb as number)
            const avgImdb = scores.length > 0 ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 : 0
            const oscarBoost = v.oscars > 0 ? 0.5 * v.oscars : 0
            const rankScore = avgImdb * Math.sqrt(v.movies.length) + oscarBoost
            const topMovies = movieData
              .filter((m: any) => m.poster_path)
              .sort((a: any, b: any) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
              .slice(0, 5)
              .map((m: any) => ({
                id: m.id,
                titulo: m.titulo,
                titulo_ingles: m.titulo_ingles,
                nota_imdb: m.nota_imdb,
                poster_path: m.poster_path,
                anio: m.anio,
              }))

            // Build a smart-search haystack: name + every movie's title +
            // collected genres/categorias/keywords from the person's films.
            const allGeneros = new Set<string>()
            const allKeywords = new Set<string>()
            const allCategorias = new Set<string>()
            const allTitles: string[] = []
            for (const id of v.movies) {
              const enr = enrMap[id]
              const pel = pelMap[id]
              if (pel) {
                allTitles.push(pel.titulo)
                if (pel.titulo_ingles) allTitles.push(pel.titulo_ingles)
              }
              if (enr) {
                ;(enr.generos ?? []).forEach((g: string) => allGeneros.add(g))
                ;(enr.keywords ?? []).forEach((k: string) => allKeywords.add(k))
                if (enr.categoria) allCategorias.add(enr.categoria)
              }
            }
            const haystack = buildHaystack([
              name,
              allTitles.slice(0, 60),
              Array.from(allGeneros),
              Array.from(allCategorias),
              Array.from(allKeywords).slice(0, 80),
            ])

            return {
              name,
              photo: (v as any).photo ?? null,
              movieCount: v.movies.length,
              avgImdb,
              score: rankScore,
              oscars: v.oscars,
              type,
              topMovies,
              haystack,
            }
          })
          .sort((a, b) => b.score - a.score)
      }

      setPeople([
        ...buildList(actors, 'actor'),
        ...buildList(directors, 'director'),
        ...buildList(composers, 'compositor'),
      ])
      setLoading(false)
    })()
  }, [])

  // Backfill missing TMDB photos for directors / composers in the background.
  // Actors usually have photos via cast_json — directors / composers don't.
  useEffect(() => {
    if (people.length === 0) return
    const missing = people
      .filter((p) => !p.photo && (p.type === 'director' || p.type === 'compositor'))
      .map((p) => p.name)
      .slice(0, 200)
    if (missing.length === 0) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/cast-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: missing }),
        })
        if (!res.ok) return
        const data = await res.json()
        const photos: Record<string, string | null> = data.photos ?? {}
        if (cancelled) return
        setPeople((prev) =>
          prev.map((p) => (p.photo || !(p.name in photos) ? p : { ...p, photo: photos[p.name] })),
        )
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [people])

  const filtered = useMemo(() => {
    const tokens = tokenize(searchCrew)
    let list = people.filter((p) => p.type === tab)
    if (tokens.length > 0) {
      list = list.filter((p) => matchTokens(p.haystack, tokens))
    }
    return list
  }, [people, tab, searchCrew])

  const linkBase = tab === 'actor' ? '/actor' : tab === 'director' ? '/director' : '/compositor'

  const handleExpand = async (person: Person) => {
    if (expanded === person.name) {
      setExpanded(null)
      setExpandedMovies([])
      setExpandedMovie(null)
      return
    }
    setExpanded(person.name)
    setExpandedMovie(null)
    setLoadingExpand(true)

    const enrField = tab === 'director' ? 'director' : tab === 'compositor' ? 'compositor' : null
    let movieIds: string[] = []
    if (enrField) {
      const { data } = await supabase
        .from('enriquecimiento')
        .select('pelicula_id')
        .eq(enrField, person.name)
      movieIds = (data ?? []).map((e: any) => e.pelicula_id)
    } else {
      // Actor — search cast_json
      const allEnr = await fetchAllPages<any>((from, to) =>
        supabase.from('enriquecimiento').select('pelicula_id, cast_json').range(from, to) as any,
      )
      movieIds = allEnr
        .filter((e) => e.cast_json?.some((c: any) => c.name === person.name))
        .map((e) => e.pelicula_id)
    }
    if (movieIds.length > 0) {
      const { data } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio')
        .in('id', movieIds.slice(0, 50))
      setExpandedMovies((data ?? []).sort((a: any, b: any) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0)))
    }
    setLoadingExpand(false)
  }

  const tabs = useMemo(
    () => [
      { key: 'actor', label: 'Actores' },
      { key: 'director', label: 'Directores' },
      { key: 'compositor', label: 'Compositores' },
    ],
    [],
  )

  const placeholderByTab =
    tab === 'actor'
      ? 'Buscar actor, película, género o keyword...'
      : tab === 'director'
      ? 'Buscar director, película, género o keyword...'
      : 'Buscar compositor, película, género o keyword...'

  return (
    <PageShell maxWidth="7xl">
      <PageHeader
        title="Cast & Crew"
        subtitle="Ranking por nota IMDb promedio × raíz de películas, con bonus por Óscares. Buscá por nombre, película, género o palabra clave."
      />

      <div className="mb-4">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(k) => {
            setTab(k as 'actor' | 'director' | 'compositor')
            setExpanded(null)
            setSearchCrew('')
          }}
        />
      </div>

      <div className="mb-6 max-w-md">
        <SearchInput value={searchCrew} onChange={setSearchCrew} placeholder={placeholderByTab} />
      </div>

      {loading ? (
        <LoadingState text="Cargando ranking..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon.Users className="w-16 h-16" />}
          title="No se encontraron resultados"
          description="Prueba a cambiar la búsqueda."
        />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 100).map((p, i) => {
            const isExpanded = expanded === p.name
            const avatarUrl = p.photo ? `https://image.tmdb.org/t/p/w185${p.photo}` : null
            return (
              <div key={p.name}>
                <PersonCard
                  person={{ name: p.name, avatar: avatarUrl }}
                  subtitle={`${p.movieCount} películas · IMDb ${p.avgImdb}`}
                  rank={i + 1}
                  expandable
                  expanded={isExpanded}
                  onClick={() => handleExpand(p)}
                  rightSlot={
                    <div className="flex items-center gap-3">
                      {p.oscars > 0 && (
                        <span className="hidden sm:flex items-center gap-1">
                          <img loading="lazy" src="/oscar.png" alt="Óscar" className="h-4 w-auto" />
                          <span className="text-yellow-400 text-xs font-bold tabular-nums">{p.oscars}</span>
                        </span>
                      )}
                      {/* Top movie posters preview - hidden on small screens */}
                      <div className="hidden md:flex gap-1.5">
                        {p.topMovies.slice(0, 5).map((m) => (
                          <div key={m.id} className="relative w-9 rounded-md overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                            {m.poster_path && (
                              <Image
                                src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                                alt={m.titulo}
                                fill
                                className="object-cover"
                                sizes="36px"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      <span className="hidden sm:inline text-yellow-400 font-bold text-sm tabular-nums">
                        {p.avgImdb}
                      </span>
                    </div>
                  }
                />

                {/* Expanded section */}
                {isExpanded && (
                  <Card padding="sm" className="mt-1 mb-2">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <Link
                        href={`${linkBase}/${encodeURIComponent(p.name)}`}
                        className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 font-semibold"
                      >
                        Ver ficha completa
                        <Icon.ArrowRight className="w-3 h-3" />
                      </Link>
                      <p className="text-zinc-500 text-xs">
                        {p.movieCount} películas · {p.avgImdb} promedio
                        {p.oscars > 0 ? ` · ${p.oscars} Óscar${p.oscars > 1 ? 'es' : ''}` : ''}
                      </p>
                    </div>

                    {loadingExpand ? (
                      <LoadingState text="Cargando filmografía..." size="sm" />
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                        {expandedMovies.map((m) => {
                          const isMovieExpanded = expandedMovie === m.id
                          return (
                            <div
                              key={m.id}
                              className={isMovieExpanded ? 'col-span-3 sm:col-span-5 md:col-span-6 lg:col-span-8' : ''}
                            >
                              {!isMovieExpanded ? (
                                <button
                                  type="button"
                                  className="cursor-pointer group block w-full text-left"
                                  onClick={async () => {
                                    if (tab === 'compositor' && musicPlaying !== m.id) {
                                      setMusicPlaying(m.id)
                                      setExpandedMovie(null)
                                      if (!musicUrls[m.id]) {
                                        try {
                                          const res = await fetch(
                                            `/api/spotify-search?q=${encodeURIComponent(m.titulo_ingles || m.titulo)}`,
                                          )
                                          const data = await res.json()
                                          setMusicUrls((prev) => ({
                                            ...prev,
                                            [m.id]: data.album?.embedUrl ?? null,
                                          }))
                                        } catch {}
                                      }
                                    } else {
                                      setMusicPlaying(null)
                                      setExpandedMovie(m.id)
                                    }
                                  }}
                                >
                                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 ring-1 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                                    {m.poster_path && (
                                      <Image
                                        src={`https://image.tmdb.org/t/p/w185${m.poster_path}`}
                                        alt={m.titulo_ingles || m.titulo}
                                        fill
                                        className="object-cover"
                                        sizes="120px"
                                      />
                                    )}
                                    {m.nota_imdb && (
                                      <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400 tabular-nums">
                                        {m.nota_imdb}
                                      </div>
                                    )}
                                    {tab === 'compositor' && musicPlaying === m.id && (
                                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <div className="w-9 h-9 rounded-full bg-yellow-400 text-zinc-950 flex items-center justify-center animate-pulse">
                                          <Icon.Music className="w-4 h-4" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2 mt-1.5">
                                    {m.titulo_ingles || m.titulo}
                                  </p>
                                  {tab === 'compositor' && musicPlaying === m.id && musicUrls[m.id] && (
                                    <div className="mt-2 rounded-xl overflow-hidden w-full">
                                      <iframe
                                        src={musicUrls[m.id]!}
                                        width="100%"
                                        height="152"
                                        frameBorder="0"
                                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                        loading="lazy"
                                        className="rounded-xl w-full"
                                        title={`Soundtrack de ${m.titulo}`}
                                      />
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <Card padding="sm" className="my-1 bg-zinc-800">
                                  <div className="flex items-start gap-3">
                                    {m.poster_path && (
                                      <div className="relative w-16 shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '2/3' }}>
                                        <Image
                                          src={`https://image.tmdb.org/t/p/w185${m.poster_path}`}
                                          alt={m.titulo}
                                          fill
                                          className="object-cover"
                                          sizes="64px"
                                        />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-white font-bold text-sm">
                                            {m.titulo_ingles || m.titulo}
                                          </p>
                                          {m.titulo_ingles && m.titulo !== m.titulo_ingles && (
                                            <p className="text-zinc-500 text-xs">{m.titulo}</p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                                            {m.anio && <span className="tabular-nums">{m.anio}</span>}
                                            {m.nota_imdb && (
                                              <span className="text-yellow-400 font-bold tabular-nums">
                                                {m.nota_imdb}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          aria-label="Cerrar detalle"
                                          onClick={() => setExpandedMovie(null)}
                                          className="text-zinc-500 hover:text-white transition-colors"
                                        >
                                          <Icon.Close className="w-4 h-4" />
                                        </button>
                                      </div>
                                      <EnrichedDetails peliculaId={m.id} />
                                      <Link
                                        href={`/pelicula/${m.id}`}
                                        className="inline-flex items-center gap-1 mt-2 text-xs text-yellow-400 hover:text-yellow-300 font-semibold"
                                      >
                                        Ver ficha
                                        <Icon.ArrowRight className="w-3 h-3" />
                                      </Link>
                                    </div>
                                  </div>
                                </Card>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
