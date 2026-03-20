'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type StatsPersonales = {
  vistas: number
  avgRating: number | null
  watchlist: number
  ratingDist: Record<number, number>
  categorias: Record<string, number>
  generos: Record<string, number>
}

type StatsComparacion = {
  my_vistas: number
  my_avg_rating: number | null
  my_watchlist: number
  community_avg_rating: number | null
  community_total_vistas: number
  community_users: number
}

type TopPelicula = {
  pelicula_id: string
  titulo_display: string
  poster_path: string | null
  nota_imdb: number | null
  visto_count: number
  avg_rating: number | null
  watchlist_count: number
}

const CATEGORIAS_LABELS: Record<string, string> = {
  "Pa'l domingo de bajón": 'Bajón',
  "Pa' saltar del sillón": 'Sillón',
  "Pa' quedar con el cerebro como licuadora": 'Licuadora',
  "Pa' llorar a moco tendido": 'Moco',
}

export default function EstadisticasPersonalesPage() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState<StatsPersonales | null>(null)
  const [comparacion, setComparacion] = useState<StatsComparacion | null>(null)
  const [topComunidad, setTopComunidad] = useState<TopPelicula[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!user) { setCargando(false); return }

    Promise.all([
      // Datos personales con categorías y géneros
      supabase
        .from('user_peliculas')
        .select('visto, rating, watchlist, peliculas(categoria, enriquecimiento(generos))')
        .eq('user_id', user.id)
        .eq('visto', true),

      // Comparación comunidad
      supabase.rpc('get_stats_comparison', { p_user_id: user.id }),

      // Top comunidad
      supabase.rpc('get_community_top'),
    ]).then(([{ data: misMovies }, { data: comp }, { data: top }]) => {
      // Stats personales
      if (misMovies) {
        const ratingDist: Record<number, number> = {}
        const categorias: Record<string, number> = {}
        const generos: Record<string, number> = {}
        let totalRating = 0, countRating = 0

        misMovies.forEach((r: any) => {
          if (r.rating) {
            ratingDist[r.rating] = (ratingDist[r.rating] ?? 0) + 1
            totalRating += r.rating
            countRating++
          }
          const cat = r.peliculas?.categoria
          if (cat) categorias[cat] = (categorias[cat] ?? 0) + 1
          const gens = r.peliculas?.enriquecimiento?.generos ?? []
          gens.forEach((g: string) => { generos[g] = (generos[g] ?? 0) + 1 })
        })

        setStats({
          vistas: misMovies.length,
          avgRating: countRating > 0 ? Math.round((totalRating / countRating) * 10) / 10 : null,
          watchlist: 0,
          ratingDist,
          categorias,
          generos,
        })
      }

      if (comp) setComparacion(comp)
      if (top) setTopComunidad(top)
      setCargando(false)
    })
  }, [user])

  if (loading || cargando) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="mi-lista" />
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-500 text-sm">Cargando estadísticas...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="mi-lista" />
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-400 text-sm">Inicia sesión para ver tus estadísticas</p>
        </div>
      </main>
    )
  }

  const topGeneros = Object.entries(stats?.generos ?? {})
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxGenero = topGeneros[0]?.[1] ?? 1

  const topCategorias = Object.entries(stats?.categorias ?? {})
    .sort((a, b) => b[1] - a[1])
  const maxCategoria = topCategorias[0]?.[1] ?? 1

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="mi-lista" />
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/mi-lista" className="text-zinc-500 hover:text-white text-sm transition-colors">← Mi lista</Link>
          <h1 className="text-2xl font-bold text-white">Mis estadísticas</h1>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Películas vistas', value: stats?.vistas ?? 0, color: 'text-emerald-400' },
            { label: 'Mi promedio', value: stats?.avgRating ? `${stats.avgRating}/10` : '—', color: 'text-yellow-400' },
            { label: 'Promedio comunidad', value: comparacion?.community_avg_rating ? `${comparacion.community_avg_rating}/10` : '—', color: 'text-blue-400' },
            { label: 'Usuarios activos', value: comparacion?.community_users ?? '—', color: 'text-purple-400' },
          ].map(c => (
            <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          {/* Distribución de ratings */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Mis ratings</h2>
            {Object.keys(stats?.ratingDist ?? {}).length === 0 ? (
              <p className="text-zinc-600 text-sm">Aún no has calificado películas</p>
            ) : (
              <div className="space-y-2">
                {[10,9,8,7,6,5,4,3,2,1].map(n => {
                  const count = stats?.ratingDist[n] ?? 0
                  const max = Math.max(...Object.values(stats?.ratingDist ?? {}), 1)
                  const pct = Math.round((count / max) * 100)
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <span className="text-zinc-500 text-xs w-4 text-right">{n}</span>
                      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-zinc-500 text-xs w-5">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Categorías */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Mis categorías</h2>
            {topCategorias.length === 0 ? (
              <p className="text-zinc-600 text-sm">Sin datos aún</p>
            ) : (
              <div className="space-y-3">
                {topCategorias.map(([cat, count]) => {
                  const pct = Math.round((count / maxCategoria) * 100)
                  const label = CATEGORIAS_LABELS[cat] ?? cat
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-zinc-400">{label}</span>
                        <span className="text-zinc-500">{count}</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                        <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Géneros favoritos */}
        {topGeneros.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Mis géneros favoritos</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {topGeneros.map(([genero, count]) => {
                const pct = Math.round((count / maxGenero) * 100)
                return (
                  <div key={genero}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">{genero}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Comparación vs comunidad */}
        {comparacion && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-6">Tú vs la comunidad</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-400">{stats?.avgRating ?? '—'}</p>
                <p className="text-xs text-zinc-500 mt-1">Tu promedio</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-400">{comparacion.community_avg_rating ?? '—'}</p>
                <p className="text-xs text-zinc-500 mt-1">Promedio comunidad</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-zinc-300">{comparacion.community_total_vistas}</p>
                <p className="text-xs text-zinc-500 mt-1">Vistas totales comunidad</p>
              </div>
            </div>
            {stats?.avgRating && comparacion.community_avg_rating && (
              <p className="text-center text-sm text-zinc-500 mt-4">
                {stats.avgRating > comparacion.community_avg_rating
                  ? `Eres más generoso que el promedio en ${(stats.avgRating - Number(comparacion.community_avg_rating)).toFixed(1)} puntos`
                  : stats.avgRating < comparacion.community_avg_rating
                  ? `Eres más exigente que el promedio en ${(Number(comparacion.community_avg_rating) - stats.avgRating).toFixed(1)} puntos`
                  : 'Tu promedio es igual al de la comunidad'}
              </p>
            )}
          </div>
        )}

        {/* Top comunidad */}
        {topComunidad.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Lo más visto por la comunidad</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {topComunidad.slice(0, 16).map(p => (
                <div key={p.pelicula_id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="relative aspect-[2/3] bg-zinc-800">
                    {p.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_display} fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <span className="text-zinc-600 text-xs text-center leading-tight">{p.titulo_display}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                      <p className="text-white text-xs font-bold">{p.visto_count} {p.visto_count === 1 ? 'vista' : 'vistas'}</p>
                      {p.avg_rating && <p className="text-yellow-400 text-xs">{p.avg_rating}/10</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
