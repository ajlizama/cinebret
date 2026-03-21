'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import ParaTi from './ParaTi'

type Perfil = {
  user_id: string
  username: string
  avatar_url: string | null
  vistas: number
  sigo: boolean
}

type FeedItem = {
  id: string
  review_text: string
  created_at: string | null
  username: string
  avatar_url: string | null
  pelicula_id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
  rating: number | null
  isCineBret: boolean
}

function AvatarCineBret({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-yellow-400 flex items-center justify-center shrink-0 font-black text-zinc-950"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      CB
    </div>
  )
}

function Avatar({ url, username, size = 36 }: { url: string | null; username: string; size?: number }) {
  if (url) return <img src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300 shrink-0" style={{ width: size, height: size }}>
      {username[0]?.toUpperCase()}
    </div>
  )
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days}d`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function FeedCard({ item }: { item: FeedItem }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {item.isCineBret ? (
          <>
            <AvatarCineBret size={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-semibold">CineBret</span>
                <span className="text-xs bg-yellow-400 text-zinc-950 font-bold px-1.5 py-0.5 rounded-full leading-none">✍️ Autor</span>
              </div>
              <p className="text-zinc-500 text-xs">Review oficial</p>
            </div>
          </>
        ) : (
          <>
            <Link href={`/perfil/${item.username}`}>
              <Avatar url={item.avatar_url} username={item.username} size={36} />
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/perfil/${item.username}`} className="text-white text-sm font-medium hover:text-zinc-300">
                @{item.username}
              </Link>
              <p className="text-zinc-500 text-xs">{item.created_at ? tiempoRelativo(item.created_at) : ''}</p>
            </div>
            {item.rating && <span className="text-yellow-400 font-bold text-sm shrink-0">{item.rating}/10</span>}
          </>
        )}
      </div>

      {/* Película + texto */}
      <Link href={`/pelicula/${item.pelicula_id}`} className="flex gap-3 px-4 pb-4 hover:opacity-90 transition-opacity">
        {item.poster_path && (
          <div className="relative w-14 h-20 shrink-0 rounded-lg overflow-hidden bg-zinc-800">
            <Image
              src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
              alt={item.titulo_ingles || item.titulo}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold mb-1 leading-snug">
            {item.titulo_ingles || item.titulo}
          </p>
          <p className={`text-sm leading-relaxed line-clamp-4 ${item.isCineBret ? 'text-zinc-300' : 'text-zinc-400'}`}>
            {item.review_text}
          </p>
        </div>
      </Link>
    </div>
  )
}

