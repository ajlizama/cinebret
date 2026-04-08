'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  PageShell,
  PageHeader,
  Section,
  FilterChips,
  Pill,
  IconButton,
  LoadingState,
  EmptyState,
  ErrorState,
  Icon,
} from '@/components/ui'

type Movie = {
  id: number
  title: string
  original_title: string
  poster_path: string | null
  release_date: string
  vote_average: number | null
  genres: string[]
  status: 'en_cines' | 'proximamente_cine' | 'en_streaming' | 'proximamente_streaming' | 'proximamente'
  medio: 'cine' | 'streaming' | 'ambos'
  // local: linked pelicula id if exists in our DB
  peliculaId?: string
}

type MonthGroup = {
  label: string
  key: string
  movies: Movie[]
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  const d = parseInt(day, 10)
  const m = MONTH_NAMES[parseInt(month, 10) - 1]?.toLowerCase() ?? ''
  return `${d} de ${m}`
}

function groupByMonth(movies: Movie[]): MonthGroup[] {
  const groups: Record<string, Movie[]> = {}
  const order: string[] = []
  for (const movie of movies) {
    if (!movie.release_date) continue
    const [year, month] = movie.release_date.split('-')
    const key = `${year}-${month}`
    if (!groups[key]) { groups[key] = []; order.push(key) }
    groups[key].push(movie)
  }
  return order.map(key => {
    const [year, month] = key.split('-')
    return { label: `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`, key, movies: groups[key] }
  })
}

function StatusBadge({ status }: { status: Movie['status'] }) {
  switch (status) {
    case 'en_cines':
      return (
        <Pill variant="gold" icon={<Icon.Film className="w-3 h-3" />}>
          En cines
        </Pill>
      )
    case 'proximamente_cine':
      return (
        <Pill variant="gold" icon={<Icon.Film className="w-3 h-3" />}>
          Pronto en cines
        </Pill>
      )
    case 'en_streaming':
      return (
        <Pill variant="gold" icon={<Icon.Tv className="w-3 h-3" />}>
          En streaming
        </Pill>
      )
    case 'proximamente_streaming':
      return (
        <Pill variant="gold" icon={<Icon.Tv className="w-3 h-3" />}>
          Pronto en streaming
        </Pill>
      )
    case 'proximamente':
      return (
        <Pill variant="gold" icon={<Icon.Calendar className="w-3 h-3" />}>
          Próximamente
        </Pill>
      )
    default:
      return null
  }
}

type Filter = 'todos' | 'en_cines' | 'proximamente' | 'streaming'

