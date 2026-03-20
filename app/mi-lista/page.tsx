'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type EntradaLista = {
  pelicula_id: string
  visto: boolean
  rating: number | null
  watchlist: boolean
  pelicula: {
    titulo: string
    titulo_ingles: string | null
    anio: number | null
    nota_imdb: number | null
    rt_score: number | null
    poster_path: string | null
    categoria: string | null
  }
}

export default function MiListaPage() {
  const { user, loading } = useAuth()
  const [entradas, setEntradas] = useState<EntradaLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<'vistas' | 'watchlist'>('vistas')

  useEffect(() => {
    if (!user) { setCargando(false); return }
    supabase
      .from('user_peliculas')
      .select('pelicula_id, visto, rating, watchlist, peliculas(titulo, titulo_ingles, anio, nota_imdb, rt_score, poster_path, categoria)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!data) return
        const mapped = data.map((r: any) => ({
          pelicula_id: r.pelicula_id,
          visto: r.visto,
          rating: r.rating,
          watchlist: r.watchlist,
          pelicula: r.peliculas,
        })).filter(r => r.pelicula)
        setEntradas(mapped)
        setCargando(false)
      })
  }, [user])

  const quitarWatchlist = async (peliculaId: string) => {
    setEntradas(prev => prev.map(e => e.pelicula_id === peliculaId ? { ...e, watchlist: false } : e))
    await supabase.from('user_peliculas').update({ watchlist: false })
      .eq('user_id', user!.id).eq('pelicula_id', peliculaId)
  }

  const quitarVista = async (peliculaId: string) => {
    setEntradas(prev => prev.map(e => e.pelicula_id === peliculaId ? { ...e, visto: false, rating: null } : e))
    await supabase.from('user_peliculas').update({ visto: false, rating: null })
      .eq('user_id', user!.id).eq('pelicula_id', peliculaId)
  }

  const vistas = entradas.filter(e => e.visto).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const watchlist = entradas.filter(e => e.watchlist)

  if (loading || cargando) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="mi-lista" />
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-500 text-sm">Cargando...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="mi-lista" />
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-zinc-400 text-sm">Inicia sesión para ver tu lista personal</p>
        </div>
      </main>
    )
  }

  const lista = tab === 'vistas' ? vistas : watchlist

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="mi-lista" />
      <div className="max-w-7xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Mi lista</h1>
        <p className="text-zinc-500 text-sm mb-6">{user.email}</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setTab('vistas')}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === 'vistas'
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            ✓ Vistas ({vistas.length})
          </button>
          <button
            onClick={() => setTab('watchlist')}
            className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === 'watchlist'
                ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            ★ Watchlist ({watchlist.length})
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            {tab === 'vistas'
              ? 'Aún no has marcado películas como vistas. Búscalas en el catálogo.'
              : 'Tu watchlist está vacía. Agrega películas desde el catálogo.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {lista.map(entrada => {
              const p = entrada.pelicula
              const titulo = p.titulo_ingles || p.titulo
              return (
                <div key={entrada.pelicula_id} className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
                  {/* Poster */}
                  <div className="relative aspect-[2/3] bg-zinc-800">
                    {p.poster_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w342${p.poster_path}`}
                        alt={titulo}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-zinc-600 text-xs text-center px-2">{titulo}</span>
                      </div>
                    )}
                    {/* Overlay con botón quitar */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => tab === 'vistas' ? quitarVista(entrada.pelicula_id) : quitarWatchlist(entrada.pelicula_id)}
                        className="text-xs bg-zinc-900 border border-zinc-600 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {tab === 'vistas' ? '✕ Quitar vista' : '✕ Quitar'}
                      </button>
                    </div>
                    {/* Badge rating */}
                    {tab === 'vistas' && entrada.rating && (
                      <div className="absolute top-2 right-2 bg-zinc-900/90 rounded-full px-2 py-0.5 text-xs font-bold text-white">
                        {entrada.rating}/10
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-white text-xs font-semibold leading-snug truncate">{titulo}</p>
                    {p.titulo_ingles && p.titulo !== p.titulo_ingles && (
                      <p className="text-zinc-500 text-xs truncate">{p.titulo}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {p.anio && <span className="text-zinc-500 text-xs">{p.anio}</span>}
                      {p.nota_imdb && <span className="text-yellow-400 text-xs">⭐ {p.nota_imdb}</span>}
                      {p.rt_score != null && <span className="text-red-400 text-xs">🍅 {p.rt_score}%</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
