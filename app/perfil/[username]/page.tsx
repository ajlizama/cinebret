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

// Ejes del mapa (igual que la imagen de referencia):
// X: Pa'l domingo de bajón (izq, -1) ↔ Pa' quedar con el cerebro como licuadora (der, +1)
// Y: Pa' llorar a moco tendido (abajo, -1) ↔ Pa' saltar del sillón (arriba, +1)
const VIBE_KEYS = {
  sillon:    "Pa' saltar del sillón",
  moco:      "Pa' llorar a moco tendido",
  bajon:     "Pa'l domingo de bajón",
  licuadora: "Pa' quedar con el cerebro como licuadora",
}

function computeVibePos(categorias: Record<string, number>): { x: number; y: number } | null {
  const bajon     = categorias[VIBE_KEYS.bajon]     ?? 0
  const licuadora = categorias[VIBE_KEYS.licuadora] ?? 0
  const sillon    = categorias[VIBE_KEYS.sillon]    ?? 0
  const moco      = categorias[VIBE_KEYS.moco]      ?? 0
  const total = bajon + licuadora + sillon + moco
  if (total === 0) return null
  return {
    x: (-bajon + licuadora) / total,   // -1 = todo bajón, +1 = todo licuadora
    y: (sillon - moco) / total,         // -1 = todo moco,  +1 = todo sillón
  }
}

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
    if (enr?.director?.trim()) directors[enr.director.trim()] = (directors[enr.director.trim()] ?? 0) + 1
    if (enr?.actores) {
      enr.actores.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
        actors[a] = (actors[a] ?? 0) + 1
      })
    }
    if (enr?.compositor?.trim()) composers[enr.compositor.trim()] = (composers[enr.compositor.trim()] ?? 0) + 1
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

type VibeChip = {
  label: string
  avatar: string | null
  pos: { x: number; y: number }
  muted: boolean
}

function VibeMapa({
  categorias,
  username,
  avatarUrl,
  misCategorias,
  miUsername,
  miAvatarUrl,
}: {
  categorias: Record<string, number>
  username: string
  avatarUrl: string | null
  misCategorias: Record<string, number> | null
  miUsername: string | null
  miAvatarUrl: string | null
}) {
  const elPos = computeVibePos(categorias)
  const miPos = misCategorias ? computeVibePos(misCategorias) : null

  const chips: VibeChip[] = []
  if (elPos) chips.push({ label: username, avatar: avatarUrl, pos: elPos, muted: false })
  if (miPos && miUsername && miUsername !== username)
    chips.push({ label: miUsername, avatar: miAvatarUrl, pos: miPos, muted: true })

  // Convert vibe position (-1..+1) to CSS % (10..90)
  const toCssX = (x: number) => 50 + x * 38
  const toCssY = (y: number) => 50 - y * 38

  const hasData = Object.values(categorias).some(v => v > 0)

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Vibe map</p>

      {!hasData ? (
        <p className="text-zinc-600 text-sm">Sin datos de categorías aún</p>
      ) : (
        <div
          className="relative w-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden"
          style={{ paddingBottom: '75%' }}
        >
          {/* Crosshair lines */}
          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-800" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-800" />
          </div>

          {/* Axis labels */}
          {/* Top: Sillón */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <span className="text-zinc-500 text-xs whitespace-nowrap">Pa' saltar del sillón</span>
          </div>
          {/* Bottom: Moco */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <span className="text-zinc-500 text-xs whitespace-nowrap">Pa' llorar a moco tendido</span>
          </div>
          {/* Left: Bajón */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ maxWidth: 64 }}>
            <span className="text-zinc-500 text-xs leading-tight block text-left">Pa'l domingo de bajón</span>
          </div>
          {/* Right: Licuadora */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ maxWidth: 64 }}>
            <span className="text-zinc-500 text-xs leading-tight block text-right">Pa' quedar con el cerebro como licuadora</span>
          </div>

          {/* Profile chips */}
          {chips.map(chip => {
            const cssX = toCssX(chip.pos.x)
            const cssY = toCssY(chip.pos.y)
            return (
              <div
                key={chip.label}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full px-2 py-1 border"
                style={{
                  left: `${cssX}%`,
                  top: `${cssY}%`,
                  opacity: chip.muted ? 0.4 : 1,
                  background: chip.muted ? 'rgba(39,39,42,0.8)' : 'rgba(250,204,21,0.15)',
                  borderColor: chip.muted ? 'rgb(63,63,70)' : 'rgba(250,204,21,0.6)',
                  zIndex: chip.muted ? 1 : 2,
                }}
              >
                {/* Avatar circle */}
                <div className="w-5 h-5 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                  {chip.avatar
                    ? <img src={chip.avatar} alt={chip.label} className="w-full h-full object-cover" />
                    : <span className="text-zinc-300 text-xs font-bold">{chip.label[0]?.toUpperCase()}</span>
                  }
                </div>
                <span className="text-xs font-medium whitespace-nowrap" style={{ color: chip.muted ? 'rgb(161,161,170)' : 'rgb(250,204,21)' }}>
                  @{chip.label}
                </span>
              </div>
            )
          })}

          {/* No position computable */}
          {!elPos && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-600 text-xs">Sin suficientes categorías para posicionar</p>
            </div>
          )}
        </div>
      )}

      {/* Leyenda */}
      {chips.length > 1 && (
        <div className="flex gap-4 mt-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border border-yellow-400/60 inline-block bg-yellow-400/15" />
            @{username}
          </span>
          {miUsername && miUsername !== username && (
            <span className="flex items-center gap-1 opacity-50">
              <span className="w-3 h-3 rounded-full border border-zinc-600 inline-block bg-zinc-700/80" />
              tú (@{miUsername})
            </span>
          )}
        </div>
      )}
    </div>
  )
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

        const esMio = user?.id === uid

        const [{ data: vistas }, { count: nSeguidores }, { count: nSiguiendo }, { data: followCheck }, { data: misVistas }, { data: miProfData }] = await Promise.all([
          supabase.from('user_peliculas')
            .select('pelicula_id, rating, peliculas(titulo, titulo_ingles, anio, nota_imdb, poster_path, oscars, categoria, enriquecimiento(director, actores, compositor))')
            .eq('user_id', uid).eq('visto', true),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
          user ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', uid).maybeSingle() : Promise.resolve({ data: null }),
          // My own movies (for "en común" + vibe position)
          (user && !esMio)
            ? supabase.from('user_peliculas').select('pelicula_id, peliculas(categoria)').eq('user_id', user.id).eq('visto', true)
            : Promise.resolve({ data: null }),
          // My avatar
          (user && !esMio)
            ? supabase.from('profiles').select('avatar_url').eq('user_id', user.id).maybeSingle()
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

        if (miAvatarUrl === null && miProfData) {
          setMiAvatarUrl((miProfData as any)?.avatar_url ?? null)
        }

        if (misVistas && misVistas.length > 0) {
          const misIds = new Set((misVistas as any[]).map(v => v.pelicula_id))
          setEnComun(mapped.filter(p => misIds.has(p.pelicula_id)).length)

          // Build my own category distribution for vibe map
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

        {/* Tops + Vibe Map */}
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
