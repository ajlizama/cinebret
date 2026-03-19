'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Image from 'next/image'

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700' },
  { id: 'hbo_max', nombre: 'HBO', color: 'bg-purple-700' },
  { id: 'amazon_prime', nombre: 'Prime', color: 'bg-cyan-600' },
  { id: 'apple_tv', nombre: 'Apple', color: 'bg-gray-800' },
  { id: 'paramount_plus', nombre: 'Paramount', color: 'bg-blue-500' },
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
  director: string | null
  actores: string | null
  compositor: string | null
  generos: string[]
  poster_path: string | null
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

  const toggle = (opcion: string) => {
    if (seleccionados.includes(opcion)) {
      onChange(seleccionados.filter(s => s !== opcion))
    } else {
      onChange([...seleccionados, opcion])
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className={`border rounded-lg px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
          seleccionados.length > 0
            ? 'border-gray-800 bg-gray-800 text-white'
            : 'border-gray-200 text-gray-600 hover:border-gray-400'
        }`}
      >
        {label}
        {seleccionados.length > 0 && (
          <span className="bg-white text-gray-800 text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
            {seleccionados.length}
          </span>
        )}
        <span className="text-xs">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAbierto(false)}
          />
          <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-52 max-h-64 overflow-y-auto">
            {seleccionados.length > 0 && (
              <div className="border-b border-gray-100 px-3 py-2">
                <button
                  onClick={() => onChange([])}
                  className="text-xs text-gray-400 hover:text-black transition-colors"
                >
                  Limpiar selección
                </button>
              </div>
            )}
            {opciones.map(opcion => (
              <div
                key={opcion}
                onClick={() => toggle(opcion)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  seleccionados.includes(opcion)
                    ? 'bg-gray-800 border-gray-800'
                    : 'border-gray-300'
                }`}>
                  {seleccionados.includes(opcion) && (
                    <span className="text-white text-xs">✓</span>
                  )}
                </div>
                <span className="truncate">{opcion}</span>
              </div>
            ))}
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
            id, titulo, titulo_ingles, anio, nota_imdb, categoria, poster_path,
            enriquecimiento (es_review_autor, director, actores, compositor, generos)
          `)
          .in('id', lote)

        data?.forEach((p: any) => {
          const enr = p.enriquecimiento || {}
          const generos = enr.generos || []
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
            plataformas: plataformasPorPelicula[p.id] || [],
            es_review_autor: enr.es_review_autor || false,
            director: enr.director || null,
            actores: enr.actores || null,
            compositor: enr.compositor || null,
            generos,
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
      const matchBusqueda = !busqueda ||
        p.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.titulo_ingles || '').toLowerCase().includes(busqueda.toLowerCase())

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

  const limpiarFiltros = () => {
    setBusqueda('')
    setPlataformasFiltro([])
    setCategoriasFiltro([])
    setGenerosFiltro([])
    setDirectoresFiltro([])
    setActoresFiltro([])
    setCompositoresFiltro([])
    setSoloReviews(false)
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-semibold tracking-tight">CineBret</Link>
          <div className="flex gap-6 text-sm text-gray-500">
            <Link href="/" className="hover:text-black transition-colors">Inicio</Link>
            <Link href="/catalogo" className="text-black font-medium">Catálogo</Link>
            <Link href="/cambios" className="hover:text-black transition-colors">Cambios</Link>
            <Link href="/estadisticas" className="hover:text-black transition-colors">Estadísticas</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Catálogo</h1>
          <p className="text-gray-400 text-sm">{peliculas.length} películas disponibles</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Buscar película..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="border border-gray-200 rounded-lg px-4 py-2 text-sm w-52 focus:outline-none focus:border-gray-400"
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
                ? 'bg-black text-white border-black'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            Solo reviews CineBret
          </button>
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-sm text-gray-400 hover:text-black transition-colors px-2"
            >
              Limpiar todo ✕
            </button>
          )}
        </div>

        {/* Ordenamiento y columnas */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 mr-1">Columnas extra:</span>
            {(['director', 'actores', 'compositor'] as const).map(col => (
              <button
                key={col}
                onClick={() => toggleColumna(col)}
                className={`border rounded-full px-3 py-1 text-xs transition-colors ${
                  columnas[col]
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {col.charAt(0).toUpperCase() + col.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Ordenar por:</span>
            <select
              value={orden}
              onChange={e => setOrden(e.target.value as Orden)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400"
            >
              <option value="imdb">Mayor IMDB</option>
              <option value="anio_desc">Más recientes</option>
              <option value="anio_asc">Más antiguas</option>
              <option value="titulo">Título A-Z</option>
            </select>
          </div>
        </div>

        {cargando ? (
          <div className="text-center py-20 text-gray-400">Cargando catálogo...</div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">
              {peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}
            </p>

            {/* Tabla con scroll interno */}
            <div
              className="border border-gray-100 rounded-xl overflow-hidden"
              style={{ height: 'calc(100vh - 340px)', overflowY: 'auto' }}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-xs text-gray-400 font-medium uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-64">Película</th>
                    <th className="text-center px-3 py-3 w-16">Año</th>
                    <th className="text-center px-3 py-3 w-20">IMDB</th>
                    <th className="text-center px-3 py-3 w-48">Géneros</th>
                    {columnas.director && <th className="text-left px-3 py-3 w-36">Director</th>}
                    {columnas.actores && <th className="text-left px-3 py-3 w-48">Actores</th>}
                    {columnas.compositor && <th className="text-left px-3 py-3 w-36">Compositor</th>}
                    <th className="text-center px-3 py-3 min-w-64">Plataformas</th>
                    <th className="text-center px-3 py-3 w-40">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {peliculasFiltradas.slice(0, 200).map((pelicula, i) => (
                    <React.Fragment key={pelicula.id}>
                      <tr
                        onClick={() => setExpandida(expandida === pelicula.id ? null : pelicula.id)}
                        className={`cursor-pointer border-t border-gray-50 transition-colors ${
                          expandida === pelicula.id
                            ? 'bg-gray-50'
                            : i % 2 === 0
                              ? 'bg-white hover:bg-gray-50/50'
                              : 'bg-gray-50/30 hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 text-xs">
                              {expandida === pelicula.id ? '▲' : '▼'}
                            </span>
                            {pelicula.poster_path ? (
                              <Image
                                src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`}
                                alt={pelicula.titulo}
                                width={24}
                                height={36}
                                className="rounded object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-9 bg-gray-100 rounded shrink-0" />
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-900 truncate max-w-48 block">
                                  {pelicula.titulo_ingles || pelicula.titulo}
                                </span>
                                {pelicula.es_review_autor && (
                                  <span className="shrink-0 text-xs bg-black text-white px-1.5 py-0.5 rounded-full">
                                    CB
                                  </span>
                                )}
                              </div>
                              {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                                <span className="text-xs text-gray-400 truncate max-w-48 block">
                                  {pelicula.titulo}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-500">
                          {pelicula.anio || '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {pelicula.nota_imdb
                            ? <span className="font-medium text-amber-600">⭐ {pelicula.nota_imdb}</span>
                            : <span className="text-gray-300">—</span>
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
                                    className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full cursor-pointer hover:bg-gray-200"
                                  >
                                    {g}
                                  </span>
                                ))
                              : <span className="text-gray-300">—</span>
                            }
                          </div>
                        </td>
                        {columnas.director && (
                          <td className="px-3 py-3 text-gray-600 text-xs">
                            {pelicula.director || <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        {columnas.actores && (
                          <td className="px-3 py-3 text-gray-600 text-xs">
                            {pelicula.actores || <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        {columnas.compositor && (
                          <td className="px-3 py-3 text-gray-600 text-xs">
                            {pelicula.compositor || <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="flex gap-1 flex-wrap justify-center">
                            {PLATAFORMAS.map(plat => {
                              const activa = pelicula.plataformas.includes(plat.id)
                              return (
                                <span
                                  key={plat.id}
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    activa
                                      ? `${plat.color} text-white`
                                      : 'bg-gray-100 text-gray-300'
                                  }`}
                                >
                                  {plat.nombre}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {pelicula.categoria
                            ? <span className="text-xs text-gray-500">{pelicula.categoria}</span>
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                      </tr>

                      {/* Fila expandida */}
                      {expandida === pelicula.id && (
                        <tr>
                          <td colSpan={6 + colsExtras} className="px-8 py-4 bg-gray-50 border-t border-gray-100">
                            <div className="grid grid-cols-1 gap-3 max-w-3xl">
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                                  {pelicula.es_review_autor ? '✍️ Review CineBret' : '🤖 Sinopsis IA'}
                                </p>
                                <p className="text-sm text-gray-600 leading-relaxed italic">
                                  Pendiente de enriquecimiento — disponible en los próximos días
                                </p>
                              </div>
                              <Link
                                href={`/pelicula/${pelicula.id}`}
                                className="text-xs text-gray-400 hover:text-black transition-colors"
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

            {peliculasFiltradas.length > 200 && (
              <p className="text-center text-sm text-gray-400 mt-4">
                Mostrando 200 de {peliculasFiltradas.length} — usa los filtros para reducir
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}