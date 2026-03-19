'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'

const GENEROS_EN_A_ES: Record<string, string> = {
  'Action': 'Acción',
  'Adventure': 'Aventura',
  'Animation': 'Animación',
  'Comedy': 'Comedia',
  'Crime': 'Crimen',
  'Documentary': 'Documental',
  'Drama': 'Drama',
  'Fantasy': 'Fantasía',
  'History': 'Historia',
  'Horror': 'Terror',
  'Music': 'Música',
  'Mystery': 'Misterio',
  'Romance': 'Romance',
  'Science Fiction': 'Ciencia ficción',
  'Sci-Fi': 'Ciencia ficción',
  'Thriller': 'Thriller',
  'War': 'Guerra',
  'Western': 'Western',
  'Family': 'Familia',
  'Biography': 'Biografía',
  'Sport': 'Deporte',
  'Musical': 'Musical',
}

function normalizarGenero(g: string): string {
  return GENEROS_EN_A_ES[g] ?? g
}

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

type Pelicula = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  categoria: string | null
  plataformas: string[]
  es_review_autor: boolean
  sello_bret: boolean
  director: string | null
  actores: string | null
  compositor: string | null
  generos: string[]
  poster_path: string | null
  oscars: string | null
  sinopsis: string | null
}

type ColumnasExtra = {
  director: boolean
  actores: boolean
  compositor: boolean
}

type Orden = 'imdb' | 'anio_desc' | 'anio_asc' | 'titulo'

type MultiSelectProps = {
  label: string
  opciones: string[]
  seleccionados: string[]
  onChange: (seleccionados: string[]) => void
}

