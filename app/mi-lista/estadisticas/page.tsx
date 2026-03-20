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
  avgImdb: number | null
  oscarWinners: number
  ratingDist: Record<number, number>
  categorias: Record<string, number>
  generos: Record<string, number>
}

type StatsComparacion = {
  my_vistas: number
  my_avg_rating: number | null
  my_avg_imdb: number | null
  my_oscar_winners: number
  my_watchlist: number
  community_avg_rating: number | null
  community_avg_imdb: number | null
  community_total_vistas: number
  community_users: number
  community_avg_vistas_per_user: number | null
  community_oscar_winners_avg: number | null
}

type CommunityDist = {
  rating_dist: Record<string, number>
  category_dist: Record<string, number>
  genre_dist: Record<string, number>
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

function CompareBar({ myVal, commVal, myColor = 'bg-yellow-400', label }: {
  myVal: number; commVal: number; myColor?: string; label: string
}) {
  const max = Math.max(myVal, commVal, 1)
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 w-4">Tú</span>
        <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
          <div className={`h-full ${myColor} rounded transition-all`} style={{ width: `${(myVal / max) * 100}%` }} />
        </div>
        <span className="text-xs text-zinc-400 w-6 text-right">{myVal}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-xs text-zinc-600 w-4">Com</span>
        <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
          <div className="h-full bg-zinc-500 rounded transition-all" style={{ width: `${(commVal / max) * 100}%` }} />
        </div>
        <span className="text-xs text-zinc-600 w-6 text-right">{commVal}</span>
      </div>
    </div>
  )
}

