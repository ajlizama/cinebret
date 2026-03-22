'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from './PeliculaDetalle'
import AgregarAListaButton from '@/app/pelicula/[id]/AgregarAListaButton'

type UserPelicula = { visto: boolean; rating: number | null; watchlist: boolean }

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO', color: 'bg-purple-700', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', color: 'bg-cyan-600', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-zinc-600', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500', logo: '/paramount_plus.svg' },
]

const CATEGORIAS = [
  "Pa'l domingo de bajón",
  "Pa' saltar del sillón",
  "Pa' quedar con el cerebro como licuadora",
  "Pa' llorar a moco tendido",
]

export type Pelicula = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  rt_score: number | null
  metacritic_score: number | null
  runtime: number | null
  boxoffice: number | null
  categoria: string | null
  plataformas: string[]
  es_review_autor: boolean
  sello_bret: boolean
  director: string | null
  director_oscars: number | null
  actores: string | null
  actores_oscars: Record<string, number> | null
  compositor: string | null
  compositor_oscars: number | null
  generos: string[]
  poster_path: string | null
  oscars: string | null
  imdb_id: string | null
  youtube_trailer_key: string | null
  sinopsis: string | null
}

type ColumnasExtra = { rt_score: boolean; metacritic_score: boolean; director: boolean; actores: boolean; compositor: boolean }
type Orden = 'imdb' | 'rt' | 'metacritic' | 'boxoffice' | 'anio_desc' | 'anio_asc' | 'titulo'

const OSCAR_OPCIONES = [
  'Ganadora Mejor Película',
  'Ganadora Mejor Película Animada',
  'Ganadora Mejor Película Internacional',
  'Ganadora de Oscar',
  'Nominada al Oscar',
  'Ganó Mejor Director',
  'Ganó Mejor Actor',
  'Ganó Mejor Actriz',
  'Ganó Mejor Guión',
  'Ganó Mejor Banda Sonora',
  'Ganó Mejor Fotografía',
  'Director con Oscar',
  'Actor con Oscar',
  'Compositor con Oscar',
]

