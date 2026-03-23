'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Miembro = {
  user_id: string
  username: string
  avatar_url: string | null
  rol: 'owner' | 'member'
}

type PeliculaEnLista = {
  lista_id: string
  pelicula_id: string
  added_by: string
  added_at: string
  added_by_username: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  poster_path: string | null
}

type PeliculaBusqueda = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  poster_path: string | null
}

type ListaDetalle = {
  id: string
  nombre: string
  descripcion: string | null
  creador_id: string
}

type Seguido = {
  user_id: string
  username: string
  avatar_url: string | null
}

export default function ListaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const router = useRouter()

  const [lista, setLista] = useState<ListaDetalle | null>(null)
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [peliculas, setPeliculas] = useState<PeliculaEnLista[]>([])
  const [cargando, setCargando] = useState(true)

  const [showAddMovie, setShowAddMovie] = useState(false)
  const [showInvitar, setShowInvitar] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(false)

  // Search modal state
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<PeliculaBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Invite modal state
  const [seguidos, setSeguidos] = useState<Seguido[]>([])
  const [seguidosCargando, setSeguidosCargando] = useState(false)
  const [hoveredPelicula, setHoveredPelicula] = useState<string | null>(null)

  const miembro = miembros.find(m => m.user_id === user?.id)
  const isOwner = miembro?.rol === 'owner'
  const isMember = !!miembro

  const peliculaIds = new Set(peliculas.map(p => p.pelicula_id))

  const fetchData = async () => {
    setCargando(true)

    const { data: listaData } = await supabase
      .from('listas_compartidas')
      .select('id, nombre, descripcion, creador_id')
      .eq('id', id)
      .single()

    if (!listaData) { setCargando(false); return }
    setLista(listaData)

    const { data: miembrosData } = await supabase
      .from('lista_miembros')
      .select('user_id, rol')
      .eq('lista_id', id)

    const memberIds = (miembrosData ?? []).map((m: any) => m.user_id)
    let profileMap: Record<string, { username: string; avatar_url: string | null }> = {}

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', memberIds)
      ;(profiles ?? []).forEach((p: any) => {
        profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null }
      })
    }

    const miembrosArr: Miembro[] = (miembrosData ?? [])
      .filter((m: any) => profileMap[m.user_id])
      .map((m: any) => ({
        user_id: m.user_id,
        username: profileMap[m.user_id].username,
        avatar_url: profileMap[m.user_id].avatar_url,
        rol: m.rol,
      }))
    setMiembros(miembrosArr)

    // Fetch movies in list
    const { data: lcp } = await supabase
      .from('lista_compartida_peliculas')
      .select('lista_id, pelicula_id, added_by, added_at')
      .eq('lista_id', id)
      .order('added_at', { ascending: false })

    if (!lcp || lcp.length === 0) { setPeliculas([]); setCargando(false); return }

    const pelIds = lcp.map((p: any) => p.pelicula_id)
    const addedByIds = [...new Set(lcp.map((p: any) => p.added_by))]

    const [pelRes, addedByRes] = await Promise.all([
      supabase.from('peliculas').select('id, titulo, titulo_ingles, anio, poster_path').in('id', pelIds),
      supabase.from('profiles').select('user_id, username').in('user_id', addedByIds),
    ])

    const pelMap: Record<string, any> = {}
    ;(pelRes.data ?? []).forEach((p: any) => { pelMap[p.id] = p })

    const addedByMap: Record<string, string> = {}
    ;(addedByRes.data ?? []).forEach((p: any) => { addedByMap[p.user_id] = p.username })

    const mapped: PeliculaEnLista[] = lcp.map((item: any) => {
      const pel = pelMap[item.pelicula_id]
      return {
        lista_id: item.lista_id,
        pelicula_id: item.pelicula_id,
        added_by: item.added_by,
        added_at: item.added_at,
        added_by_username: addedByMap[item.added_by] ?? '?',
        titulo: pel?.titulo ?? '',
        titulo_ingles: pel?.titulo_ingles ?? null,
        anio: pel?.anio ?? null,
        poster_path: pel?.poster_path ?? null,
      }
    })

    setPeliculas(mapped)
    setCargando(false)
  }

  useEffect(() => {
    fetchData()
  }, [id])

  // Debounced movie search
  useEffect(() => {
    const q = busqueda.trim()
    if (!q) { setResultados([]); return }
    setBuscando(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_peliculas', { q })
      setResultados((data ?? []).map((p: any) => ({
        id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles ?? null,
        anio: p.anio ?? null, poster_path: p.poster_path ?? null,
      })))
      setBuscando(false)
    }, 300)
  }, [busqueda])

  const fetchSeguidos = async () => {
    if (!user) return
    setSeguidosCargando(true)
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    if (!follows || follows.length === 0) { setSeguidos([]); setSeguidosCargando(false); return }

    const ids = follows.map((f: any) => f.following_id)
    const miembroIds = new Set(miembros.map(m => m.user_id))
    const noMiembros = ids.filter((id: string) => !miembroIds.has(id))

    if (noMiembros.length === 0) { setSeguidos([]); setSeguidosCargando(false); return }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, avatar_url')
      .in('user_id', noMiembros)

    setSeguidos((profiles ?? []).map((p: any) => ({
      user_id: p.user_id, username: p.username, avatar_url: p.avatar_url ?? null,
    })))
    setSeguidosCargando(false)
  }

  const addPelicula = async (pelicula: PeliculaBusqueda) => {
    if (!user || peliculaIds.has(pelicula.id)) return
    await supabase.from('lista_compartida_peliculas').insert({
      lista_id: id,
      pelicula_id: pelicula.id,
      added_by: user.id,
    })
    // Notificar a los otros miembros
    const otrosMiembros = miembros.filter(m => m.user_id !== user.id)
    if (otrosMiembros.length > 0) {
      await supabase.from('notifications').insert(
        otrosMiembros.map(m => ({
          user_id: m.user_id,
          type: 'lista_pelicula',
          from_user_id: user.id,
          meta: {
            lista_id: id,
            lista_nombre: lista?.nombre ?? '',
            pelicula_titulo: pelicula.titulo_ingles ?? pelicula.titulo,
            redirect_url: `/listas/${id}`,
          },
        }))
      )
    }
    fetchData()
  }

  const removePelicula = async (peliculaId: string) => {
    await supabase.from('lista_compartida_peliculas')
      .delete()
      .eq('lista_id', id)
      .eq('pelicula_id', peliculaId)
    setPeliculas(prev => prev.filter(p => p.pelicula_id !== peliculaId))
  }

  const invitarUsuario = async (seguido: Seguido) => {
    if (!user) return
    await supabase.from('lista_miembros').insert({
      lista_id: id,
      user_id: seguido.user_id,
      rol: 'member',
    })
    await supabase.from('notifications').insert({
      user_id: seguido.user_id,
      type: 'lista_invitacion',
      from_user_id: user.id,
      meta: {
        lista_id: id,
        lista_nombre: lista?.nombre ?? '',
        redirect_url: `/listas/${id}`,
      },
    })
    setSeguidos(prev => prev.filter(s => s.user_id !== seguido.user_id))
    fetchData()
  }

  const salirDeLista = async () => {
    if (!user) return
    await supabase.from('lista_miembros')
      .delete()
      .eq('lista_id', id)
      .eq('user_id', user.id)
    router.push('/listas')
  }

  const eliminarLista = async () => {
    if (!user || !isOwner) return
    await supabase.from('lista_compartida_peliculas').delete().eq('lista_id', id)
    await supabase.from('lista_miembros').delete().eq('lista_id', id)
    await supabase.from('listas_compartidas').delete().eq('id', id)
    router.push('/listas')
  }

  if (cargando) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="perfil" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-zinc-500 text-sm">Cargando...</p>
        </div>
      </main>
    )
  }

  if (!lista) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav active="perfil" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-zinc-500 text-sm">Lista no encontrada.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-20">
      <Nav active="perfil" />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-5">
          <Link href="/listas" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors flex items-center gap-1 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Listas
          </Link>
          <h1 className="text-2xl font-bold text-white">{lista.nombre}</h1>
          {lista.descripcion && <p className="text-zinc-400 text-sm mt-1">{lista.descripcion}</p>}
        </div>

        {/* Members */}
        <div className="flex flex-wrap gap-2 mb-5">
          {miembros.map(m => (
            <div
              key={m.user_id}
              className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1"
            >
              <div className="w-5 h-5 rounded-full bg-zinc-600 overflow-hidden flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">
                {m.avatar_url
                  ? <img src={m.avatar_url} alt={m.username} className="w-full h-full object-cover" />
                  : m.username[0]?.toUpperCase()
                }
              </div>
              <span className="text-xs text-zinc-300">@{m.username}</span>
              {m.rol === 'owner' && <span className="text-yellow-400 text-[10px]">★</span>}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        {isMember && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setShowAddMovie(true); setBusqueda(''); setResultados([]) }}
              className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors rounded-lg px-4 py-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Película
            </button>
            <button
              onClick={() => { setShowInvitar(true); fetchSeguidos() }}
              className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors rounded-lg px-4 py-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invitar
            </button>
          </div>
        )}

        {/* Movie grid */}
        {peliculas.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500 text-sm">No hay películas en esta lista aún.</p>
            {isMember && (
              <button
                onClick={() => { setShowAddMovie(true); setBusqueda(''); setResultados([]) }}
                className="mt-3 text-yellow-400 text-sm hover:text-yellow-300 transition-colors"
              >
                + Agregar la primera
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {peliculas.map(p => {
              const canRemove = user && (p.added_by === user.id || isOwner)
              const titulo = p.titulo_ingles || p.titulo
              return (
                <div
                  key={p.pelicula_id}
                  className="relative group"
                  onMouseEnter={() => setHoveredPelicula(p.pelicula_id)}
                  onMouseLeave={() => setHoveredPelicula(null)}
                >
                  <Link href={`/pelicula/${p.pelicula_id}`}>
                    <div className="relative rounded-xl overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                      {p.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w342${p.poster_path}`}
                          alt={titulo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">🎬</div>
                      )}
                    </div>
                  </Link>
                  {canRemove && hoveredPelicula === p.pelicula_id && (
                    <button
                      onClick={() => removePelicula(p.pelicula_id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors z-10"
                    >
                      ✕
                    </button>
                  )}
                  <p className="text-zinc-500 text-[10px] mt-1 text-center truncate">@{p.added_by_username}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Leave / Delete */}
        {isMember && (
          <div className="mt-10 border-t border-zinc-800 pt-6">
            {isOwner ? (
              <>
                {confirmEliminar ? (
                  <div className="bg-red-950/30 border border-red-800 rounded-xl p-4">
                    <p className="text-white text-sm font-medium mb-1">¿Eliminar esta lista?</p>
                    <p className="text-zinc-400 text-xs mb-3">Se borrarán todas las películas y miembros. Esta acción no se puede deshacer.</p>
                    <div className="flex gap-2">
                      <button onClick={eliminarLista} className="bg-red-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-red-500 transition-colors">
                        Sí, eliminar
                      </button>
                      <button onClick={() => setConfirmEliminar(false)} className="border border-zinc-700 text-zinc-400 text-sm rounded-lg px-4 py-2 hover:border-zinc-500 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmEliminar(true)}
                    className="text-red-500 text-sm hover:text-red-400 transition-colors"
                  >
                    Eliminar lista
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={salirDeLista}
                className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
              >
                Salir de esta lista
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal: Agregar película */}
      {showAddMovie && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddMovie(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md mx-auto max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Agregar película</h2>
              <button onClick={() => setShowAddMovie(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 pt-4 pb-2">
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por título..."
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-5">
              {buscando && <p className="text-zinc-500 text-xs text-center py-4">Buscando...</p>}
              {!buscando && busqueda && resultados.length === 0 && (
                <p className="text-zinc-500 text-xs text-center py-4">Sin resultados</p>
              )}
              {!busqueda && (
                <p className="text-zinc-600 text-xs text-center py-4">Escribí para buscar</p>
              )}
              <div className="space-y-2 mt-2">
                {resultados.map(p => {
                  const yaEsta = peliculaIds.has(p.id)
                  const titulo = p.titulo_ingles || p.titulo
                  return (
                    <button
                      key={p.id}
                      onClick={() => !yaEsta && addPelicula(p)}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors text-left ${
                        yaEsta
                          ? 'border-emerald-700 bg-emerald-950/30 cursor-default'
                          : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      <div className="w-9 rounded-lg overflow-hidden bg-zinc-700 shrink-0" style={{ aspectRatio: '2/3' }}>
                        {p.poster_path && (
                          <img src={`https://image.tmdb.org/t/p/w92${p.poster_path}`} alt={titulo} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium line-clamp-1">{titulo}</p>
                        {p.anio && <p className="text-zinc-500 text-xs">{p.anio}</p>}
                      </div>
                      {yaEsta && <span className="text-emerald-400 text-xs shrink-0">Ya está</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Invitar */}
      {showInvitar && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setShowInvitar(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-md mx-auto max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Invitar a la lista</h2>
              <button onClick={() => setShowInvitar(false)} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {seguidosCargando && <p className="text-zinc-500 text-xs text-center py-4">Cargando...</p>}
              {!seguidosCargando && seguidos.length === 0 && (
                <p className="text-zinc-500 text-xs text-center py-4">No hay amigos para invitar (o todos ya son miembros).</p>
              )}
              <div className="space-y-2">
                {seguidos.map(s => (
                  <button
                    key={s.user_id}
                    onClick={() => invitarUsuario(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-zinc-600 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300">
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt={s.username} className="w-full h-full object-cover" />
                        : s.username[0]?.toUpperCase()
                      }
                    </div>
                    <span className="text-white text-sm flex-1 text-left">@{s.username}</span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
