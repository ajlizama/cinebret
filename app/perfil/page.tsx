'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import Loading from '@/components/Loading'
import {
  type PeliculaConStats,
  type Stats,
  computeStats,
  StatsCards,
  TopsPanel,
  VibeMapa,
} from '@/components/PerfilStats'

const PLATAFORMAS = [
  { id: 'netflix',        nombre: 'Netflix',     logo: '/netflix.png' },
  { id: 'disney_plus',   nombre: 'Disney+',     logo: '/disney_plus.svg' },
  { id: 'hbo_max',       nombre: 'HBO',         logo: '/hbo_max.png' },
  { id: 'amazon_prime',  nombre: 'Prime',       logo: '/amazon_prime.png' },
  { id: 'apple_tv',      nombre: 'Apple TV+',   logo: '/apple_tv.png' },
  { id: 'paramount_plus',nombre: 'Paramount+',  logo: '/paramount_plus.svg' },
  { id: 'mubi',           nombre: 'MUBI',        logo: '/mubi.png' },
]

type Entrada = PeliculaConStats & {
  visto: boolean
  watchlist: boolean
  pelicula: PeliculaConStats['pelicula'] & {
    titulo_ingles: string | null
    anio: number | null
    rt_score: number | null
  }
  plataformas: string[]
}

type Tab = 'vistas' | 'watchlist' | 'estadisticas'

function RatingBar({ n, count, max }: { n: number; count: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-xs w-3 text-right">{n}</span>
      <div className="flex-1 h-2.5 bg-zinc-800 rounded overflow-hidden">
        <div className="h-full bg-yellow-400 rounded" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
      </div>
      <span className="text-zinc-400 text-xs w-5 text-right">{count}</span>
    </div>
  )
}

