'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
// ParaTi moved to home page (catalogo)
import AutorReviewLike from '@/app/pelicula/[id]/AutorReviewLike'
import CuestionarioOnboarding from '@/app/perfil/CuestionarioOnboarding'
import YouTubeClip from '@/components/YouTubeClip'
import Loading from '@/components/Loading'
import { extractYouTubeId } from '@/lib/youtube'

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
  user_id: string
  pelicula_id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
  rating: number | null
  isCineBret: boolean
  publica?: boolean
  video_clip_url?: string | null
  sinopsis?: string | null
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
  if (url) return <img loading="lazy" src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
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

// Global tracker: only the most visible video plays
const visibleVideos = new Map<HTMLVideoElement, number>()

function updateActiveVideo() {
  let best: HTMLVideoElement | null = null
  let bestRatio = 0
  visibleVideos.forEach((ratio, video) => {
    if (ratio > bestRatio) { bestRatio = ratio; best = video }
  })
  visibleVideos.forEach((_, video) => {
    if (video === best) {
      if (video.paused) video.play().catch(() => {})
    } else {
      if (!video.paused) { video.pause(); video.currentTime = 0 }
    }
  })
}

function AutoplayClip({ url }: { url: string }) {
  const ytId = extractYouTubeId(url)
  if (ytId) {
    return <YouTubeClip videoId={ytId} className="mt-2 mb-1" />
  }

  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio > 0.3) {
          visibleVideos.set(video, entry.intersectionRatio)
        } else {
          visibleVideos.delete(video)
          video.pause()
          video.currentTime = 0
          setMuted(true)
        }
        updateActiveVideo()
      },
      { threshold: [0, 0.3, 0.5, 0.7, 1] }
    )
    observer.observe(video)
    return () => { observer.disconnect(); visibleVideos.delete(video) }
  }, [])

  return (
    <div className="relative rounded-xl overflow-hidden bg-black mt-2 mb-1">
      <video
        ref={ref}
        src={url}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="w-full max-h-72 object-contain"
        onClick={() => setMuted(m => !m)}
      />
      <button
        onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
        className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-white text-xs"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}

function FeedCard({
  item, likes, youLiked, onToggleLike, visto, watchlist, onToggleVisto, onToggleWatchlist, hasUser,
}: {
  item: FeedItem
  likes?: number; youLiked?: boolean; onToggleLike?: () => void
  visto?: boolean; watchlist?: boolean; onToggleVisto?: () => void; onToggleWatchlist?: () => void
  hasUser?: boolean
}) {
  const [expandido, setExpandido] = useState(false)

  return (
    <div className="bg-black border-t border-b border-zinc-800 overflow-hidden">
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
      <div className="flex gap-3 px-4 pb-3">
        <Link href={`/pelicula/${item.pelicula_id}`} className="shrink-0">
          {item.poster_path && (
            <div className="relative w-28 rounded-lg overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
              <Image src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.titulo_ingles || item.titulo} fill className="object-cover" />
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/pelicula/${item.pelicula_id}`} className="hover:opacity-80 transition-opacity">
            <p className="text-white text-sm font-semibold mb-1 leading-snug">{item.titulo_ingles || item.titulo}</p>
          </Link>
          {item.isCineBret && item.sinopsis && (
            <p className="text-zinc-400 text-sm italic leading-relaxed mb-2 border-l-2 border-zinc-700 pl-3">{item.sinopsis}</p>
          )}
          <p
            onClick={() => setExpandido(v => !v)}
            className={`text-sm leading-relaxed cursor-pointer ${expandido ? '' : 'line-clamp-4'} ${item.isCineBret ? 'text-zinc-300' : 'text-zinc-400'}`}
          >
            {item.review_text}
          </p>
          {!expandido && item.review_text.length > 200 && (
            <button onClick={() => setExpandido(true)} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1 transition-colors">
              Ver más
            </button>
          )}
          {expandido && (
            <button onClick={() => setExpandido(false)} className="text-xs text-zinc-500 hover:text-zinc-300 mt-1 transition-colors">
              Ver menos
            </button>
          )}
        </div>
      </div>

      {/* Video clip */}
      {item.video_clip_url && (
        <div className="px-4">
          <AutoplayClip url={item.video_clip_url} />
        </div>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3 px-4 pb-3">
        {item.isCineBret ? (
          <AutorReviewLike peliculaId={item.pelicula_id} />
        ) : (
          <>
            {/* Like review */}
            <button
              onClick={onToggleLike}
              className={`flex items-center gap-1 text-xs transition-colors ${youLiked ? 'text-yellow-400' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <span className="text-sm leading-none">{youLiked ? '♥' : '♡'}</span>
              {(likes ?? 0) > 0 && <span>{likes}</span>}
            </button>
            {/* Vista */}
            {hasUser && (
              <>
                <button
                  onClick={onToggleVisto}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${visto ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                >
                  {visto ? '✓ Vista' : '○ Vista'}
                </button>
                <button
                  onClick={onToggleWatchlist}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${watchlist ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                >
                  {watchlist ? '★' : '☆'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

type PerfilPreferencias = {
  birth_year: number | null
  fav_movies: string[]
  generos_preferidos: string[]
  mood_ranking: string[]
  peso_critica: number
  peso_seguidores: number
  peso_director?: number
  peso_actores?: number
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
  const [likesMap, setLikesMap] = useState<Record<string, { count: number; youLiked: boolean }>>({})
  const [misPeliculasMap, setMisPeliculasMap] = useState<Record<string, { visto: boolean; watchlist: boolean }>>({})
  const [cuestionarioAbierto, setCuestionarioAbierto] = useState(false)
  const [preferencias, setPreferencias] = useState<PerfilPreferencias | null>(null)
  const [preferenciasLoaded, setPreferenciasLoaded] = useState(false)
  const [paraTiKey, setParaTiKey] = useState(0)

  // Fetch preferencias del usuario — incrementa paraTiKey cuando estén listas
  useEffect(() => {
    if (!user) { setPreferenciasLoaded(true); return }
    supabase
      .from('perfil_preferencias')
      .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores, peso_director, peso_actores')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPreferencias(data as PerfilPreferencias ?? null)
        setPreferenciasLoaded(true)
        setParaTiKey(k => k + 1)
      })
  }, [user])

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
      .select('pelicula_id, review_autor, video_clip_url, sinopsis_chilensis, peliculas(id, titulo, titulo_ingles, poster_path)')
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
            user_id: '',
            pelicula_id: r.pelicula_id,
            titulo: r.peliculas.titulo,
            titulo_ingles: r.peliculas.titulo_ingles,
            poster_path: r.peliculas.poster_path,
            rating: null,
            isCineBret: true,
            video_clip_url: r.video_clip_url ?? null,
            sinopsis: r.sinopsis_chilensis ?? null,
          }))
        setFeedCineBret(items)
        setCargandoFeed(false)
      })
  }, [])

  // Fetch reviews: públicas (todos) + privadas de seguidores
  useEffect(() => {
    if (!user) return

    const fetchReviews = async () => {
      // Obtener lista de seguidos
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
      const followingIds: string[] = (follows ?? []).map((f: any) => f.following_id)

      // Query 1: reseñas de seguidos (siempre — no depende de columna publica)
      const followerData: any[] = []
      if (followingIds.length > 0) {
        const { data } = await supabase.from('user_reviews')
          .select('id, review_text, created_at, user_id, pelicula_id')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(30)
        ;(data ?? []).forEach(r => followerData.push(r))
      }

      // Query 2: reseñas públicas (opcional — solo si la columna publica existe)
      const publicData: any[] = []
      try {
        const { data, error } = await supabase.from('user_reviews')
          .select('id, review_text, created_at, user_id, pelicula_id')
          .eq('publica', true)
          .neq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30)
        if (!error) (data ?? []).forEach(r => publicData.push(r))
      } catch { /* columna publica aún no existe */ }

      // Merge deduplicado (seguidos tienen prioridad)
      const reviewMap = new Map<string, any>()
      ;[...followerData, ...publicData].forEach((r: any) => { if (!reviewMap.has(r.id)) reviewMap.set(r.id, r) })
      const reviews = [...reviewMap.values()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 40)

      if (reviews.length === 0) return

      const reviewUserIds = [...new Set(reviews.map((r: any) => r.user_id))]
      const peliculaIds   = [...new Set(reviews.map((r: any) => r.pelicula_id))]
      const reviewIds     = reviews.map((r: any) => r.id)

      const [{ data: profiles }, { data: peliculas }, { data: userPelis }, { data: likesData }, { data: misMovies }, { data: enrData }] = await Promise.all([
        supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', reviewUserIds),
        supabase.from('peliculas').select('id, titulo, titulo_ingles, poster_path').in('id', peliculaIds),
        supabase.from('user_peliculas').select('user_id, pelicula_id, rating').in('user_id', reviewUserIds).in('pelicula_id', peliculaIds),
        supabase.from('review_likes').select('review_id, user_id').in('review_id', reviewIds),
        supabase.from('user_peliculas').select('pelicula_id, visto, watchlist').eq('user_id', user.id).in('pelicula_id', peliculaIds),
        supabase.from('enriquecimiento').select('pelicula_id, video_clip_url').in('pelicula_id', peliculaIds).not('video_clip_url', 'is', null),
      ])

      const clipMap: Record<string, string> = {}
      ;(enrData ?? []).forEach((e: any) => { if (e.video_clip_url) clipMap[e.pelicula_id] = e.video_clip_url })

      const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
      ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null } })

      const peliculaMap: Record<string, { titulo: string; titulo_ingles: string | null; poster_path: string | null }> = {}
      ;(peliculas ?? []).forEach((p: any) => { peliculaMap[p.id] = p })

      const ratingMap: Record<string, number | null> = {}
      ;(userPelis ?? []).forEach((r: any) => { ratingMap[`${r.user_id}_${r.pelicula_id}`] = r.rating ?? null })

      const newLikesMap: Record<string, { count: number; youLiked: boolean }> = {}
      ;(likesData ?? []).forEach((l: any) => {
        if (!newLikesMap[l.review_id]) newLikesMap[l.review_id] = { count: 0, youLiked: false }
        newLikesMap[l.review_id].count++
        if (l.user_id === user.id) newLikesMap[l.review_id].youLiked = true
      })
      setLikesMap(newLikesMap)

      const newMisMap: Record<string, { visto: boolean; watchlist: boolean }> = {}
      ;(misMovies ?? []).forEach((m: any) => { newMisMap[m.pelicula_id] = { visto: m.visto, watchlist: m.watchlist } })
      setMisPeliculasMap(newMisMap)

      const items: FeedItem[] = reviews
        .filter((r: any) => profileMap[r.user_id] && peliculaMap[r.pelicula_id])
        .map((r: any) => ({
          id: r.id,
          review_text: r.review_text,
          created_at: r.created_at,
          username: profileMap[r.user_id].username,
          avatar_url: profileMap[r.user_id].avatar_url,
          user_id: r.user_id,
          pelicula_id: r.pelicula_id,
          titulo: peliculaMap[r.pelicula_id].titulo,
          titulo_ingles: peliculaMap[r.pelicula_id].titulo_ingles,
          poster_path: peliculaMap[r.pelicula_id].poster_path,
          rating: ratingMap[`${r.user_id}_${r.pelicula_id}`] ?? null,
          isCineBret: false,
          publica: r.publica,
          video_clip_url: clipMap[r.pelicula_id] ?? null,
        }))

      setFeedSeguidores(items)
    }

    fetchReviews()
  }, [user])


  const toggleLike = async (item: FeedItem) => {
    if (!user) return
    const current = likesMap[item.id] ?? { count: 0, youLiked: false }
    if (current.youLiked) {
      await supabase.from('review_likes').delete().eq('review_id', item.id).eq('user_id', user.id)
      setLikesMap(prev => ({ ...prev, [item.id]: { count: (prev[item.id]?.count ?? 1) - 1, youLiked: false } }))
    } else {
      await supabase.from('review_likes').insert({ review_id: item.id, user_id: user.id })
      setLikesMap(prev => ({ ...prev, [item.id]: { count: (prev[item.id]?.count ?? 0) + 1, youLiked: true } }))
      if (item.user_id && item.user_id !== user.id) {
        await supabase.from('notifications').insert({ user_id: item.user_id, type: 'like', from_user_id: user.id, meta: { review_id: item.id, redirect_url: `/pelicula/${item.pelicula_id}` } })
      }
    }
  }

  const toggleVisto = async (peliculaId: string) => {
    if (!user) return
    const current = misPeliculasMap[peliculaId] ?? { visto: false, watchlist: false }
    const nuevo = { ...current, visto: !current.visto }
    setMisPeliculasMap(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: null },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  const toggleWatchlist = async (peliculaId: string) => {
    if (!user) return
    const current = misPeliculasMap[peliculaId] ?? { visto: false, watchlist: false }
    const nuevo = { ...current, watchlist: !current.watchlist }
    setMisPeliculasMap(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: null },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

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

      {/* ── HERO ── */}
      <div className="relative overflow-hidden bg-zinc-950" style={{ height: '200px' }}>
        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white text-center mb-1.5 tracking-tight">
            Comunidad <span className="text-yellow-400">CineBret</span>
          </h1>
          <p className="text-zinc-300 text-sm md:text-base text-center mb-6 max-w-md">
            Busca, escribe y comparte tus reviews con tus amigos
          </p>
          <div className="relative w-full max-w-xl">
            <input type="text" placeholder="Buscar película o usuario..." readOnly
              onClick={() => { const el = document.querySelector('nav input') as HTMLInputElement; el?.focus() }}
              className="w-full bg-zinc-900/80 backdrop-blur-md border border-zinc-600 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder:text-zinc-400 focus:outline-none focus:border-yellow-400/60 focus:ring-1 focus:ring-yellow-400/30 text-sm cursor-pointer shadow-lg" />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">

        {/* Contenido principal — ancho completo */}
        <div>
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
                <div className="max-h-72 overflow-y-auto rounded-xl space-y-2 pr-1">
                  {cargandoTodos ? (
                    <Loading text="Cargando..." size="sm" />
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
            {cargandoFeed && <Loading text="Cargando..." size="sm" />}

            {!cargandoFeed && feedCombinado.length === 0 && (
              <p className="text-zinc-500 text-sm text-center mt-8">Sin contenido aún</p>
            )}

            {!cargandoFeed && feedCombinado.length > 0 && (
              <div className="space-y-4">
                {feedSeguidores.length > 0 && (
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">Reviews</p>
                )}
                {feedSeguidores.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    likes={likesMap[item.id]?.count ?? 0}
                    youLiked={likesMap[item.id]?.youLiked ?? false}
                    onToggleLike={() => toggleLike(item)}
                    visto={misPeliculasMap[item.pelicula_id]?.visto ?? false}
                    watchlist={misPeliculasMap[item.pelicula_id]?.watchlist ?? false}
                    onToggleVisto={() => toggleVisto(item.pelicula_id)}
                    onToggleWatchlist={() => toggleWatchlist(item.pelicula_id)}
                    hasUser={!!user}
                  />
                ))}

                {feedCineBret.length > 0 && (
                  <div className="flex items-center gap-3 pt-2">
                    <AvatarCineBret size={28} />
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Reviews de CineBret</p>
                  </div>
                )}
                {feedCineBret.map(item => <FeedCard key={item.id} item={item} hasUser={!!user} />)}
              </div>
            )}

        </div>
      </div>

      {/* Modal cuestionario */}
      {cuestionarioAbierto && (
        <CuestionarioOnboarding
          onComplete={async () => {
            setCuestionarioAbierto(false)
            if (user) {
              const { data } = await supabase
                .from('perfil_preferencias')
                .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores, peso_director, peso_actores')
                .eq('user_id', user.id)
                .maybeSingle()
              setPreferencias(data as PerfilPreferencias ?? null)
            }
            setParaTiKey(k => k + 1)
          }}
          onDismiss={() => setCuestionarioAbierto(false)}
          preferenciasIniciales={preferencias}
        />
      )}
    </main>
  )
}