export default function ComunidadPage() {
  const { user } = useAuth()
  const [siguiendoMap, setSiguiendoMap] = useState<Record<string, boolean>>({})
  const [feedSeguidores, setFeedSeguidores] = useState<FeedItem[]>([])
  const [feedCineBret, setFeedCineBret] = useState<FeedItem[]>([])
  const [cargandoFeed, setCargandoFeed] = useState(true)
  const [todosPerfiles, setTodosPerfiles] = useState<Perfil[]>([])
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [cargandoTodos, setCargandoTodos] = useState(true)

  // Fetch todos los perfiles
  useEffect(() => {
    const fetchTodos = async () => {
      setCargandoTodos(true)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .order('username')
        .limit(200)

      if (!profiles || profiles.length === 0) { setCargandoTodos(false); return }

      const userIds = profiles.map((p: any) => p.user_id)
      const { data: vistas } = await supabase
        .from('user_peliculas')
        .select('user_id')
        .eq('visto', true)
        .in('user_id', userIds)

      const vistasMap: Record<string, number> = {}
      ;(vistas ?? []).forEach((v: any) => { vistasMap[v.user_id] = (vistasMap[v.user_id] ?? 0) + 1 })

      let sigosSet: Set<string> = new Set()
      if (user) {
        const { data: followsData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
        sigosSet = new Set((followsData ?? []).map((f: any) => f.following_id))
      }

      const merged: Perfil[] = profiles
        .filter((p: any) => !user || p.user_id !== user.id)
        .map((p: any) => ({
          user_id: p.user_id,
          username: p.username,
          avatar_url: p.avatar_url ?? null,
          vistas: vistasMap[p.user_id] ?? 0,
          sigo: sigosSet.has(p.user_id),
        }))
        .sort((a, b) => b.vistas - a.vistas)

      setTodosPerfiles(merged)
      setCargandoTodos(false)
    }
    fetchTodos()
  }, [user])

  // Fetch CineBret reviews (siempre, para todos)
  useEffect(() => {
    supabase
      .from('enriquecimiento')
      .select('pelicula_id, review_autor, peliculas(id, titulo, titulo_ingles, poster_path)')
      .not('review_autor', 'is', null)
      .limit(40)
      .then(({ data }) => {
        if (!data) { setCargandoFeed(false); return }
        const items: FeedItem[] = (data as any[])
          .filter(r => r.peliculas && r.review_autor?.trim())
          .map(r => ({
            id: `cb_${r.pelicula_id}`,
            review_text: r.review_autor,
            created_at: null,
            username: 'CineBret',
            avatar_url: null,
            pelicula_id: r.pelicula_id,
            titulo: r.peliculas.titulo,
            titulo_ingles: r.peliculas.titulo_ingles,
            poster_path: r.peliculas.poster_path,
            rating: null,
            isCineBret: true,
          }))
        setFeedCineBret(items)
        setCargandoFeed(false)
      })
  }, [])

  // Fetch reviews de seguidores (solo si hay sesión)
  useEffect(() => {
    if (!user) return

    supabase.from('follows').select('following_id').eq('follower_id', user.id)
      .then(async ({ data: follows }) => {
        if (!follows || follows.length === 0) return
        const ids = follows.map((f: any) => f.following_id)

        const { data: reviews } = await supabase
          .from('user_reviews')
          .select('id, review_text, created_at, user_id, pelicula_id')
          .in('user_id', ids)
          .order('created_at', { ascending: false })
          .limit(30)

        if (!reviews || reviews.length === 0) return

        const reviewUserIds = [...new Set(reviews.map((r: any) => r.user_id))]
        const peliculaIds   = [...new Set(reviews.map((r: any) => r.pelicula_id))]

        const [{ data: profiles }, { data: peliculas }, { data: userPelis }] = await Promise.all([
          supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', reviewUserIds),
          supabase.from('peliculas').select('id, titulo, titulo_ingles, poster_path').in('id', peliculaIds),
          supabase.from('user_peliculas').select('user_id, pelicula_id, rating').in('user_id', reviewUserIds).in('pelicula_id', peliculaIds),
        ])

        const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
        ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null } })

        const peliculaMap: Record<string, { titulo: string; titulo_ingles: string | null; poster_path: string | null }> = {}
        ;(peliculas ?? []).forEach((p: any) => { peliculaMap[p.id] = p })

        const ratingMap: Record<string, number | null> = {}
        ;(userPelis ?? []).forEach((r: any) => { ratingMap[`${r.user_id}_${r.pelicula_id}`] = r.rating ?? null })

        const items: FeedItem[] = reviews
          .filter((r: any) => profileMap[r.user_id] && peliculaMap[r.pelicula_id])
          .map((r: any) => ({
            id: r.id,
            review_text: r.review_text,
            created_at: r.created_at,
            username: profileMap[r.user_id].username,
            avatar_url: profileMap[r.user_id].avatar_url,
            pelicula_id: r.pelicula_id,
            titulo: peliculaMap[r.pelicula_id].titulo,
            titulo_ingles: peliculaMap[r.pelicula_id].titulo_ingles,
            poster_path: peliculaMap[r.pelicula_id].poster_path,
            rating: ratingMap[`${r.user_id}_${r.pelicula_id}`] ?? null,
            isCineBret: false,
          }))

        setFeedSeguidores(items)
      })
  }, [user])


  const toggleFollow = async (perfil: Perfil) => {
    if (!user) return
    const sigo = siguiendoMap[perfil.user_id] !== undefined ? siguiendoMap[perfil.user_id] : perfil.sigo
    setSiguiendoMap(prev => ({ ...prev, [perfil.user_id]: !sigo }))
    setTodosPerfiles(prev => prev.map(p => p.user_id === perfil.user_id ? { ...p, sigo: !sigo } : p))
    if (sigo) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', perfil.user_id)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: perfil.user_id })
      await supabase.from('notifications').insert({
        user_id: perfil.user_id,
        type: 'follow',
        from_user_id: user.id,
      })
    }
  }

  // Feed combinado: reviews de seguidores primero, luego CineBret
  const feedCombinado: FeedItem[] = [...feedSeguidores, ...feedCineBret]

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="comunidad" />
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex justify-end mb-3">
          <Link href="/estadisticas" className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors">
            Ver estadísticas →
          </Link>
        </div>

        {/* Para ti */}
        <ParaTi />

        {/* Explorar todos los perfiles */}
        <div className="mb-6">
            <button
              onClick={() => setMostrarTodos(v => !v)}
              className="flex items-center gap-2 w-full text-left text-sm text-zinc-400 hover:text-white transition-colors mb-3"
            >
              <span className="text-xs">{mostrarTodos ? '▲' : '▼'}</span>
              <span className="font-medium">Explorar perfiles</span>
              {!cargandoTodos && <span className="text-zinc-600 text-xs">({todosPerfiles.length})</span>}
            </button>

            {mostrarTodos && (
              <div className="space-y-2">
                {cargandoTodos ? (
                  <p className="text-zinc-500 text-sm">Cargando...</p>
                ) : todosPerfiles.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Sin perfiles aún</p>
                ) : (
                  todosPerfiles.map(perfil => {
                    const sigoEste = siguiendoMap[perfil.user_id] !== undefined ? siguiendoMap[perfil.user_id] : perfil.sigo
                    return (
                      <div key={perfil.user_id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                        <Link href={`/perfil/${perfil.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                          <Avatar url={perfil.avatar_url} username={perfil.username} size={36} />
                          <div>
                            <p className="text-white text-sm font-medium">@{perfil.username}</p>
                            <p className="text-zinc-500 text-xs">{perfil.vistas} películas vistas</p>
                          </div>
                        </Link>
                        {user && (
                          <button
                            onClick={() => toggleFollow(perfil)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              sigoEste
                                ? 'border-zinc-600 text-zinc-400 hover:border-red-500 hover:text-red-400'
                                : 'bg-yellow-400 border-yellow-400 text-zinc-950 hover:bg-yellow-300'
                            }`}
                          >
                            {sigoEste ? 'Siguiendo' : '+ Seguir'}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
        </div>

        {/* Feed */}
        <>
          {cargandoFeed && <p className="text-zinc-500 text-sm">Cargando...</p>}

          {!cargandoFeed && feedCombinado.length === 0 && (
            <p className="text-zinc-500 text-sm text-center mt-8">Sin contenido aún</p>
          )}

          {!cargandoFeed && feedCombinado.length > 0 && (
            <div className="space-y-4">
              {feedSeguidores.length > 0 && (
                <p className="text-xs text-zinc-500 uppercase tracking-wide">Reviews de tus seguidos</p>
              )}
              {feedSeguidores.map(item => <FeedCard key={item.id} item={item} />)}

              {feedCineBret.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <AvatarCineBret size={28} />
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">Reviews de CineBret</p>
                </div>
              )}
              {feedCineBret.map(item => <FeedCard key={item.id} item={item} />)}
            </div>
          )}
        </>
      </div>
    </main>
  )
}
