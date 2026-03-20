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
    oscars: string | null
    categoria: string | null
    enriquecimiento: {
      director: string | null
      actores: string | null
      compositor: string | null
    } | null
  }
}

type Stats = {
  oscarWinners: number
  avgRating: number | null
  avgImdb: number | null
  topDirectores: [string, number][]
  topActores: [string, number][]
  topCompositores: [string, number][]
  categorias: Record<string, number>
}

// Cuadrantes del vibe map 2D
// X: Tranquilo(-1) ↔ Intenso(+1)
// Y: Emocional(+1) ↔ Cerebral(-1)
const VIBE_QUADRANTS = [
  { key: "Pa'l domingo de bajón",              label: 'Bajón',      emoji: '😴', x: -1, y:  1, color: 'rgba(99,102,241,', pos: 'top-left'     },
  { key: "Pa' llorar a moco tendido",          label: 'Moco',       emoji: '😭', x:  1, y:  1, color: 'rgba(59,130,246,', pos: 'top-right'    },
  { key: "Pa' quedar con el cerebro como licuadora", label: 'Licuadora', emoji: '🧠', x: -1, y: -1, color: 'rgba(168,85,247,', pos: 'bottom-left' },
  { key: "Pa' saltar del sillón",              label: 'Sillón',     emoji: '🎬', x:  1, y: -1, color: 'rgba(239,68,68,',  pos: 'bottom-right' },
]

