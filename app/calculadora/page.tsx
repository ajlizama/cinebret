'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  PageShell,
  PageHeader,
  Card,
  ProgressBar,
  PlatformLogo,
  Pill,
  Button,
  LoadingState,
  Icon,
  type Platform,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const PLATAFORMAS: { id: Platform; nombre: string }[] = [
  { id: 'netflix',         nombre: 'Netflix' },
  { id: 'disney_plus',     nombre: 'Disney+' },
  { id: 'hbo_max',         nombre: 'Max' },
  { id: 'amazon_prime',    nombre: 'Prime Video' },
  { id: 'apple_tv',        nombre: 'Apple TV+' },
  { id: 'paramount_plus',  nombre: 'Paramount+' },
  { id: 'mubi',            nombre: 'MUBI' },
  { id: 'crunchyroll',     nombre: 'Crunchyroll' },
]

type PlatformResult = {
  id: Platform
  nombre: string
  watchlistCount: number
  totalMovies: number
  matchScore: number
  recommendation: string
  unseenGems: number
  avgImdb: number | null
  topGenre: string | null
  // Sub-scores for debugging / transparency
  watchlistValue: number
  catalogQuality: number
  tasteMatch: number
  unseenGemsScore: number
}

function getRecommendation(score: number): string {
  if (score >= 70) return 'Imprescindible'
  if (score >= 50) return 'Muy recomendada'
  if (score >= 30) return 'Buena opción'
  return 'Podrías prescindir'
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
  const [, setUserGenres] = useState<Record<string, number>>({})

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Fetch all active catalog entries for this date (paginated)
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

    // Collect all movie IDs across all platforms
    const allMovieIds = new Set<string>()
    Object.values(platMovies).forEach(s => s.forEach(id => allMovieIds.add(id)))

    // Fetch IMDB ratings + genres for all catalog movies in parallel batches
    const movieIdArr = Array.from(allMovieIds)
    const imdbMap: Record<string, number> = {}
    const genreMap: Record<string, string[]> = {}

    const batches: Promise<void>[] = []
    for (let i = 0; i < movieIdArr.length; i += 500) {
      const batch = movieIdArr.slice(i, i + 500)
      batches.push(
        (async () => {
          const { data } = await supabase
            .from('peliculas')
            .select('id, nota_imdb')
            .in('id', batch)
          ;(data ?? []).forEach((r: any) => {
            if (r.nota_imdb != null) imdbMap[r.id] = r.nota_imdb
          })
        })(),
      )
      batches.push(
        (async () => {
          const { data } = await supabase
            .from('enriquecimiento')
            .select('pelicula_id, generos')
            .in('pelicula_id', batch)
          ;(data ?? []).forEach((r: any) => {
            if (r.generos) genreMap[r.pelicula_id] = r.generos
          })
        })(),
      )
    }
    await Promise.all(batches)

    if (!user) {
      // Non-logged-in: show total movies and avg IMDB per platform
      const platformResults: PlatformResult[] = PLATAFORMAS.map(p => {
        const movieSet = platMovies[p.id]
        const ratings = Array.from(movieSet).map(id => imdbMap[id]).filter(Boolean)
        const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

        return {
          id: p.id,
          nombre: p.nombre,
          watchlistCount: 0,
          totalMovies: movieSet.size,
          matchScore: 0,
          recommendation: '',
          unseenGems: 0,
          avgImdb: avg ? parseFloat(avg.toFixed(1)) : null,
          topGenre: null,
          watchlistValue: 0,
          catalogQuality: 0,
          tasteMatch: 0,
          unseenGemsScore: 0,
        }
      }).sort((a, b) => b.totalMovies - a.totalMovies)

      setResults(platformResults)
      setLoading(false)
      return
    }

    // Logged-in user: fetch watchlist + watched movies with genres
    const { data: userRows } = await supabase
      .from('user_peliculas')
      .select('pelicula_id, visto, watchlist, peliculas(categoria, nota_imdb, enriquecimiento(generos))')
      .eq('user_id', user.id)

    const watchlistIds = new Set<string>()
    const watchedIds = new Set<string>()
    const genreCount: Record<string, number> = {}

    ;(userRows ?? []).forEach((r: any) => {
      if (r.watchlist) watchlistIds.add(r.pelicula_id)
      if (r.visto) watchedIds.add(r.pelicula_id)

      // Count genres from watched movies to build taste profile
      if (r.visto && r.peliculas) {
        const generos: string[] = r.peliculas?.enriquecimiento?.generos ?? []
        generos.forEach((g: string) => {
          genreCount[g] = (genreCount[g] ?? 0) + 1
        })
        if (r.peliculas.categoria) {
          genreCount[r.peliculas.categoria] = (genreCount[r.peliculas.categoria] ?? 0) + 1
        }
      }
    })

    setWatchlistTotal(watchlistIds.size)
    setUserGenres(genreCount)

    // Calculate scores per platform
    const totalUserGenreCount = Object.values(genreCount).reduce((a, b) => a + b, 0)
    const hasGenreData = totalUserGenreCount > 0

    const platformRawScores = PLATAFORMAS.map(p => {
      const movieSet = platMovies[p.id]
      const total = movieSet.size

      // --- 1. WATCHLIST VALUE (40%) ---
      let watchlistValue = 0
      let wlCount = 0
      watchlistIds.forEach(id => {
        if (movieSet.has(id)) {
          wlCount++
          const rating = imdbMap[id]
          watchlistValue += rating ? rating : 5
        }
      })

      // --- 2. CATALOG QUALITY (20%) ---
      const ratings = Array.from(movieSet).map(id => imdbMap[id]).filter(Boolean)
      const avgImdb = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

      // --- 3. TASTE MATCH (25%) ---
      let genreScore = 0
      let topGenre: string | null = null
      if (hasGenreData) {
        const platGenreCount: Record<string, number> = {}
        let platGenreTotal = 0
        movieSet.forEach(id => {
          const genres = genreMap[id] ?? []
          genres.forEach(g => {
            platGenreCount[g] = (platGenreCount[g] ?? 0) + 1
            platGenreTotal++
          })
        })

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

        let bestGenreScore = 0
        const platGenreCount2: Record<string, number> = {}
        movieSet.forEach(id => {
          const genres = genreMap[id] ?? []
          genres.forEach(g => { platGenreCount2[g] = (platGenreCount2[g] ?? 0) + 1 })
        })

        Object.entries(genreCount).forEach(([genre, userCount]) => {
          const platCount = platGenreCount2[genre] ?? 0
          const score = (userCount / totalUserGenreCount) * platCount
          if (score > bestGenreScore) {
            bestGenreScore = score
            topGenre = genre
          }
        })
      }

      // --- 4. UNSEEN GEMS (15%) ---
      let unseenGems = 0
      movieSet.forEach(id => {
        if (!watchedIds.has(id) && !watchlistIds.has(id)) {
          const rating = imdbMap[id]
          if (rating && rating >= 7.5) unseenGems++
        }
      })

      return {
        id: p.id,
        nombre: p.nombre,
        wlCount,
        totalMovies: total,
        watchlistValue,
        avgImdb,
        genreScore,
        topGenre,
        unseenGems,
      }
    })

    // Normalize each dimension to 0-100 and compute final score
    const maxWatchlistValue = Math.max(...platformRawScores.map(p => p.watchlistValue), 1)
    const maxUnseenGems = Math.max(...platformRawScores.map(p => p.unseenGems), 1)

    const platformResults: PlatformResult[] = platformRawScores.map(p => {
      const normWatchlistValue = (p.watchlistValue / maxWatchlistValue) * 100
      const normCatalogQuality = Math.min(Math.max(((p.avgImdb - 5.0) / 3.5) * 100, 0), 100)
      const normTasteMatch = p.genreScore
      const normUnseenGems = (p.unseenGems / maxUnseenGems) * 100

      const matchScore = Math.round(
        normWatchlistValue * 0.40 +
        normCatalogQuality * 0.20 +
        normTasteMatch * 0.25 +
        normUnseenGems * 0.15
      )

      const clampedScore = Math.min(matchScore, 100)

      return {
        id: p.id,
        nombre: p.nombre,
        watchlistCount: p.wlCount,
        totalMovies: p.totalMovies,
        matchScore: clampedScore,
        recommendation: getRecommendation(clampedScore),
        unseenGems: p.unseenGems,
        avgImdb: p.avgImdb > 0 ? parseFloat(p.avgImdb.toFixed(1)) : null,
        topGenre: p.topGenre,
        watchlistValue: Math.round(normWatchlistValue),
        catalogQuality: Math.round(normCatalogQuality),
        tasteMatch: Math.round(normTasteMatch),
        unseenGemsScore: Math.round(normUnseenGems),
      }
    }).sort((a, b) => b.matchScore - a.matchScore)

    setResults(platformResults)
    setLoading(false)
  }

  // Top 2 recommendation with "why"
  const top2 = useMemo(() => {
    if (!user || results.length < 2) return null
    const top = results.filter(r => r.matchScore > 0).slice(0, 2)
    if (top.length < 2) return null
    return top
  }, [results, user])

  function getWhyText(p: PlatformResult): string {
    if (p.topGenre) {
      const genre = p.topGenre.toLowerCase()
      return `por tu ${genre}`
    }
    if (p.watchlistCount > 0) return `por tu watchlist`
    if (p.unseenGems > 0) return `por sus joyas sin ver`
    return 'por su catálogo'
  }

  if (loading || authLoading) {
    return (
      <PageShell maxWidth="4xl">
        <LoadingState text="Analizando plataformas..." />
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="¿Qué plataforma te conviene?"
        subtitle={
          user
            ? 'Analizamos tu watchlist, tus gustos y la calidad de cada catálogo para decirte en qué plataformas vale la pena gastar.'
            : 'Mira cuántas películas tiene cada plataforma en nuestro catálogo. Inicia sesión para un análisis personalizado.'
        }
      />

      {/* Top 2 recommendation banner */}
      {top2 && (
        <Card
          padding="lg"
          className="mb-8 bg-gradient-to-r from-yellow-400/10 via-yellow-400/5 to-transparent border border-yellow-400/30"
        >
          <p className="text-xs uppercase tracking-widest text-yellow-400/80 font-bold mb-4">
            Si solo pudieras tener dos plataformas
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {top2.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                {i === 1 && (
                  <span className="text-yellow-400/60 font-bold text-xl" aria-hidden="true">
                    +
                  </span>
                )}
                <div className="flex items-center gap-3 bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
                  <PlatformLogo platform={p.id} size="md" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{p.nombre}</span>
                      <Pill variant="gold" size="sm">{p.matchScore}/100</Pill>
                    </div>
                    <span className="text-zinc-400 text-[11px] mt-0.5">{getWhyText(p)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Platform cards */}
      <div className="space-y-3">
        {results.map((p, index) => {
          const isTop = index === 0 && !!user && p.matchScore > 0
          return (
            <Card
              key={p.id}
              padding="lg"
              className={`relative ${
                isTop
                  ? 'border border-yellow-400/40 shadow-[0_0_30px_-8px_rgba(250,204,21,0.18)]'
                  : 'border border-zinc-800'
              }`}
            >
              {/* Rank badge */}
              {user && p.matchScore > 0 && (
                <div
                  className={`absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black tabular-nums ${
                    isTop ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-700 text-zinc-300'
                  }`}
                  aria-label={`Posición ${index + 1}`}
                >
                  {index + 1}
                </div>
              )}

              <div className="flex items-start gap-4">
                <PlatformLogo platform={p.id} size="lg" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`font-bold text-lg ${isTop ? 'text-yellow-400' : 'text-white'}`}>
                      {p.nombre}
                    </h3>
                    {user && p.matchScore > 0 && (
                      <span className={`text-2xl font-black tabular-nums ${isTop ? 'text-yellow-400' : 'text-zinc-300'}`}>
                        {p.matchScore}
                        <span className="text-sm font-bold opacity-50">/100</span>
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-sm">
                    {user && watchlistTotal > 0 && (
                      <span className="text-zinc-400">
                        <span className="text-white font-semibold">{p.watchlistCount}</span>{' '}
                        {p.watchlistCount === 1 ? 'película' : 'películas'} de tu watchlist
                      </span>
                    )}
                    {user && p.unseenGems > 0 && (
                      <span className="text-zinc-400">
                        <span className="text-yellow-400 font-semibold">{p.unseenGems}</span>{' '}
                        {p.unseenGems === 1 ? 'joya' : 'joyas'} sin ver (IMDb 7,5+)
                      </span>
                    )}
                    {p.avgImdb && (
                      <span className="text-zinc-500">
                        Promedio IMDb: <span className="text-zinc-300 font-medium">{p.avgImdb}</span>
                      </span>
                    )}
                  </div>

                  {/* Catalog size (subtle) */}
                  <div className="mt-1">
                    <span className="text-xs text-zinc-600">
                      {p.totalMovies.toLocaleString('es')} películas en catálogo
                    </span>
                  </div>

                  {/* Match bar */}
                  {user && p.matchScore > 0 && (
                    <div className="mt-3">
                      <ProgressBar value={p.matchScore} max={100} color="gold" size="md" />
                      <p className="text-xs font-bold mt-1.5 text-yellow-400/90">
                        {p.recommendation}
                      </p>
                    </div>
                  )}

                  {/* Non-logged-in: subtle bar for total movies */}
                  {!user && results.length > 0 && (
                    <div className="mt-3">
                      <ProgressBar
                        value={(p.totalMovies / results[0].totalMovies) * 100}
                        max={100}
                        color="gold"
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* CTA for non-logged users */}
      {!user && (
        <div className="mt-10">
          <Card padding="lg" className="text-center">
            <Icon.Sparkles className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
            <p className="text-white font-bold text-lg mb-2">
              ¿Quieres saber qué plataforma es para ti?
            </p>
            <p className="text-zinc-400 text-sm mb-5 max-w-md mx-auto">
              Inicia sesión, agrega películas a tu watchlist y te diremos exactamente dónde vale la pena gastar.
            </p>
            <Link href="/catalogo">
              <Button>Explorar catálogo</Button>
            </Link>
          </Card>
        </div>
      )}

      {/* Tip for logged users with empty watchlist */}
      {user && watchlistTotal === 0 && (
        <div className="mt-10">
          <Card padding="lg" className="text-center">
            <Icon.Bookmark className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
            <p className="text-white font-bold text-lg mb-2">Tu watchlist está vacía</p>
            <p className="text-zinc-400 text-sm mb-5 max-w-md mx-auto">
              Agrega películas a tu watchlist y marca las que ya viste para que podamos calcular tu match con cada plataforma.
            </p>
            <Link href="/catalogo">
              <Button>Ir al catálogo</Button>
            </Link>
          </Card>
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-zinc-600 text-xs mt-8">
        Basado en {results.reduce((sum, r) => sum + r.totalMovies, 0).toLocaleString('es')} películas rastreadas en el catálogo de CineBret.
      </p>
    </PageShell>
  )
}
