'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from './PeliculaDetalle'
import AgregarAListaButton from '@/app/pelicula/[id]/AgregarAListaButton'

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
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false)
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
    const actual = userPeliculas[peliculaId]
    upsertUserPelicula(peliculaId, { visto: !actual?.visto })
  }

  const toggleWatchlist = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const actual = userPeliculas[peliculaId]
    upsertUserPelicula(peliculaId, { watchlist: !actual?.watchlist })
  }

  const setRating = (peliculaId: string, rating: number, e: React.MouseEvent | React.ChangeEvent<HTMLSelectElement>) => {
    if ('stopPropagation' in e) e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: true, rating })
  }

  const generosDisponibles = [...new Set(peliculas.flatMap(p => p.generos))].sort()
  const directoresDisponibles = [...new Set(peliculas.map(p => p.director).filter(Boolean) as string[])].sort()
  const actoresDisponibles = [...new Set(
    peliculas.flatMap(p => (p.actores || '').split(',').map(a => a.trim()).filter(Boolean))
  )].sort()
  const compositoresDisponibles = [...new Set(peliculas.map(p => p.compositor).filter(Boolean) as string[])].sort()

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

  const filtrosAvanzadosCount = [...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length

  // Find movie for modal
  const peliculaModal = expandida && expandida !== '__filtros__' ? peliculas.find(p => p.id === expandida) : null

  return (
    <>
      {/* ── HERO ── */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fondo-interstellar.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950" />
        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white text-center mb-1.5 tracking-tight">
            Bienvenido a <span className="text-yellow-400">CineBret</span>
          </h1>
          <p className="text-zinc-300 text-sm md:text-base text-center mb-6 max-w-md">
            Buscador y recomendador inteligente de las mejores películas
          </p>
          <div className="relative w-full max-w-xl">
            <input
              type="text"
              placeholder="Buscar película, director, actor..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(0) }}
              className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder:text-zinc-400 focus:outline-none focus:border-white/50 text-sm"
            />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── FILTROS + GRILLA ── */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-6">

        {/* Mood (categorías) */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-zinc-300 mb-2 md:hidden">¿En qué mood estás?</p>
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
            {([
              { id: "Pa'l domingo de bajón",                          emoji: '🛋️', short: 'Bajón',            grad: 'from-amber-500 to-orange-600',  dim: 'from-amber-950/60 to-orange-950/60 border-amber-800'  },
              { id: "Pa' saltar del sillón",                          emoji: '⚡',  short: 'Del sillón',       grad: 'from-violet-500 to-blue-600',   dim: 'from-violet-950/60 to-blue-950/60 border-violet-800'  },
              { id: "Pa' quedar con el cerebro como licuadora",       emoji: '🤯', short: 'Licuadora',        grad: 'from-rose-500 to-pink-600',     dim: 'from-rose-950/60 to-pink-950/60 border-rose-800'      },
              { id: "Pa' llorar a moco tendido",                      emoji: '😭', short: 'A moco tendido',   grad: 'from-cyan-500 to-teal-600',     dim: 'from-cyan-950/60 to-teal-950/60 border-cyan-800'      },
            ]).map(cat => {
              const activa = categoriasFiltro.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                  className={`md:px-4 md:py-2 px-2 py-3 rounded-xl border text-xs font-semibold flex items-center justify-center md:justify-start gap-1.5 transition-all bg-gradient-to-br ${
                    activa ? `${cat.grad} border-transparent text-white shadow-md` : `${cat.dim} text-zinc-300 hover:text-white`
                  }`}
                >
                  <span className="text-base md:text-sm">{cat.emoji}</span>
                  <span className="hidden md:inline">{cat.id}</span>
                  <span className="md:hidden text-center leading-tight">{cat.short}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Plataformas + búsqueda avanzada */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-sm font-semibold text-zinc-300 w-full md:hidden">Plataformas</p>
          {PLATAFORMAS.map(plat => {
            const activa = plataformasFiltro.includes(plat.id)
            return (
              <button
                key={plat.id}
                onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                className={`h-8 w-14 rounded-lg border flex items-center justify-center transition-colors ${activa ? 'bg-white border-white' : 'border-zinc-700 bg-zinc-800/80 hover:border-zinc-500'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
              </button>
            )
          })}

          <div className="hidden md:block w-px h-6 bg-zinc-700 mx-1" />

          {/* Más filtros */}
          <button
            onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
            className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              mostrarFiltrosAvanzados ? 'bg-zinc-700 border-zinc-600 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
            </svg>
            Más filtros
            {filtrosAvanzadosCount > 0 && (
              <span className="bg-yellow-400 text-zinc-950 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">
                {filtrosAvanzadosCount}
              </span>
            )}
          </button>

          {hayFiltros && (
            <button onClick={limpiarFiltros} className="h-8 px-3 rounded-lg border border-zinc-700 text-xs text-zinc-500 hover:text-white transition-colors">
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* Panel filtros avanzados */}
        {mostrarFiltrosAvanzados && (
          <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
              <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
              <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
              <MultiSelect label="🏆 Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
              <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
            </div>
            <div className="flex items-center flex-wrap gap-3 pt-1">
              <button onClick={() => setSoloReviews(!soloReviews)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                Solo reviews CineBret
              </button>
              <button onClick={() => setSoloSello(!soloSello)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloSello ? 'bg-emerald-500 text-white border-emerald-500 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
                Solo recomendadas
              </button>
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

        {/* Contador + badges leyenda + ordenar */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-zinc-500">
              {peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setSoloReviews(!soloReviews)}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${soloReviews ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
            >
              <span className={`font-serif italic font-bold px-1.5 py-0.5 rounded text-[10px] ${soloReviews ? 'bg-yellow-400 text-zinc-950 ring-1 ring-yellow-300' : 'bg-yellow-400 text-zinc-950'}`}>CB</span>
              <span className="text-zinc-500 hidden sm:inline text-xs">Reviews</span>
            </button>
            <button
              onClick={() => setSoloSello(!soloSello)}
              className={`flex items-center gap-1.5 text-xs transition-opacity ${soloSello ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
            >
              <span className={`font-serif italic font-bold border px-1.5 py-0.5 rounded text-[10px] ${soloSello ? 'border-emerald-400 text-emerald-400 ring-1 ring-emerald-400/40' : 'border-emerald-400 text-emerald-400'}`}>★</span>
              <span className="text-zinc-500 hidden sm:inline text-xs">Recomendadas</span>
            </button>
          </div>
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

        {/* ── GRILLA DE POSTERS ── */}
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {peliculasPagina.map(pelicula => {
            const up = userPeliculas[pelicula.id]
            const platsActivas = PLATAFORMAS.filter(pl => pelicula.plataformas.includes(pl.id))
            const oscarGano = pelicula.oscars?.toLowerCase().startsWith('ganó')

            return (
              <div
                key={pelicula.id}
                onClick={() => setExpandida(pelicula.id)}
                className="relative rounded-xl overflow-hidden cursor-pointer group bg-zinc-800 shadow-lg hover:shadow-2xl transition-shadow"
                style={{ aspectRatio: '2/3' }}
              >
                {/* Poster image */}
                {pelicula.poster_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w342${pelicula.poster_path}`}
                    alt={pelicula.titulo_ingles || pelicula.titulo}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                    <span className="text-zinc-600 text-5xl">🎬</span>
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />

                {/* Top-left badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                  {pelicula.es_review_autor && (
                    <span className="font-serif italic font-bold text-[10px] bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded leading-none shadow">CB</span>
                  )}
                  {pelicula.sello_bret && (
                    <span className="text-[10px] border border-emerald-400 text-emerald-400 bg-black/60 px-1 py-0.5 rounded leading-none font-bold shadow">★</span>
                  )}
                </div>

                {/* User action buttons — top right (hover on desktop, always on mobile when user) */}
                {user && (
                  <div
                    className="absolute top-2 right-2 flex flex-col gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={e => toggleVisto(pelicula.id, e)}
                      className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors shadow ${
                        up?.visto
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-white/70 bg-black/60 text-white hover:border-emerald-400 hover:text-emerald-400'
                      }`}
                    >✓</button>
                    <button
                      onClick={e => toggleWatchlist(pelicula.id, e)}
                      className={`w-7 h-7 rounded-full border text-xs font-bold flex items-center justify-center transition-colors shadow ${
                        up?.watchlist
                          ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                          : 'border-white/70 bg-black/60 text-white hover:border-yellow-400 hover:text-yellow-400'
                      }`}
                    >★</button>
                  </div>
                )}

                {/* Bottom info overlay */}
                <div className="absolute inset-x-0 bottom-0 p-2.5 z-10">
                  <div className="flex items-end justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      {/* Platform logos */}
                      {platsActivas.length > 0 && (
                        <div className="flex gap-1 mb-1.5 flex-wrap">
                          {platsActivas.map(pl => (
                            <div key={pl.id} className="rounded bg-white/95 px-1 py-0.5 flex items-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={pl.logo} alt={pl.nombre} className="h-3 w-auto object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-white font-semibold text-xs md:text-sm leading-tight line-clamp-2">
                        {pelicula.titulo_ingles || pelicula.titulo}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {pelicula.anio && (
                          <span className="text-zinc-400 text-[10px] md:text-xs">{pelicula.anio}</span>
                        )}
                        {pelicula.nota_imdb != null && (
                          <span className="text-yellow-400 font-bold text-[10px] md:text-xs">⭐ {pelicula.nota_imdb}</span>
                        )}
                      </div>
                      {/* Genre chips — visible on hover */}
                      {pelicula.generos.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {pelicula.generos.slice(0, 2).map(g => (
                            <span key={g} className="text-[9px] bg-white/15 backdrop-blur-sm text-zinc-300 px-1.5 py-0.5 rounded-full">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Oscar trophy */}
                    {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                      <div className="shrink-0 self-end">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/oscar.png"
                          alt="Oscar"
                          className={`h-8 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => {
                setPagina(p => Math.max(0, p - 1))
                gridRef.current ? gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) : window.scrollTo({ top: 0, behavior: 'smooth' })
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
                gridRef.current ? gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) : window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              disabled={pagina === totalPaginas - 1}
              className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* ── MODAL DETALLE ── */}
      {peliculaModal && (() => {
        const p = peliculaModal
        const up = userPeliculas[p.id]
        const oscarGano = p.oscars?.toLowerCase().startsWith('ganó')

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setExpandida(null)}
          >
            <div
              className="w-full max-w-2xl bg-zinc-900 rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header backdrop */}
              <div className="relative h-48 md:h-64 bg-zinc-800 shrink-0">
                {p.poster_path && (
                  <Image
                    src={`https://image.tmdb.org/t/p/w780${p.poster_path}`}
                    alt={p.titulo_ingles || p.titulo}
                    fill
                    className="object-cover object-top"
                    sizes="672px"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
                <button
                  onClick={() => setExpandida(null)}
                  className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Title + poster strip */}
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="relative w-16 shrink-0 rounded-lg overflow-hidden bg-zinc-800 shadow-lg" style={{ aspectRatio: '2/3' }}>
                  {p.poster_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w154${p.poster_path}`}
                      alt={p.titulo_ingles || p.titulo}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg md:text-xl font-bold text-white leading-tight">
                    {p.titulo_ingles || p.titulo}
                  </h2>
                  {p.titulo_ingles && p.titulo !== p.titulo_ingles && (
                    <p className="text-zinc-400 text-sm mt-0.5">{p.titulo}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {p.anio && <span className="text-zinc-400 text-sm">{p.anio}</span>}
                    {p.runtime != null && <span className="text-zinc-500 text-sm">{Math.floor(p.runtime / 60)}h {p.runtime % 60}min</span>}
                    {p.nota_imdb != null && <span className="font-bold text-yellow-400">⭐ {p.nota_imdb}</span>}
                    {p.rt_score != null && <span className="text-red-400 text-sm">🍅 {p.rt_score}%</span>}
                    {p.metacritic_score != null && <span className="text-green-400 text-sm">{p.metacritic_score} MC</span>}
                  </div>
                  {/* Plataformas */}
                  {p.plataformas.length > 0 && (
                    <div className="flex gap-1.5 mt-2.5 flex-wrap">
                      {PLATAFORMAS.filter(pl => p.plataformas.includes(pl.id)).map(pl => (
                        <div key={pl.id} className="rounded-md bg-white px-2 py-1 flex items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={pl.logo} alt={pl.nombre} className="h-4 w-auto object-contain" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="px-5 pb-6 space-y-4 border-t border-zinc-800 pt-4">
                {/* User actions */}
                {user && (
                  <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => toggleVisto(p.id, e)}
                      className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors ${
                        up?.visto
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-zinc-600 text-zinc-400 hover:border-emerald-400 hover:text-emerald-400'
                      }`}
                    >
                      {up?.visto ? '✓ Vista' : '○ Marcar vista'}
                    </button>
                    <button
                      onClick={e => toggleWatchlist(p.id, e)}
                      className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors ${
                        up?.watchlist
                          ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                          : 'border-zinc-600 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400'
                      }`}
                    >
                      {up?.watchlist ? '★ En watchlist' : '☆ Watchlist'}
                    </button>
                    {up?.visto && (
                      <select
                        value={up.rating ?? ''}
                        onChange={e => { if (e.target.value) setRating(p.id, Number(e.target.value), e as any) }}
                        onClick={e => e.stopPropagation()}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
                      >
                        <option value="">Tu rating</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <option key={n} value={n}>{n}/10</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Genres */}
                {p.generos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {p.generos.map(g => (
                      <span
                        key={g}
                        onClick={e => { e.stopPropagation(); if (!generosFiltro.includes(g)) { setGenerosFiltro([...generosFiltro, g]); setExpandida(null) } }}
                        className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1 rounded-full cursor-pointer transition-colors"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Oscars */}
                {p.oscars && p.oscars !== 'N/A' && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/oscar.png" alt="Oscar" className={`h-10 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`} />
                    <p className="text-sm text-yellow-500">{p.oscars}</p>
                  </div>
                )}

                {/* Boxoffice */}
                {p.boxoffice != null && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Taquilla</p>
                    <p className="text-sm text-zinc-200">${(p.boxoffice / 1_000_000).toFixed(0)}M</p>
                  </div>
                )}

                {/* Team */}
                <div className="grid grid-cols-2 gap-4">
                  {p.director && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Director</p>
                      <p className="text-sm text-zinc-200">{p.director}</p>
                    </div>
                  )}
                  {p.compositor && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Compositor</p>
                      <p className="text-sm text-zinc-200">{p.compositor}</p>
                    </div>
                  )}
                  {p.actores && (
                    <div className="col-span-2">
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p>
                      <p className="text-sm text-zinc-200">{p.actores}</p>
                    </div>
                  )}
                </div>

                {/* Categoria mood */}
                {p.categoria && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Categoría</p>
                    <p className="text-sm text-zinc-400">{p.categoria}</p>
                  </div>
                )}

                {/* Links */}
                <div className="flex flex-wrap gap-3 items-center" onClick={e => e.stopPropagation()}>
                  {p.imdb_id && (
                    <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">
                      IMDb ↗
                    </a>
                  )}
                  {p.youtube_trailer_key && (
                    <a href={`https://www.youtube.com/watch?v=${p.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-500 hover:text-red-300 transition-colors">
                      ▶ Trailer ↗
                    </a>
                  )}
                  <a href={`https://open.spotify.com/search/${encodeURIComponent((p.titulo_ingles || p.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-300 transition-colors">
                    ♫ Soundtrack ↗
                  </a>
                  <AgregarAListaButton peliculaId={p.id} />
                </div>

                {/* Review CineBret + reviews usuarios */}
                <PeliculaDetalle
                  peliculaId={p.id}
                  esReviewAutor={p.es_review_autor}
                  sinopsisIa={p.sinopsis}
                />
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