export default function EstadisticasPersonalesPage() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState<StatsPersonales | null>(null)
  const [comp, setComp] = useState<StatsComparacion | null>(null)
  const [commDist, setCommDist] = useState<CommunityDist | null>(null)
  const [topComunidad, setTopComunidad] = useState<TopPelicula[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!user) { setCargando(false); return }

    Promise.all([
      supabase.from('user_peliculas')
        .select('visto, rating, peliculas(nota_imdb, oscars, categoria, enriquecimiento(generos))')
        .eq('user_id', user.id).eq('visto', true),
      supabase.rpc('get_stats_comparison', { p_user_id: user.id }),
      supabase.rpc('get_community_distributions'),
      supabase.rpc('get_community_top'),
    ]).then(([{ data: mis }, { data: c }, { data: cd }, { data: top }]) => {
      if (mis) {
        const ratingDist: Record<number, number> = {}
        const categorias: Record<string, number> = {}
        const generos: Record<string, number> = {}
        let totalRating = 0, countRating = 0, totalImdb = 0, countImdb = 0, oscars = 0

        mis.forEach((r: any) => {
          if (r.rating) { ratingDist[r.rating] = (ratingDist[r.rating] ?? 0) + 1; totalRating += r.rating; countRating++ }
          const p = r.peliculas
          if (p?.nota_imdb) { totalImdb += p.nota_imdb; countImdb++ }
          const osc = (p?.oscars ?? '').toLowerCase()
          if (osc.startsWith('ganó') && osc.includes('mejor película') && !osc.includes('animad') && !osc.includes('internacional') && !osc.includes('extranjera') && !osc.includes('habla no inglesa')) oscars++
          if (p?.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
          ;(p?.enriquecimiento?.generos ?? []).forEach((g: string) => { generos[g] = (generos[g] ?? 0) + 1 })
        })

        setStats({
          vistas: mis.length,
          avgRating: countRating > 0 ? Math.round((totalRating / countRating) * 10) / 10 : null,
          avgImdb: countImdb > 0 ? Math.round((totalImdb / countImdb) * 10) / 10 : null,
          oscarWinners: oscars,
          ratingDist, categorias, generos,
        })
      }
      if (c) setComp(c)
      if (cd) setCommDist(cd)
      if (top) setTopComunidad(top)
      setCargando(false)
    })
  }, [user])

  if (loading || cargando) return (
    <main className="min-h-screen bg-zinc-950"><Nav active="mi-lista" />
      <div className="flex items-center justify-center h-64"><p className="text-zinc-500 text-sm">Cargando estadísticas...</p></div>
    </main>
  )

  if (!user) return (
    <main className="min-h-screen bg-zinc-950"><Nav active="mi-lista" />
      <div className="flex items-center justify-center h-64"><p className="text-zinc-400 text-sm">Inicia sesión para ver tus estadísticas</p></div>
    </main>
  )

  const topGenerosMios = Object.entries(stats?.generos ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topGenerosComm = Object.entries(commDist?.genre_dist ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const generosKeys = [...new Set([...topGenerosMios.map(g => g[0]), ...topGenerosComm.map(g => g[0])])]
    .slice(0, 8)

  const categoriasKeys = Object.keys({ ...stats?.categorias, ...commDist?.category_dist })
  const maxCategoriaMia = Math.max(...Object.values(stats?.categorias ?? {}), 1)
  const maxCategoriaComm = Math.max(...Object.values(commDist?.category_dist ?? {}).map(Number), 1)

  const maxGeneroMio = Math.max(...Object.values(stats?.generos ?? {}), 1)
  const maxGeneroComm = Math.max(...Object.values(commDist?.genre_dist ?? {}).map(Number), 1)

  const commAvgVistas = comp?.community_avg_vistas_per_user ?? 0
  const commUsers = comp?.community_users ?? 1

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="mi-lista" />
      <div className="max-w-7xl mx-auto px-6 py-10">

        <div className="flex items-center gap-4 mb-8">
          <Link href="/mi-lista" className="text-zinc-500 hover:text-white text-sm transition-colors">← Mi lista</Link>
          <h1 className="text-2xl font-bold text-white">Mis estadísticas</h1>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Películas vistas', mine: stats?.vistas ?? 0, comm: commAvgVistas, color: 'text-emerald-400' },
            { label: 'Promedio rating', mine: stats?.avgRating ?? '—', comm: comp?.community_avg_rating ?? '—', color: 'text-yellow-400' },
            { label: 'Promedio IMDB visto', mine: stats?.avgImdb ?? '—', comm: comp?.community_avg_imdb ?? '—', color: 'text-blue-400' },
            { label: 'Ganadoras Mejor Película', mine: stats?.oscarWinners ?? 0, comm: comp?.community_oscar_winners_avg ?? '—', color: 'text-amber-300' },
          ].map(c => (
            <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.mine}</p>
              <p className="text-xs text-zinc-500 mt-0.5 mb-2">{c.label}</p>
              <p className="text-xs text-zinc-600">Com. promedio: <span className="text-zinc-400">{c.comm}</span></p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          {/* Rating distribution */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Distribución de ratings</h2>
            {Object.keys(stats?.ratingDist ?? {}).length === 0 ? (
              <p className="text-zinc-600 text-sm">Aún no has calificado películas</p>
            ) : (
              <div className="space-y-2">
                {[10,9,8,7,6,5,4,3,2,1].map(n => {
                  const mine = stats?.ratingDist[n] ?? 0
                  const comm = Math.round((Number(commDist?.rating_dist[String(n)] ?? 0) / commUsers) * 10) / 10
                  const max = Math.max(...[10,9,8,7,6,5,4,3,2,1].map(i => Math.max(stats?.ratingDist[i] ?? 0, Math.round((Number(commDist?.rating_dist[String(i)] ?? 0) / commUsers) * 10) / 10)), 1)
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-zinc-500 text-xs w-3 text-right">{n}</span>
                      <div className="flex-1 flex flex-col gap-0.5">
                        <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                          <div className="h-full bg-yellow-400 rounded" style={{ width: `${(mine / max) * 100}%` }} />
                        </div>
                        <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                          <div className="h-full bg-zinc-500 rounded" style={{ width: `${(comm / max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-xs w-10 text-right">
                        <span className="text-zinc-400">{mine}</span>
                        <span className="text-zinc-700"> / {comm}</span>
                      </div>
                    </div>
                  )
                })}
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-yellow-400 rounded inline-block" /> Tú</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-zinc-500 rounded inline-block" /> Comunidad</span>
                </div>
              </div>
            )}
          </div>

          {/* Categorías comparadas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Categorías (tú vs comunidad)</h2>
            {categoriasKeys.length === 0 ? (
              <p className="text-zinc-600 text-sm">Sin datos aún</p>
            ) : (
              <div className="space-y-4">
                {categoriasKeys.map(cat => {
                  const mine = stats?.categorias[cat] ?? 0
                  const comm = Math.round((Number(commDist?.category_dist[cat] ?? 0) / commUsers) * 10) / 10
                  return (
                    <CompareBar
                      key={cat}
                      label={CATEGORIAS_LABELS[cat] ?? cat}
                      myVal={mine}
                      commVal={comm}
                      myColor="bg-blue-500"
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Géneros comparados */}
        {generosKeys.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Géneros favoritos (tú vs comunidad)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {generosKeys.map(g => {
                const mine = stats?.generos[g] ?? 0
                const comm = Math.round((Number(commDist?.genre_dist[g] ?? 0) / commUsers) * 10) / 10
                return <CompareBar key={g} label={g} myVal={mine} commVal={comm} myColor="bg-emerald-500" />
              })}
            </div>
          </div>
        )}

        {/* Tú vs comunidad texto */}
        {comp && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Resumen vs comunidad</h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <p className="text-zinc-400">
                Has visto <span className="text-white font-bold">{stats?.vistas}</span> películas, vs un promedio de <span className="text-zinc-300 font-bold">{commAvgVistas}</span> por usuario.
              </p>
              {stats?.avgRating && comp.community_avg_rating && (
                <p className="text-zinc-400">
                  {Number(stats.avgRating) > Number(comp.community_avg_rating)
                    ? <>Eres <span className="text-yellow-400 font-bold">más generoso</span> que el promedio en {(Number(stats.avgRating) - Number(comp.community_avg_rating)).toFixed(1)} pts</>
                    : Number(stats.avgRating) < Number(comp.community_avg_rating)
                    ? <>Eres <span className="text-blue-400 font-bold">más exigente</span> que el promedio en {(Number(comp.community_avg_rating) - Number(stats.avgRating)).toFixed(1)} pts</>
                    : <>Tu promedio es igual al de la comunidad</>}
                </p>
              )}
              {stats?.oscarWinners != null && (
                <p className="text-zinc-400">
                  Has visto <span className="text-amber-300 font-bold">{stats.oscarWinners}</span> película{stats.oscarWinners !== 1 ? 's' : ''} ganadora{stats.oscarWinners !== 1 ? 's' : ''} a Mejor Película, vs <span className="text-zinc-300 font-bold">{comp.community_oscar_winners_avg ?? '—'}</span> de promedio.
                </p>
              )}
              <p className="text-zinc-400">
                Comunidad: <span className="text-white font-bold">{comp.community_users}</span> usuarios · <span className="text-white font-bold">{comp.community_total_vistas}</span> vistas totales
              </p>
            </div>
          </div>
        )}

        {/* Top comunidad */}
        {topComunidad.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Lo más visto por la comunidad</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {topComunidad.slice(0, 16).map(p => (
                <div key={p.pelicula_id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="relative aspect-[2/3] bg-zinc-800">
                    {p.poster_path
                      ? <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_display} fill className="object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center p-2"><span className="text-zinc-600 text-xs text-center leading-tight">{p.titulo_display}</span></div>
                    }
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
