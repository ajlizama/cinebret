'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'
import UsernameModal from './UsernameModal'

type Props = { active?: 'inicio' | 'catalogo' | 'cambios' | 'estadisticas' | 'mi-lista' | 'comunidad' }

type Notif = {
  id: string
  type: 'follow' | 'like'
  from_username: string
  from_avatar: string | null
  read: boolean
  created_at: string
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
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usernameModal, setUsernameModal] = useState(false)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [showNotifs, setShowNotifs] = useState(false)

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
      .select('id, type, from_user_id, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!raw || raw.length === 0) return

    const fromIds = [...new Set(raw.map((n: any) => n.from_user_id).filter(Boolean))]
    const { data: profiles } = await supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', fromIds)
    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null } })

    const mapped: Notif[] = raw
      .filter((n: any) => profileMap[n.from_user_id])
      .map((n: any) => ({
        id: n.id,
        type: n.type as 'follow' | 'like',
        from_username: profileMap[n.from_user_id].username,
        from_avatar: profileMap[n.from_user_id].avatar_url,
        read: n.read,
        created_at: n.created_at,
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

  const link = (href: string, label: string, key: Props['active']) => (
    <Link
      href={href}
      className={`hover:text-white transition-colors ${active === key ? 'text-white font-medium' : ''}`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <nav className="sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Fila 1: logo + auth */}
          <div className="flex items-center justify-between mb-2.5">
            <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
            <div className="flex items-center gap-3">
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
                                  <div
                                    key={n.id}
                                    className={`flex items-start gap-3 px-4 py-3 border-b border-zinc-800 last:border-0 ${!n.read ? 'bg-zinc-800/50' : ''}`}
                                  >
                                    <MiniAvatar url={n.from_avatar} username={n.from_username} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-zinc-300 leading-snug">
                                        <span className="text-white font-medium">@{n.from_username}</span>
                                        {' '}{n.type === 'follow' ? 'te siguió' : 'le dio ♥ a tu reseña'}
                                      </p>
                                      <p className="text-xs text-zinc-600 mt-0.5">{tiempoRelativo(n.created_at)}</p>
                                    </div>
                                    {!n.read && <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full shrink-0 mt-1.5" />}
                                  </div>
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
                      onClick={signOut}
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
          {/* Fila 2: links */}
          <div className="flex items-center gap-5 text-sm text-zinc-500 overflow-x-auto scrollbar-none">
            {link('/catalogo', 'Catálogo', 'catalogo')}
            {link('/cambios', 'Cambios', 'cambios')}
            {link('/estadisticas', 'Estadísticas', 'estadisticas')}
            {link('/comunidad', 'Comunidad', 'comunidad')}
            {user && username && (
              <Link href="/perfil" className="hover:text-white transition-colors">
                Mi perfil
              </Link>
            )}
          </div>
        </div>
      </nav>

      {modalAbierto && <AuthModal onClose={() => setModalAbierto(false)} />}
      {usernameModal && <UsernameModal onClose={() => setUsernameModal(false)} forced={!username} />}
    </>
  )
}
