'use client'

import { useState, useEffect } from 'react'
import Nav from '@/components/Nav'
import Image from 'next/image'

type Movie = {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  release_date: string
  vote_average: number
  genres: string[]
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
    const [year, month] = movie.release_date.split('-')
    const key = `${year}-${month}`
    if (!groups[key]) {
      groups[key] = []
      order.push(key)
    }
    groups[key].push(movie)
  }

  return order.map(key => {
    const [year, month] = key.split('-')
    const label = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`
    return { label, key, movies: groups[key] }
  })
}

export default function EstRenosPage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reminders, setReminders] = useState<Set<number>>(new Set())

  // Load reminders from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cinebret-estrenos-reminders')
      if (saved) setReminders(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  // Fetch movies
  useEffect(() => {
    fetch('/api/estrenos')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setMovies(data.movies ?? [])
        }
      })
      .catch(() => setError('No se pudieron cargar los estrenos'))
      .finally(() => setLoading(false))
  }, [])

  const toggleReminder = (movieId: number) => {
    setReminders(prev => {
      const next = new Set(prev)
      if (next.has(movieId)) {
        next.delete(movieId)
      } else {
        next.add(movieId)
      }
      try {
        localStorage.setItem('cinebret-estrenos-reminders', JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  const monthGroups = groupByMonth(movies)

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Calendario de Estrenos
          </h1>
          <p className="text-zinc-400 mt-2 text-sm md:text-base">
            Proximamente en streaming y cines en Chile
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Cargando estrenos...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-20">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && movies.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500">No se encontraron estrenos proximamente.</p>
          </div>
        )}

        {/* Month sections */}
        {!loading && !error && monthGroups.map((group, gi) => (
          <section key={group.key} className={gi > 0 ? 'mt-12' : ''}>
            {/* Month header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-8 bg-amber-500 rounded-full" />
              <h2 className="text-xl md:text-2xl font-bold text-white">
                {group.label}
              </h2>
              <span className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                {group.movies.length} {group.movies.length === 1 ? 'titulo' : 'titulos'}
              </span>
            </div>

            {/* Movie grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {group.movies.map((movie) => {
                const isReminded = reminders.has(movie.id)
                return (
                  <div
                    key={movie.id}
                    className="group bg-zinc-900/60 border border-zinc-800/50 rounded-xl overflow-hidden hover:border-zinc-700 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
                  >
                    {/* Poster */}
                    <div className="relative aspect-[2/3] bg-zinc-800 overflow-hidden">
                      {movie.poster_path ? (
                        <Image
                          src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                          alt={movie.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                          <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                      )}

                      {/* Release date badge */}
                      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-md">
                        {formatDate(movie.release_date)}
                      </div>

                      {/* Rating badge */}
                      {movie.vote_average > 0 && (
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-amber-400 text-[10px] font-bold px-1.5 py-1 rounded-md flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {movie.vote_average.toFixed(1)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2 mb-1.5">
                        {movie.title}
                      </h3>

                      {movie.original_title !== movie.title && (
                        <p className="text-[11px] text-zinc-500 leading-tight line-clamp-1 mb-1.5 italic">
                          {movie.original_title}
                        </p>
                      )}

                      {/* Genres */}
                      {movie.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {movie.genres.slice(0, 3).map(g => (
                            <span
                              key={g}
                              className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Reminder button */}
                      <button
                        onClick={() => toggleReminder(movie.id)}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all duration-200 ${
                          isReminded
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill={isReminded ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth={1.8}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                          />
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
