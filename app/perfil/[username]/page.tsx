'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  type PeliculaConStats,
  type Stats,
  computeStats,
  StatsCards,
  TopsPanel,
  VibeMapa,
} from '@/components/PerfilStats'
import CuestionarioOnboarding from '@/app/perfil/CuestionarioOnboarding'
import ListaComentarioModal from '@/app/perfil/ListaComentarioModal'

type Pelicula = PeliculaConStats & {
  pelicula: PeliculaConStats['pelicula'] & { titulo_ingles: string | null; anio: number | null }
}

type PerfilPreferencias = {
  birth_year: number | null
  fav_movies: string[]
  generos_preferidos: string[]
  mood_ranking: string[]
  peso_critica: number
  peso_seguidores: number
}

export default function PerfilPage() {
  const { username } = useParams<{ username: string }>()
  const { user, username: miUsername } = useAuth()
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [miAvatarUrl, setMiAvatarUrl] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [misCategorias, setMisCategorias] = useState<Record<string, number> | null>(null)
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [yaSigo, setYaSigo] = useState(false)
  const [enComun, setEnComun] = useState<number | null>(null)
  const [watchlist, setWatchlist] = useState<Pelicula[]>([])
  const [tab, setTab] = useState<'vistas' | 'watchlist' | 'estadisticas'>('vistas')
  const [cargando, setCargando] = useState(true)
  const [loadingFollow, setLoadingFollow] = useState(false)
  const [preferencias, setPreferencias] = useState<PerfilPreferencias | null>(null)
  const [cuestionarioAbierto, setCuestionarioAbierto] = useState(false)
  const [elMeSigue, setElMeSigue] = useState(false)
  const [comentarioModal, setComentarioModal] = useState<{
    peliculaId: string
    peliculaTitulo: string
    peliculaPoster: string | null
    listaTipo: 'watchlist' | 'vistas'
  } | null>(null)

  useEffect(() => {
    if (!username) return

    supabase.from('profiles').select('user_id, avatar_url').eq('username', username).maybeSingle()
      .then(async ({ data: profile }) => {
        if (!profile) { setNotFound(true); setCargando(false); return }
        const uid = profile.user_id
        setProfileUserId(uid)
        setAvatarUrl((profile as any).avatar_url ?? null)
        const esMio = user?.id === uid

        const promises = [
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, categoria, enriquecimiento(director, actores, compositor))')
            .eq('user_id', uid).eq('visto', true),
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, categoria, enriquecimiento(director, actores, compositor))')
            .eq('user_id', uid).eq('watchlist', true),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
          user ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', uid).maybeSingle() : Promise.resolve({ data: null }),
          (user && !esMio)
            ? supabase.from('user_peliculas').select('pelicula_id, peliculas(categoria)').eq('user_id', user.id).eq('visto', true)
            : Promise.resolve({ data: null }),
          (user && !esMio)
            ? supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle()
            : Promise.resolve({ data: null }),
          esMio
            ? supabase.from('perfil_preferencias').select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores').eq('user_id', uid).maybeSingle()
            : Promise.resolve({ data: null }),
          // El dueño del perfil me sigue a mí (mutual follow check)
          (user && !esMio)
            ? supabase.from('follows').select('follower_id').eq('follower_id', uid).eq('following_id', user.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ] as const

        const [{ data: vistas }, { data: wl }, { count: nSeguidores }, { count: nSiguiendo }, { data: followCheck }, { data: misVistas }, { data: miProfData }, { data: prefData }, { data: elMeSigueCheck }] = await Promise.all(promises)

        const mapped: Pelicula[] = (vistas ?? [])
          .map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas }))
          .filter((r: any) => r.pelicula)
          .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))

        const mappedWl: Pelicula[] = (wl ?? [])
          .map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas }))
          .filter((r: any) => r.pelicula)

        setPeliculas(mapped)
        setWatchlist(mappedWl)
        setStats(computeStats(mapped))
        setSeguidores(nSeguidores ?? 0)
        setSiguiendo(nSiguiendo ?? 0)
        setYaSigo(!!followCheck)
        if (miProfData) setMiAvatarUrl((miProfData as any)?.avatar_url ?? null)
        if (prefData) setPreferencias(prefData as PerfilPreferencias)
        setElMeSigue(!!elMeSigueCheck)

        if (misVistas && misVistas.length > 0) {
          const misIds = new Set((misVistas as any[]).map(v => v.pelicula_id))
          setEnComun(mapped.filter(p => misIds.has(p.pelicula_id)).length)
          const cats: Record<string, number> = {}
          ;(misVistas as any[]).forEach(r => {
            const cat = r.peliculas?.categoria
            if (cat) cats[cat] = (cats[cat] ?? 0) + 1
          })
          setMisCategorias(cats)
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

  const handleCuestionarioComplete = async () => {
    setCuestionarioAbierto(false)
    // Refetch preferencias
    if (user) {
      const { data } = await supabase
        .from('perfil_preferencias')
        .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) setPreferencias(data as PerfilPreferencias)
    }
  }

  function PosterCard({ titulo, poster, rating }: { titulo: string; poster: string | null; rating: number | null }) {
    return (
      <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors">
        <div className="relative aspect-[2/3] bg-zinc-800">
          {poster ? (
            <Image src={`https://image.tmdb.org/t/p/w185${poster}`} alt={titulo} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-1">
              <span className="text-zinc-600 text-xs text-center leading-tight">{titulo}</span>
            </div>
          )}
          {rating != null && (
            <div className="absolute top-1 right-1 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400">
              {rating}
            </div>
          )}
        </div>
      </div>
    )
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
  const puedecomentar = !esMiPerfil && yaSigo && elMeSigue

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              {avatarUrl
                ? <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-zinc-400">{username?.[0]?.toUpperCase()}</span>
              }
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">@{username}</h1>
              <div className="flex gap-4 mt-1 text-sm text-zinc-500 flex-wrap">
                <span><span className="text-white font-semibold">{peliculas.length}</span> vistas</span>
                <span><span className="text-white font-semibold">{seguidores}</span> seguidores</span>
                <span><span className="text-white font-semibold">{siguiendo}</span> siguiendo</span>
                {enComun !== null && (
                  <span><span className="text-yellow-400 font-semibold">{enComun}</span> en común</span>
                )}
              </div>
            </div>
          </div>

          {esMiPerfil ? (
            <Link href="/perfil" className="px-4 py-2 rounded-lg text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors">
              Editar perfil
            </Link>
          ) : user && (
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

        {/* Banner cuestionario para mi perfil */}
        {esMiPerfil && (
          <div className="mb-6 flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
            <p className="text-sm text-zinc-300">
              {preferencias
                ? '⚙️ Tus recomendaciones están personalizadas'
                : '✨ Personaliza tus recomendaciones para películas más afines a ti'}
            </p>
            <button
              type="button"
              onClick={() => setCuestionarioAbierto(true)}
              className="shrink-0 text-xs font-medium text-yellow-400 hover:text-yellow-300 transition-colors whitespace-nowrap"
            >
              {preferencias ? 'Editar →' : 'Personalizar →'}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1">
          {([
            { key: 'vistas', label: `Vistas`, count: peliculas.length },
            { key: 'watchlist', label: 'Watchlist', count: watchlist.length },
            { key: 'estadisticas', label: 'Estadísticas', count: null },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
              {count !== null && count > 0 && (
                <span className={`ml-1.5 text-xs ${tab === key ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Vistas */}
        {tab === 'vistas' && (
          peliculas.length === 0 ? (
            <p className="text-zinc-500 text-sm">Aún no ha marcado películas como vistas.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {peliculas.map(entrada => {
                const p = entrada.pelicula
                const titulo = p.titulo_ingles || p.titulo
                const clickable = !esMiPerfil
                return (
                  <div
                    key={entrada.pelicula_id}
                    className={clickable ? 'cursor-pointer' : ''}
                    onClick={clickable ? () => setComentarioModal({ peliculaId: entrada.pelicula_id, peliculaTitulo: titulo, peliculaPoster: p.poster_path ?? null, listaTipo: 'vistas' }) : undefined}
                  >
                    {esMiPerfil ? (
                      <Link href={`/pelicula/${entrada.pelicula_id}`}>
                        <PosterCard titulo={titulo} poster={p.poster_path ?? null} rating={entrada.rating} />
                      </Link>
                    ) : (
                      <PosterCard titulo={titulo} poster={p.poster_path ?? null} rating={entrada.rating} />
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Tab: Watchlist */}
        {tab === 'watchlist' && (
          watchlist.length === 0 ? (
            <p className="text-zinc-500 text-sm">La watchlist está vacía.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {watchlist.map(entrada => {
                const p = entrada.pelicula
                const titulo = p.titulo_ingles || p.titulo
                const clickable = !esMiPerfil
                return (
                  <div
                    key={entrada.pelicula_id}
                    className={clickable ? 'cursor-pointer' : ''}
                    onClick={clickable ? () => setComentarioModal({ peliculaId: entrada.pelicula_id, peliculaTitulo: titulo, peliculaPoster: p.poster_path ?? null, listaTipo: 'watchlist' }) : undefined}
                  >
                    {esMiPerfil ? (
                      <Link href={`/pelicula/${entrada.pelicula_id}`}>
                        <PosterCard titulo={titulo} poster={p.poster_path ?? null} rating={null} />
                      </Link>
                    ) : (
                      <PosterCard titulo={titulo} poster={p.poster_path ?? null} rating={null} />
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Tab: Estadísticas */}
        {tab === 'estadisticas' && (
          stats && peliculas.length > 0 ? (
            <>
              <StatsCards stats={stats} total={peliculas.length} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <TopsPanel stats={stats} />
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <VibeMapa
                    categorias={stats.categorias}
                    username={username}
                    avatarUrl={avatarUrl}
                    misCategorias={esMiPerfil ? null : misCategorias}
                    miUsername={esMiPerfil ? null : (miUsername ?? null)}
                    miAvatarUrl={esMiPerfil ? null : miAvatarUrl}
                  />
                </div>
              </div>

              {/* Resumen de preferencias para mi perfil */}
              {esMiPerfil && preferencias && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-zinc-300">Mis preferencias</h3>
                    <button
                      type="button"
                      onClick={() => setCuestionarioAbierto(true)}
                      className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                      Editar preferencias →
                    </button>
                  </div>
                  <div className="space-y-2 text-xs text-zinc-400">
                    {preferencias.birth_year && (
                      <p>Año de nacimiento: <span className="text-white">{preferencias.birth_year}</span></p>
                    )}
                    {preferencias.generos_preferidos.length > 0 && (
                      <p>Géneros: <span className="text-white">{preferencias.generos_preferidos.join(', ')}</span></p>
                    )}
                    {preferencias.mood_ranking.length > 0 && (
                      <p>Mood favorito: <span className="text-white">{preferencias.mood_ranking[0]}</span></p>
                    )}
                    <p>
                      Peso crítica: <span className="text-white">{Math.round(preferencias.peso_critica * 10)}/10</span>
                      {' · '}
                      Peso seguidores: <span className="text-white">{Math.round(preferencias.peso_seguidores * 10)}/10</span>
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-500 text-sm">Aún no hay suficientes datos para mostrar estadísticas.</p>
          )
        )}
      </div>

      {/* Cuestionario modal */}
      {cuestionarioAbierto && (
        <CuestionarioOnboarding
          onComplete={handleCuestionarioComplete}
          onDismiss={() => setCuestionarioAbierto(false)}
          preferenciasIniciales={preferencias}
        />
      )}

      {/* Modal comentario en lista */}
      {comentarioModal && profileUserId && (
        <ListaComentarioModal
          peliculaId={comentarioModal.peliculaId}
          peliculaTitulo={comentarioModal.peliculaTitulo}
          peliculaPoster={comentarioModal.peliculaPoster}
          toUserId={profileUserId}
          toUsername={username as string}
          listaTipo={comentarioModal.listaTipo}
          puedecomentar={puedecomentar}
          onClose={() => setComentarioModal(null)}
        />
      )}
    </main>
  )
}