function matchOscarFiltro(p: Pelicula, filtros: string[]): boolean {
  if (filtros.length === 0) return true
  return filtros.every(f => {
    const osc = (p.oscars ?? '').toLowerCase()
    const gano = osc.startsWith('ganó')
    if (f === 'Ganadora Mejor Película')
      return gano && osc.includes('mejor película') && !osc.includes('animad') && !osc.includes('internacional') && !osc.includes('extranjera') && !osc.includes('habla no inglesa')
    if (f === 'Ganadora Mejor Película Animada')
      return gano && osc.includes('animad')
    if (f === 'Ganadora Mejor Película Internacional')
      return gano && (osc.includes('internacional') || osc.includes('extranjera') || osc.includes('habla no inglesa'))
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

type MultiSelectProps = {
  label: string
  opciones: string[]
  seleccionados: string[]
  onChange: (s: string[]) => void
}

function MultiSelect({ label, opciones, seleccionados, onChange }: MultiSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const toggle = (op: string) =>
    onChange(seleccionados.includes(op) ? seleccionados.filter(s => s !== op) : [...seleccionados, op])

  const opcionesFiltradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))
  const handleClose = () => { setAbierto(false); setBusqueda('') }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className={`border rounded-lg px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
          seleccionados.length > 0
            ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium'
            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
        }`}
      >
        {label}
        {seleccionados.length > 0 && (
          <span className="bg-zinc-950 text-yellow-400 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {seleccionados.length}
          </span>
        )}
        <span className="text-xs">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={handleClose} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl min-w-52 flex flex-col max-h-72">
            <div className="p-2 border-b border-zinc-800 shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="Buscar..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
            {seleccionados.length > 0 && (
              <div className="border-b border-zinc-800 px-3 py-2 shrink-0">
                <button onClick={() => onChange([])} className="text-xs text-zinc-500 hover:text-white transition-colors">
                  Limpiar selección
                </button>
              </div>
            )}
            <div className="overflow-y-auto">
              {opcionesFiltradas.length === 0 ? (
                <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p>
              ) : (
                opcionesFiltradas.map(op => (
                  <div
                    key={op}
                    onClick={() => toggle(op)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      seleccionados.includes(op) ? 'bg-yellow-400 border-yellow-400' : 'border-zinc-600'
                    }`}>
                      {seleccionados.includes(op) && <span className="text-zinc-950 text-xs font-bold">✓</span>}
                    </div>
                    <span className="truncate text-zinc-300">{op}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

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
  const tablaRef = useRef<HTMLDivElement>(null)
  const [columnas, setColumnas] = useState<ColumnasExtra>({ rt_score: false, metacritic_score: false, director: false, actores: false, compositor: false })

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
    const actual = userPeliculas[peliculaId]
    upsertUserPelicula(peliculaId, { visto: !actual?.visto })
  }

  const toggleWatchlist = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const actual = userPeliculas[peliculaId]
    upsertUserPelicula(peliculaId, { watchlist: !actual?.watchlist })
  }

  const setRating = (peliculaId: string, rating: number, e: React.MouseEvent) => {
    e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: true, rating })
  }

  const marcarTodos = async (campo: 'visto' | 'watchlist') => {
    if (!user) return
    const ids = peliculasFiltradas.map(p => p.id)
    const updates = ids.map(id => ({
      user_id: user.id,
      pelicula_id: id,
      visto: campo === 'visto' ? true : (userPeliculas[id]?.visto ?? false),
      rating: userPeliculas[id]?.rating ?? null,
      watchlist: campo === 'watchlist' ? true : (userPeliculas[id]?.watchlist ?? false),
    }))
    setUserPeliculas(prev => {
      const nuevo = { ...prev }
      ids.forEach(id => {
        nuevo[id] = { ...prev[id] ?? { visto: false, rating: null, watchlist: false }, [campo]: true }
      })
      return nuevo
    })
    await supabase.from('user_peliculas').upsert(updates, { onConflict: 'user_id,pelicula_id' })
  }

  const generosDisponibles = [...new Set(peliculas.flatMap(p => p.generos))].sort()
  const directoresDisponibles = [...new Set(peliculas.map(p => p.director).filter(Boolean) as string[])].sort()
  const actoresDisponibles = [...new Set(
    peliculas.flatMap(p => (p.actores || '').split(',').map(a => a.trim()).filter(Boolean))
  )].sort()
  const compositoresDisponibles = [...new Set(peliculas.map(p => p.compositor).filter(Boolean) as string[])].sort()

  const toggleColumna = (col: keyof ColumnasExtra) => setColumnas(prev => ({ ...prev, [col]: !prev[col] }))
  const colsExtras = Object.values(columnas).filter(Boolean).length

  const peliculasFiltradas = peliculas
    .filter(p => {
      const terminos = busqueda.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      const matchBusqueda = terminos.length === 0 || terminos.every(q =>
        p.titulo.toLowerCase().includes(q) ||
        (p.titulo_ingles || '').toLowerCase().includes(q) ||
        (p.director || '').toLowerCase().includes(q) ||
        (p.actores || '').toLowerCase().includes(q) ||
        p.generos.some(g => g.toLowerCase().includes(q)) ||
        (p.compositor || '').toLowerCase().includes(q)
      )
      const matchPlataforma = plataformasFiltro.length === 0 || plataformasFiltro.some(plat => p.plataformas.includes(plat))
      const matchCategoria = categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria || '')
      const matchGenero = generosFiltro.length === 0 || generosFiltro.every(g => p.generos.includes(g))
      const matchDirector = directoresFiltro.length === 0 || directoresFiltro.includes(p.director || '')
      const matchActor = actoresFiltro.length === 0 || actoresFiltro.some(a => (p.actores || '').includes(a))
      const matchCompositor = compositoresFiltro.length === 0 || compositoresFiltro.includes(p.compositor || '')
      const matchReview = !soloReviews || p.es_review_autor
      const matchSello = !soloSello || p.sello_bret
      const matchOscars = matchOscarFiltro(p, oscarsFiltro)
      const matchAnioDesde = !anioDesde || (p.anio ?? 0) >= Number(anioDesde)
      const matchAnioHasta = !anioHasta || (p.anio ?? 9999) <= Number(anioHasta)
      return matchBusqueda && matchPlataforma && matchCategoria && matchGenero && matchDirector && matchActor && matchCompositor && matchReview && matchSello && matchOscars && matchAnioDesde && matchAnioHasta
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
    generosFiltro.length > 0 || directoresFiltro.length > 0 ||
    actoresFiltro.length > 0 || compositoresFiltro.length > 0 || oscarsFiltro.length > 0 || soloReviews || soloSello || anioDesde || anioHasta

  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, oscarsFiltro, soloReviews, soloSello, orden])

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([]); setGenerosFiltro([])
    setDirectoresFiltro([]); setActoresFiltro([]); setCompositoresFiltro([])
    setOscarsFiltro([]); setSoloReviews(false); setSoloSello(false)
    setAnioDesde(''); setAnioHasta(''); setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  return (
    <>
      {/* ── Filtros MÓVIL ── */}
      <div className="md:hidden mb-4 space-y-2">
        {/* Subtítulo mood */}
        <p className="text-base font-semibold text-zinc-200">¿En qué mood estás?</p>

        {/* Grid 2x2 de categorías — igual tamaño */}
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { id: "Pa'l domingo de bajón",                          emoji: '🛋️', grad: 'from-amber-500 to-orange-600',    dim: 'from-amber-950/60 to-orange-950/60 border-amber-800'   },
            { id: "Pa' saltar del sillón",                          emoji: '⚡', grad: 'from-violet-500 to-blue-600',     dim: 'from-violet-950/60 to-blue-950/60 border-violet-800'   },
            { id: "Pa' quedar con el cerebro como licuadora",       emoji: '🤯', grad: 'from-rose-500 to-pink-600',       dim: 'from-rose-950/60 to-pink-950/60 border-rose-800'       },
            { id: "Pa' llorar a moco tendido",                      emoji: '😭', grad: 'from-cyan-500 to-teal-600',       dim: 'from-cyan-950/60 to-teal-950/60 border-cyan-800'       },
          ]).map(cat => {
            const activa = categoriasFiltro.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                className={`h-24 px-2 rounded-xl border text-[11px] font-semibold leading-tight transition-all text-center flex flex-col items-center justify-center gap-1 bg-gradient-to-br ${
                  activa ? `${cat.grad} border-transparent text-white shadow-lg` : `${cat.dim} text-zinc-300`
                }`}
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                {cat.id}
              </button>
            )
          })}
        </div>

        {/* Subtítulo plataformas */}
        <p className="text-base font-semibold text-zinc-200">¿Qué plataformas tienes?</p>

        {/* Plataformas siempre visibles */}
        <div className="grid grid-cols-3 gap-2">
          {PLATAFORMAS.map(plat => {
            const activa = plataformasFiltro.includes(plat.id)
            return (
              <button
                key={plat.id}
                onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                className={`h-[30px] rounded-lg border flex items-center justify-center transition-colors ${activa ? 'bg-white border-white' : 'border-zinc-700 bg-zinc-800'}`}
              >
                <img src={plat.logo} alt={plat.nombre} className="h-3 w-auto object-contain" />
              </button>
            )
          })}
        </div>

        {/* Más filtros + Limpiar */}
        <div className="flex gap-2">
          <button
            onClick={() => setExpandida(expandida === '__filtros__' ? null : '__filtros__')}
            className={`flex-1 h-9 px-3 rounded-lg border text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              expandida === '__filtros__'
                ? 'bg-zinc-700 border-zinc-600 text-white'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
            </svg>
            Más filtros
            {[...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length > 0 && (
              <span className="bg-yellow-400 text-zinc-950 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">
                {[...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length}
              </span>
            )}
          </button>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="h-9 px-3 rounded-lg border border-zinc-700 text-xs text-zinc-500 hover:text-white transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar película, director, actor..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
        />

        {/* Panel filtros avanzados */}
        {expandida === '__filtros__' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
              <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
              <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
              <MultiSelect label="🏆 Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
              <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-zinc-500 text-xs">Año</span>
              <input type="number" placeholder="Desde" value={anioDesde} onChange={e => setAnioDesde(e.target.value)} min={1900} max={2099}
                className={`flex-1 bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none ${anioDesde ? 'border-yellow-400' : 'border-zinc-700'}`} />
              <span className="text-zinc-600 text-xs">—</span>
              <input type="number" placeholder="Hasta" value={anioHasta} onChange={e => setAnioHasta(e.target.value)} min={1900} max={2099}
                className={`flex-1 bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none ${anioHasta ? 'border-yellow-400' : 'border-zinc-700'}`} />
            </div>
          </div>
        )}
      </div>

      {/* ── Filtros DESKTOP ── */}
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Categorías */}
          {([
            { id: "Pa'l domingo de bajón",                    emoji: '🛋️', short: 'Bajón',        grad: 'from-amber-500 to-orange-600',  dim: 'from-amber-950/60 to-orange-950/60 border-amber-800'  },
            { id: "Pa' saltar del sillón",                    emoji: '⚡',  short: 'Del sillón',   grad: 'from-violet-500 to-blue-600',   dim: 'from-violet-950/60 to-blue-950/60 border-violet-800'  },
            { id: "Pa' quedar con el cerebro como licuadora", emoji: '🤯', short: 'Licuadora',    grad: 'from-rose-500 to-pink-600',     dim: 'from-rose-950/60 to-pink-950/60 border-rose-800'      },
            { id: "Pa' llorar a moco tendido",                emoji: '😭', short: 'A moco tendido', grad: 'from-cyan-500 to-teal-600',  dim: 'from-cyan-950/60 to-teal-950/60 border-cyan-800'      },
          ]).map(cat => {
            const activa = categoriasFiltro.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all bg-gradient-to-br whitespace-nowrap ${
                  activa ? `${cat.grad} border-transparent text-white shadow-md` : `${cat.dim} text-zinc-300 hover:text-white`
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.id}</span>
              </button>
            )
          })}

          <div className="w-px h-6 bg-zinc-700 shrink-0" />

          {/* Plataformas */}
          {PLATAFORMAS.map(plat => {
            const activa = plataformasFiltro.includes(plat.id)
            return (
              <button
                key={plat.id}
                onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                className={`h-[30px] w-12 rounded-lg border flex items-center justify-center transition-colors ${activa ? 'bg-white border-white' : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'}`}
              >
                <img src={plat.logo} alt={plat.nombre} className="h-3 w-auto object-contain" />
              </button>
            )
          })}

          <div className="w-px h-6 bg-zinc-700 shrink-0" />

          {/* Buscador */}
          <input
            type="text"
            placeholder="Buscar película, director, actor..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm w-64 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />

          {/* Más filtros */}
          <button
            onClick={() => setExpandida(expandida === '__filtros__' ? null : '__filtros__')}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              expandida === '__filtros__' ? 'bg-zinc-700 border-zinc-600 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
            </svg>
            Más filtros
            {[...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length > 0 && (
              <span className="bg-yellow-400 text-zinc-950 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">
                {[...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length}
              </span>
            )}
          </button>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="h-9 px-3 rounded-lg border border-zinc-700 text-xs text-zinc-500 hover:text-white transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* Panel filtros avanzados */}
        {expandida === '__filtros__' && (
          <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
              <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
              <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
              <MultiSelect label="🏆 Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
              <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={() => setSoloReviews(!soloReviews)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                Solo reviews CineBret
              </button>
              <button onClick={() => setSoloSello(!soloSello)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloSello ? 'bg-emerald-500 text-white border-emerald-500 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                Solo recomendadas
              </button>
              <div className="flex items-center gap-2 ml-auto">
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
      </div>

      {/* Ordenamiento y columnas — solo desktop */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 mr-1">Columnas extra:</span>
          {([
            { key: 'rt_score', label: '🍅 RT' },
            { key: 'metacritic_score', label: 'MC Metacritic' },
            { key: 'director', label: 'Director' },
            { key: 'actores', label: 'Actores' },
            { key: 'compositor', label: 'Compositor' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleColumna(key)}
              className={`border rounded-full px-3 py-1 text-xs transition-colors ${columnas[key] ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Ordenar por:</span>
          <select
            value={orden}
            onChange={e => setOrden(e.target.value as Orden)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
          >
            <option value="imdb">Mayor IMDB</option>
            <option value="rt">Mayor Rotten Tomatoes</option>
            <option value="metacritic">Mayor Metacritic</option>
            <option value="boxoffice">Mayor taquilla</option>
            <option value="anio_desc">Más recientes</option>
            <option value="anio_asc">Más antiguas</option>
            <option value="titulo">Título A-Z</option>
          </select>
        </div>
      </div>

      {/* Ordenar por — solo móvil */}
      <div className="md:hidden flex items-center gap-2 mb-4">
        <span className="text-xs text-zinc-500">Ordenar por:</span>
        <select
          value={orden}
          onChange={e => setOrden(e.target.value as Orden)}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="imdb">Mayor IMDB</option>
          <option value="rt">Mayor Rotten Tomatoes</option>
          <option value="metacritic">Mayor Metacritic</option>
          <option value="boxoffice">Mayor taquilla</option>
          <option value="anio_desc">Más recientes</option>
          <option value="anio_asc">Más antiguas</option>
          <option value="titulo">Título A-Z</option>
        </select>
      </div>

      {/* Nomenclatura + contador */}
      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm text-zinc-500">
          {peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <button
            onClick={() => setSoloReviews(!soloReviews)}
            className={`flex items-center gap-1.5 transition-opacity ${soloReviews ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
          >
            <span className={`font-serif italic font-bold px-1.5 py-0.5 rounded ${soloReviews ? 'bg-yellow-400 text-zinc-950 ring-2 ring-yellow-300' : 'bg-yellow-400 text-zinc-950'}`}>CB</span>
            Contiene crítica CineBret
          </button>
          <button
            onClick={() => setSoloSello(!soloSello)}
            className={`flex items-center gap-1.5 transition-opacity ${soloSello ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
          >
            <span className={`font-serif italic font-bold border px-1.5 py-0.5 rounded ${soloSello ? 'border-emerald-400 text-emerald-400 ring-2 ring-emerald-400/40' : 'border-emerald-400 text-emerald-400'}`}>★ Recomendada</span>
            Recomendada por CineBret
          </button>
        </div>
      </div>

      {/* Tabla (md y superior) */}
      <div
        ref={tablaRef}
        className="hidden md:block border border-zinc-950 rounded-xl overflow-hidden"
        style={{ height: 'calc(100vh - 190px)', minHeight: '650px', overflowY: 'auto' }}
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-zinc-900 text-xs text-zinc-500 font-medium uppercase tracking-wide">
              {user && (
                <th className="text-center px-3 py-3 w-36">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-zinc-500">Vista / Watchlist</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => marcarTodos('visto')}
                        className="text-zinc-600 hover:text-emerald-400 text-xs transition-colors"
                        title="Marcar todas como vistas"
                      >
                        ✓ todo
                      </button>
                      <span className="text-zinc-700">·</span>
                      <button
                        onClick={() => marcarTodos('watchlist')}
                        className="text-zinc-600 hover:text-yellow-400 text-xs transition-colors"
                        title="Agregar todas a watchlist"
                      >
                        ★ todo
                      </button>
                    </div>
                  </div>
                </th>
              )}
              <th className="text-left px-4 py-3 w-64">Película</th>
              <th className="text-center px-3 py-3 w-16">Año</th>
              <th className="text-center px-3 py-3 w-20">IMDB</th>
              {columnas.rt_score && <th className="text-center px-3 py-3 w-16">RT</th>}
              {columnas.metacritic_score && <th className="text-center px-3 py-3 w-16">MC</th>}
              <th className="text-center px-3 py-3 w-48">Géneros</th>
              {columnas.director && <th className="text-left px-3 py-3 w-36">Director</th>}
              {columnas.actores && <th className="text-left px-3 py-3 w-48">Actores</th>}
              {columnas.compositor && <th className="text-left px-3 py-3 w-36">Compositor</th>}
              <th className="text-center px-3 py-3 w-36">Plataformas</th>
              <th className="text-center px-3 py-3 w-20">Oscars</th>
              <th className="text-center px-3 py-3 w-40">Categoría</th>
            </tr>
          </thead>
          <tbody>
            {peliculasPagina.map((pelicula, i) => (
              <React.Fragment key={pelicula.id}>
                <tr
                  onClick={() => setExpandida(expandida === pelicula.id ? null : pelicula.id)}
                  className={`cursor-pointer border-t border-zinc-950 transition-colors ${
                    expandida === pelicula.id ? 'bg-zinc-900' : 'bg-zinc-950 hover:bg-zinc-900/50'
                  }`}
                >
                  {user && (
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={e => toggleVisto(pelicula.id, e)}
                            title="Vista"
                            className={`w-4 h-4 rounded-full border text-[10px] font-bold transition-colors flex items-center justify-center ${
                              userPeliculas[pelicula.id]?.visto
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-zinc-600 text-zinc-600 hover:border-zinc-400'
                            }`}
                          >
                            {userPeliculas[pelicula.id]?.visto ? '✓' : ''}
                          </button>
                          <button
                            onClick={e => toggleWatchlist(pelicula.id, e)}
                            title="Watchlist"
                            className={`w-4 h-4 rounded text-[10px] transition-colors flex items-center justify-center ${
                              userPeliculas[pelicula.id]?.watchlist
                                ? 'bg-yellow-400 text-zinc-950'
                                : 'border border-zinc-600 text-zinc-600 hover:border-zinc-400'
                            }`}
                          >
                            {userPeliculas[pelicula.id]?.watchlist ? '★' : '☆'}
                          </button>
                        </div>
                        {userPeliculas[pelicula.id]?.visto && (
                          <select
                            value={userPeliculas[pelicula.id]?.rating ?? ''}
                            onChange={e => { if (e.target.value) setRating(pelicula.id, Number(e.target.value), e as any) }}
                            onClick={e => e.stopPropagation()}
                            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-1 py-0.5 focus:outline-none w-14"
                          >
                            <option value="">nota</option>
                            {[1,2,3,4,5,6,7,8,9,10].map(n => (
                              <option key={n} value={n}>{n}/10</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="p-0" style={{ height: '1px' }}>
                    <div className="flex items-stretch h-full">
                      <div className="flex items-center px-3 py-3">
                        <span className="text-zinc-600 text-xs">{expandida === pelicula.id ? '▲' : '▼'}</span>
                      </div>
                      <div className="relative w-9 shrink-0 self-stretch">
                        {pelicula.poster_path ? (
                          <Image src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`} alt={pelicula.titulo} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-zinc-800" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 px-3 py-3">
                        <div>
                          <span className="font-semibold text-white truncate max-w-48 block">
                            {pelicula.titulo_ingles || pelicula.titulo}
                          </span>
                          {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                            <span className="text-xs text-zinc-500 truncate max-w-48 block">{pelicula.titulo}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-400">{pelicula.anio || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    {pelicula.nota_imdb != null
                      ? <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span>
                      : <span className="text-zinc-700">—</span>}
                  </td>
                  {columnas.rt_score && (
                    <td className="px-3 py-3 text-center">
                      {pelicula.rt_score != null
                        ? <span className="text-sm text-red-400">🍅 {pelicula.rt_score}%</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                  )}
                  {columnas.metacritic_score && (
                    <td className="px-3 py-3 text-center">
                      {pelicula.metacritic_score != null
                        ? <span className="text-sm text-green-400">{pelicula.metacritic_score}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 justify-center">
                      {pelicula.generos.length > 0
                        ? pelicula.generos.map(g => (
                            <span
                              key={g}
                              onClick={e => { e.stopPropagation(); if (!generosFiltro.includes(g)) setGenerosFiltro([...generosFiltro, g]) }}
                              className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full cursor-pointer hover:bg-zinc-700 hover:text-zinc-200"
                            >
                              {g}
                            </span>
                          ))
                        : <span className="text-zinc-700">—</span>}
                    </div>
                  </td>
                  {columnas.director && <td className="px-3 py-3 text-zinc-400 text-xs">{pelicula.director || <span className="text-zinc-700">—</span>}</td>}
                  {columnas.actores && <td className="px-3 py-3 text-zinc-400 text-xs">{pelicula.actores || <span className="text-zinc-700">—</span>}</td>}
                  {columnas.compositor && <td className="px-3 py-3 text-zinc-400 text-xs">{pelicula.compositor || <span className="text-zinc-700">—</span>}</td>}
                  <td className="px-3 py-3">
                    <div className="grid grid-cols-3 gap-1">
                      {PLATAFORMAS.map(plat => {
                        const activa = pelicula.plataformas.includes(plat.id)
                        return (
                          <div key={plat.id} className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${activa ? 'opacity-100' : 'opacity-20'}`}>
                            <img src={plat.logo} alt={plat.nombre} className="h-5 w-auto object-contain" />
                          </div>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {pelicula.oscars && pelicula.oscars !== 'N/A'
                      ? (() => {
                          const gano = pelicula.oscars!.toLowerCase().startsWith('ganó')
                          return (
                            <span className="flex items-center justify-center gap-0.5">
                              <img src="/oscar.png" alt="Oscar" className={`h-8 w-auto ${gano ? 'opacity-100' : 'opacity-25'}`} />
                              <span className={`text-base font-bold ${gano ? 'text-yellow-400' : 'text-zinc-600'}`}>
                                {pelicula.oscars!.match(/\d+/)?.[0]}
                              </span>
                            </span>
                          )
                        })()
                      : <span className="text-zinc-700 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {pelicula.categoria
                      ? <span className="text-xs text-zinc-400">{pelicula.categoria}</span>
                      : <span className="text-zinc-700 text-xs">—</span>}
                  </td>
                </tr>

                {/* Fila expandida */}
                {expandida === pelicula.id && (
                  <tr>
                    <td colSpan={7 + colsExtras + (user ? 1 : 0)} className="px-8 py-4 bg-zinc-900 border-t border-zinc-800" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-8">
                        {/* Izquierda: ratings + links */}
                        <div className="space-y-3">
                          {(pelicula.nota_imdb != null || pelicula.rt_score != null || pelicula.metacritic_score != null) && (
                            <div className="flex gap-4 flex-wrap">
                              {pelicula.nota_imdb != null && (
                                <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">IMDB</p>
                                  <p className="text-sm font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</p>
                                </div>
                              )}
                              {pelicula.rt_score != null && (
                                <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Rotten Tomatoes</p>
                                  <p className="text-sm font-bold text-red-400">🍅 {pelicula.rt_score}%</p>
                                </div>
                              )}
                              {pelicula.metacritic_score != null && (
                                <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Metacritic</p>
                                  <p className="text-sm font-bold text-green-400">{pelicula.metacritic_score}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {(pelicula.runtime != null || pelicula.boxoffice != null) && (
                            <div className="flex gap-4">
                              {pelicula.runtime != null && (
                                <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Duración</p>
                                  <p className="text-sm text-zinc-200">{Math.floor(pelicula.runtime / 60)}h {pelicula.runtime % 60}min</p>
                                </div>
                              )}
                              {pelicula.boxoffice != null && (
                                <div>
                                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Taquilla</p>
                                  <p className="text-sm text-zinc-200">${(pelicula.boxoffice / 1_000_000).toFixed(0)}M</p>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 items-center">
                            {pelicula.imdb_id && (
                              <a href={`https://www.imdb.com/title/${pelicula.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">IMDb ↗</a>
                            )}
                            {pelicula.youtube_trailer_key && (
                              <a href={`https://www.youtube.com/watch?v=${pelicula.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-500 hover:text-red-300 transition-colors">▶ Trailer ↗</a>
                            )}
                            <a href={`https://open.spotify.com/search/${encodeURIComponent((pelicula.titulo_ingles || pelicula.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-300 transition-colors">♫ Soundtrack ↗</a>
                            <AgregarAListaButton peliculaId={pelicula.id} />
                          </div>
                          {/* Review CineBret + reviews usuarios */}
                          <PeliculaDetalle
                            peliculaId={pelicula.id}
                            esReviewAutor={pelicula.es_review_autor}
                            sinopsisIa={pelicula.sinopsis}
                          />
                        </div>
                        {/* Derecha: equipo + oscars */}
                        <div className="space-y-3">
                          {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Oscars</p>
                              <p className="text-sm text-yellow-500">{pelicula.oscars}</p>
                            </div>
                          )}
                          {pelicula.director && (
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Director</p>
                              <p className="text-sm text-zinc-200">{pelicula.director}</p>
                            </div>
                          )}
                          {pelicula.compositor && (
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
                              <p className="text-sm text-zinc-200">{pelicula.compositor}</p>
                            </div>
                          )}
                          {pelicula.actores && (
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p>
                              <p className="text-sm text-zinc-200">{pelicula.actores}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda botones — solo móvil */}
      {user && (
        <div className="flex md:hidden items-center gap-4 mb-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-7 h-7 rounded-full bg-emerald-500 border-emerald-500 text-white font-bold flex items-center justify-center text-sm">✓</span>
            Vista
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-7 h-7 rounded-full bg-yellow-400 text-zinc-950 font-bold flex items-center justify-center text-sm">★</span>
            Watchlist
          </span>
        </div>
      )}

      {/* Lista de tarjetas móvil (por debajo de md) */}
      <div className="block md:hidden space-y-2">
        {peliculasPagina.map(pelicula => {
          const isExpanded = expandida === pelicula.id
          const plataformasActivas = PLATAFORMAS.filter(plat => pelicula.plataformas.includes(plat.id))
          return (
            <div
              key={pelicula.id}
              onClick={() => setExpandida(isExpanded ? null : pelicula.id)}
              className="bg-zinc-950 border border-zinc-950 rounded-xl p-3 cursor-pointer"
            >
              {/* Fila principal */}
              <div className="flex gap-3">
                {/* Poster — solo cuando NO está expandida, se estira al alto del contenido */}
                {!isExpanded && (
                  <div className="relative w-12 self-stretch shrink-0 rounded overflow-hidden bg-zinc-800 min-h-[72px]">
                    {pelicula.poster_path && (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`}
                        alt={pelicula.titulo}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-white text-sm leading-snug">
                      {pelicula.titulo_ingles || pelicula.titulo}
                    </span>
                  </div>
                  {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                    <span className="text-xs text-zinc-500 block mb-1">{pelicula.titulo}</span>
                  )}
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {pelicula.anio && (
                      <span className="text-zinc-400">{pelicula.anio}</span>
                    )}
                    {pelicula.nota_imdb != null && (
                      <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span>
                    )}
                  </div>
                  {pelicula.categoria && (
                    <span className="text-xs text-zinc-500 mt-0.5 block">{pelicula.categoria}</span>
                  )}
                </div>

                {/* Derecha: acciones + poster expandido */}
                {isExpanded ? (
                  <div className="relative w-20 shrink-0 rounded overflow-hidden bg-zinc-800" style={{ height: 120 }}>
                    {pelicula.poster_path && (
                      <Image src={`https://image.tmdb.org/t/p/w154${pelicula.poster_path}`} alt={pelicula.titulo} fill className="object-cover" />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 shrink-0 self-start" onClick={e => e.stopPropagation()}>
                    {user ? (
                      <>
                        <button
                          onClick={e => toggleVisto(pelicula.id, e)}
                          title="Marcar como vista"
                          className={`w-6 h-6 rounded-full border text-xs font-bold transition-colors flex items-center justify-center ${
                            userPeliculas[pelicula.id]?.visto
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-zinc-600 text-zinc-600 hover:border-zinc-400 hover:text-zinc-400'
                          }`}
                        >
                          ✓
                        </button>
                        <button
                          onClick={e => toggleWatchlist(pelicula.id, e)}
                          title="Agregar a watchlist"
                          className={`w-6 h-6 rounded-full border text-xs font-bold transition-colors flex items-center justify-center ${
                            userPeliculas[pelicula.id]?.watchlist
                              ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                              : 'border-zinc-600 text-zinc-600 hover:border-zinc-400 hover:text-zinc-400'
                          }`}
                        >
                          ★
                        </button>
                        {userPeliculas[pelicula.id]?.visto && (
                          <select
                            value={userPeliculas[pelicula.id]?.rating ?? ''}
                            onChange={e => { if (e.target.value) setRating(pelicula.id, Number(e.target.value), e as any) }}
                            onClick={e => e.stopPropagation()}
                            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-yellow-400 font-bold px-1 py-0.5 focus:outline-none w-12 text-center"
                          >
                            <option value="">—</option>
                            {[1,2,3,4,5,6,7,8,9,10].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        )}
                      </>
                    ) : null}
                    <span className="text-zinc-600 text-xs mt-auto">▼</span>
                  </div>
                )}
              </div>

              {/* Logos de plataformas */}
              <div className="flex items-center gap-1.5 mt-2">
                {PLATAFORMAS.map(plat => {
                  const activa = pelicula.plataformas.includes(plat.id)
                  return (
                    <div key={plat.id} className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${activa ? 'opacity-100' : 'opacity-20'}`} style={{ height: '20px' }}>
                      <img src={plat.logo} alt={plat.nombre} className="h-4 w-auto object-contain" />
                    </div>
                  )
                })}
              </div>

              {/* Contenido expandido */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    {user ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={e => toggleVisto(pelicula.id, e)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                            userPeliculas[pelicula.id]?.visto
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-zinc-600 text-zinc-500 hover:border-zinc-400'
                          }`}
                        >
                          {userPeliculas[pelicula.id]?.visto ? '✓ Vista' : '○ Vista'}
                        </button>
                        <button
                          onClick={e => toggleWatchlist(pelicula.id, e)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                            userPeliculas[pelicula.id]?.watchlist
                              ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                              : 'border-zinc-600 text-zinc-500 hover:border-zinc-400'
                          }`}
                        >
                          {userPeliculas[pelicula.id]?.watchlist ? '★ Watchlist' : '☆ Watchlist'}
                        </button>
                        {userPeliculas[pelicula.id]?.visto && (
                          <select
                            value={userPeliculas[pelicula.id]?.rating ?? ''}
                            onChange={e => { if (e.target.value) setRating(pelicula.id, Number(e.target.value), e as any) }}
                            onClick={e => e.stopPropagation()}
                            className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 focus:outline-none"
                          >
                            <option value="">Tu rating —</option>
                            {[1,2,3,4,5,6,7,8,9,10].map(n => (
                              <option key={n} value={n}>{n}/10</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : <div />}
                    <span className="text-zinc-600 text-xs">▲ colapsar</span>
                  </div>
                  {(pelicula.rt_score != null || pelicula.metacritic_score != null) && (
                    <div className="flex gap-4 flex-wrap">
                      {pelicula.rt_score != null && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Rotten Tomatoes</p>
                          <p className="text-sm font-bold text-red-400">🍅 {pelicula.rt_score}%</p>
                        </div>
                      )}
                      {pelicula.metacritic_score != null && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Metacritic</p>
                          <p className="text-sm font-bold text-green-400">{pelicula.metacritic_score}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {(pelicula.runtime != null || pelicula.boxoffice != null) && (
                    <div className="flex gap-6">
                      {pelicula.runtime != null && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Duración</p>
                          <p className="text-sm text-zinc-200">{Math.floor(pelicula.runtime / 60)}h {pelicula.runtime % 60}min</p>
                        </div>
                      )}
                      {pelicula.boxoffice != null && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Taquilla</p>
                          <p className="text-sm text-zinc-200">${(pelicula.boxoffice / 1_000_000).toFixed(0)}M</p>
                        </div>
                      )}
                    </div>
                  )}
                  {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Oscars</p>
                      <p className="text-sm text-yellow-500">{pelicula.oscars}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {pelicula.director && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Director</p>
                        <p className="text-sm text-zinc-200">{pelicula.director}</p>
                      </div>
                    )}
                    {pelicula.compositor && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Compositor</p>
                        <p className="text-sm text-zinc-200">{pelicula.compositor}</p>
                      </div>
                    )}
                    {pelicula.actores && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Reparto</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {pelicula.actores.split(',').map(a => {
                            const actor = a.trim()
                            return (
                              <span key={actor} className="text-sm text-zinc-200">
                                {actor}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
                    {pelicula.imdb_id && (
                      <a href={`https://www.imdb.com/title/${pelicula.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">IMDb ↗</a>
                    )}
                    {pelicula.youtube_trailer_key && (
                      <a href={`https://www.youtube.com/watch?v=${pelicula.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-500 hover:text-red-300 transition-colors">▶ Trailer ↗</a>
                    )}
                    <a href={`https://open.spotify.com/search/${encodeURIComponent((pelicula.titulo_ingles || pelicula.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-300 transition-colors">♫ Soundtrack ↗</a>
                    <AgregarAListaButton peliculaId={pelicula.id} />
                  </div>
                  {/* Review CineBret + reviews usuarios */}
                  <PeliculaDetalle
                    peliculaId={pelicula.id}
                    esReviewAutor={pelicula.es_review_autor}
                    sinopsisIa={pelicula.sinopsis}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => {
              setPagina(p => Math.max(0, p - 1))
              tablaRef.current ? tablaRef.current.scrollTop = 0 : window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            disabled={pagina === 0}
            className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-sm text-zinc-500">
            Página <span className="text-white font-medium">{pagina + 1}</span> de {totalPaginas}
            <span className="text-zinc-600 ml-2">({peliculasFiltradas.length} resultados)</span>
          </span>
          <button
            onClick={() => {
              setPagina(p => Math.min(totalPaginas - 1, p + 1))
              tablaRef.current ? tablaRef.current.scrollTop = 0 : window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            disabled={pagina === totalPaginas - 1}
            className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </>
  )
}
