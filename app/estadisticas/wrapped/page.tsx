'use client'

import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

/* ── Types ── */
type WatchedMovie = {
  pelicula_id: string
  rating: number | null
  pelicula: {
    titulo: string
    titulo_ingles: string | null
    anio: number | null
    nota_imdb: number | null
    runtime: number | null
    poster_path: string | null
    categoria: string | null
    enriquecimiento: {
      director: string | null
      generos: string[] | null
    } | null
  }
}

type WrappedStats = {
  totalMovies: number
  totalMinutes: number
  topGenres: [string, number][]
  favoriteGenre: string | null
  favoriteDirector: string | null
  directorCount: number
  favoritDecade: string | null
  avgImdb: number | null
  userAvgRating: number | null
  uniqueDirectors: number
  longestMovie: { titulo: string; runtime: number } | null
  highestRated: { titulo: string; nota_imdb: number } | null
  topRatedByUser: { titulo: string; rating: number } | null
  streakWeeks: number
}

/* ── Helpers ── */
function computeWrapped(movies: WatchedMovie[]): WrappedStats {
  const genreCount: Record<string, number> = {}
  const directorCount: Record<string, number> = {}
  const decadeCount: Record<string, number> = {}
  let totalMinutes = 0
  let totalImdb = 0, countImdb = 0
  let totalUserRating = 0, countUserRating = 0
  let longestMovie: { titulo: string; runtime: number } | null = null
  let highestRated: { titulo: string; nota_imdb: number } | null = null
  let topRatedByUser: { titulo: string; rating: number } | null = null

  movies.forEach(m => {
    const p = m.pelicula
    if (!p) return

    // Runtime
    if (p.runtime) {
      totalMinutes += p.runtime
      if (!longestMovie || p.runtime > longestMovie.runtime) {
        longestMovie = { titulo: p.titulo_ingles || p.titulo, runtime: p.runtime }
      }
    }

    // IMDB
    if (p.nota_imdb) {
      totalImdb += p.nota_imdb
      countImdb++
      if (!highestRated || p.nota_imdb > highestRated.nota_imdb) {
        highestRated = { titulo: p.titulo_ingles || p.titulo, nota_imdb: p.nota_imdb }
      }
    }

    // User rating
    if (m.rating) {
      totalUserRating += m.rating
      countUserRating++
      if (!topRatedByUser || m.rating > topRatedByUser.rating) {
        topRatedByUser = { titulo: p.titulo_ingles || p.titulo, rating: m.rating }
      }
    }

    // Genres
    const generos = p.enriquecimiento?.generos ?? []
    generos.forEach(g => { genreCount[g] = (genreCount[g] ?? 0) + 1 })

    // Director
    const dir = p.enriquecimiento?.director
    if (dir) directorCount[dir] = (directorCount[dir] ?? 0) + 1

    // Decade
    if (p.anio) {
      const decade = `${Math.floor(p.anio / 10) * 10}s`
      decadeCount[decade] = (decadeCount[decade] ?? 0) + 1
    }
  })

  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topDirector = Object.entries(directorCount).sort((a, b) => b[1] - a[1])[0]
  const topDecade = Object.entries(decadeCount).sort((a, b) => b[1] - a[1])[0]

  return {
    totalMovies: movies.length,
    totalMinutes,
    topGenres,
    favoriteGenre: topGenres[0]?.[0] ?? null,
    favoriteDirector: topDirector?.[0] ?? null,
    directorCount: topDirector?.[1] ?? 0,
    favoritDecade: topDecade?.[0] ?? null,
    avgImdb: countImdb > 0 ? Math.round((totalImdb / countImdb) * 10) / 10 : null,
    userAvgRating: countUserRating > 0 ? Math.round((totalUserRating / countUserRating) * 10) / 10 : null,
    uniqueDirectors: Object.keys(directorCount).length,
    longestMovie,
    highestRated,
    topRatedByUser,
    streakWeeks: 0, // computed separately if created_at available
  }
}

/* ── Animated number ── */
function AnimatedNumber({ value, decimals = 0, duration = 1200 }: { value: number; decimals?: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0
    const increment = value / (duration / 16)
    const timer = setInterval(() => {
      start += increment
      if (start >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(start)
    }, 16)
    return () => clearInterval(timer)
  }, [value, duration])
  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>
}

