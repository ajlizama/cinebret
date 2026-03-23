'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'
import UsernameModal from './UsernameModal'

type Props = { active?: 'inicio' | 'comunidad' | 'reel' | 'perfil' }

type Notif = {
  id: string
  type: 'follow' | 'like' | 'personalizar' | 'lista_comentario' | 'lista_invitacion' | 'recomendacion' | 'lista_pelicula'
  from_username: string | null
  from_avatar: string | null
  read: boolean
  created_at: string
  meta?: {
    redirect_url?: string
    pelicula_titulo?: string
    lista_tipo?: string
    [key: string]: unknown
  } | null
}

type Perfil = {
  user_id: string
  username: string
  avatar_url: string | null
  vistas: number
  sigo: boolean
}

type ResultadoPelicula = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

function MiniAvatar({ url, username }: { url: string | null; username: string }) {
  if (url) return <img src={url} alt={username} className="w-7 h-7 rounded-full object-cover shrink-0" />
  return (
    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
      {username[0]?.toUpperCase()}
    </div>
  )
}

export default function Nav({ active }: Props) {
  const { user, username, loading, signOut } = useAuth()
  const router = useRouter()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usernameModal, setUsernameModal] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [showNotifs, setShowNotifs] = useState(false)

  // Avatar del usuario logueado
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!user) { setAvatarUrl(null); return }
    supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null))
  }, [user])

  // Buscador unificado
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Perfil[]>([])
  const [peliculasResultados, setPeliculasResultados] = useState<ResultadoPelicula[]>([])
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false)
  const [siguiendoMap, setSiguiendoMap] = useState<Record<string, boolean>>({})
  const [showSearch, setShowSearch] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Auto-abrir modal de activación cuando el usuario no tiene perfil
  useEffect(() => {
    if (!loading && user && !username) setUsernameModal(true)
  }, [loading, user, username])

  useEffect(() => {
    if (!user) { setNotifs([]); return }
    fetchNotifs()
  }, [user])

  const fetchNotifs = async () => {
    if (!user) return
    const { data: raw } = await supabase
      .from('notifications')
      .select('id, type, from_user_id, read, created_at, meta')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!raw || raw.length === 0) return

    const fromIds = [...new Set(raw.map((n: any) => n.from_user_id).filter(Boolean))]
    const { data: profiles } = await supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', fromIds)
    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null } })

    const mapped: Notif[] = raw
      .filter((n: any) => !n.from_user_id || profileMap[n.from_user_id])
      .map((n: any) => ({
        id: n.id,
        type: n.type as 'follow' | 'like' | 'personalizar' | 'lista_comentario' | 'lista_invitacion' | 'recomendacion' | 'lista_pelicula',
        from_username: n.from_user_id ? profileMap[n.from_user_id]?.username ?? null : null,
        from_avatar: n.from_user_id ? profileMap[n.from_user_id]?.avatar_url ?? null : null,
        read: n.read,
        created_at: n.created_at,
        meta: n.meta ?? null,
      }))

    setNotifs(mapped)
  }

  const marcarLeidas = async () => {
    if (!user) return
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifs.filter(n => !n.read).length

  const handleNotifClick = async (n: Notif) => {
    // Marcar como leída
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setShowNotifs(false)
    // Redirigir según tipo
    const redirectUrl = n.meta?.redirect_url
    if (redirectUrl) { router.push(redirectUrl); return }
    if (n.type === 'follow' && n.from_username) { router.push(`/perfil/${n.from_username}`); return }
    if (n.type === 'personalizar' && username) { router.push(`/perfil/${username}`); return }
  }

  // Búsqueda unificada: usuarios + películas
  useEffect(() => {
    const q = busqueda.trim()
    if (!q) { setResultados([]); setPeliculasResultados([]); setShowSearch(false); return }
    setShowSearch(true)
    setCargandoBusqueda(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const [{ data: profiles }, { data: peliculas }] = await Promise.all([
        supabase.rpc('buscar_usuarios', { q }),
        supabase.rpc('buscar_peliculas', { q }),
      ])

      // Películas
      setPeliculasResultados((peliculas ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles ?? null,
        anio: p.anio ?? null, nota_imdb: p.nota_imdb ?? null, poster_path: p.poster_path ?? null,
      })))

      // Usuarios
      if (!profiles || profiles.length === 0) { setResultados([]); setCargandoBusqueda(false); return }
      const vistasRes = await Promise.all(
        (profiles as any[]).map((p: any) => supabase.from('user_peliculas').select('*', { count: 'exact', head: true }).eq('user_id', p.user_id).eq('visto', true))
      )
      let sigosSet: Set<string> = new Set()
      if (user) {
        const { data: followsData } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
        sigosSet = new Set((followsData ?? []).map((f: any) => f.following_id))
      }
      const merged: Perfil[] = (profiles as any[])
        .map((p: any, i: number) => ({ user_id: p.user_id, username: p.username, avatar_url: p.avatar_url ?? null, vistas: vistasRes[i].count ?? 0, sigo: sigosSet.has(p.user_id) }))
        .filter((p: any) => !user || p.user_id !== user.id)
      setResultados(merged)
      const map: Record<string, boolean> = {}
      merged.forEach(p => { map[p.user_id] = p.sigo })
      setSiguiendoMap(map)
      setCargandoBusqueda(false)
    }, 300)
  }, [busqueda, user])

  const toggleFollow = async (perfil: Perfil) => {
    if (!user) return
    const sigo = siguiendoMap[perfil.user_id] !== undefined ? siguiendoMap[perfil.user_id] : perfil.sigo
    setSiguiendoMap(prev => ({ ...prev, [perfil.user_id]: !sigo }))
    if (sigo) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', perfil.user_id)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: perfil.user_id })
      await supabase.from('notifications').insert({ user_id: perfil.user_id, type: 'follow', from_user_id: user.id })
    }
  }

  return (
    <>
      <nav className="sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 md:px-2 py-3">
        <div className="max-w-7xl mx-auto flex gap-3 md:gap-4">
          {/* Logo — desktop: grande, ocupa ambas filas */}
          <Link href="/" className="shrink-0 hidden md:flex items-center pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-oficial.png" alt="CineBret" className="h-14 w-auto" />
          </Link>

          <div className="flex-1 min-w-0">
          {/* Fila 1: logo mobile + buscador + auth */}
          <div className="flex items-center justify-between mb-2.5 gap-3">
            <Link href="/" className="shrink-0 md:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-oficial.png" alt="CineBret" className="h-8 w-auto" />
            </Link>

            {/* Buscador unificado */}
            <div className="relative flex-1 max-w-xs" ref={searchRef}>
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onFocus={() => busqueda && setShowSearch(true)}
                placeholder="Buscar película o usuario..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              {showSearch && busqueda && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSearch(false)} />
                  <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto">
                    {cargandoBusqueda ? (
                      <p className="text-zinc-500 text-xs px-4 py-3">Buscando...</p>
                    ) : peliculasResultados.length === 0 && resultados.length === 0 ? (
                      <p className="text-zinc-500 text-xs px-4 py-3">Sin resultados</p>
                    ) : (
                      <>
                        {/* Sección películas */}
                        {peliculasResultados.length > 0 && (
                          <div>
                            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide px-3 pt-2.5 pb-1">Películas</p>
                            {peliculasResultados.map(p => (
                              <Link
                                key={p.id}
                                href={`/pelicula/${p.id}`}
                                onClick={() => { setBusqueda(''); setShowSearch(false) }}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800/60 last:border-0 transition-colors"
                              >
                                <div className="w-8 shrink-0 rounded overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                                  {p.poster_path && (
                                    <img
                                      src={`https://image.tmdb.org/t/p/w92${p.poster_path}`}
                                      alt={p.titulo_ingles ?? p.titulo}
                                      className="w-full h-full object-cover"
                                    />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-medium leading-snug line-clamp-1">{p.titulo_ingles ?? p.titulo}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {p.anio && <span className="text-zinc-500 text-[10px]">{p.anio}</span>}
                                    {p.nota_imdb && <span className="text-yellow-400 text-[10px]">⭐ {p.nota_imdb}</span>}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Sección usuarios */}
                        {resultados.length > 0 && (
                          <div>
                            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide px-3 pt-2.5 pb-1">Usuarios</p>
                            {resultados.map(perfil => (
                              <div key={perfil.user_id} className="flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800 border-b border-zinc-800/60 last:border-0">
                                <Link href={`/perfil/${perfil.username}`} onClick={() => { setBusqueda(''); setShowSearch(false) }} className="flex items-center gap-2.5">
                                  <MiniAvatar url={perfil.avatar_url} username={perfil.username} />
                                  <div>
                                    <p className="text-white text-xs font-medium">@{perfil.username}</p>
                                    <p className="text-zinc-500 text-xs">{perfil.vistas} vistas</p>
                                  </div>
                                </Link>
                                {user && (
                                  <button
                                    onClick={() => toggleFollow(perfil)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                      siguiendoMap[perfil.user_id]
                                        ? 'border-zinc-600 text-zinc-400 hover:border-red-500 hover:text-red-400'
                                        : 'bg-yellow-400 border-yellow-400 text-zinc-950 hover:bg-yellow-300'
                                    }`}
                                  >
                                    {siguiendoMap[perfil.user_id] ? 'Siguiendo' : '+ Seguir'}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <a
                href="https://open.spotify.com/playlist/4KR3H2OR7VzwZM0AMDskap?si=c8ac5239a4564661"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-green-400 transition-colors"
                aria-label="Playlist Spotify CineBret"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/>
                </svg>
              </a>
              <a
                href="https://www.instagram.com/cinebret/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-pink-400 transition-colors"
                aria-label="Instagram CineBret"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="3.5" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </a>
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2">
                    {/* Campana de notificaciones */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          const opening = !showNotifs
                          setShowNotifs(opening)
                          if (opening) marcarLeidas()
                        }}
                        className="relative text-zinc-500 hover:text-white transition-colors p-1"
                        aria-label="Notificaciones"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold leading-none px-0.5">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>
                      {showNotifs && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowNotifs(false)} />
                          <div className="absolute top-full right-0 mt-2 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-72 overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-300">Notificaciones</span>
                              {notifs.some(n => !n.read) && (
                                <button onClick={marcarLeidas} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                                  Marcar leídas
                                </button>
                              )}
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                              {notifs.length === 0 ? (
                                <p className="text-zinc-600 text-xs px-4 py-4 text-center">Sin notificaciones aún</p>
                              ) : (
                                notifs.map(n => (
                                  <button
                                    key={n.id}
                                    onClick={() => handleNotifClick(n)}
                                    className={`w-full flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 text-left transition-colors hover:bg-zinc-800/70 ${!n.read ? 'bg-zinc-800/50' : ''}`}
                                  >
                                    {n.type === 'personalizar' ? (
                                      <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center text-sm shrink-0">✨</div>
                                    ) : n.type === 'lista_comentario' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-sm shrink-0">💬</div>
                                    ) : n.type === 'lista_pelicula' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-sm shrink-0">🎬</div>
                                    ) : n.type === 'lista_invitacion' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-sm shrink-0">📋</div>
                                    ) : n.type === 'recomendacion' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-sm shrink-0">✈️</div>
                                    ) : (
                                      <MiniAvatar url={n.from_avatar} username={n.from_username ?? '?'} />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-zinc-300 leading-snug">
                                        {n.type === 'personalizar' ? (
                                          <span className="text-white font-medium">Personaliza tus recomendaciones</span>
                                        ) : n.type === 'lista_comentario' ? (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' comentó en '}
                                            <span className="text-zinc-200">{n.meta?.pelicula_titulo ?? 'una película'}</span>
                                            {' de tu '}
                                            <span className="text-zinc-200">{n.meta?.lista_tipo === 'watchlist' ? 'watchlist' : 'lista de vistas'}</span>
                                          </>
                                        ) : n.type === 'lista_pelicula' ? (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' agregó '}
                                            <span className="text-zinc-200">{(n.meta as any)?.pelicula_titulo ?? 'una película'}</span>
                                            {' a '}
                                            <span className="text-zinc-200">{(n.meta as any)?.lista_nombre ?? 'la lista'}</span>
                                          </>
                                        ) : n.type === 'lista_invitacion' ? (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' te invitó a la lista '}
                                            <span className="text-zinc-200">{(n.meta as any)?.lista_nombre ?? 'compartida'}</span>
                                          </>
                                        ) : n.type === 'recomendacion' ? (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' te recomendó '}
                                            <span className="text-zinc-200">{n.meta?.pelicula_titulo ?? 'una película'}</span>
                                            {(n.meta as any)?.mensaje && (
                                              <span className="block text-zinc-400 italic mt-0.5">"{(n.meta as any).mensaje}"</span>
                                            )}
                                          </>
                                        ) : n.type === 'follow' ? (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' te siguió'}
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-white font-medium">@{n.from_username}</span>
                                            {' le dio ♥ a tu reseña'}
                                          </>
                                        )}
                                      </p>
                                      <p className="text-xs text-zinc-600 mt-0.5">{tiempoRelativo(n.created_at)}</p>
                                    </div>
                                    {!n.read && <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full shrink-0 mt-1.5" />}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {username ? (
                      <Link href={`/perfil/${username}`} className="text-zinc-400 hover:text-white text-xs transition-colors hidden sm:block">
                        @{username}
                      </Link>
                    ) : (
                      <button onClick={() => setUsernameModal(true)} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
                        + Activar perfil
                      </button>
                    )}
                    <button
                      onClick={() => signOut().then(() => router.push('/'))}
                      className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white rounded-lg px-3 py-1.5 text-xs transition-colors"
                    >
                      Salir
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setModalAbierto(true)}
                    className="border border-zinc-700 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400 rounded-lg px-3 py-1.5 text-xs transition-colors whitespace-nowrap"
                  >
                    Iniciar sesión
                  </button>
                )
              )}
            </div>
          </div>
          {/* Fila 2: navegación principal */}
          <div className="flex items-center justify-around border-t border-zinc-800 pt-2 mt-1">
            {/* Inicio */}
            <Link href="/catalogo" className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'inicio' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[10px] font-medium">Inicio</span>
            </Link>

            {/* Comunidad */}
            <Link href="/comunidad" className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'comunidad' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[10px] font-medium">Comunidad</span>
            </Link>

            {/* Reel */}
            <Link href="/reel" className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'reel' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="9" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" />
                <line x1="3" y1="9" x2="21" y2="9" strokeLinecap="round" />
                <line x1="3" y1="15" x2="21" y2="15" strokeLinecap="round" />
                <line x1="9" y1="3.5" x2="7.5" y2="20.5" strokeLinecap="round" />
                <line x1="15" y1="3.5" x2="16.5" y2="20.5" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium">Reel</span>
            </Link>

            {/* Perfil */}
            {user && username ? (
              <Link href={`/perfil/${username}`} className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'perfil' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={username} className={`w-5 h-5 rounded-full object-cover ${active === 'perfil' ? 'ring-2 ring-white' : ''}`} />
                ) : (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active === 'perfil' ? 'bg-white text-zinc-950' : 'bg-zinc-700 text-zinc-300'}`}>
                    {username[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-[10px] font-medium">Perfil</span>
              </Link>
            ) : !loading ? (
              <button onClick={() => setModalAbierto(true)} className="flex flex-col items-center gap-0.5 text-zinc-500 hover:text-zinc-300 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[10px] font-medium">Perfil</span>
              </button>
            ) : null}
          </div>
          </div>
        </div>
      </nav>

      {modalAbierto && <AuthModal onClose={() => setModalAbierto(false)} />}
      {usernameModal && <UsernameModal onClose={() => setUsernameModal(false)} forced={!username} />}
    </>
  )
}
