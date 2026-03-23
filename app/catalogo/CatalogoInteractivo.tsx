'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from './PeliculaDetalle'
import AgregarAListaButton from '@/app/pelicula/[id]/AgregarAListaButton'
import ParaTi from '@/app/comunidad/ParaTi'
import CuestionarioOnboarding from '@/app/perfil/CuestionarioOnboarding'

type UserPelicula = { visto: boolean; rating: number | null; watchlist: boolean }

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', logo: '/paramount_plus.svg' },
]

export type Pelicula = {
  id: string; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; rt_score: number | null; metacritic_score: number | null
  runtime: number | null; boxoffice: number | null; categoria: string | null
  plataformas: string[]; es_review_autor: boolean; sello_bret: boolean
  director: string | null; director_oscars: number | null; actores: string | null
  actores_oscars: Record<string, number> | null; compositor: string | null
  compositor_oscars: number | null; generos: string[]; poster_path: string | null
  oscars: string | null; imdb_id: string | null; youtube_trailer_key: string | null
  sinopsis: string | null
}

type Orden = 'imdb' | 'rt' | 'metacritic' | 'boxoffice' | 'anio_desc' | 'anio_asc' | 'titulo'

const OSCAR_OPCIONES = [
  'Ganadora Mejor Película', 'Ganadora Mejor Película Animada', 'Ganadora Mejor Película Internacional',
  'Ganadora de Oscar', 'Nominada al Oscar', 'Ganó Mejor Director', 'Ganó Mejor Actor',
  'Ganó Mejor Actriz', 'Ganó Mejor Guión', 'Ganó Mejor Banda Sonora', 'Ganó Mejor Fotografía',
  'Director con Oscar', 'Actor con Oscar', 'Compositor con Oscar',
]

function matchOscarFiltro(p: Pelicula, filtros: string[]): boolean {
  if (filtros.length === 0) return true
  return filtros.every(f => {
    const osc = (p.oscars ?? '').toLowerCase()
    const gano = osc.startsWith('ganó')
    if (f === 'Ganadora Mejor Película') return gano && osc.includes('mejor película') && !osc.includes('animad') && !osc.includes('internacional') && !osc.includes('extranjera') && !osc.includes('habla no inglesa')
    if (f === 'Ganadora Mejor Película Animada') return gano && osc.includes('animad')
    if (f === 'Ganadora Mejor Película Internacional') return gano && (osc.includes('internacional') || osc.includes('extranjera') || osc.includes('habla no inglesa'))
    if (f === 'Ganadora de Oscar') return gano
    if (f === 'Nominada al Oscar') return osc.includes('nominad')
    if (f === 'Ganó Mejor Director') return gano && osc.includes('mejor director')
    if (f === 'Ganó Mejor Actor') return gano && osc.includes('mejor actor') && !osc.includes('mejor actriz')
    if (f === 'Ganó Mejor Actriz') return gano && osc.includes('mejor actriz')
    if (f === 'Ganó Mejor Guión') return gano && (osc.includes('guión') || osc.includes('guion'))
    if (f === 'Ganó Mejor Banda Sonora') return gano && (osc.includes('banda sonora') || osc.includes('música original') || osc.includes('musica original'))
    if (f === 'Ganó Mejor Fotografía') return gano && (osc.includes('fotografía') || osc.includes('fotografia') || osc.includes('cinematografía'))
    if (f === 'Director con Oscar') return (p.director_oscars ?? 0) > 0
    if (f === 'Actor con Oscar') return p.actores_oscars != null && Object.values(p.actores_oscars).some(v => v > 0)
    if (f === 'Compositor con Oscar') return (p.compositor_oscars ?? 0) > 0
    return true
  })
}

type MultiSelectProps = { label: string; opciones: string[]; seleccionados: string[]; onChange: (s: string[]) => void }

