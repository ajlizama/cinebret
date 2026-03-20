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
  }
}

export default function PerfilPage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [yaSigo, setYaSigo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [loadingFollow, setLoadingFollow] = useState(false)

  useEffect(() => {
    if (!username) return

    supabase.from('profiles').select('user_id').eq('username', username).maybeSingle()
      .then(async ({ data: profile }) => {
        if (!profile) { setNotFound(true); setCargando(false); return }
        const uid = profile.user_id
        setProfileUserId(uid)

        const [{ data: vistas }, { count: nSeguidores }, { count: nSiguiendo }, { data: followCheck }] = await Promise.all([
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path)')
            .eq('user_id', uid).eq('visto', true),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
          user ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', uid).maybeSingle() : Promise.resolve({ data: null }),
        ])

        setPeliculas((vistas ?? []).map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas })).filter((r: any) => r.pelicula).sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0)))
        setSeguidores(nSeguidores ?? 0)
        setSiguiendo(nSiguiendo ?? 0)
        setYaSigo(!!followCheck)
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
            <div className="flex gap-4 mt-2 text-sm text-zinc-500">
              <span><span className="text-white font-semibold">{peliculas.length}</span> vistas</span>
              <span><span className="text-white font-semibold">{seguidores}</span> seguidores</span>
              <span><span className="text-white font-semibold">{siguiendo}</span> siguiendo</span>
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

        {/* Grid películas */}
        {peliculas.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no ha marcado películas como vistas.</p>
        ) : (
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
        )}
      </div>
    </main>
  )
}
