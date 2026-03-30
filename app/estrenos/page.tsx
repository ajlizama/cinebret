'use client'

import { useState, useEffect } from 'react'
import Nav from '@/components/Nav'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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

const CINEMA_ICON = (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h2v2H4V5zm4 0h4v2H8V5zm6 0h2v2h-2V5zM4 9h2v2H4V9zm4 0h4v2H8V9zm6 0h2v2h-2V9zM4 13h2v2H4v-2zm4 0h4v2H8v-2zm6 0h2v2h-2v-2z"/>
  </svg>
)

function StatusBadge({ status }: { status: Movie['status'] }) {
  switch (status) {
    case 'en_cines':
      return (
        <span className="bg-amber-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
          {CINEMA_ICON} En cines
        </span>
      )
    case 'proximamente_cine':
      return (
        <span className="bg-red-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
          {CINEMA_ICON} Pronto en cines
        </span>
      )
    case 'en_streaming':
      return (
        <span className="bg-blue-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
          En streaming
        </span>
      )
    case 'proximamente_streaming':
      return (
        <span className="bg-indigo-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
          Pronto en streaming
        </span>
      )
    case 'proximamente':
      return (
        <span className="bg-zinc-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
          Proximamente
        </span>
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

  const filteredMovies = movies.filter(m => {
    if (filter === 'todos') return true
    if (filter === 'en_cines') return m.status === 'en_cines'
    if (filter === 'proximamente') return m.status === 'proximamente_cine' || m.status === 'proximamente_streaming' || m.status === 'proximamente'
    if (filter === 'streaming') return m.status === 'en_streaming' || m.status === 'proximamente_streaming'
    return true
  })

  const monthGroups = groupByMonth(filteredMovies)

  const enCinesCount = movies.filter(m => m.status === 'en_cines').length
  const proximamenteCount = movies.filter(m => m.status.startsWith('proximamente')).length
  const streamingCount = movies.filter(m => m.status === 'en_streaming' || m.status === 'proximamente_streaming').length

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Calendario de Estrenos
          </h1>
          <p className="text-zinc-400 mt-2 text-sm md:text-base">
            Cine y streaming en Chile
          </p>
        </div>

        {/* Filter tabs */}
        {!loading && !error && movies.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {([
              { key: 'todos' as Filter, label: `Todos (${movies.length})`, color: 'amber' },
              { key: 'en_cines' as Filter, label: `En cines (${enCinesCount})`, color: 'amber' },
              { key: 'proximamente' as Filter, label: `Proximamente (${proximamenteCount})`, color: 'red' },
              { key: 'streaming' as Filter, label: `Streaming (${streamingCount})`, color: 'blue' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === tab.key
                    ? `bg-${tab.color}-500/20 text-${tab.color}-400 border border-${tab.color}-500/30`
                    : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Cargando estrenos...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-20"><p className="text-red-400">{error}</p></div>
        )}

        {!loading && !error && filteredMovies.length === 0 && (
          <div className="text-center py-20"><p className="text-zinc-500">No se encontraron estrenos.</p></div>
        )}

        {!loading && !error && monthGroups.map((group, gi) => (
          <section key={group.key} className={gi > 0 ? 'mt-12' : ''}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-amber-500 rounded-full" />
              <h2 className="text-xl md:text-2xl font-bold text-white">{group.label}</h2>
              <span className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                {group.movies.length} {group.movies.length === 1 ? 'titulo' : 'titulos'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {group.movies.map((movie) => {
                const isReminded = reminders.has(movie.id)
                const CardWrapper = movie.peliculaId
                  ? ({ children, className }: { children: React.ReactNode; className: string }) => (
                      <Link href={`/pelicula/${movie.peliculaId}`} className={className}>{children}</Link>
                    )
                  : ({ children, className }: { children: React.ReactNode; className: string }) => (
                      <div className={className}>{children}</div>
                    )

                return (
                  <div key={movie.id} className="group bg-zinc-900/60 border border-zinc-800/50 rounded-xl overflow-hidden hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
                    {/* Poster - clickable if we have the movie in our DB */}
                    <CardWrapper className="block relative aspect-[2/3] bg-zinc-800 overflow-hidden cursor-pointer">
                      {movie.poster_path && (
                        <Image
                          src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                          alt={movie.original_title || movie.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        />
                      )}

                      {/* Date badge */}
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-md">
                        {formatDate(movie.release_date)}
                      </div>

                      {/* Rating - only if meaningful */}
                      {movie.vote_average && movie.vote_average > 0 && (
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-amber-400 text-[10px] font-bold px-1.5 py-1 rounded-md flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {movie.vote_average.toFixed(1)}
                        </div>
                      )}

                      {/* Status badge */}
                      <div className="absolute bottom-2 left-2">
                        <StatusBadge status={movie.status} />
                      </div>
                    </CardWrapper>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2 mb-1">
                        {movie.original_title || movie.title}
                      </h3>
                      {movie.original_title && movie.original_title !== movie.title && (
                        <p className="text-[11px] text-zinc-500 leading-tight line-clamp-1 mb-1.5 italic">
                          {movie.title}
                        </p>
                      )}

                      {movie.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {movie.genres.slice(0, 3).map(g => (
                            <span key={g} className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{g}</span>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={(e) => { e.preventDefault(); toggleReminder(movie.id) }}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all duration-200 ${
                          isReminded
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill={isReminded ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        {isReminded ? 'Recordatorio activo' : 'Recordarme'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