/* ── Section wrapper with fade-in ── */
function Section({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    >
      {children}
    </div>
  )
}

/* ── Genre bar ── */
function GenreBar({ genre, count, max, index }: { genre: string; count: number; max: number; index: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const colors = [
    'from-amber-500 to-yellow-400',
    'from-amber-600 to-amber-400',
    'from-yellow-600 to-yellow-500',
    'from-amber-700 to-amber-500',
    'from-yellow-700 to-yellow-600',
  ]
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-sm w-28 text-right truncate">{genre}</span>
      <div className="flex-1 h-7 bg-zinc-800/60 rounded-lg overflow-hidden relative">
        <div
          className={`h-full bg-gradient-to-r ${colors[index % colors.length]} rounded-lg transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-300">
          {count} {count === 1 ? 'peli' : 'pelis'}
        </span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════ */
/* ══  MAIN PAGE COMPONENT             ══ */
/* ══════════════════════════════════════ */

export default function WrappedPage() {
  const { user, username, loading } = useAuth()
  const [stats, setStats] = useState<WrappedStats | null>(null)
  const [cargando, setCargando] = useState(true)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!user) { setCargando(false); return }

    supabase
      .from('user_peliculas')
      .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, runtime, poster_path, categoria, enriquecimiento(director, generos))')
      .eq('user_id', user.id)
      .eq('visto', true)
      .then(({ data }) => {
        if (!data || data.length === 0) { setCargando(false); return }
        const mapped: WatchedMovie[] = (data as any[])
          .filter((r: any) => r.peliculas)
          .map((r: any) => ({
            pelicula_id: r.pelicula_id,
            rating: r.rating,
            pelicula: r.peliculas,
          }))
        setStats(computeWrapped(mapped))
        setCargando(false)
      })
  }, [user])

  // Reveal animation trigger
  useEffect(() => {
    if (stats && !cargando) {
      const t = setTimeout(() => setRevealed(true), 200)
      return () => clearTimeout(t)
    }
  }, [stats, cargando])

  const handleShare = async () => {
    const text = stats
      ? `Mi CineBret Wrapped:\n${stats.totalMovies} peliculas vistas\n${Math.round(stats.totalMinutes / 60)} horas de cine\nGenero favorito: ${stats.favoriteGenre ?? '?'}\nDirector favorito: ${stats.favoriteDirector ?? '?'}\n\nDescubre tu wrapped en cinebret.com/estadisticas/wrapped`
      : ''
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mi CineBret Wrapped', text })
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      alert('Copiado al portapapeles')
    }
  }

  /* ── Loading state ── */
  if (loading || cargando) return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">Preparando tu Wrapped...</p>
        </div>
      </div>
    </main>
  )

  /* ── Not logged in ── */
  if (!user) return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="mb-6"><svg className="w-16 h-16 mx-auto text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
          <h1 className="text-2xl font-bold text-white mb-3">Tu Wrapped te espera</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Inicia sesion para descubrir tus estadisticas de cine personalizadas.
          </p>
          <Link
            href="/catalogo"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Ir al catalogo
          </Link>
        </div>
      </div>
    </main>
  )

  /* ── No movies watched ── */
  if (!stats || stats.totalMovies === 0) return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="mb-6"><svg className="w-16 h-16 mx-auto text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
          <h1 className="text-2xl font-bold text-white mb-3">Aun no hay datos</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Marca peliculas como vistas en el catalogo para desbloquear tu Wrapped.
          </p>
          <Link
            href="/catalogo"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Explorar catalogo
          </Link>
        </div>
      </div>
    </main>
  )

  const hours = Math.floor(stats.totalMinutes / 60)
  const mins = stats.totalMinutes % 60

  /* ── Main wrapped ── */
  return (
    <main className="min-h-screen bg-zinc-950 overflow-hidden">
      <Nav />

      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-4 py-8 pb-24 space-y-6">

        {/* ── Header ── */}
        <Section delay={0}>
          <div className="text-center pt-4 pb-2">
            <p className="text-amber-500 text-xs font-bold uppercase tracking-[0.3em] mb-3">CineBret Wrapped</p>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
              Tu cine en<br />
              <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
                numeros
              </span>
            </h1>
            {username && (
              <p className="text-zinc-500 text-sm mt-3">@{username}</p>
            )}
          </div>
        </Section>

        {/* ── Total movies - Hero card ── */}
        <Section delay={200}>
          <div className="relative bg-gradient-to-br from-amber-500/10 via-zinc-900 to-zinc-900 border border-amber-500/20 rounded-2xl p-8 text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,160,23,0.15),transparent_70%)]" />
            <div className="relative">
              <p className="text-amber-500/80 text-xs font-bold uppercase tracking-[0.2em] mb-2">Peliculas vistas</p>
              <p className="text-7xl sm:text-8xl font-black text-white leading-none mb-2">
                {revealed ? <AnimatedNumber value={stats.totalMovies} duration={1500} /> : 0}
              </p>
              <p className="text-zinc-500 text-sm">
                {stats.totalMovies >= 100 ? 'Nivel: Cinefilo profesional' :
                 stats.totalMovies >= 50 ? 'Nivel: Cinefilo dedicado' :
                 stats.totalMovies >= 20 ? 'Nivel: Cinefilo en ascenso' :
                 'Nivel: Explorando el cine'}
              </p>
            </div>
          </div>
        </Section>

        {/* ── Hours watched ── */}
        <Section delay={400}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-3">Tiempo total frente a la pantalla</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl sm:text-6xl font-black text-white">
                {revealed ? <AnimatedNumber value={hours} duration={1400} /> : 0}
              </span>
              <span className="text-zinc-500 text-lg font-medium">hrs</span>
              <span className="text-3xl font-bold text-zinc-400">
                {revealed ? <AnimatedNumber value={mins} duration={1000} /> : 0}
              </span>
              <span className="text-zinc-600 text-lg">min</span>
            </div>
            <p className="text-zinc-600 text-xs mt-3">
              {hours >= 100 ? 'Eso es mas de 4 dias seguidos de cine puro.' :
               hours >= 48 ? 'Casi dos dias completos de cine sin parar.' :
               hours >= 24 ? 'Un dia entero viviendo en mundos de ficcion.' :
               'Cada minuto cuenta.'}
            </p>
          </div>
        </Section>

        {/* ── Favorite genre + breakdown ── */}
        <Section delay={600}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {stats.favoriteGenre && (
              <div className="text-center mb-6">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-2">Tu genero favorito</p>
                <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                  {stats.favoriteGenre}
                </p>
              </div>
            )}
            {stats.topGenres.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-zinc-600 text-xs font-semibold uppercase tracking-wide mb-3">Top 5 generos</p>
                {stats.topGenres.map(([genre, count], i) => (
                  <GenreBar key={genre} genre={genre} count={count} max={stats.topGenres[0][1]} index={i} />
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── Favorite director ── */}
        {stats.favoriteDirector && (
          <Section delay={800}>
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 rounded-2xl p-6 text-center">
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-2">Director favorito</p>
              <p className="text-2xl sm:text-3xl font-bold text-white mb-1">{stats.favoriteDirector}</p>
              <p className="text-amber-500 text-sm font-medium">
                {stats.directorCount} {stats.directorCount === 1 ? 'pelicula vista' : 'peliculas vistas'}
              </p>
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <p className="text-zinc-600 text-xs">
                  Exploraste <span className="text-zinc-400 font-semibold">{stats.uniqueDirectors}</span> directores distintos
                </p>
              </div>
            </div>
          </Section>
        )}

        {/* ── Decade preference ── */}
        {stats.favoritDecade && (
          <Section delay={1000}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-2">Tu decada favorita</p>
              <p className="text-5xl sm:text-6xl font-black text-white">{stats.favoritDecade}</p>
              <p className="text-zinc-600 text-xs mt-2">
                {stats.favoritDecade === '2020s' ? 'Te gusta lo fresco y actual.' :
                 stats.favoritDecade === '2010s' ? 'La era dorada del streaming.' :
                 stats.favoritDecade === '2000s' ? 'Nostalgia milenial en su maxima expresion.' :
                 stats.favoritDecade === '1990s' ? 'Clasicos noventeros. Buen gusto.' :
                 stats.favoritDecade === '1980s' ? 'La era de Spielberg y los blockbusters.' :
                 'Un viajero del tiempo cinematografico.'}
              </p>
            </div>
          </Section>
        )}

        {/* ── Rating comparison ── */}
        <Section delay={1200}>
          <div className="grid grid-cols-2 gap-4">
            {/* User avg */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] mb-2">Tu promedio</p>
              <p className="text-4xl font-black text-amber-400">
                {stats.userAvgRating !== null ? stats.userAvgRating : '--'}
              </p>
              <p className="text-zinc-600 text-xs mt-1">rating personal</p>
            </div>
            {/* IMDB avg */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center">
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] mb-2">IMDB promedio</p>
              <p className="text-4xl font-black text-yellow-500">
                {stats.avgImdb !== null ? stats.avgImdb : '--'}
              </p>
              <p className="text-zinc-600 text-xs mt-1">de lo que ves</p>
            </div>
          </div>
          {stats.userAvgRating !== null && stats.avgImdb !== null && (
            <div className="mt-3 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center">
              <p className="text-zinc-400 text-sm">
                {stats.userAvgRating > stats.avgImdb + 0.5
                  ? <>Eres <span className="text-amber-400 font-bold">mas generoso</span> que IMDB. Disfrutas lo que ves.</>
                  : stats.userAvgRating < stats.avgImdb - 0.5
                  ? <>Eres <span className="text-blue-400 font-bold">mas exigente</span> que IMDB. Tienes estandares altos.</>
                  : <>Tu criterio esta <span className="text-emerald-400 font-bold">alineado</span> con IMDB. Buen ojo.</>
                }
              </p>
            </div>
          )}
        </Section>

        {/* ── Notable movies ── */}
        <Section delay={1400}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.longestMovie && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] mb-2">Pelicula mas larga</p>
                <p className="text-white font-bold text-lg leading-snug">{stats.longestMovie.titulo}</p>
                <p className="text-amber-500 text-sm mt-1">
                  {Math.floor(stats.longestMovie.runtime / 60)}h {stats.longestMovie.runtime % 60}min
                </p>
              </div>
            )}
            {stats.highestRated && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] mb-2">Mejor nota IMDB vista</p>
                <p className="text-white font-bold text-lg leading-snug">{stats.highestRated.titulo}</p>
                <p className="text-yellow-400 text-sm mt-1">{stats.highestRated.nota_imdb} / 10</p>
              </div>
            )}
            {stats.topRatedByUser && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:col-span-2">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.15em] mb-2">Tu pelicula mejor calificada</p>
                <p className="text-white font-bold text-lg leading-snug">{stats.topRatedByUser.titulo}</p>
                <p className="text-amber-400 text-sm mt-1">{stats.topRatedByUser.rating} / 10</p>
              </div>
            )}
          </div>
        </Section>

        {/* ── Share button ── */}
        <Section delay={1600}>
          <div className="text-center pt-4">
            <button
              onClick={handleShare}
              className="group relative inline-flex items-center gap-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 font-bold px-8 py-4 rounded-2xl text-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(212,160,23,0.3)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M15.75 4.5a3.75 3.75 0 11-3 6 3.75 3.75 0 013-6zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                <path fillRule="evenodd" d="M18.97 3.659a2.25 2.25 0 00-3.182 0l-10.94 10.94a3.75 3.75 0 105.304 5.303l7.693-7.693a.75.75 0 011.06 1.06l-7.693 7.693a5.25 5.25 0 11-7.424-7.424l10.939-10.94a3.75 3.75 0 115.303 5.304L9.097 18.835l-.008.008-.007.007-.002.002-.003.002A2.25 2.25 0 015.91 15.66l7.81-7.81a.75.75 0 011.061 1.06l-7.81 7.81a.75.75 0 001.054 1.068L18.97 6.84a2.25 2.25 0 000-3.182z" clipRule="evenodd" />
              </svg>
              Compartir mi Wrapped
            </button>
            <p className="text-zinc-600 text-xs mt-3">Comparte tus stats con tus amigos</p>
          </div>
        </Section>

        {/* ── Footer link ── */}
        <Section delay={1800}>
          <div className="text-center pt-4 pb-8">
            <Link
              href="/perfil"
              className="text-zinc-500 hover:text-amber-400 text-sm transition-colors"
            >
              Volver a mi perfil
            </Link>
          </div>
        </Section>

      </div>
    </main>
  )
}
