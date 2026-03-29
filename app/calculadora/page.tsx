'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Loading from '@/components/Loading'

const PLATAFORMAS = [
  { id: 'netflix',         nombre: 'Netflix',      logo: '/netflix.png' },
  { id: 'disney_plus',    nombre: 'Disney+',      logo: '/disney_plus.svg' },
  { id: 'hbo_max',        nombre: 'Max',           logo: '/hbo_max.png' },
  { id: 'amazon_prime',   nombre: 'Prime Video',   logo: '/amazon_prime.png' },
  { id: 'apple_tv',       nombre: 'Apple TV+',     logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+',    logo: '/paramount_plus.svg' },
  { id: 'mubi',            nombre: 'MUBI',          logo: '/mubi.png' },
]

type PlatformResult = {
  id: string
  nombre: string
  logo: string
  watchlistCount: number
  totalMovies: number
  matchScore: number
  recommendation: string
}

function getRecommendation(score: number): string {
  if (score >= 70) return 'Altamente recomendada'
  if (score >= 40) return 'Buena opcion'
  return 'Podrias prescindir'
}

function getRecommendationColor(rec: string): string {
  if (rec === 'Altamente recomendada') return 'text-yellow-400'
  if (rec === 'Buena opcion') return 'text-emerald-400'
  return 'text-zinc-500'
}

function getBarColor(rec: string): string {
  if (rec === 'Altamente recomendada') return 'bg-yellow-400'
  if (rec === 'Buena opcion') return 'bg-emerald-500'
  return 'bg-zinc-600'
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
    results.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

export default function CalculadoraPage() {
  const { user, loading: authLoading } = useAuth()
  const [results, setResults] = useState<PlatformResult[]>([])
  const [loading, setLoading] = useState(true)
  const [watchlistTotal, setWatchlistTotal] = useState(0)
  const [userGenres, setUserGenres] = useState<Record<string, number>>({})

  useEffect(() => {
    loadData()
  }, [user, authLoading])

  async function loadData() {
    setLoading(true)

    // Get latest catalog date
    const { data: fechaRow } = await supabase
      .from('catalogos')
      .select('fecha')
      .eq('activo', true)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    const fechaCatalogo = (fechaRow as any)?.fecha ?? new Date().toISOString().split('T')[0]

    // Fetch all active catalog entries for this date (paginated to avoid 1000-row default limit)
    const allCats = await fetchAllPages<{ pelicula_id: string; plataforma: string }>((from, to) =>
      supabase
        .from('catalogos')
        .select('pelicula_id, plataforma')
        .eq('fecha', fechaCatalogo)
        .eq('activo', true)
        .range(from, to)
    )

    // Build platform -> set of pelicula_ids
    const platMovies: Record<string, Set<string>> = {}
    PLATAFORMAS.forEach(p => { platMovies[p.id] = new Set() })
    allCats.forEach((c: any) => {
      if (platMovies[c.plataforma]) {
        platMovies[c.plataforma].add(c.pelicula_id)
      }
    })

    if (!user) {
      // Non-logged-in: just show total movies per platform
      const platformResults: PlatformResult[] = PLATAFORMAS.map(p => ({
        id: p.id,
        nombre: p.nombre,
        logo: p.logo,
        watchlistCount: 0,
        totalMovies: platMovies[p.id].size,
        matchScore: 0,
        recommendation: '',
      })).sort((a, b) => b.totalMovies - a.totalMovies)

      setResults(platformResults)
      setLoading(false)
      return
    }

    // Logged-in user: fetch watchlist + watched movies with genres
    const { data: userRows } = await supabase
      .from('user_peliculas')
      .select('pelicula_id, visto, watchlist, peliculas(categoria, enriquecimiento(generos))')
      .eq('user_id', user.id)

    const watchlistIds = new Set<string>()
    const genreCount: Record<string, number> = {}

    ;(userRows ?? []).forEach((r: any) => {
      if (r.watchlist) watchlistIds.add(r.pelicula_id)

      // Count genres from watched movies to build taste profile
      if (r.visto && r.peliculas) {
        const generos: string[] = r.peliculas?.enriquecimiento?.generos ?? []
        generos.forEach((g: string) => {
          genreCount[g] = (genreCount[g] ?? 0) + 1
        })
        // Also count categoria
        if (r.peliculas.categoria) {
          genreCount[r.peliculas.categoria] = (genreCount[r.peliculas.categoria] ?? 0) + 1
        }
      }
    })

    setWatchlistTotal(watchlistIds.size)
    setUserGenres(genreCount)

    // For genre matching, we need genres per movie on each platform
    // Fetch genres for all movies that are in at least one catalog
    const allMovieIds = new Set<string>()
    Object.values(platMovies).forEach(s => s.forEach(id => allMovieIds.add(id)))

    // Fetch in batches of 500
    const movieIdArr = Array.from(allMovieIds)
    const genreMap: Record<string, string[]> = {}

    for (let i = 0; i < movieIdArr.length; i += 500) {
      const batch = movieIdArr.slice(i, i + 500)
      const { data: enrichRows } = await supabase
        .from('enriquecimiento')
        .select('pelicula_id, generos')
        .in('pelicula_id', batch)

      ;(enrichRows ?? []).forEach((r: any) => {
        if (r.generos) genreMap[r.pelicula_id] = r.generos
      })
    }

    // Calculate scores per platform
    const totalUserGenreCount = Object.values(genreCount).reduce((a, b) => a + b, 0)
    const hasGenreData = totalUserGenreCount > 0

    const platformResults: PlatformResult[] = PLATAFORMAS.map(p => {
      const movieSet = platMovies[p.id]
      const total = movieSet.size

      // Watchlist overlap
      let wlCount = 0
      watchlistIds.forEach(id => { if (movieSet.has(id)) wlCount++ })

      // Genre match score: how well does this platform's catalog match user's taste?
      let genreScore = 0
      if (hasGenreData) {
        // Build platform genre distribution
        const platGenreCount: Record<string, number> = {}
        let platGenreTotal = 0
        movieSet.forEach(id => {
          const genres = genreMap[id] ?? []
          genres.forEach(g => {
            platGenreCount[g] = (platGenreCount[g] ?? 0) + 1
            platGenreTotal++
          })
        })

        // Cosine-ish similarity: for each genre the user watches, how represented is it on this platform?
        if (platGenreTotal > 0) {
          let dotProduct = 0
          let userMag = 0
          let platMag = 0

          const allGenres = new Set([...Object.keys(genreCount), ...Object.keys(platGenreCount)])
          allGenres.forEach(g => {
            const uWeight = (genreCount[g] ?? 0) / totalUserGenreCount
            const pWeight = (platGenreCount[g] ?? 0) / platGenreTotal
            dotProduct += uWeight * pWeight
            userMag += uWeight * uWeight
            platMag += pWeight * pWeight
          })

          const magnitude = Math.sqrt(userMag) * Math.sqrt(platMag)
          genreScore = magnitude > 0 ? (dotProduct / magnitude) * 100 : 0
        }
      }

      // Combined match score: weighted blend of watchlist hit rate + genre similarity
      const watchlistScore = watchlistIds.size > 0 ? (wlCount / watchlistIds.size) * 100 : 0
      const matchScore = hasGenreData
        ? Math.round(watchlistScore * 0.6 + genreScore * 0.4)
        : Math.round(watchlistScore)

      return {
        id: p.id,
        nombre: p.nombre,
        logo: p.logo,
        watchlistCount: wlCount,
        totalMovies: total,
        matchScore: Math.min(matchScore, 100),
        recommendation: getRecommendation(matchScore),
      }
    }).sort((a, b) => b.matchScore - a.matchScore)

    setResults(platformResults)
    setLoading(false)
  }

  // Top 2 recommendation
  const top2 = useMemo(() => {
    if (!user || results.length < 2) return null
    const top = results.filter(r => r.matchScore > 0).slice(0, 2)
    if (top.length < 2) return null
    return top
  }, [results, user])

  if (loading || authLoading) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav />
        <div className="flex items-center justify-center h-64">
          <Loading text="Analizando plataformas..." />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Que plataforma te conviene?
          </h1>
          <p className="text-zinc-400 mt-3 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
            {user
              ? 'Analizamos tu watchlist y gustos para decirte en que plataformas vale la pena gastar.'
              : 'Mira cuantas peliculas tiene cada plataforma en nuestro catalogo. Inicia sesion para un analisis personalizado.'}
          </p>
        </div>

        {/* Top 2 recommendation banner */}
        {top2 && (
          <div className="mb-8 bg-gradient-to-r from-yellow-400/10 via-yellow-400/5 to-transparent border border-yellow-400/30 rounded-2xl p-5 sm:p-6">
            <p className="text-xs uppercase tracking-widest text-yellow-400/70 font-semibold mb-3">
              Si solo pudieras tener 2 plataformas
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {top2.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  {i === 1 && <span className="text-yellow-400/50 font-bold text-lg">+</span>}
                  <div className="flex items-center gap-2.5 bg-zinc-900/80 border border-zinc-700 rounded-xl px-4 py-2.5">
                    <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center p-0.5 shrink-0">
                      <Image src={p.logo} alt={p.nombre} width={24} height={24} className="object-contain" />
                    </div>
                    <span className="text-white font-bold text-sm">{p.nombre}</span>
                    <span className="text-yellow-400 text-xs font-semibold">{p.matchScore}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform cards */}
        <div className="space-y-3">
          {results.map((p, index) => {
            const isTop = index === 0 && user && p.matchScore > 0
            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-5 transition-all ${
                  isTop
                    ? 'bg-zinc-900/80 border-yellow-400/40 shadow-[0_0_30px_-8px_rgba(250,204,21,0.15)]'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Rank badge */}
                {user && p.matchScore > 0 && (
                  <div className={`absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    isTop ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-700 text-zinc-300'
                  }`}>
                    {index + 1}
                  </div>
                )}

                <div className="flex items-start gap-4">
                  {/* Platform logo */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center p-1.5 shrink-0 ${
                    isTop ? 'bg-white' : 'bg-white/90'
                  }`}>
                    <Image src={p.logo} alt={p.nombre} width={36} height={36} className="object-contain" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className={`font-bold text-lg ${isTop ? 'text-yellow-400' : 'text-white'}`}>
                        {p.nombre}
                      </h3>
                      {user && p.matchScore > 0 && (
                        <span className={`text-2xl font-black tabular-nums ${isTop ? 'text-yellow-400' : 'text-zinc-400'}`}>
                          {p.matchScore}%
                        </span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {user && watchlistTotal > 0 && (
                        <span className="text-sm text-zinc-400">
                          <span className="text-white font-semibold">{p.watchlistCount}</span>{' '}
                          {p.watchlistCount === 1 ? 'pelicula' : 'peliculas'} de tu watchlist
                        </span>
                      )}
                      <span className="text-sm text-zinc-500">
                        <span className="text-zinc-300 font-medium">{p.totalMovies.toLocaleString()}</span> peliculas en catalogo
                      </span>
                    </div>

                    {/* Match bar */}
                    {user && p.matchScore > 0 && (
                      <div className="mt-3">
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${getBarColor(p.recommendation)}`}
                            style={{ width: `${p.matchScore}%` }}
                          />
                        </div>
                        <p className={`text-xs font-semibold mt-1.5 ${getRecommendationColor(p.recommendation)}`}>
                          {p.recommendation}
                        </p>
                      </div>
                    )}

                    {/* Non-logged-in: just a subtle bar for total movies */}
                    {!user && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-zinc-600 transition-all duration-700 ease-out"
                            style={{ width: `${results.length > 0 ? (p.totalMovies / results[0].totalMovies) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA for non-logged users */}
        {!user && (
          <div className="mt-10 text-center">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
              <p className="text-white font-bold text-lg mb-2">Quieres saber cual plataforma es para ti?</p>
              <p className="text-zinc-400 text-sm mb-5">
                Inicia sesion, agrega peliculas a tu watchlist y te diremos exactamente donde gastar tu plata.
              </p>
              <Link
                href="/catalogo"
                className="inline-block bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold text-sm rounded-xl px-6 py-3 transition-colors"
              >
                Explorar catalogo
              </Link>
            </div>
          </div>
        )}

        {/* Tip for logged users with empty watchlist */}
        {user && watchlistTotal === 0 && (
          <div className="mt-10 text-center">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
              <p className="text-white font-bold text-lg mb-2">Tu watchlist esta vacia</p>
              <p className="text-zinc-400 text-sm mb-5">
                Agrega peliculas a tu watchlist y marca las que ya viste para que podamos calcular tu match con cada plataforma.
              </p>
              <Link
                href="/catalogo"
                className="inline-block bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold text-sm rounded-xl px-6 py-3 transition-colors"
              >
                Ir al catalogo
              </Link>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-zinc-600 text-xs mt-8">
          Basado en {results.reduce((sum, r) => sum + r.totalMovies, 0).toLocaleString()} peliculas rastreadas en el catalogo de CineBret.
        </p>
      </div>
    </main>
  )
}
