'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Lista = {
  id: string
  nombre: string
  descripcion: string | null
  creador_id: string
  created_at: string
  num_peliculas: number
  miembros: { user_id: string; username: string; avatar_url: string | null; rol: string }[]
}

type Seguido = {
  user_id: string
  username: string
  avatar_url: string | null
}

function MiniAvatar({ url, username, size = 7 }: { url: string | null; username: string; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full object-cover ring-2 ring-zinc-950`
  if (url) return <img src={url} alt={username} className={cls} />
  return (
    <div className={`w-${size} h-${size} rounded-full bg-zinc-700 ring-2 ring-zinc-950 flex items-center justify-center text-[10px] font-bold text-zinc-300`}>
      {username[0]?.toUpperCase()}
    </div>
  )
}

export default function ListasPage() {
  const { user, username } = useAuth()
  const [listas, setListas] = useState<Lista[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)

  // Form state
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [seguidos, setSeguidos] = useState<Seguido[]>([])
  const [invitados, setInvitados] = useState<Set<string>>(new Set())
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)

  const fetchListas = async () => {
    if (!user) { setCargando(false); return }
    setCargando(true)

    // Get all lista_ids where user is a member
    const { data: membresias } = await supabase
      .from('lista_miembros')
      .select('lista_id')
      .eq('user_id', user.id)

    if (!membresias || membresias.length === 0) { setListas([]); setCargando(false); return }

    const listaIds = membresias.map((m: any) => m.lista_id)

    // Fetch lists
    const { data: listasData } = await supabase
      .from('listas_compartidas')
      .select('id, nombre, descripcion, creador_id, created_at')
      .in('id', listaIds)
      .order('created_at', { ascending: false })

    if (!listasData || listasData.length === 0) { setListas([]); setCargando(false); return }

    // Fetch members for each list
    const { data: miembrosData } = await supabase
      .from('lista_miembros')
      .select('lista_id, user_id, rol')
      .in('lista_id', listaIds)

    // Fetch peliculas count for each list
    const { data: peliculasData } = await supabase
      .from('lista_compartida_peliculas')
      .select('lista_id, pelicula_id')
      .in('lista_id', listaIds)

    // Fetch profiles for members
    const memberIds = [...new Set((miembrosData ?? []).map((m: any) => m.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, avatar_url')
      .in('user_id', memberIds)

    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    ;(profilesData ?? []).forEach((p: any) => {
      profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null }
    })

    const countMap: Record<string, number> = {}
    ;(peliculasData ?? []).forEach((p: any) => {
      countMap[p.lista_id] = (countMap[p.lista_id] ?? 0) + 1
    })

    const membersMap: Record<string, any[]> = {}
    ;(miembrosData ?? []).forEach((m: any) => {
      if (!membersMap[m.lista_id]) membersMap[m.lista_id] = []
      const profile = profileMap[m.user_id]
      if (profile) {
        membersMap[m.lista_id].push({
          user_id: m.user_id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          rol: m.rol,
        })
      }
    })

    const mapped: Lista[] = listasData.map((l: any) => ({
      id: l.id,
      nombre: l.nombre,
      descripcion: l.descripcion ?? null,
      creador_id: l.creador_id,
      created_at: l.created_at,
      num_peliculas: countMap[l.id] ?? 0,
      miembros: membersMap[l.id] ?? [],
    }))

    setListas(mapped)
    setCargando(false)
  }

  const fetchSeguidos = async () => {
    if (!user) return
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    if (!follows || follows.length === 0) { setSeguidos([]); return }

    const ids = follows.map((f: any) => f.following_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, avatar_url')
      .in('user_id', ids)

    setSeguidos((profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url ?? null,
    })))
  }

  useEffect(() => {
    fetchListas()
  }, [user])

  const abrirModal = () => {
    setNombre('')
    setDescripcion('')
    setInvitados(new Set())
    fetchSeguidos()
    setModalAbierto(true)
  }

  const crearLista = async () => {
    if (!user || !nombre.trim() || creando) return
    setCreando(true)
    setErrorCrear(null)

    // Insert lista
    const { data: lista, error } = await supabase
      .from('listas_compartidas')
      .insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, creador_id: user.id })
      .select('id')
      .single()

    if (error || !lista) {
      console.error('Error creando lista:', error)
      setErrorCrear(error?.message ?? 'Error desconocido al crear la lista')
      setCreando(false)
      return
    }

    const listaId = lista.id

    // Insert owner
    await supabase.from('lista_miembros').insert({
      lista_id: listaId,
      user_id: user.id,
      rol: 'owner',
    })

    // Insert invitados + notifications
    const invitadosArr = [...invitados]
    if (invitadosArr.length > 0) {
      await supabase.from('lista_miembros').insert(
        invitadosArr.map(uid => ({ lista_id: listaId, user_id: uid, rol: 'member' }))
      )
      await supabase.from('notifications').insert(
        invitadosArr.map(uid => ({
          user_id: uid,
          type: 'lista_invitacion',
          from_user_id: user.id,
          meta: {
            lista_id: listaId,
            lista_nombre: nombre.trim(),
            redirect_url: `/listas/${listaId}`,
          },
        }))
      )
    }

    setCreando(false)
    setModalAbierto(false)
    fetchListas()
  }

  const toggleInvitado = (uid: string) => {
    setInvitados(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="listas" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-zinc-500 text-sm">Iniciá sesión para ver tus listas compartidas.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="listas" />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">Listas compartidas</h1>
          <button
            onClick={abrirModal}
            className="flex items-center gap-1.5 bg-yellow-400 text-zinc-950 font-semibold rounded-lg px-4 py-2 text-sm hover:bg-yellow-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nueva lista
          </button>
        </div>

        {cargando ? (
          <p className="text-zinc-500 text-sm text-center py-12">Cargando...</p>
        ) : listas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium mb-1">No tenés listas aún</p>
              <p className="text-zinc-500 text-sm">Creá una lista compartida con tus amigos</p>
            </div>
            <button
              onClick={abrirModal}
              className="bg-yellow-400 text-zinc-950 font-semibold rounded-lg px-6 py-2.5 text-sm hover:bg-yellow-300 transition-colors"
            >
              + Nueva lista
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {listas.map(lista => (
              <Link
                key={lista.id}
                href={`/listas/${lista.id}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold leading-snug">{lista.nombre}</p>
                    {lista.descripcion && (
                      <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1">{lista.descripcion}</p>
                    )}
                    <p className="text-zinc-600 text-xs mt-1.5">
                      {lista.num_peliculas} {lista.num_peliculas === 1 ? 'película' : 'películas'}
                    </p>
                  </div>
                  {/* Member avatars overlapping */}
                  <div className="flex -space-x-2 shrink-0">
                    {lista.miembros.slice(0, 4).map(m => (
                      <MiniAvatar key={m.user_id} url={m.avatar_url} username={m.username} size={7} />
                    ))}
                    {lista.miembros.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-zinc-700 ring-2 ring-zinc-950 flex items-center justify-center text-[9px] font-bold text-zinc-400">
                        +{lista.miembros.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear lista */}
      {modalAbierto && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setModalAbierto(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md mx-auto max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Nueva lista compartida</h2>
              <button onClick={() => setModalAbierto(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1.5">Nombre *</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej. Pelis del finde"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1.5">Descripción (opcional)</label>
                <textarea
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder="Para qué es esta lista..."
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>

              {seguidos.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-400 font-medium block mb-2">Invitar amigos (opcional)</label>
                  <div className="space-y-1.5">
                    {seguidos.map(s => (
                      <label
                        key={s.user_id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 cursor-pointer hover:border-zinc-500 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-zinc-600 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300">
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt={s.username} className="w-full h-full object-cover" />
                            : s.username[0]?.toUpperCase()
                          }
                        </div>
                        <span className="text-sm text-white flex-1">@{s.username}</span>
                        <input
                          type="checkbox"
                          checked={invitados.has(s.user_id)}
                          onChange={() => toggleInvitado(s.user_id)}
                          className="w-4 h-4 rounded accent-yellow-400"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-zinc-800">
              <button
                onClick={crearLista}
                disabled={!nombre.trim() || creando}
                className="w-full bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-3 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creando ? 'Creando...' : 'Crear lista'}
              </button>
              {errorCrear && (
                <p className="text-red-400 text-xs text-center mt-2">{errorCrear}</p>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