export default function EstRenosPage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reminders, setReminders] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<Filter>('todos')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cinebret-estrenos-reminders')
      if (saved) setReminders(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/estrenos')
        const data = await res.json()
        if (data.error) { setError(data.error); return }

        const apiMovies: Movie[] = data.movies ?? []

        // Try to link TMDB ids to our peliculas DB for click-through
        const tmdbIds = apiMovies.map(m => m.id)
        if (tmdbIds.length > 0) {
          const { data: peliculas } = await supabase
            .from('peliculas')
            .select('id, tmdb_id')
            .in('tmdb_id', tmdbIds)
          if (peliculas) {
            const tmdbMap = new Map(peliculas.map(p => [p.tmdb_id, p.id]))
            apiMovies.forEach(m => {
              const pid = tmdbMap.get(m.id)
              if (pid) m.peliculaId = pid
            })
          }
        }

        setMovies(apiMovies)
      } catch {
        setError('No se pudieron cargar los estrenos')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const toggleReminder = (movieId: number) => {
    setReminders(prev => {
      const next = new Set(prev)
      if (next.has(movieId)) next.delete(movieId)
      else next.add(movieId)
      try { localStorage.setItem('cinebret-estrenos-reminders', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const filteredMovies = useMemo(() => movies.filter(m => {
    if (filter === 'todos') return true
    if (filter === 'en_cines') return m.status === 'en_cines'
    if (filter === 'proximamente') return m.status === 'proximamente_cine' || m.status === 'proximamente_streaming' || m.status === 'proximamente'
    if (filter === 'streaming') return m.status === 'en_streaming' || m.status === 'proximamente_streaming'
    return true
  }), [movies, filter])

  const monthGroups = useMemo(() => groupByMonth(filteredMovies), [filteredMovies])

  const counts = useMemo(() => ({
    todos: movies.length,
    enCines: movies.filter(m => m.status === 'en_cines').length,
    proximamente: movies.filter(m => m.status.startsWith('proximamente')).length,
    streaming: movies.filter(m => m.status === 'en_streaming' || m.status === 'proximamente_streaming').length,
  }), [movies])

  const chips = [
    { key: 'todos', label: 'Todos', count: counts.todos },
    { key: 'en_cines', label: 'En cines', count: counts.enCines },
    { key: 'proximamente', label: 'Próximamente', count: counts.proximamente },
    { key: 'streaming', label: 'Streaming', count: counts.streaming },
  ]

  return (
    <PageShell maxWidth="7xl">
      <PageHeader
        title="Calendario de estrenos"
        subtitle="Cine y streaming en Chile."
        icon={<Icon.Calendar className="w-7 h-7" />}
      />

      {!loading && !error && movies.length > 0 && (
        <div className="mb-8">
          <FilterChips
            chips={chips}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
          />
        </div>
      )}

      {loading && <LoadingState text="Cargando estrenos..." size="lg" />}

      {error && !loading && (
        <ErrorState
          title="No se pudieron cargar los estrenos"
          description={error}
        />
      )}

      {!loading && !error && filteredMovies.length === 0 && (
        <EmptyState
          icon={<Icon.Calendar className="w-16 h-16" />}
          title="No hay estrenos"
          description="No se encontraron estrenos para este filtro."
        />
      )}

      {!loading && !error && monthGroups.map((group) => (
        <Section
          key={group.key}
          label={group.label}
          count={group.movies.length}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {group.movies.map((movie) => {
              const isReminded = reminders.has(movie.id)
              const title = movie.original_title || movie.title

              const Poster = (
                <div className="block relative aspect-[2/3] bg-zinc-800 overflow-hidden rounded-t-2xl">
                  {movie.poster_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    />
                  )}

                  {/* Date badge */}
                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-md">
                    {formatDate(movie.release_date)}
                  </div>

                  {/* Rating */}
                  {movie.vote_average && movie.vote_average > 0 && (
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-yellow-400 text-[10px] font-bold px-1.5 py-1 rounded-md inline-flex items-center gap-0.5">
                      <Icon.Star filled className="w-2.5 h-2.5" />
                      {movie.vote_average.toFixed(1)}
                    </div>
                  )}

                  {/* Status badge */}
                  <div className="absolute bottom-2 left-2">
                    <StatusBadge status={movie.status} />
                  </div>
                </div>
              )

              return (
                <div
                  key={movie.id}
                  className="group bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800/50 hover:border-yellow-400/30 transition-colors flex flex-col"
                >
                  {movie.peliculaId ? (
                    <Link href={`/pelicula/${movie.peliculaId}`} className="block">
                      {Poster}
                    </Link>
                  ) : (
                    Poster
                  )}

                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2 mb-1">
                      {title}
                    </h3>
                    {movie.original_title && movie.original_title !== movie.title && (
                      <p className="text-[11px] text-zinc-500 leading-tight line-clamp-1 mb-1.5 italic">
                        {movie.title}
                      </p>
                    )}

                    {movie.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {movie.genres.slice(0, 3).map(g => (
                          <Pill key={g} variant="default" size="sm">{g}</Pill>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-end">
                      <IconButton
                        icon={<Icon.Bookmark filled={isReminded} className="w-5 h-5" />}
                        label={isReminded ? 'Quitar recordatorio' : 'Recordarme este estreno'}
                        variant="ghost"
                        active={isReminded}
                        onClick={(e) => { e.preventDefault(); toggleReminder(movie.id) }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      ))}
    </PageShell>
  )
}
