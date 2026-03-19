'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

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
  sinopsis: string | null
}

type ColumnasExtra = { director: boolean; actores: boolean; compositor: boolean }
type Orden = 'imdb' | 'anio_desc' | 'anio_asc' | 'titulo'

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
  const [busqueda, setBusqueda] = useState('')
  const [plataformasFiltro, setPlataformasFiltro] = useState<string[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [generosFiltro, setGenerosFiltro] = useState<string[]>([])
  const [directoresFiltro, setDirectoresFiltro] = useState<string[]>([])
  const [actoresFiltro, setActoresFiltro] = useState<string[]>([])
  const [compositoresFiltro, setCompositoresFiltro] = useState<string[]>([])
  const [soloReviews, setSoloReviews] = useState(false)
  const [soloSello, setSoloSello] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('imdb')
  const [pagina, setPagina] = useState(0)
  const [columnas, setColumnas] = useState<ColumnasExtra>({ director: false, actores: false, compositor: false })

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
      const matchPlataforma = plataformasFiltro.length === 0 || plataformasFiltro.every(plat => p.plataformas.includes(plat))
      const matchCategoria = categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria || '')
      const matchGenero = generosFiltro.length === 0 || generosFiltro.every(g => p.generos.includes(g))
      const matchDirector = directoresFiltro.length === 0 || directoresFiltro.includes(p.director || '')
      const matchActor = actoresFiltro.length === 0 || actoresFiltro.some(a => (p.actores || '').includes(a))
      const matchCompositor = compositoresFiltro.length === 0 || compositoresFiltro.includes(p.compositor || '')
      const matchReview = !soloReviews || p.es_review_autor
      const matchSello = !soloSello || p.sello_bret
      return matchBusqueda && matchPlataforma && matchCategoria && matchGenero && matchDirector && matchActor && matchCompositor && matchReview && matchSello
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
    actoresFiltro.length > 0 || compositoresFiltro.length > 0 || soloReviews || soloSello

  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, soloReviews, soloSello, orden])

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([]); setGenerosFiltro([])
    setDirectoresFiltro([]); setActoresFiltro([]); setCompositoresFiltro([])
    setSoloReviews(false); setSoloSello(false); setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar película, director, actor, género..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm w-72 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <MultiSelect label="Plataforma" opciones={PLATAFORMAS.map(p => p.id)} seleccionados={plataformasFiltro} onChange={setPlataformasFiltro} />
        <MultiSelect label="Categoría" opciones={CATEGORIAS} seleccionados={categoriasFiltro} onChange={setCategoriasFiltro} />
        <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
        <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
        <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
        <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
        <button
          onClick={() => setSoloReviews(!soloReviews)}
          className={`border rounded-lg px-4 py-2 text-sm transition-colors ${soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
        >
          Solo reviews CineBret
        </button>
        <button
          onClick={() => setSoloSello(!soloSello)}
          className={`border rounded-lg px-4 py-2 text-sm transition-colors ${soloSello ? 'bg-emerald-500 text-white border-emerald-500 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}
        >
          Solo recomendadas
        </button>
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="text-sm text-zinc-500 hover:text-white transition-colors px-2">
            Limpiar todo ✕
          </button>
        )}
      </div>

      {/* Ordenamiento y columnas */}
      <div className="flex items-center justify-between mb-6">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs text-zinc-500 mr-1">Columnas extra:</span>
          {(['director', 'actores', 'compositor'] as const).map(col => (
            <button
              key={col}
              onClick={() => toggleColumna(col)}
              className={`border rounded-full px-3 py-1 text-xs transition-colors ${columnas[col] ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-medium' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
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
        className="hidden md:block border border-zinc-800 rounded-xl overflow-hidden"
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
                    expandida === pelicula.id ? 'bg-zinc-800' : i % 2 === 0 ? 'bg-zinc-950 hover:bg-zinc-900' : 'bg-zinc-900/40 hover:bg-zinc-900'
                  }`}
                >
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
                        {pelicula.es_review_autor && (
                          <span className="shrink-0 font-serif italic text-xs font-bold bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded">CB</span>
                        )}
                        {pelicula.sello_bret && (
                          <span className="shrink-0 font-serif italic text-xs font-bold border border-emerald-400 text-emerald-400 px-1.5 py-0.5 rounded">★ Recomendada</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-400">{pelicula.anio || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    {pelicula.nota_imdb
                      ? <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span>
                      : <span className="text-zinc-700">—</span>}
                  </td>
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
                    <td colSpan={7 + colsExtras} className="px-8 py-4 bg-zinc-900 border-t border-zinc-800">
                      <div className="grid grid-cols-2 gap-8">
                        {/* Izquierda: sinopsis + links */}
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">🤖 Sinopsis IA</p>
                            {pelicula.sinopsis ? (
                              <p className="text-sm text-zinc-300 leading-relaxed italic">{pelicula.sinopsis}</p>
                            ) : (
                              <p className="text-sm text-zinc-600 leading-relaxed italic">Pendiente de enriquecimiento — disponible en los próximos días</p>
                            )}
                          </div>
                          <Link
                            href={`/pelicula/${pelicula.id}`}
                            className={`text-xs transition-colors ${pelicula.es_review_autor ? 'text-yellow-400 hover:text-yellow-200' : 'text-zinc-500 hover:text-white'}`}
                            onClick={e => e.stopPropagation()}
                          >
                            {pelicula.es_review_autor ? '✍️ Ver ficha para reseña CineBret →' : 'Ver ficha completa →'}
                          </Link>
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

      {/* Lista de tarjetas móvil (por debajo de md) */}
      <div className="block md:hidden space-y-2">
        {peliculasPagina.map(pelicula => {
          const isExpanded = expandida === pelicula.id
          const plataformasActivas = PLATAFORMAS.filter(plat => pelicula.plataformas.includes(plat.id))
          return (
            <div
              key={pelicula.id}
              onClick={() => setExpandida(isExpanded ? null : pelicula.id)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 cursor-pointer"
            >
              {/* Fila principal */}
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-zinc-800">
                  {pelicula.poster_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`}
                      alt={pelicula.titulo}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <span className="font-semibold text-white text-sm leading-snug">
                      {pelicula.titulo_ingles || pelicula.titulo}
                    </span>
                    {pelicula.es_review_autor && (
                      <span className="shrink-0 font-serif italic text-xs font-bold bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded">CB</span>
                    )}
                    {pelicula.sello_bret && (
                      <span className="shrink-0 font-serif italic text-xs font-bold border border-emerald-400 text-emerald-400 px-1.5 py-0.5 rounded">★ Recomendada</span>
                    )}
                  </div>
                  {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                    <span className="text-xs text-zinc-500 block mb-1">{pelicula.titulo}</span>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    {pelicula.anio && (
                      <span className="text-zinc-400">{pelicula.anio}</span>
                    )}
                    {pelicula.nota_imdb && (
                      <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span>
                    )}
                  </div>
                  {pelicula.categoria && (
                    <span className="text-xs text-zinc-500 mt-0.5">{pelicula.categoria}</span>
                  )}
                </div>

                {/* Chevron */}
                <span className="text-zinc-600 text-xs shrink-0 mt-1">{isExpanded ? '▲' : '▼'}</span>
              </div>

              {/* Logos de plataformas activas */}
              {plataformasActivas.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {plataformasActivas.map(plat => (
                    <div key={plat.id} className="rounded px-1 py-0.5 bg-white flex items-center justify-center" style={{ height: '20px' }}>
                      <img src={plat.logo} alt={plat.nombre} className="h-4 w-auto object-contain" />
                    </div>
                  ))}
                </div>
              )}

              {/* Contenido expandido */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">🤖 Sinopsis IA</p>
                    {pelicula.sinopsis ? (
                      <p className="text-sm text-zinc-300 leading-relaxed italic">{pelicula.sinopsis}</p>
                    ) : (
                      <p className="text-sm text-zinc-600 leading-relaxed italic">Pendiente de enriquecimiento — disponible en los próximos días</p>
                    )}
                  </div>
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
                  <Link
                    href={`/pelicula/${pelicula.id}`}
                    className={`inline-block text-xs transition-colors ${pelicula.es_review_autor ? 'text-yellow-400 hover:text-yellow-200' : 'text-zinc-500 hover:text-white'}`}
                    onClick={e => e.stopPropagation()}
                  >
                    {pelicula.es_review_autor ? '✍️ Ver ficha para reseña CineBret →' : 'Ver ficha completa →'}
                  </Link>
                </div>
              )}
            </div>
          )
        })}
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
  )
}
