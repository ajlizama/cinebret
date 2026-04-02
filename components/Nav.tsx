'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'
import UsernameModal from './UsernameModal'

type Props = { active?: 'inicio' | 'comunidad' | 'reel' | 'cinereels' | 'perfil'; transparent?: boolean }

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
  _isSerie?: boolean
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
  if (url) return <img loading="lazy" src={url} alt={username} className="w-7 h-7 rounded-full object-cover shrink-0" />
  return (
    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
      {username[0]?.toUpperCase()}
    </div>
  )
}

export default function Nav({ active, transparent }: Props) {
  const { user, username, loading, signOut } = useAuth()
  const { mode, setMode, hydrated } = useMediaMode()
  const activeMode = hydrated ? mode : 'peliculas'
  const router = useRouter()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usernameModal, setUsernameModal] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
      const [{ data: profiles }, pelisResult, seriesResult] = await Promise.all([
        supabase.rpc('buscar_usuarios', { q }),
        supabase.rpc('buscar_peliculas', { q }),
        supabase.from('series').select('id, titulo, titulo_ingles, anio_inicio, nota_imdb, poster_path').or(`titulo.ilike.%${q}%,titulo_ingles.ilike.%${q}%`).order('nota_imdb', { ascending: false, nullsFirst: false }).limit(10),
      ])

      // Películas + Series combinadas
      const pelis = (pelisResult.data ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles ?? null,
        anio: p.anio ?? null, nota_imdb: p.nota_imdb ?? null, poster_path: p.poster_path ?? null, _isSerie: false,
      }))
      const srs = (seriesResult.data ?? []).map((s: any) => ({
        id: s.id, titulo: s.titulo, titulo_ingles: s.titulo_ingles ?? null,
        anio: s.anio_inicio ?? null, nota_imdb: s.nota_imdb ?? null, poster_path: s.poster_path ?? null, _isSerie: true,
      }))
      setPeliculasResultados([...pelis, ...srs])

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
      <nav className={`sticky top-0 z-50 px-4 md:px-2 py-3 ${transparent ? 'bg-transparent border-b border-transparent' : 'bg-zinc-950 border-b border-zinc-800'}`}>
        <div className="max-w-7xl mx-auto flex gap-3 md:gap-4">
          {/* Logo — desktop: grande, ocupa ambas filas */}
          <Link href="/" className="shrink-0 hidden md:flex items-center pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={transparent ? "/logo-oficial-transparent.png" : "/logo-oficial.png"} alt="CineBret" className="h-14 w-auto" />
          </Link>

          <div className="flex-1 min-w-0">
          {/* Fila 1: logo mobile + buscador + auth */}
          <div className="flex items-center justify-between mb-2.5 gap-3">
            <Link href="/" className="shrink-0 md:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" src={transparent ? "/logo-oficial-transparent.png" : "/logo-oficial.png"} alt="CineBret" className="h-8 w-auto" />
            </Link>

            {/* Buscador unificado */}
            <div className="relative flex-1 max-w-xs" ref={searchRef}>
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onFocus={() => busqueda && setShowSearch(true)}
                placeholder="Buscar..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-[16px] md:text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400"
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
                        {/* Sección contenido */}
                        {peliculasResultados.length > 0 && (
                          <div>
                            <p className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wide px-3 pt-2.5 pb-1">Contenido</p>
                            {peliculasResultados.map(p => (
                              <Link
                                key={`${p._isSerie ? 's' : 'p'}-${p.id}`}
                                href={p._isSerie ? `/serie/${p.id}` : `/pelicula/${p.id}`}
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
                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${p._isSerie ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{p._isSerie ? 'Serie' : 'Película'}</span>
                                    {p.anio && <span className="text-zinc-500 text-[10px]">{p.anio}</span>}
                                    {p.nota_imdb && <span className="text-yellow-400 text-[10px] flex items-center gap-0.5"><svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {p.nota_imdb}</span>}
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
              {/* Toggle Películas / Series */}
              <div className="flex bg-zinc-800 rounded-lg p-0.5 gap-0.5" suppressHydrationWarning>
                <button
                  onClick={() => setMode('peliculas')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${activeMode === 'peliculas' ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
                  suppressHydrationWarning
                >
                  Películas
                </button>
                <button
                  onClick={() => setMode('series')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${activeMode === 'series' ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
                  suppressHydrationWarning
                >
                  Series
                </button>
              </div>

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
                                      <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2l1.09 3.26L16 6l-2.91.74L12 10l-1.09-3.26L8 6l2.91-.74L12 2zm5 7l.72 2.18L20 12l-2.28.82L17 15l-.72-2.18L14 12l2.28-.82L17 9zM7 13l.72 2.18L10 16l-2.28.82L7 19l-.72-2.18L4 16l2.28-.82L7 13z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                                    ) : n.type === 'lista_comentario' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                                    ) : n.type === 'lista_pelicula' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
                                    ) : n.type === 'lista_invitacion' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                                    ) : n.type === 'recomendacion' ? (
                                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
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

            {/* Tinder (ex-Reel) */}
            <Link href="/reel" className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'reel' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" />
                <path d="M12 18a2 2 0 002-2c0-2-2-3-2-3s-2 1-2 3a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] font-medium">Tinder</span>
            </Link>

            {/* CineReels */}
            <Link href="/cinereels" className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'cinereels' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <img loading="lazy" src="/cinereels-icon.png" alt="CineReels" className={`w-5 h-5 object-contain ${active === 'cinereels' ? 'opacity-100' : 'opacity-50'}`} />
              <span className="text-[10px] font-medium">CineReels</span>
            </Link>

            {/* Perfil */}
            {user && username ? (
              <Link href={`/perfil/${username}`} className={`flex flex-col items-center gap-0.5 transition-colors ${active === 'perfil' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {avatarUrl ? (
                  <img loading="lazy" src={avatarUrl} alt={username} className={`w-5 h-5 rounded-full object-cover ${active === 'perfil' ? 'ring-2 ring-white' : ''}`} />
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

            {/* Menu hamburguesa */}
            <div className="relative">
              <button onClick={() => setMenuOpen(v => !v)} className={`flex flex-col items-center gap-0.5 transition-colors ${menuOpen ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-[10px] font-medium">Más</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-52 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <Link href="/cast-crew" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M9 7a3 3 0 116 0 3 3 0 01-6 0z" /></svg>
                      Cast & Crew
                    </Link>
                    <Link href="/trailers" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Trailers & Clips
                    </Link>
                    <Link href="/estrenos" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                      Estrenos
                    </Link>
                    <Link href="/musica" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072z"/></svg>
                      Música
                    </Link>
                    <Link href="/calculadora" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.25-2.25h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z" /></svg>
                      Calculadora
                    </Link>
                    <Link href="/cinequest" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                      CineQuest
                    </Link>
                    <Link href="/mapa" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 2a10 10 0 110 20 10 10 0 010-20zm0 0v4m0 12v4m10-10h-4M6 12H2"/></svg>
                      Mapa
                    </Link>
                    <Link href="/juntos" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                      Juntos
                    </Link>
                    <div className="border-t border-zinc-800" />
                    <Link href="/estadisticas" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      Estadísticas
                    </Link>
                    <Link href="/cambios" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Update plataformas
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      </nav>

      {modalAbierto && <AuthModal onClose={() => setModalAbierto(false)} />}
      {usernameModal && <UsernameModal onClose={() => setUsernameModal(false)} forced={!username} />}
    </>
  )
}