function MultiSelect({ label, opciones, seleccionados, onChange }: MultiSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const toggle = (opcion: string) => {
    if (seleccionados.includes(opcion)) {
      onChange(seleccionados.filter(s => s !== opcion))
    } else {
      onChange([...seleccionados, opcion])
    }
  }

  const opcionesFiltradas = opciones.filter(o =>
    o.toLowerCase().includes(busqueda.toLowerCase())
  )

  const handleClose = () => {
    setAbierto(false)
    setBusqueda('')
  }

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
                <button
                  onClick={() => onChange([])}
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                  Limpiar selección
                </button>
              </div>
            )}
            <div className="overflow-y-auto">
              {opcionesFiltradas.length === 0 ? (
                <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p>
              ) : (
                opcionesFiltradas.map(opcion => (
                  <div
                    key={opcion}
                    onClick={() => toggle(opcion)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      seleccionados.includes(opcion)
                        ? 'bg-yellow-400 border-yellow-400'
                        : 'border-zinc-600'
                    }`}>
                      {seleccionados.includes(opcion) && (
                        <span className="text-zinc-950 text-xs font-bold">✓</span>
                      )}
                    </div>
                    <span className="truncate text-zinc-300">{opcion}</span>
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

export default function CatalogoPage() {
  const [peliculas, setPeliculas] = useState<Pelicula[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [plataformasFiltro, setPlataformasFiltro] = useState<string[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [generosFiltro, setGenerosFiltro] = useState<string[]>([])
  const [directoresFiltro, setDirectoresFiltro] = useState<string[]>([])
  const [actoresFiltro, setActoresFiltro] = useState<string[]>([])
  const [compositoresFiltro, setCompositoresFiltro] = useState<string[]>([])
  const [soloReviews, setSoloReviews] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [generosDisponibles, setGenerosDisponibles] = useState<string[]>([])
  const [directoresDisponibles, setDirectoresDisponibles] = useState<string[]>([])
  const [actoresDisponibles, setActoresDisponibles] = useState<string[]>([])
  const [compositoresDisponibles, setCompositoresDisponibles] = useState<string[]>([])
  const [orden, setOrden] = useState<Orden>('imdb')
  const [pagina, setPagina] = useState(0)
  const [columnas, setColumnas] = useState<ColumnasExtra>({
    director: false,
    actores: false,
    compositor: false,
  })

  useEffect(() => {
    async function cargar() {
      const hoy = new Date().toISOString().split('T')[0]

      const plataformas = ['netflix', 'disney_plus', 'hbo_max', 'amazon_prime', 'apple_tv', 'paramount_plus']
      const plataformasPorPelicula: Record<string, string[]> = {}

      await Promise.all(plataformas.map(async (plat) => {
        let from = 0
        const pageSize = 1000
        while (true) {
          const { data } = await supabase
            .from('catalogos')
            .select('pelicula_id')
            .eq('fecha', hoy)
            .eq('activo', true)
            .eq('plataforma', plat)
            .range(from, from + pageSize - 1)

          data?.forEach(c => {
            if (!plataformasPorPelicula[c.pelicula_id])
              plataformasPorPelicula[c.pelicula_id] = []
            plataformasPorPelicula[c.pelicula_id].push(plat)
          })

          if (!data || data.length < pageSize) break
          from += pageSize
        }
      }))

      const ids = Object.keys(plataformasPorPelicula)
      const todasLasPeliculas: Pelicula[] = []
      const todosLosGeneros = new Set<string>()
      const todosLosDirectores = new Set<string>()
      const todosLosActores = new Set<string>()
      const todosLosCompositores = new Set<string>()

      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500)
        const { data } = await supabase
          .from('peliculas')
          .select(`
            id, titulo, titulo_ingles, anio, nota_imdb, oscars, categoria, poster_path,
            enriquecimiento (es_review_autor, sello_bret, director, actores, compositor, generos, sinopsis_chilensis)
          `)
          .in('id', lote)

        data?.forEach((p: any) => {
          const enr = p.enriquecimiento || {}
          const generos = (enr.generos || []).map(normalizarGenero)
          generos.forEach((g: string) => todosLosGeneros.add(g))

          if (enr.director) todosLosDirectores.add(enr.director)
          if (enr.compositor) todosLosCompositores.add(enr.compositor)
          if (enr.actores) {
            enr.actores.split(',').forEach((a: string) => {
              const actor = a.trim()
              if (actor) todosLosActores.add(actor)
            })
          }

          todasLasPeliculas.push({
            id: p.id,
            titulo: p.titulo,
            titulo_ingles: p.titulo_ingles,
            anio: p.anio,
            nota_imdb: p.nota_imdb,
            categoria: p.categoria,
            poster_path: p.poster_path || null,
            oscars: p.oscars || null,
            sinopsis: enr.sinopsis_chilensis || null,
            plataformas: plataformasPorPelicula[p.id] || [],
            es_review_autor: enr.es_review_autor || false,
            sello_bret: enr.sello_bret || false,
            director: enr.director || null,
            actores: enr.actores || null,
            compositor: enr.compositor || null,
            generos: generos.map(normalizarGenero),
          })
        })
      }

      setPeliculas(todasLasPeliculas)
      setGenerosDisponibles(Array.from(todosLosGeneros).sort())
      setDirectoresDisponibles(Array.from(todosLosDirectores).sort())
      setActoresDisponibles(Array.from(todosLosActores).sort())
      setCompositoresDisponibles(Array.from(todosLosCompositores).sort())
      setCargando(false)
    }
    cargar()
  }, [])

  const toggleColumna = (col: keyof ColumnasExtra) => {
    setColumnas(prev => ({ ...prev, [col]: !prev[col] }))
  }

  const colsExtras = Object.values(columnas).filter(Boolean).length

  const peliculasFiltradas = peliculas
    .filter(p => {
      const terminos = busqueda.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      const matchBusqueda = terminos.length === 0 || terminos.every(q =>
        p.titulo.toLowerCase().includes(q) ||
        (p.titulo_ingles || '').toLowerCase().includes(q) ||
        (p.director || '').toLowerCase().includes(q) ||
        (p.actores || '').toLowerCase().includes(q) ||
        p.generos.some(g => normalizarGenero(g).toLowerCase().includes(q)) ||
        (p.compositor || '').toLowerCase().includes(q)
      )

      const matchPlataforma = plataformasFiltro.length === 0 ||
        plataformasFiltro.every(plat => p.plataformas.includes(plat))

      const matchCategoria = categoriasFiltro.length === 0 ||
        categoriasFiltro.includes(p.categoria || '')

      const matchGenero = generosFiltro.length === 0 ||
        generosFiltro.every(g => p.generos.includes(g))

      const matchDirector = directoresFiltro.length === 0 ||
        directoresFiltro.includes(p.director || '')

      const matchActor = actoresFiltro.length === 0 ||
        actoresFiltro.some(a => (p.actores || '').includes(a))

      const matchCompositor = compositoresFiltro.length === 0 ||
        compositoresFiltro.includes(p.compositor || '')

      const matchReview = !soloReviews || p.es_review_autor

      return matchBusqueda && matchPlataforma && matchCategoria &&
        matchGenero && matchDirector && matchActor && matchCompositor && matchReview
    })
    .sort((a, b) => {
      if (orden === 'imdb') return (b.nota_imdb || 0) - (a.nota_imdb || 0)
      if (orden === 'anio_desc') return (b.anio || 0) - (a.anio || 0)
      if (orden === 'anio_asc') return (a.anio || 0) - (b.anio || 0)
      if (orden === 'titulo') return (a.titulo_ingles || a.titulo).localeCompare(b.titulo_ingles || b.titulo)
      return 0
    })

  const hayFiltros = busqueda || plataformasFiltro.length > 0 || categoriasFiltro.length > 0 ||
    generosFiltro.length > 0 || directoresFiltro.length > 0 ||
    actoresFiltro.length > 0 || compositoresFiltro.length > 0 || soloReviews

  // Resetear página al cambiar filtros u orden
  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, soloReviews, orden])

  const limpiarFiltros = () => {
    setBusqueda('')
    setPlataformasFiltro([])
    setCategoriasFiltro([])
    setGenerosFiltro([])
    setDirectoresFiltro([])
    setActoresFiltro([])
    setCompositoresFiltro([])
    setSoloReviews(false)
    setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
            <Link href="/catalogo" className="text-white font-medium">Catálogo</Link>
            <Link href="/cambios" className="hover:text-white transition-colors">Cambios</Link>
            <Link href="/estadisticas" className="hover:text-white transition-colors">Estadísticas</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Catálogo</h1>
          <p className="text-zinc-500 text-sm mb-6">{peliculas.length} películas disponibles</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {[
              'grok-image-1327d1af-2281-4de3-993f-b7f1a9fbc04a.png',
              'grok-image-49a19a4c-29a0-4004-9846-a9a267d735e7.png',
              'grok-image-513fac9b-9a0f-4a9d-a198-6577a71d7e99.png',
              'grok-image-51d5db78-3829-4fb7-91d1-fec1f4d4e5fb.png',
              'grok-image-57e4c680-6fba-417b-892b-b1d7ab57b1ff.png',
              'grok-image-687f30d5-1463-4646-9d79-5142f8649dd1.png',
              'grok-image-91511f66-7d4b-47fb-a927-1d91a760392d.png',
              'grok-image-9a93a78f-2f38-4066-ae26-4015b4c48138.png',
              'grok-image-a1d16758-d46b-4846-bb3b-fc23613c929f.png',
              'grok-image-a2f13aa6-ec32-4efa-91f3-488186406b70.png',
              'grok-image-be622a5c-fa71-42d4-b494-f2a3d0e295fa.png',
              'grok-image-c1d4ff63-7f5d-47e8-9e4c-f6c503b24967.png',
              'grok-image-e5f99d18-940e-4a52-a49e-befe853ee4ac.png',
              'grok-image-ee8e466c-8f36-42ba-a81c-a50d66e79e94.png',
              'grok-image-f0601cd7-c078-4ebd-9cd5-b534d79c7e9e.png',
            ].map(file => (
              <img
                key={file}
                src={`/iconos/${file}`}
                alt=""
                className="h-16 w-16 object-cover rounded-xl"
              />
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Buscar película, director, actor, género..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm w-72 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <MultiSelect
            label="Plataforma"
            opciones={PLATAFORMAS.map(p => p.id)}
            seleccionados={plataformasFiltro}
            onChange={setPlataformasFiltro}
          />
          <MultiSelect
            label="Categoría"
            opciones={CATEGORIAS}
            seleccionados={categoriasFiltro}
            onChange={setCategoriasFiltro}
          />
          <MultiSelect
            label="Género"
            opciones={generosDisponibles}
            seleccionados={generosFiltro}
            onChange={setGenerosFiltro}
          />
          <MultiSelect
            label="Director"
            opciones={directoresDisponibles}
            seleccionados={directoresFiltro}
            onChange={setDirectoresFiltro}
          />
          <MultiSelect
            label="Actor"
            opciones={actoresDisponibles}
            seleccionados={actoresFiltro}
            onChange={setActoresFiltro}
          />
          <MultiSelect
            label="Compositor"
            opciones={compositoresDisponibles}
            seleccionados={compositoresFiltro}
            onChange={setCompositoresFiltro}
          />
          <button
            onClick={() => setSoloReviews(!soloReviews)}
            className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
              soloReviews
                ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            Solo reviews CineBret
          </button>
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-sm text-zinc-500 hover:text-white transition-colors px-2"
            >
              Limpiar todo ✕
            </button>
          )}
        </div>

        {/* Ordenamiento y columnas */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 mr-1">Columnas extra:</span>
            {(['director', 'actores', 'compositor'] as const).map(col => (
              <button
                key={col}
                onClick={() => toggleColumna(col)}
                className={`border rounded-full px-3 py-1 text-xs transition-colors ${
                  columnas[col]
                    ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                }`}
              >
                {col.charAt(0).toUpperCase() + col.slice(1)}
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
              <option value="anio_desc">Más recientes</option>
              <option value="anio_asc">Más antiguas</option>
              <option value="titulo">Título A-Z</option>
            </select>
          </div>
        </div>

        {cargando ? (
          <div className="text-center py-20 text-zinc-500">Cargando catálogo...</div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <p className="text-sm text-zinc-500">
                {peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="font-serif italic font-bold bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded">CB</span>
                  Contiene crítica CineBret
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-serif italic font-bold border border-emerald-400 text-emerald-400 px-1.5 py-0.5 rounded">★ Recomendada</span>
                  Recomendada por CineBret
                </span>
              </div>
            </div>

            {/* Tabla con scroll interno */}
            <div
              className="border border-zinc-800 rounded-xl overflow-hidden"
              style={{ height: 'calc(100vh - 190px)', minHeight: '650px', overflowY: 'auto' }}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-zinc-900 text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-64">Película</th>
                    <th className="text-center px-3 py-3 w-16">Año</th>
                    <th className="text-center px-3 py-3 w-20">IMDB</th>
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
                        className={`cursor-pointer border-t border-zinc-800 transition-colors ${
                          expandida === pelicula.id
                            ? 'bg-zinc-800'
                            : i % 2 === 0
                              ? 'bg-zinc-950 hover:bg-zinc-900'
                              : 'bg-zinc-900/40 hover:bg-zinc-900'
                        }`}
                      >
                        <td className="p-0" style={{ height: '1px' }}>
                          <div className="flex items-stretch h-full">
                            <div className="flex items-center px-3 py-3">
                              <span className="text-zinc-600 text-xs">
                                {expandida === pelicula.id ? '▲' : '▼'}
                              </span>
                            </div>
                            <div className="relative w-9 shrink-0 self-stretch">
                              {pelicula.poster_path ? (
                                <Image
                                  src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`}
                                  alt={pelicula.titulo}
                                  fill
                                  className="object-cover"
                                />
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
                                  <span className="text-xs text-zinc-500 truncate max-w-48 block">
                                    {pelicula.titulo}
                                  </span>
                                )}
                              </div>
                              {pelicula.es_review_autor && (
                                <span className="shrink-0 font-serif italic text-xs font-bold bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded">
                                  CB
                                </span>
                              )}
                              {pelicula.sello_bret && (
                                <span className="shrink-0 font-serif italic text-xs font-bold border border-emerald-400 text-emerald-400 px-1.5 py-0.5 rounded">
                                  ★ Recomendada
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-zinc-400">
                          {pelicula.anio || '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {pelicula.nota_imdb
                            ? <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span>
                            : <span className="text-zinc-700">—</span>
                          }
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {pelicula.generos.length > 0
                              ? pelicula.generos.map(g => (
                                  <span
                                    key={g}
                                    onClick={e => {
                                      e.stopPropagation()
                                      if (!generosFiltro.includes(g)) {
                                        setGenerosFiltro([...generosFiltro, g])
                                      }
                                    }}
                                    className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full cursor-pointer hover:bg-zinc-700 hover:text-zinc-200"
                                  >
                                    {g}
                                  </span>
                                ))
                              : <span className="text-zinc-700">—</span>
                            }
                          </div>
                        </td>
                        {columnas.director && (
                          <td className="px-3 py-3 text-zinc-400 text-xs">
                            {pelicula.director || <span className="text-zinc-700">—</span>}
                          </td>
                        )}
                        {columnas.actores && (
                          <td className="px-3 py-3 text-zinc-400 text-xs">
                            {pelicula.actores || <span className="text-zinc-700">—</span>}
                          </td>
                        )}
                        {columnas.compositor && (
                          <td className="px-3 py-3 text-zinc-400 text-xs">
                            {pelicula.compositor || <span className="text-zinc-700">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="grid grid-cols-3 gap-1">
                            {PLATAFORMAS.map(plat => {
                              const activa = pelicula.plataformas.includes(plat.id)
                              return (
                                <div
                                  key={plat.id}
                                  className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${activa ? 'opacity-100' : 'opacity-20'}`}
                                >
                                  <img
                                    src={plat.logo}
                                    alt={plat.nombre}
                                    className="h-5 w-auto object-contain"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {pelicula.oscars && pelicula.oscars !== 'N/A'
                            ? (() => {
                                const gano = pelicula.oscars.toLowerCase().startsWith('ganó')
                                return (
                                  <span className="flex items-center justify-center gap-0.5">
                                    <img src="/oscar.png" alt="Oscar" className={`h-8 w-auto ${gano ? 'opacity-100' : 'opacity-25'}`} />
                                    <span className={`text-base font-bold ${gano ? 'text-yellow-400' : 'text-zinc-600'}`}>
                                      {pelicula.oscars.match(/\d+/)?.[0]}
                                    </span>
                                  </span>
                                )
                              })()
                            : <span className="text-zinc-700 text-xs">—</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center">
                          {pelicula.categoria
                            ? <span className="text-xs text-zinc-400">{pelicula.categoria}</span>
                            : <span className="text-zinc-700 text-xs">—</span>
                          }
                        </td>
                      </tr>

                      {/* Fila expandida */}
                      {expandida === pelicula.id && (
                        <tr>
                          <td colSpan={7 + colsExtras} className="px-8 py-4 bg-zinc-900 border-t border-zinc-800">
                            <div className="grid grid-cols-1 gap-3 max-w-3xl">
                              <div>
                                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                                  🤖 Sinopsis IA
                                </p>
                                {pelicula.sinopsis ? (
                                  <p className="text-sm text-zinc-300 leading-relaxed italic">
                                    {pelicula.sinopsis}
                                  </p>
                                ) : (
                                  <p className="text-sm text-zinc-600 leading-relaxed italic">
                                    Pendiente de enriquecimiento — disponible en los próximos días
                                  </p>
                                )}
                                {pelicula.es_review_autor && (
                                  <p className="text-xs text-yellow-400 mt-2">
                                    ✍️ Ver ficha para reseña CineBret
                                  </p>
                                )}
                              </div>
                              <Link
                                href={`/pelicula/${pelicula.id}`}
                                className="text-xs text-zinc-500 hover:text-white transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                Ver ficha completa →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => setPagina(p => Math.max(0, p - 1))}
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
                  onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina === totalPaginas - 1}
                  className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