function computeStats(peliculas: Pelicula[]): Stats {
  const directors: Record<string, number> = {}
  const actors: Record<string, number> = {}
  const composers: Record<string, number> = {}
  const categorias: Record<string, number> = {}
  let oscarWinners = 0
  let totalRating = 0, countRating = 0, totalImdb = 0, countImdb = 0

  for (const e of peliculas) {
    const p = e.pelicula
    const osc = (p.oscars ?? '').toLowerCase()
    if (osc.startsWith('ganó') && osc.includes('mejor película') &&
      !osc.includes('animad') && !osc.includes('internacional') &&
      !osc.includes('extranjera') && !osc.includes('habla no inglesa')) oscarWinners++

    if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
    if (e.rating) { totalRating += e.rating; countRating++ }
    if (p.nota_imdb) { totalImdb += p.nota_imdb; countImdb++ }

    const enr = p.enriquecimiento
    if (enr?.director?.trim()) {
      const d = enr.director.trim()
      directors[d] = (directors[d] ?? 0) + 1
    }
    if (enr?.actores) {
      enr.actores.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
        actors[a] = (actors[a] ?? 0) + 1
      })
    }
    if (enr?.compositor?.trim()) {
      const c = enr.compositor.trim()
      composers[c] = (composers[c] ?? 0) + 1
    }
  }

  return {
    oscarWinners,
    avgRating: countRating > 0 ? Math.round((totalRating / countRating) * 10) / 10 : null,
    avgImdb: countImdb > 0 ? Math.round((totalImdb / countImdb) * 10) / 10 : null,
    topDirectores: Object.entries(directors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topActores: Object.entries(actors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topCompositores: Object.entries(composers).sort((a, b) => b[1] - a[1]).slice(0, 3),
    categorias,
  }
}

function TopList({ title, items }: { title: string; items: [string, number][] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map(([name, count], i) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-zinc-600 text-xs w-3">{i + 1}.</span>
            <span className="text-zinc-200 text-sm flex-1 truncate">{name}</span>
            <span className="text-zinc-500 text-xs shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function VibeMapa2D({ categorias }: { categorias: Record<string, number> }) {
  const total = VIBE_QUADRANTS.reduce((s, q) => s + (categorias[q.key] ?? 0), 0)
  if (total === 0) return null

  // Posición ponderada del "punto de vibe"
  let wx = 0, wy = 0
  VIBE_QUADRANTS.forEach(q => {
    const n = categorias[q.key] ?? 0
    wx += q.x * n
    wy += q.y * n
  })
  const dotX = 50 + (wx / total) * 35   // 15-85% rango
  const dotY = 50 - (wy / total) * 35   // invertido porque Y CSS va hacia abajo

  const max = Math.max(...VIBE_QUADRANTS.map(q => categorias[q.key] ?? 0), 1)

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Vibe map</p>

      {/* Etiquetas de ejes */}
      <div className="flex justify-between text-xs text-zinc-600 mb-1 px-1">
        <span>← Tranquilo</span>
        <span>Intenso →</span>
      </div>

      <div className="relative">
        {/* Etiqueta eje Y izquierda */}
        <div className="absolute -left-5 top-0 bottom-0 flex flex-col justify-between py-2 pointer-events-none">
          <span className="text-xs text-zinc-600 -rotate-90 origin-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10 }}>Emocional</span>
          <span className="text-xs text-zinc-600" style={{ writingMode: 'vertical-rl', fontSize: 10 }}>Cerebral</span>
        </div>

        {/* Grid 2×2 */}
        <div className="grid grid-cols-2 gap-0.5 ml-2">
          {[
            VIBE_QUADRANTS[0], // Bajón top-left
            VIBE_QUADRANTS[1], // Moco top-right
            VIBE_QUADRANTS[2], // Licuadora bottom-left
            VIBE_QUADRANTS[3], // Sillón bottom-right
          ].map(q => {
            const count = categorias[q.key] ?? 0
            const intensity = count / max
            return (
              <div
                key={q.key}
                className="relative rounded-lg p-3 border border-zinc-800 min-h-[72px] flex flex-col justify-between"
                style={{ background: `${q.color}${(intensity * 0.35 + 0.05).toFixed(2)})` }}
              >
                <span className="text-base">{q.emoji}</span>
                <div>
                  <p className="text-xs font-medium text-zinc-200">{q.label}</p>
                  <p className="text-xs text-zinc-500">{count} {count === 1 ? 'peli' : 'pelis'}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Punto de vibe superpuesto — solo decorativo en grid, usamos un overlay */}
        <div className="absolute inset-0 ml-2 pointer-events-none" style={{ top: 0, left: 8 }}>
          <div
            className="absolute w-4 h-4 rounded-full bg-white border-2 border-zinc-900 shadow-lg transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${dotX}%`, top: `${dotY}%` }}
            title="Tu vibe promedio"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 ml-2">
        {VIBE_QUADRANTS.map(q => {
          const count = categorias[q.key] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <span key={q.key} className="text-xs text-zinc-500">
              {q.emoji} {pct}%
            </span>
          )
        })}
        <span className="text-xs text-zinc-600 ml-auto">● tu vibe</span>
      </div>
    </div>
  )
}

export default function PerfilPage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [seguidores, setSeguidores] = useState(0)
  const [siguiendo, setSiguiendo] = useState(0)
  const [yaSigo, setYaSigo] = useState(false)
  const [enComun, setEnComun] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [loadingFollow, setLoadingFollow] = useState(false)

  useEffect(() => {
    if (!username) return

    supabase.from('profiles').select('user_id, avatar_url').eq('username', username).maybeSingle()
      .then(async ({ data: profile }) => {
        if (!profile) { setNotFound(true); setCargando(false); return }
        const uid = profile.user_id
        setProfileUserId(uid)
        setAvatarUrl((profile as any).avatar_url ?? null)

        const [{ data: vistas }, { count: nSeguidores }, { count: nSiguiendo }, { data: followCheck }, { data: misVistas }] = await Promise.all([
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, categoria, enriquecimiento(director, actores, compositor))')
            .eq('user_id', uid).eq('visto', true),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
          user
            ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', uid).maybeSingle()
            : Promise.resolve({ data: null }),
          (user && user.id !== uid)
            ? supabase.from('user_peliculas').select('pelicula_id').eq('user_id', user.id).eq('visto', true)
            : Promise.resolve({ data: null }),
        ] as const)

        const mapped: Pelicula[] = (vistas ?? [])
          .map((r: any) => ({ pelicula_id: r.pelicula_id, rating: r.rating, pelicula: r.peliculas }))
          .filter((r: any) => r.pelicula)
          .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0))

        setPeliculas(mapped)
        setStats(computeStats(mapped))
        setSeguidores(nSeguidores ?? 0)
        setSiguiendo(nSiguiendo ?? 0)
        setYaSigo(!!followCheck)

        if (misVistas && misVistas.length > 0) {
          const misIds = new Set((misVistas as any[]).map(v => v.pelicula_id))
          setEnComun(mapped.filter(p => misIds.has(p.pelicula_id)).length)
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

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
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

        {/* Stats cards */}
        {stats && peliculas.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { val: peliculas.length,        label: 'Películas vistas',    color: 'text-emerald-400' },
              { val: stats.avgRating ?? '—',  label: 'Rating promedio',     color: 'text-yellow-400' },
              { val: stats.avgImdb ?? '—',    label: 'IMDB promedio visto', color: 'text-blue-400' },
              { val: stats.oscarWinners,      label: 'Oscars Mejor Peli',   color: 'text-amber-300' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className={`text-2xl font-bold ${c.color}`}>{c.val}</p>
                <p className="text-xs text-zinc-500 mt-1">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tops + Vibe Map 2D */}
        {stats && peliculas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
              <TopList title="Top directores" items={stats.topDirectores} />
              <TopList title="Top actores" items={stats.topActores} />
              <TopList title="Top compositores" items={stats.topCompositores} />
              {!stats.topDirectores.length && !stats.topActores.length && !stats.topCompositores.length && (
                <p className="text-zinc-600 text-sm">Sin datos de equipo aún</p>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <VibeMapa2D categorias={stats.categorias} />
              {!Object.keys(stats.categorias).length && (
                <p className="text-zinc-600 text-sm">Sin datos de categorías aún</p>
              )}
            </div>
          </div>
        )}

        {/* Grid películas */}
        {peliculas.length === 0 ? (
          <p className="text-zinc-500 text-sm">Aún no ha marcado películas como vistas.</p>
        ) : (
          <>
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Películas vistas</p>
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
          </>
        )}
      </div>
    </main>
  )
}
