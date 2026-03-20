'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Pelicula = {
  pelicula_id: string
  rating: number | null
  pelicula: {
    titulo: string
    titulo_ingles: string | null
    anio: number | null
    nota_imdb: number | null
    poster_path: string | null
    oscars: string | null
    categoria: string | null
    enriquecimiento: {
      director: string | null
      actores: string | null
      compositor: string | null
    } | null
  }
}

type Stats = {
  oscarWinners: number
  topDirectores: [string, number][]
  topActores: [string, number][]
  topCompositores: [string, number][]
  categorias: Record<string, number>
}

const CATEGORIAS_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "Pa'l domingo de bajón", label: 'Bajón dominical', color: 'bg-indigo-500' },
  { key: "Pa' saltar del sillón", label: 'Acción / Adrenalina', color: 'bg-red-500' },
  { key: "Pa' quedar con el cerebro como licuadora", label: 'Cerebro licuadora', color: 'bg-yellow-400' },
  { key: "Pa' llorar a moco tendido", label: 'Drama / Moco', color: 'bg-blue-400' },
]

function computeStats(peliculas: Pelicula[]): Stats {
  const directors: Record<string, number> = {}
  const actors: Record<string, number> = {}
  const composers: Record<string, number> = {}
  const categorias: Record<string, number> = {}
  let oscarWinners = 0

  for (const e of peliculas) {
    const p = e.pelicula
    const osc = (p.oscars ?? '').toLowerCase()
    if (
      osc.startsWith('ganó') &&
      osc.includes('mejor película') &&
      !osc.includes('animad') &&
      !osc.includes('internacional') &&
      !osc.includes('extranjera') &&
      !osc.includes('habla no inglesa')
    ) oscarWinners++

    if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1

    const enr = p.enriquecimiento
    if (enr?.director) {
      const d = enr.director.trim()
      if (d) directors[d] = (directors[d] ?? 0) + 1
    }
    if (enr?.actores) {
      enr.actores.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
        actors[a] = (actors[a] ?? 0) + 1
      })
    }
    if (enr?.compositor) {
      const c = enr.compositor.trim()
      if (c) composers[c] = (composers[c] ?? 0) + 1
    }
  }

  return {
    oscarWinners,
    topDirectores: Object.entries(directors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topActores: Object.entries(actors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topCompositores: Object.entries(composers).sort((a, b) => b[1] - a[1]).slice(0, 3),
    categorias,
  }
}

function TopList({ title, items }: { title: string; items: [string, number][] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map(([name, count], i) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-zinc-600 text-xs w-3">{i + 1}.</span>
            <span className="text-zinc-200 text-sm flex-1 truncate">{name}</span>
            <span className="text-zinc-500 text-xs shrink-0">{count} {count === 1 ? 'peli' : 'pelis'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VibeMapa({ categorias }: { categorias: Record<string, number> }) {
  const total = Object.values(categorias).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const max = Math.max(...CATEGORIAS_CONFIG.map(c => categorias[c.key] ?? 0), 1)
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Vibe map</p>
      <div className="space-y-2">
        {CATEGORIAS_CONFIG.map(cat => {
          const val = categorias[cat.key] ?? 0
          const pct = Math.round((val / total) * 100)
          return (
            <div key={cat.key}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-xs text-zinc-400">{cat.label}</span>
                <span className="text-xs text-zinc-500">{val > 0 ? `${pct}%` : '—'}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full ${cat.color} rounded transition-all`}
                  style={{ width: `${(val / max) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PerfilPage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [yaSigo, setYaSigo] = useState(false)
  const [enComun, setEnComun] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [loadingFollow, setLoadingFollow] = useState(false)

  useEffect(() => {
    if (!username) return

    supabase.from('profiles').select('user_id').eq('username', username).maybeSingle()
      .then(async ({ data: profile }) => {
        if (!profile) { setNotFound(true); setCargando(false); return }
        const uid = profile.user_id
        setProfileUserId(uid)

        const [{ data: vistas }, { count: nSeguidores }, { count: nSiguiendo }, { data: followCheck }, { data: misVistas }] = await Promise.all([
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, categoria, enriquecimiento(director, actores, compositor))')
            .eq('user_id', uid).eq('visto', true),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
          user
            ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', uid).maybeSingle()
            : Promise.resolve({ data: null }),
          (user && user.id !== uid)
            ? supabase.from('user_peliculas').select('pelicula_id').eq('user_id', user.id).eq('visto', true)
            : Promise.resolve({ data: null }),
        ] as const)

        const mapped: Pelicula[] = (vistas ?? [])
          .map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas }))
          .filter((r: any) => r.pelicula)
          .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))

        setPeliculas(mapped)
        setStats(computeStats(mapped))
        setSeguidores(nSeguidores ?? 0)
        setSiguiendo(nSiguiendo ?? 0)
        setYaSigo(!!followCheck)

        if (misVistas && misVistas.length > 0) {
          const misIds = new Set((misVistas as any[]).map(v => v.pelicula_id))
          const comun = mapped.filter(p => misIds.has(p.pelicula_id)).length
          setEnComun(comun)
        }

        setCargando(false)
      })
  }, [username, user])

  const toggleFollow = async () => {
    if (!user || !profileUserId || user.id === profileUserId) return
    setLoadingFollow(true)
    if (yaSigo) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profileUserId)
      setYaSigo(false); setSeguidores(s => s - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profileUserId })
      setYaSigo(true); setSeguidores(s => s + 1)
    }
    setLoadingFollow(false)
  }

  if (cargando) return (
    <main className="min-h-screen bg-zinc-950"><Nav />
      <div className="flex items-center justify-center h-64"><p className="text-zinc-500 text-sm">Cargando...</p></div>
    </main>
  )

  if (notFound) return (
    <main className="min-h-screen bg-zinc-950"><Nav />
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-zinc-400 text-sm">No existe el perfil <span className="text-white">@{username}</span></p>
        <Link href="/catalogo" className="text-zinc-600 hover:text-white text-xs transition-colors">← Volver al catálogo</Link>
      </div>
    </main>
  )

  const esMiPerfil = user?.id === profileUserId

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header perfil */}
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white">@{username}</h1>
            <div className="flex gap-4 mt-2 text-sm text-zinc-500 flex-wrap">
              <span><span className="text-white font-semibold">{peliculas.length}</span> vistas</span>
              <span><span className="text-white font-semibold">{seguidores}</span> seguidores</span>
              <span><span className="text-white font-semibold">{siguiendo}</span> siguiendo</span>
              {enComun !== null && (
                <span><span className="text-yellow-400 font-semibold">{enComun}</span> en común contigo</span>
              )}
            </div>
          </div>
          {!esMiPerfil && user && (
            <button
              onClick={toggleFollow}
              disabled={loadingFollow}
              className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 ${
                yaSigo
                  ? 'border-zinc-600 text-zinc-400 hover:border-red-500 hover:text-red-400'
                  : 'bg-yellow-400 border-yellow-400 text-zinc-950 hover:bg-yellow-300'
              }`}
            >
              {yaSigo ? 'Siguiendo' : '+ Seguir'}
            </button>
          )}
        </div>

        {/* Stats panel */}
        {stats && peliculas.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-amber-300">{stats.oscarWinners}</p>
              <p className="text-xs text-zinc-500 mt-1">Ganadoras Oscar Mejor Película</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-blue-400">
                {peliculas.filter(p => p.rating).length > 0
                  ? (peliculas.filter(p => p.rating).reduce((s, p) => s + (p.rating ?? 0), 0) / peliculas.filter(p => p.rating).length).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Rating promedio</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-emerald-400">{peliculas.length}</p>
              <p className="text-xs text-zinc-500 mt-1">Películas vistas</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-pink-400">
                {peliculas.filter(p => p.pelicula.nota_imdb).length > 0
                  ? (peliculas.filter(p => p.pelicula.nota_imdb).reduce((s, p) => s + (p.pelicula.nota_imdb ?? 0), 0) / peliculas.filter(p => p.pelicula.nota_imdb).length).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-zinc-500 mt-1">IMDB promedio visto</p>
            </div>
          </div>
        )}

        {/* Tops + Vibe */}
        {stats && peliculas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Tops */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
              <TopList title="Top directores" items={stats.topDirectores} />
              <TopList title="Top actores" items={stats.topActores} />
              <TopList title="Top compositores" items={stats.topCompositores} />
              {stats.topDirectores.length === 0 && stats.topActores.length === 0 && stats.topCompositores.length === 0 && (
                <p className="text-zinc-600 text-sm">Sin datos de equipo aún</p>
              )}
            </div>
            {/* Vibe mapa */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <VibeMapa categorias={stats.categorias} />
              {Object.keys(stats.categorias).length === 0 && (
                <p className="text-zinc-600 text-sm">Sin datos de categorías aún</p>
              )}
            </div>
          </div>
        )}

        {/* Grid películas */}
        {peliculas.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no ha marcado películas como vistas.</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Películas vistas</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {peliculas.map(entrada => {
                const p = entrada.pelicula
                const titulo = p.titulo_ingles || p.titulo
                return (
                  <Link key={entrada.pelicula_id} href={`/pelicula/${entrada.pelicula_id}`}>
                    <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
                      <div className="relative aspect-[2/3] bg-zinc-800">
                        {p.poster_path ? (
                          <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={titulo} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center p-1">
                            <span className="text-zinc-600 text-xs text-center leading-tight">{titulo}</span>
                          </div>
                        )}
                        {entrada.rating && (
                          <div className="absolute top-1 right-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400">
                            {entrada.rating}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