function MultiSelect({ label, opciones, seleccionados, onChange }: MultiSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const toggle = (op: string) => onChange(seleccionados.includes(op) ? seleccionados.filter(s => s !== op) : [...seleccionados, op])
  const opcionesFiltradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))
  const handleClose = () => { setAbierto(false); setBusqueda('') }

  return (
    <div className="relative">
      <button onClick={() => setAbierto(!abierto)}
        className={`border rounded-lg px-4 py-2 text-sm flex items-center gap-2 transition-colors ${seleccionados.length > 0 ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
        {label}
        {seleccionados.length > 0 && <span className="bg-zinc-950 text-yellow-400 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{seleccionados.length}</span>}
        <span className="text-xs">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={handleClose} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl min-w-52 flex flex-col max-h-72">
            <div className="p-2 border-b border-zinc-800 shrink-0">
              <input autoFocus type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} onClick={e => e.stopPropagation()}
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500" />
            </div>
            {seleccionados.length > 0 && <div className="border-b border-zinc-800 px-3 py-2 shrink-0"><button onClick={() => onChange([])} className="text-xs text-zinc-500 hover:text-white transition-colors">Limpiar selección</button></div>}
            <div className="overflow-y-auto">
              {opcionesFiltradas.length === 0 ? <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p> : opcionesFiltradas.map(op => (
                <div key={op} onClick={() => toggle(op)} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${seleccionados.includes(op) ? 'bg-yellow-400 border-yellow-400' : 'border-zinc-600'}`}>
                    {seleccionados.includes(op) && <span className="text-zinc-950 text-xs font-bold">✓</span>}
                  </div>
                  <span className="truncate text-zinc-300">{op}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const MOOD_CATS = [
  { id: "Pa'l domingo de bajón", emoji: '🛋️', short: 'Bajón', grad: 'from-amber-500 to-orange-600', dim: 'from-amber-950/70 to-orange-950/70 border-amber-800' },
  { id: "Pa' saltar del sillón", emoji: '⚡', short: 'Del sillón', grad: 'from-violet-500 to-blue-600', dim: 'from-violet-950/70 to-blue-950/70 border-violet-800' },
  { id: "Pa' quedar con el cerebro como licuadora", emoji: '🤯', short: 'Licuadora', grad: 'from-rose-500 to-pink-600', dim: 'from-rose-950/70 to-pink-950/70 border-rose-800' },
  { id: "Pa' llorar a moco tendido", emoji: '😭', short: 'A moco tendido', grad: 'from-cyan-500 to-teal-600', dim: 'from-cyan-950/70 to-teal-950/70 border-cyan-800' },
]

/* ─────────── Expanded detail panel (TMDB-style) ─────────── */
function PanelExpandido({
  p, up, user, generosFiltro, setGenerosFiltro, setExpandida,
  toggleVisto, toggleWatchlist, setRating,
}: {
  p: Pelicula; up: UserPelicula | undefined; user: any
  generosFiltro: string[]; setGenerosFiltro: (g: string[]) => void
  setExpandida: (id: string | null) => void
  toggleVisto: (id: string, e: React.MouseEvent) => void
  toggleWatchlist: (id: string, e: React.MouseEvent) => void
  setRating: (id: string, r: number, e: any) => void
}) {
  const platsActivas = PLATAFORMAS.filter(pl => p.plataformas.includes(pl.id))
  const oscarGano = p.oscars?.toLowerCase().startsWith('ganó')
  const oscarNum = p.oscars?.match(/\d+/)?.[0]

  return (
    <div className="col-span-2 md:col-span-4 rounded-2xl overflow-hidden my-2 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="relative bg-zinc-900">
        {/* Blurred backdrop */}
        {p.poster_path && (
          <div className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://image.tmdb.org/t/p/w780${p.poster_path}`} alt="" className="w-full h-full object-cover blur-3xl opacity-15 scale-110" />
          </div>
        )}

        {/* Close button */}
        <button onClick={() => setExpandida(null)}
          className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors">✕</button>

        {/* Content: poster left + info right */}
        <div className="relative z-10 p-4 md:p-6 flex gap-5 md:gap-8">
          {/* LEFT: poster */}
          <div className="relative w-32 md:w-48 shrink-0 rounded-xl overflow-hidden shadow-2xl self-start" style={{ aspectRatio: '2/3' }}>
            {p.poster_path ? (
              <Image src={`https://image.tmdb.org/t/p/w342${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="192px" />
            ) : (
              <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><span className="text-4xl">🎬</span></div>
            )}
          </div>

          {/* RIGHT: info */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Title + year */}
            <div>
              <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">
                {p.titulo_ingles || p.titulo}
                {p.anio && <span className="text-zinc-400 font-normal ml-2">({p.anio})</span>}
              </h3>
              {p.titulo_ingles && p.titulo !== p.titulo_ingles && (
                <p className="text-zinc-500 text-sm mt-0.5">{p.titulo}</p>
              )}
            </div>

            {/* Meta line: genres · runtime */}
            <div className="flex items-center gap-2 text-sm text-zinc-400 flex-wrap">
              {p.generos.length > 0 && <span>{p.generos.join(', ')}</span>}
              {p.runtime != null && <span>· {Math.floor(p.runtime / 60)}h {p.runtime % 60}min</span>}
              {p.categoria && <span>· {p.categoria}</span>}
            </div>

            {/* Ratings row */}
            <div className="flex items-center gap-4 flex-wrap">
              {p.nota_imdb != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                    <span className="text-yellow-400 font-bold text-sm">{p.nota_imdb}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">IMDB</span>
                </div>
              )}
              {p.rt_score != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full border-2 border-red-400 flex items-center justify-center">
                    <span className="text-red-400 font-bold text-sm">{p.rt_score}%</span>
                  </div>
                  <span className="text-zinc-500 text-xs">RT</span>
                </div>
              )}
              {p.metacritic_score != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-10 h-10 rounded-full border-2 border-green-400 flex items-center justify-center">
                    <span className="text-green-400 font-bold text-sm">{p.metacritic_score}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">MC</span>
                </div>
              )}
              {/* Oscars */}
              {p.oscars && p.oscars !== 'N/A' && (
                <div className="flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/oscar.png" alt="Oscar" className={`h-10 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`} />
                  <div>
                    {oscarNum && <span className={`text-sm font-bold ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                    <p className="text-zinc-500 text-[10px] leading-none">{oscarGano ? 'Ganó' : 'Nom.'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Platforms */}
            {platsActivas.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {platsActivas.map(pl => (
                  <div key={pl.id} className="rounded-lg bg-white px-2 py-1 flex items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pl.logo} alt={pl.nombre} className="h-4 w-auto object-contain" />
                  </div>
                ))}
              </div>
            )}

            {/* User actions */}
            {user && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={e => toggleVisto(p.id, e)}
                  className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 text-zinc-400 hover:border-emerald-400 hover:text-emerald-400'}`}>
                  {up?.visto ? '✓ Vista' : '○ Marcar vista'}
                </button>
                <button onClick={e => toggleWatchlist(p.id, e)}
                  className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-600 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400'}`}>
                  {up?.watchlist ? '★ En watchlist' : '☆ Watchlist'}
                </button>
                {up?.visto && (
                  <select value={up.rating ?? ''} onChange={e => { if (e.target.value) setRating(p.id, Number(e.target.value), e as any) }}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
                    <option value="">Tu rating</option>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}/10</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Trailer + links */}
            <div className="flex flex-wrap gap-3 items-center">
              {p.youtube_trailer_key && (
                <a href={`https://www.youtube.com/watch?v=${p.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                  ▶ Reproducir tráiler
                </a>
              )}
              {p.imdb_id && <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-yellow-500 hover:text-yellow-300">IMDb ↗</a>}
              <a href={`https://open.spotify.com/search/${encodeURIComponent((p.titulo_ingles || p.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-300">♫ Soundtrack ↗</a>
              <AgregarAListaButton peliculaId={p.id} />
            </div>

            {/* Synopsis */}
            {p.sinopsis && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium">Vista general</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{p.sinopsis}</p>
              </div>
            )}

            {/* Team */}
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {p.director && (
                <div>
                  <p className="text-white text-sm font-medium">{p.director}</p>
                  <p className="text-zinc-500 text-xs">Director</p>
                </div>
              )}
              {p.compositor && (
                <div>
                  <p className="text-white text-sm font-medium">{p.compositor}</p>
                  <p className="text-zinc-500 text-xs">Compositor</p>
                </div>
              )}
            </div>
            {p.actores && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p>
                <p className="text-sm text-zinc-300">{p.actores}</p>
              </div>
            )}

            {/* Badges */}
            <div className="flex gap-2">
              {p.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-2 py-0.5 rounded">CB Review</span>}
              {p.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 px-2 py-0.5 rounded font-bold">★ Recomendada</span>}
            </div>

            {/* Reviews */}
            <PeliculaDetalle peliculaId={p.id} esReviewAutor={p.es_review_autor} sinopsisIa={p.sinopsis} />
          </div>
        </div>

        {/* Boxoffice bar */}
        {p.boxoffice != null && (
          <div className="relative z-10 px-6 pb-4 flex gap-6 text-xs text-zinc-500">
            <span>Taquilla: <span className="text-zinc-300">${(p.boxoffice / 1_000_000).toFixed(0)}M</span></span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────── Main component ─────────── */
export default function CatalogoInteractivo({ peliculas }: { peliculas: Pelicula[] }) {
  const { user } = useAuth()
  const [userPeliculas, setUserPeliculas] = useState<Record<string, UserPelicula>>({})
  const [busqueda, setBusqueda] = useState('')
  const [plataformasFiltro, setPlataformasFiltro] = useState<string[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [generosFiltro, setGenerosFiltro] = useState<string[]>([])
  const [directoresFiltro, setDirectoresFiltro] = useState<string[]>([])
  const [actoresFiltro, setActoresFiltro] = useState<string[]>([])
  const [compositoresFiltro, setCompositoresFiltro] = useState<string[]>([])
  const [oscarsFiltro, setOscarsFiltro] = useState<string[]>([])
  const [anioDesde, setAnioDesde] = useState<string>('')
  const [anioHasta, setAnioHasta] = useState<string>('')
  const [soloReviews, setSoloReviews] = useState(false)
  const [soloSello, setSoloSello] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('imdb')
  const [pagina, setPagina] = useState(0)
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false)
  const [showCuestionario, setShowCuestionario] = useState(false)
  const [prefKey, setPrefKey] = useState(0) // force re-render ParaTi after cuestionario
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) { setUserPeliculas({}); return }
    supabase.from('user_peliculas').select('pelicula_id, visto, rating, watchlist').eq('user_id', user.id)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, UserPelicula> = {}
        data.forEach(r => { map[r.pelicula_id] = { visto: r.visto, rating: r.rating, watchlist: r.watchlist } })
        setUserPeliculas(map)
      })
  }, [user])

  const upsertUserPelicula = async (peliculaId: string, campos: Partial<UserPelicula>) => {
    if (!user) return
    const actual = userPeliculas[peliculaId] ?? { visto: false, rating: null, watchlist: false }
    const nuevo = { ...actual, ...campos }
    setUserPeliculas(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, rating: nuevo.rating, watchlist: nuevo.watchlist },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  const toggleVisto = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: !userPeliculas[peliculaId]?.visto })
  }
  const toggleWatchlist = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    upsertUserPelicula(peliculaId, { watchlist: !userPeliculas[peliculaId]?.watchlist })
  }
  const setRatingFn = (peliculaId: string, rating: number, e: any) => {
    if (e?.stopPropagation) e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: true, rating })
  }

  const generosDisponibles = [...new Set(peliculas.flatMap(p => p.generos))].sort()
  const directoresDisponibles = [...new Set(peliculas.map(p => p.director).filter(Boolean) as string[])].sort()
  const actoresDisponibles = [...new Set(peliculas.flatMap(p => (p.actores || '').split(',').map(a => a.trim()).filter(Boolean)))].sort()
  const compositoresDisponibles = [...new Set(peliculas.map(p => p.compositor).filter(Boolean) as string[])].sort()

  const peliculasFiltradas = peliculas
    .filter(p => {
      const terminos = busqueda.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      const matchBusqueda = terminos.length === 0 || terminos.every(q =>
        p.titulo.toLowerCase().includes(q) || (p.titulo_ingles || '').toLowerCase().includes(q) ||
        (p.director || '').toLowerCase().includes(q) || (p.actores || '').toLowerCase().includes(q) ||
        p.generos.some(g => g.toLowerCase().includes(q)) || (p.compositor || '').toLowerCase().includes(q)
      )
      return matchBusqueda &&
        (plataformasFiltro.length === 0 || plataformasFiltro.some(plat => p.plataformas.includes(plat))) &&
        (categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria || '')) &&
        (generosFiltro.length === 0 || generosFiltro.every(g => p.generos.includes(g))) &&
        (directoresFiltro.length === 0 || directoresFiltro.includes(p.director || '')) &&
        (actoresFiltro.length === 0 || actoresFiltro.some(a => (p.actores || '').includes(a))) &&
        (compositoresFiltro.length === 0 || compositoresFiltro.includes(p.compositor || '')) &&
        (!soloReviews || p.es_review_autor) && (!soloSello || p.sello_bret) &&
        matchOscarFiltro(p, oscarsFiltro) &&
        (!anioDesde || (p.anio ?? 0) >= Number(anioDesde)) &&
        (!anioHasta || (p.anio ?? 9999) <= Number(anioHasta))
    })
    .sort((a, b) => {
      if (orden === 'imdb') return (b.nota_imdb || 0) - (a.nota_imdb || 0)
      if (orden === 'rt') return (b.rt_score || 0) - (a.rt_score || 0)
      if (orden === 'metacritic') return (b.metacritic_score || 0) - (a.metacritic_score || 0)
      if (orden === 'boxoffice') return (b.boxoffice || 0) - (a.boxoffice || 0)
      if (orden === 'anio_desc') return (b.anio || 0) - (a.anio || 0)
      if (orden === 'anio_asc') return (a.anio || 0) - (b.anio || 0)
      if (orden === 'titulo') return (a.titulo_ingles || a.titulo).localeCompare(b.titulo_ingles || b.titulo)
      return 0
    })

  const hayFiltros = busqueda || plataformasFiltro.length > 0 || categoriasFiltro.length > 0 ||
    generosFiltro.length > 0 || directoresFiltro.length > 0 || actoresFiltro.length > 0 ||
    compositoresFiltro.length > 0 || oscarsFiltro.length > 0 || soloReviews || soloSello || anioDesde || anioHasta

  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, oscarsFiltro, soloReviews, soloSello, orden])

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([]); setGenerosFiltro([])
    setDirectoresFiltro([]); setActoresFiltro([]); setCompositoresFiltro([])
    setOscarsFiltro([]); setSoloReviews(false); setSoloSello(false); setAnioDesde(''); setAnioHasta(''); setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const filtrosAvanzadosCount = [...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length

  return (
    <>
      {/* ── HERO ── */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fondo-interstellar.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950" />
        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white text-center mb-1.5 tracking-tight">
            Bienvenido a <span className="text-yellow-400">CineBret</span>
          </h1>
          <p className="text-zinc-300 text-sm md:text-base text-center mb-6 max-w-md">
            Buscador y recomendador inteligente de las mejores películas
          </p>
          <div className="relative w-full max-w-xl">
            <input type="text" placeholder="Buscar película, director, actor..." value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(0) }}
              className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder:text-zinc-400 focus:outline-none focus:border-white/50 text-sm" />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── PARA TI (carousel) ── */}
      {user && (
        <div className="max-w-7xl mx-auto px-3 md:px-6 pt-6 pb-2">
          <ParaTi key={prefKey} onEditPreferences={() => setShowCuestionario(true)} />
        </div>
      )}

      {/* ── STICKY FILTROS ── */}
      <div className="sticky top-24 z-20 bg-zinc-950 border-b border-zinc-800/60 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
        <div className="max-w-7xl mx-auto px-3 md:px-6 pt-3 pb-3 space-y-3">
          {/* Section title */}
          <h2 className="text-lg font-bold text-white">Catálogo</h2>

          {/* Mood categorías — 4 columnas iguales */}
          <div className="grid grid-cols-4 gap-2">
            {MOOD_CATS.map(cat => {
              const activa = categoriasFiltro.includes(cat.id)
              return (
                <button key={cat.id}
                  onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                  className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-gradient-to-br ${activa ? `${cat.grad} border-transparent text-white shadow-md` : `${cat.dim} text-zinc-300 hover:text-white`}`}>
                  <span className="text-base md:text-sm">{cat.emoji}</span>
                  <span className="hidden md:inline truncate">{cat.id}</span>
                  <span className="md:hidden text-[10px] text-center leading-tight">{cat.short}</span>
                </button>
              )
            })}
          </div>

          {/* Plataformas + más filtros */}
          <div className="flex flex-wrap items-center gap-2">
            {PLATAFORMAS.map(plat => {
              const activa = plataformasFiltro.includes(plat.id)
              return (
                <button key={plat.id}
                  onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                  className={`h-8 w-14 rounded-lg border flex items-center justify-center transition-colors ${activa ? 'bg-white border-white' : 'border-zinc-600 bg-zinc-800 hover:border-zinc-400'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
                </button>
              )
            })}
            <div className="w-px h-6 bg-zinc-700 mx-1 hidden md:block" />
            <button onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${mostrarFiltrosAvanzados ? 'bg-zinc-700 border-zinc-600 text-white' : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" /></svg>
              Más filtros
              {filtrosAvanzadosCount > 0 && <span className="bg-yellow-400 text-zinc-950 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">{filtrosAvanzadosCount}</span>}
            </button>
            {hayFiltros && <button onClick={limpiarFiltros} className="h-8 px-3 rounded-lg border border-zinc-600 text-xs text-zinc-500 hover:text-white transition-colors">✕ Limpiar</button>}
          </div>

          {/* Panel filtros avanzados */}
          {mostrarFiltrosAvanzados && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
                <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
                <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
                <MultiSelect label="🏆 Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
                <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
              </div>
              <div className="flex items-center flex-wrap gap-3 pt-1">
                <button onClick={() => setSoloReviews(!soloReviews)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>Solo reviews CineBret</button>
                <button onClick={() => setSoloSello(!soloSello)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloSello ? 'bg-emerald-500 text-white border-emerald-500 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>Solo recomendadas</button>
                <div className="flex items-center gap-2 md:ml-auto">
                  <span className="text-zinc-500 text-xs">Año</span>
                  <input type="number" placeholder="Desde" value={anioDesde} onChange={e => setAnioDesde(e.target.value)} min={1900} max={2099}
                    className={`bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none ${anioDesde ? 'border-yellow-400' : 'border-zinc-700'}`} />
                  <span className="text-zinc-600 text-xs">—</span>
                  <input type="number" placeholder="Hasta" value={anioHasta} onChange={e => setAnioHasta(e.target.value)} min={1900} max={2099}
                    className={`bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none ${anioHasta ? 'border-yellow-400' : 'border-zinc-700'}`} />
                </div>
              </div>
            </div>
          )}

          {/* Contador + sort */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm text-zinc-500">{peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setSoloReviews(!soloReviews)} className={`flex items-center gap-1 transition-opacity ${soloReviews ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                <span className={`font-serif italic font-bold px-1.5 py-0.5 rounded text-[10px] ${soloReviews ? 'bg-yellow-400 text-zinc-950 ring-1 ring-yellow-300' : 'bg-yellow-400 text-zinc-950'}`}>CB</span>
              </button>
              <button onClick={() => setSoloSello(!soloSello)} className={`flex items-center gap-1 transition-opacity ${soloSello ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                <span className={`font-serif italic font-bold border px-1.5 py-0.5 rounded text-[10px] ${soloSello ? 'border-emerald-400 text-emerald-400 ring-1 ring-emerald-400/40' : 'border-emerald-400 text-emerald-400'}`}>★</span>
              </button>
            </div>
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500">
              <option value="imdb">Mayor IMDB</option>
              <option value="rt">Mayor RT</option>
              <option value="metacritic">Mayor MC</option>
              <option value="boxoffice">Mayor taquilla</option>
              <option value="anio_desc">Más recientes</option>
              <option value="anio_asc">Más antiguas</option>
              <option value="titulo">Título A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── GRILLA con expansión full-width ── */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-6">
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 grid-flow-row-dense items-start">
          {peliculasPagina.map(pelicula => {
            const isExpanded = expandida === pelicula.id
            const up = userPeliculas[pelicula.id]
            const platsActivas = PLATAFORMAS.filter(pl => pelicula.plataformas.includes(pl.id))
            const oscarGano = pelicula.oscars?.toLowerCase().startsWith('ganó')
            const oscarNum = pelicula.oscars?.match(/\d+/)?.[0]

            return (
              <React.Fragment key={pelicula.id}>
                {/* Poster card */}
                <div
                  onClick={() => setExpandida(isExpanded ? null : pelicula.id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer group bg-zinc-800 shadow-lg hover:shadow-2xl transition-all ${isExpanded ? 'ring-2 ring-yellow-400' : ''}`}
                  style={{ aspectRatio: '2/3' }}
                >
                  {pelicula.poster_path ? (
                    <Image src={`https://image.tmdb.org/t/p/w342${pelicula.poster_path}`} alt={pelicula.titulo_ingles || pelicula.titulo} fill
                      className={`object-cover transition-transform duration-500 ${isExpanded ? '' : 'group-hover:scale-105'}`} sizes="(max-width: 768px) 50vw, 25vw" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800"><span className="text-zinc-600 text-5xl">🎬</span></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />

                  {/* Top-left badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                    {pelicula.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded leading-none shadow">CB</span>}
                    {pelicula.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 bg-black/70 px-1.5 py-0.5 rounded leading-none font-bold shadow">★</span>}
                  </div>

                  {/* User actions hover */}
                  {user && (
                    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                      <button onClick={e => toggleVisto(pelicula.id, e)}
                        className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 bg-black/60 text-white hover:border-emerald-400'}`}>✓</button>
                      <button onClick={e => toggleWatchlist(pelicula.id, e)}
                        className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-white/70 bg-black/60 text-white hover:border-yellow-400'}`}>★</button>
                    </div>
                  )}

                  {/* Bottom overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-3 z-10">
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {platsActivas.length > 0 && (
                          <div className="flex gap-1 mb-2 flex-wrap">
                            {platsActivas.map(pl => (
                              <div key={pl.id} className="rounded bg-white px-1 py-0.5 flex items-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-white font-bold text-sm md:text-base leading-tight line-clamp-2">{pelicula.titulo_ingles || pelicula.titulo}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {pelicula.anio && <span className="text-zinc-300 text-xs md:text-sm">{pelicula.anio}</span>}
                          {pelicula.nota_imdb != null && <span className="text-yellow-400 font-bold text-xs md:text-sm">⭐ {pelicula.nota_imdb}</span>}
                        </div>
                        {pelicula.categoria && <p className="text-zinc-400 text-[11px] md:text-xs mt-1 leading-tight">{pelicula.categoria}</p>}
                      </div>
                      {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                        <div className="shrink-0 self-end flex flex-col items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/oscar.png" alt="Oscar" className={`h-9 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`} />
                          {oscarNum && <span className={`text-xs font-bold leading-none -mt-1 ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Full-width expansion panel */}
                {isExpanded && (
                  <PanelExpandido
                    p={pelicula} up={up} user={user}
                    generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
                    setExpandida={setExpandida} toggleVisto={toggleVisto}
                    toggleWatchlist={toggleWatchlist} setRating={setRatingFn}
                  />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={() => { setPagina(p => Math.max(0, p - 1)); gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              disabled={pagina === 0} className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors">← Anterior</button>
            <span className="text-sm text-zinc-500">Página <span className="text-white font-medium">{pagina + 1}</span> de {totalPaginas}</span>
            <button onClick={() => { setPagina(p => Math.min(totalPaginas - 1, p + 1)); gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              disabled={pagina === totalPaginas - 1} className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors">Siguiente →</button>
          </div>
        )}
      </div>

      {/* ── Cuestionario modal ── */}
      {showCuestionario && (
        <CuestionarioOnboarding
          onComplete={() => { setShowCuestionario(false); setPrefKey(k => k + 1) }}
          onDismiss={() => setShowCuestionario(false)}
        />
      )}
    </>
  )
}