export default function MiPerfilPage() {
  const { user, username, loading, signOut, refreshUsername } = useAuth()
  const router = useRouter()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<Tab>('vistas')
  const fileRef = useRef<HTMLInputElement>(null)

  // — Modal editar perfil —
  const [editarModal, setEditarModal] = useState(false)
  // Cambiar username
  const [nuevoUsername, setNuevoUsername] = useState('')
  const [disponibleEdit, setDisponibleEdit] = useState<boolean | null>(null)
  const [verificandoEdit, setVerificandoEdit] = useState(false)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Eliminar cuenta
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    if (!loading && !user) { router.replace('/catalogo'); return }
    if (!user) return

    Promise.all([
      supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_peliculas')
        .select('pelicula_id, visto, rating, watchlist, peliculas(titulo, titulo_ingles, anio, nota_imdb, rt_score, poster_path, categoria, oscars, enriquecimiento(director, actores, compositor))')
        .eq('user_id', user.id),
      supabase.from('catalogos').select('fecha').eq('activo', true).order('fecha', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]).then(async ([{ data: prof }, { data: rows }, { data: fechaRow }, { count: nSeg }, { count: nSig }]) => {
      const fechaCatalogo = (fechaRow as any)?.fecha ?? new Date().toISOString().split('T')[0]
      const { data: cats } = await supabase.from('catalogos').select('pelicula_id, plataforma').eq('fecha', fechaCatalogo).eq('activo', true)
      setAvatarUrl((prof as any)?.avatar_url ?? null)

      const platMap: Record<string, string[]> = {}
      ;(cats ?? []).forEach((c: any) => {
        const prev = platMap[c.pelicula_id] ?? []
        if (!prev.includes(c.plataforma)) platMap[c.pelicula_id] = [...prev, c.plataforma]
        else platMap[c.pelicula_id] = prev
      })

      const mapped: Entrada[] = (rows ?? [])
        .map((r: any) => ({
          pelicula_id: r.pelicula_id,
          visto: r.visto,
          rating: r.rating,
          watchlist: r.watchlist,
          plataformas: platMap[r.pelicula_id] ?? [],
          pelicula: r.peliculas,
        }))
        .filter((r: any) => r.pelicula)

      setEntradas(mapped)
      const vistas = mapped.filter(e => e.visto)
      setStats(computeStats(vistas))
      setSeguidores(nSeg ?? 0)
      setSiguiendo(nSig ?? 0)
      setCargando(false)
    })
  }, [user, loading])

  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    setUploadError(null)

    const ext = file.name.split('.').pop()
    const path = `${user.id}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      setUploadError(`Error al subir imagen: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // cache-bust para forzar recarga del navegador
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: urlWithBust })
      .eq('user_id', user.id)

    if (updateErr) {
      setUploadError(`Imagen subida pero no se pudo guardar en perfil: ${updateErr.message}`)
      setUploading(false)
      return
    }

    setAvatarUrl(urlWithBust)
    setUploading(false)
  }

  // Verificar disponibilidad de nuevo username
  useEffect(() => {
    const sanitize = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')
    const val = sanitize(nuevoUsername)
    if (val.length < 3 || val === username) { setDisponibleEdit(null); return }
    setVerificandoEdit(true)
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
    editDebounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('user_id').eq('username', val).maybeSingle()
      setDisponibleEdit(!data)
      setVerificandoEdit(false)
    }, 400)
  }, [nuevoUsername, username])

  const handleUsernameChange = async () => {
    const sanitize = (v: string) => v.toLowerCase().replace(/[^a-z0-9_]/g, '')
    const val = sanitize(nuevoUsername)
    if (!val || val.length < 3) { setEditError('Mínimo 3 caracteres'); return }
    if (val.length > 20) { setEditError('Máximo 20 caracteres'); return }
    if (!disponibleEdit) { setEditError('Username no disponible'); return }
    setGuardandoEdit(true)
    setEditError('')
    const { error } = await supabase.from('profiles').update({ username: val }).eq('user_id', user!.id)
    if (error) { setEditError('Error al guardar: ' + error.message); setGuardandoEdit(false); return }
    await refreshUsername()
    setNuevoUsername('')
    setDisponibleEdit(null)
    setGuardandoEdit(false)
    setEditarModal(false)
  }

  const handleDeleteAccount = async () => {
    if (!user || deleteText !== 'ELIMINAR') return
    setEliminando(true)
    // Intentar borrar avatar del storage
    try {
      const ext = avatarUrl?.split('.').pop()?.split('?')[0]
      if (ext) await supabase.storage.from('avatars').remove([`${user.id}.${ext}`])
    } catch {}
    // Llamar función delete_user (requiere SQL previo)
    const { error } = await supabase.rpc('delete_user')
    if (error) {
      // Fallback: borrar perfil y cerrar sesión
      await supabase.from('profiles').delete().eq('user_id', user.id)
    }
    await signOut()
    router.replace('/')
  }

  const quitarVista = async (peliculaId: string) => {
    setEntradas(prev => prev.map(e => e.pelicula_id === peliculaId ? { ...e, visto: false, rating: null } : e))
    await supabase.from('user_peliculas').update({ visto: false, rating: null }).eq('user_id', user!.id).eq('pelicula_id', peliculaId)
  }

  const quitarWatchlist = async (peliculaId: string) => {
    setEntradas(prev => prev.map(e => e.pelicula_id === peliculaId ? { ...e, watchlist: false } : e))
    await supabase.from('user_peliculas').update({ watchlist: false }).eq('user_id', user!.id).eq('pelicula_id', peliculaId)
  }

  if (loading || cargando) return (
    <main className="min-h-screen bg-zinc-950"><Nav active="perfil" />
      <div className="flex items-center justify-center h-64"><Loading text="Cargando perfil..." /></div>
    </main>
  )

  const vistas    = entradas.filter(e => e.visto).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  const watchlist = entradas.filter(e => e.watchlist)
  const lista     = tab === 'vistas' ? vistas : watchlist

  // Stats para sección estadísticas
  const ratingDist: Record<number, number> = {}
  vistas.forEach(e => { if (e.rating) ratingDist[e.rating] = (ratingDist[e.rating] ?? 0) + 1 })
  const maxRating = Math.max(...Object.values(ratingDist), 1)

  const catDist: Record<string, number> = stats?.categorias ?? {}
  const totalCat = Object.values(catDist).reduce((a, b) => a + b, 0)
  const topCats = Object.entries(catDist).sort((a, b) => b[1] - a[1])

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="perfil" />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Header ── */}
        <div className="flex items-center gap-5 mb-8 flex-wrap">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center border-2 border-zinc-700 group-hover:border-yellow-400 transition-colors">
              {avatarUrl
                ? <img src={avatarUrl} alt={username ?? ''} className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-zinc-400">{username?.[0]?.toUpperCase() ?? '?'}</span>
              }
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">{uploading ? '...' : 'Cambiar'}</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white">
              {username ? `@${username}` : <span className="text-zinc-400">Sin username</span>}
            </h1>
            <div className="flex gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
              <span><span className="text-white font-semibold">{vistas.length}</span> vistas</span>
              <span><span className="text-white font-semibold">{watchlist.length}</span> en watchlist</span>
              <span><span className="text-white font-semibold">{seguidores}</span> seguidores</span>
              <span><span className="text-white font-semibold">{siguiendo}</span> siguiendo</span>
            </div>
            <p className="text-zinc-600 text-xs mt-1">Haz clic en la foto para cambiarla</p>
            {uploadError && (
              <p className="text-red-400 text-xs mt-1 max-w-xs">{uploadError}</p>
            )}
            <button
              onClick={() => { setEditarModal(true); setNuevoUsername(''); setDisponibleEdit(null); setEditError(''); setConfirmDelete(false); setDeleteText('') }}
              className="mt-3 text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              ✎ Editar perfil
            </button>
          </div>
        </div>

        {/* ── Stats summary cards ── */}
        {stats && vistas.length > 0 && (
          <StatsCards stats={stats} total={vistas.length} />
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab('vistas')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === 'vistas' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            ✓ Vistas ({vistas.length})
          </button>
          <button
            onClick={() => setTab('watchlist')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === 'watchlist' ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            ★ Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setTab('estadisticas')}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === 'estadisticas' ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            📊 Estadísticas
          </button>
        </div>

        {/* ── Contenido por tab ── */}

        {/* Vistas / Watchlist */}
        {tab !== 'estadisticas' && (
          lista.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              {tab === 'vistas'
                ? 'Aún no has marcado películas como vistas. Búscalas en el catálogo.'
                : 'Tu watchlist está vacía. Agrega películas desde el catálogo.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {lista.map(entrada => {
                const p = entrada.pelicula
                const titulo = p.titulo_ingles || p.titulo
                return (
                  <div key={entrada.pelicula_id} className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
                    {/* Botón quitar */}
                    <button
                      onClick={() => tab === 'vistas' ? quitarVista(entrada.pelicula_id) : quitarWatchlist(entrada.pelicula_id)}
                      className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/90 border border-zinc-700 text-zinc-400 hover:text-white rounded-md w-6 h-6 flex items-center justify-center text-xs"
                      title={tab === 'vistas' ? 'Quitar de vistas' : 'Quitar de watchlist'}
                    >
                      ✕
                    </button>
                    <Link href={`/pelicula/${entrada.pelicula_id}`}>
                      <div className="relative aspect-[2/3] bg-zinc-800">
                        {p.poster_path ? (
                          <Image src={`https://image.tmdb.org/t/p/w342${p.poster_path}`} alt={titulo} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-zinc-600 text-xs text-center px-2">{titulo}</span>
                          </div>
                        )}
                        {tab === 'vistas' && entrada.rating && (
                          <div className="absolute top-2 right-2 bg-zinc-900/90 rounded-full px-2 py-0.5 text-xs font-bold text-yellow-400">
                            {entrada.rating}/10
                          </div>
                        )}
                        {entrada.plataformas.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-4 pb-1.5 px-1.5">
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {PLATAFORMAS.filter(pl => entrada.plataformas.includes(pl.id)).map(pl => (
                                <div key={pl.id} className="rounded px-0.5 py-0.5 bg-white/90" style={{ height: 14 }}>
                                  <img src={pl.logo} alt={pl.nombre} className="h-2.5 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="p-2">
                      <p className="text-white text-xs font-semibold leading-snug truncate">{titulo}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {p.anio && <span className="text-zinc-500 text-xs">{p.anio}</span>}
                        {p.nota_imdb && <span className="text-yellow-400 text-xs">⭐ {p.nota_imdb}</span>}
                      </div>
                      {entrada.plataformas.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {PLATAFORMAS.filter(pl => entrada.plataformas.includes(pl.id)).map(pl => (
                            <div key={pl.id} className="rounded px-1 py-0.5 bg-white flex items-center justify-center" style={{ height: 16 }}>
                              <img src={pl.logo} alt={pl.nombre} className="h-3 w-auto object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Estadísticas */}
        {tab === 'estadisticas' && stats && (
          <div className="space-y-6">
            {/* Tops + Vibe map */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TopsPanel stats={stats} />
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <VibeMapa
                  categorias={stats.categorias}
                  username={username ?? 'yo'}
                  avatarUrl={avatarUrl}
                />
              </div>
            </div>

            {/* Rating distribution */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Distribución de ratings</h3>
              {Object.keys(ratingDist).length === 0 ? (
                <p className="text-zinc-600 text-sm">Aún no has calificado películas</p>
              ) : (
                <div className="space-y-2">
                  {[10,9,8,7,6,5,4,3,2,1].map(n => (
                    <RatingBar key={n} n={n} count={ratingDist[n] ?? 0} max={maxRating} />
                  ))}
                </div>
              )}
            </div>

            {/* Categorías */}
            {topCats.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">Categorías vistas</h3>
                <div className="space-y-3">
                  {topCats.map(([cat, count]) => {
                    const pct = totalCat > 0 ? Math.round((count / totalCat) * 100) : 0
                    const SHORT: Record<string, string> = {
                      "Pa'l domingo de bajón": 'Bajón dominical',
                      "Pa' saltar del sillón": 'Sillón / Acción',
                      "Pa' quedar con el cerebro como licuadora": 'Cerebro licuadora',
                      "Pa' llorar a moco tendido": 'Drama / Moco',
                    }
                    return (
                      <div key={cat}>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-400 text-xs">{SHORT[cat] ?? cat}</span>
                          <span className="text-zinc-500 text-xs">{count} pelis · {pct}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Link a estadísticas completas con comunidad */}
            <Link
              href="/mi-lista/estadisticas"
              className="flex items-center justify-between bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-5 py-4 transition-colors group"
            >
              <div>
                <p className="text-white text-sm font-medium">Comparar con la comunidad</p>
                <p className="text-zinc-500 text-xs mt-0.5">Rating distribution, géneros y más vs. promedio de usuarios</p>
              </div>
              <span className="text-zinc-500 group-hover:text-white transition-colors text-lg">→</span>
            </Link>
          </div>
        )}

        {tab === 'estadisticas' && !stats && (
          <p className="text-zinc-500 text-sm">Aún no tienes suficientes películas vistas para mostrar estadísticas.</p>
        )}
      </div>

      {/* ── Modal editar perfil ── */}
      {editarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setEditarModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-7 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">Editar perfil</h2>
              <button onClick={() => setEditarModal(false)} className="text-zinc-500 hover:text-white text-xl leading-none transition-colors">✕</button>
            </div>

            {/* Cambiar username */}
            <div className="mb-7">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Cambiar username</p>
              <p className="text-zinc-600 text-xs mb-3">Username actual: <span className="text-zinc-300">@{username}</span></p>
              <div className={`flex items-center bg-zinc-800 border rounded-lg px-3 py-2.5 mb-1 transition-colors ${
                nuevoUsername.length >= 3
                  ? disponibleEdit ? 'border-emerald-500' : verificandoEdit ? 'border-zinc-600' : 'border-red-500'
                  : 'border-zinc-700'
              }`}>
                <span className="text-zinc-500 text-sm mr-1">@</span>
                <input
                  type="text"
                  value={nuevoUsername}
                  onChange={e => { setNuevoUsername(e.target.value); setEditError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleUsernameChange()}
                  placeholder="nuevo_username"
                  maxLength={20}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                />
                {nuevoUsername.length >= 3 && (
                  <span className="text-xs ml-2 shrink-0">
                    {verificandoEdit ? <span className="text-zinc-500">...</span>
                      : disponibleEdit ? <span className="text-emerald-400">✓</span>
                      : <span className="text-red-400">✗</span>}
                  </span>
                )}
              </div>
              <p className="text-zinc-600 text-xs mb-3">Solo letras, números y guión bajo.</p>
              {editError && <p className="text-red-400 text-xs mb-3">{editError}</p>}
              <button
                onClick={handleUsernameChange}
                disabled={guardandoEdit || !disponibleEdit || verificandoEdit || nuevoUsername.length < 3}
                className="w-full bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
              >
                {guardandoEdit ? 'Guardando...' : 'Guardar nuevo username'}
              </button>
            </div>

            {/* Zona de peligro */}
            <div className="border-t border-zinc-800 pt-6">
              <p className="text-xs text-red-500 uppercase tracking-wide mb-4">Zona de peligro</p>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full border border-red-900 text-red-400 hover:bg-red-950 rounded-lg py-2.5 text-sm transition-colors"
                >
                  Eliminar mi cuenta
                </button>
              ) : (
                <div>
                  <p className="text-zinc-400 text-sm mb-3 leading-relaxed">
                    Esta acción es <span className="text-white font-semibold">irreversible</span>. Se borrarán todos tus datos.
                    Escribe <span className="text-white font-bold">ELIMINAR</span> para confirmar.
                  </p>
                  <input
                    type="text"
                    value={deleteText}
                    onChange={e => setDeleteText(e.target.value)}
                    placeholder="ELIMINAR"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-700 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmDelete(false); setDeleteText('') }}
                      className="flex-1 border border-zinc-700 text-zinc-400 rounded-lg py-2.5 text-sm hover:border-zinc-500 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteText !== 'ELIMINAR' || eliminando}
                      className="flex-1 bg-red-600 text-white font-semibold rounded-lg py-2.5 text-sm hover:bg-red-500 transition-colors disabled:opacity-40"
                    >
                      {eliminando ? 'Eliminando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
