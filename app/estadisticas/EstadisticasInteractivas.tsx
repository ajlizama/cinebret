'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export type PeliculaRow = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  oscars: string | null
  categoria: string | null
  director: string | null
  director_oscars: number | null
  actores: string | null
  actores_oscars: Record<string, number> | null
  compositor: string | null
  compositor_oscars: number | null
  generos: string[]
  plataformas: string[]
  es_review_autor: boolean
}

type RankingEntry = { nombre: string; avg: number; count: number }
type StatEntry = { nombre: string; avg: number; count: number }
type OscarEntry = { nombre: string; count: number }

type PlatStats = {
  generos: StatEntry[]
  categorias: StatEntry[]
  directores: RankingEntry[]
  actores: RankingEntry[]
  totalMovies: number
  enriquecidas: number
  totalEnPlataforma: number
}

type Plataforma = { id: string; nombre: string; color: string; logo: string }

type Props = {
  peliculas: PeliculaRow[]
  plataformas: Plataforma[]
}

type TipoEvaluado = 'directores' | 'actores' | 'compositores'

const CATEGORIAS = [
  "Pa'l domingo de bajón",
  "Pa' saltar del sillón",
  "Pa' quedar con el cerebro como licuadora",
  "Pa' llorar a moco tendido",
]

function computeRanking(
  peliculas: PeliculaRow[],
  keyFn: (p: PeliculaRow) => string[],
  min = 2,
): RankingEntry[] {
  const map = new Map<string, { suma: number; count: number }>()
  for (const p of peliculas) {
    if (p.nota_imdb === null) continue
    for (const nombre of keyFn(p)) {
      if (!nombre) continue
      const e = map.get(nombre) ?? { suma: 0, count: 0 }
      e.suma += p.nota_imdb
      e.count++
      map.set(nombre, e)
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.count >= min)
    .map(([nombre, v]) => ({ nombre, avg: +(v.suma / v.count).toFixed(2), count: v.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 15)
}

function computeAvgByKey(
  peliculas: PeliculaRow[],
  keyFn: (p: PeliculaRow) => string[],
): StatEntry[] {
  const map = new Map<string, { suma: number; count: number }>()
  for (const p of peliculas) {
    if (p.nota_imdb === null) continue
    for (const k of keyFn(p)) {
      if (!k) continue
      const e = map.get(k) ?? { suma: 0, count: 0 }
      e.suma += p.nota_imdb
      e.count++
      map.set(k, e)
    }
  }
  return Array.from(map.entries())
    .map(([nombre, v]) => ({ nombre, avg: +(v.suma / v.count).toFixed(2), count: v.count }))
    .sort((a, b) => b.avg - a.avg)
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

  const toggle = (o: string) =>
    onChange(seleccionados.includes(o) ? seleccionados.filter(s => s !== o) : [...seleccionados, o])

  const filtradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))

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
          <div className="fixed inset-0 z-10" onClick={() => { setAbierto(false); setBusqueda('') }} />
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
              {filtradas.length === 0 ? (
                <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p>
              ) : filtradas.map(opcion => (
                <div
                  key={opcion}
                  onClick={() => toggle(opcion)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    seleccionados.includes(opcion) ? 'bg-yellow-400 border-yellow-400' : 'border-zinc-600'
                  }`}>
                    {seleccionados.includes(opcion) && <span className="text-zinc-950 text-xs font-bold">✓</span>}
                  </div>
                  <span className="truncate text-zinc-300">{opcion}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BaraAvg({ avg, max }: { avg: number; max: number }) {
  const pct = max > 0 ? Math.round((avg / max) * 100) : 0
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Estatuillas({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 items-center flex-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <img key={i} src="/oscar.png" alt="Oscar" className="h-5 w-auto" />
      ))}
    </div>
  )
}

export default function EstadisticasInteractivas({ peliculas, plataformas }: Props) {
  // Filter state
  const [busqueda, setBusqueda] = useState('')
  const [plataformasFiltro, setPlataformasFiltro] = useState<string[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [generosFiltro, setGenerosFiltro] = useState<string[]>([])
  const [directoresFiltro, setDirectoresFiltro] = useState<string[]>([])
  const [actoresFiltro, setActoresFiltro] = useState<string[]>([])
  const [compositoresFiltro, setCompositoresFiltro] = useState<string[]>([])
  const [soloReviews, setSoloReviews] = useState(false)

  // Section tabs
  const [tabEvaluado, setTabEvaluado] = useState<TipoEvaluado>('directores')
  const [tabOscars, setTabOscars] = useState<TipoEvaluado>('directores')
  const [platSeleccionada, setPlatSeleccionada] = useState(plataformas[0]?.id ?? '')

  // Filter options from all movies
  const generosDisponibles = useMemo(() => {
    const set = new Set<string>()
    peliculas.forEach(p => p.generos.forEach(g => set.add(g)))
    return Array.from(set).sort()
  }, [peliculas])

  const directoresDisponibles = useMemo(() => {
    const set = new Set<string>()
    peliculas.forEach(p => { if (p.director) set.add(p.director) })
    return Array.from(set).sort()
  }, [peliculas])

  const actoresDisponibles = useMemo(() => {
    const set = new Set<string>()
    peliculas.forEach(p => {
      if (p.actores) p.actores.split(',').forEach(a => { const t = a.trim(); if (t) set.add(t) })
    })
    return Array.from(set).sort()
  }, [peliculas])

  const compositoresDisponibles = useMemo(() => {
    const set = new Set<string>()
    peliculas.forEach(p => { if (p.compositor) set.add(p.compositor) })
    return Array.from(set).sort()
  }, [peliculas])

  // Filtered movies
  const peliculasFiltradas = useMemo(() => peliculas.filter(p => {
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
    return matchBusqueda && matchPlataforma && matchCategoria && matchGenero && matchDirector && matchActor && matchCompositor && matchReview
  }), [peliculas, busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, soloReviews])

  const hayFiltros = !!(busqueda || plataformasFiltro.length || categoriasFiltro.length ||
    generosFiltro.length || directoresFiltro.length || actoresFiltro.length || compositoresFiltro.length || soloReviews)

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([])
    setGenerosFiltro([]); setDirectoresFiltro([]); setActoresFiltro([])
    setCompositoresFiltro([]); setSoloReviews(false)
  }

  // ── Summary stats (from filtered) ──────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const conImdb = peliculasFiltradas.filter(p => p.nota_imdb !== null)
    const conOscars = peliculasFiltradas.filter(p => p.oscars && p.oscars !== 'N/A')
    const reviewsAutor = peliculasFiltradas.filter(p => p.es_review_autor).length
    const totalEntradas = peliculasFiltradas.reduce((acc, p) => acc + p.plataformas.length, 0)
    return { conImdb, conOscars, reviewsAutor, totalEntradas }
  }, [peliculasFiltradas])

  // ── IMDB distribution ──────────────────────────────────────────────────────
  const imdbRanges = useMemo((): [string, number][] => {
    const ranges: [string, number][] = [
      ['< 6', 0], ['6 – 7', 0], ['7 – 8', 0], ['8 – 9', 0], ['≥ 9', 0], ['Sin nota', 0],
    ]
    peliculasFiltradas.forEach(p => {
      const n = p.nota_imdb
      if (n === null) ranges[5][1]++
      else if (n < 6) ranges[0][1]++
      else if (n < 7) ranges[1][1]++
      else if (n < 8) ranges[2][1]++
      else if (n < 9) ranges[3][1]++
      else ranges[4][1]++
    })
    return ranges
  }, [peliculasFiltradas])
  const maxImdb = Math.max(...imdbRanges.map(([, v]) => v), 1)

  // ── Por categoría ──────────────────────────────────────────────────────────
  const porCategoria = useMemo(() => {
    const catMap = new Map<string, number>()
    peliculasFiltradas.forEach(p => {
      const cat = p.categoria || 'Sin categoría'
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
    })
    return Array.from(catMap.entries()).sort(([, a], [, b]) => b - a)
  }, [peliculasFiltradas])
  const maxCategoria = porCategoria[0]?.[1] ?? 1

  // ── Top géneros ────────────────────────────────────────────────────────────
  const topGeneros = useMemo(() => {
    const genCountMap = new Map<string, number>()
    peliculasFiltradas.forEach(p => p.generos.forEach(g => genCountMap.set(g, (genCountMap.get(g) ?? 0) + 1)))
    return Array.from(genCountMap.entries()).sort(([, a], [, b]) => b - a).slice(0, 10)
  }, [peliculasFiltradas])
  const maxGenero = topGeneros[0]?.[1] ?? 1

  // ── Oscar highlights ───────────────────────────────────────────────────────
  const topOscarsMovies = useMemo(() =>
    summaryStats.conOscars
      .filter(p => p.nota_imdb !== null)
      .sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
      .slice(0, 8),
    [summaryStats.conOscars])

  // ── Platform counts ────────────────────────────────────────────────────────
  const statsPlataformas = useMemo(() => {
    const counts: Record<string, number> = {}
    plataformas.forEach(p => { counts[p.id] = 0 })
    peliculasFiltradas.forEach(p => p.plataformas.forEach(plat => {
      if (plat in counts) counts[plat]++
    }))
    return counts
  }, [peliculasFiltradas, plataformas])
  const maxPlataforma = Math.max(...Object.values(statsPlataformas), 1)

  // ── Interactive stats ──────────────────────────────────────────────────────
  const mejoresEvaluados = useMemo(() => ({
    directores: computeRanking(peliculasFiltradas, p => p.director ? [p.director] : []),
    actores: computeRanking(peliculasFiltradas, p => p.actores?.split(',').map(a => a.trim()).filter(Boolean) ?? []),
    compositores: computeRanking(peliculasFiltradas, p => p.compositor ? [p.compositor] : []),
  }), [peliculasFiltradas])

  const oscarsPersonas = useMemo(() => {
    const dirs = new Map<string, number>()
    const comps = new Map<string, number>()
    const acts = new Map<string, number>()
    peliculasFiltradas.forEach(p => {
      if (p.director && p.director_oscars != null && p.director_oscars > 0)
        dirs.set(p.director, Math.max(dirs.get(p.director) ?? 0, p.director_oscars))
      if (p.compositor && p.compositor_oscars != null && p.compositor_oscars > 0)
        comps.set(p.compositor, Math.max(comps.get(p.compositor) ?? 0, p.compositor_oscars))
      if (p.actores_oscars)
        Object.entries(p.actores_oscars).forEach(([a, c]) => { if (c > 0) acts.set(a, Math.max(acts.get(a) ?? 0, c)) })
    })
    const toArr = (m: Map<string, number>): OscarEntry[] =>
      Array.from(m.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count).slice(0, 15)
    return { directores: toArr(dirs), compositores: toArr(comps), actores: toArr(acts) }
  }, [peliculasFiltradas])

  const porPlataforma = useMemo(() => {
    const result: Record<string, PlatStats> = {}
    for (const plat of plataformas) {
      const platMovies = peliculasFiltradas.filter(p => p.plataformas.includes(plat.id))
      result[plat.id] = {
        generos: computeAvgByKey(platMovies, p => p.generos),
        categorias: computeAvgByKey(platMovies, p => [p.categoria || 'Sin categoría']),
        directores: computeRanking(platMovies, p => p.director ? [p.director] : [], 2).slice(0, 8),
        actores: computeRanking(platMovies, p => p.actores?.split(',').map(a => a.trim()).filter(Boolean) ?? [], 2).slice(0, 8),
        totalMovies: platMovies.filter(p => p.generos.length > 0).length,
        enriquecidas: platMovies.filter(p => p.director !== null).length,
        totalEnPlataforma: platMovies.length,
      }
    }
    return result
  }, [peliculasFiltradas, plataformas])

  const ranking = mejoresEvaluados[tabEvaluado]
  const maxRankingAvg = ranking[0]?.avg ?? 10
  const platStats = porPlataforma[platSeleccionada]
  const oscarsLista = oscarsPersonas[tabOscars]

  return (
    <>
      {/* === Filtros === */}
      <div className="mb-10 border border-zinc-800 bg-zinc-900/50 rounded-xl p-5">
        <div className="flex flex-wrap gap-3 mb-3">
          <input
            type="text"
            placeholder="Buscar película, director, actor, género..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm w-72 text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <MultiSelect label="Plataforma" opciones={plataformas.map(p => p.id)} seleccionados={plataformasFiltro} onChange={setPlataformasFiltro} />
          <MultiSelect label="Categoría" opciones={CATEGORIAS} seleccionados={categoriasFiltro} onChange={setCategoriasFiltro} />
          <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
          <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
          <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
          <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
          <button
            onClick={() => setSoloReviews(!soloReviews)}
            className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
              soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            Solo reviews CineBret
          </button>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="text-sm text-zinc-500 hover:text-white transition-colors px-2">
              Limpiar todo ✕
            </button>
          )}
        </div>
        {hayFiltros && (
          <p className="text-xs text-zinc-500">
            Mostrando estadísticas para{' '}
            <span className="text-white font-medium">{peliculasFiltradas.length}</span> de {peliculas.length} películas
          </p>
        )}
      </div>

      {/* === Números grandes === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'Películas en catálogo', value: peliculasFiltradas.length },
          { label: 'Entradas en plataformas', value: summaryStats.totalEntradas },
          { label: 'Con Oscars', value: summaryStats.conOscars.length },
          { label: 'Reviews CineBret', value: summaryStats.reviewsAutor },
        ].map(({ label, value }) => (
          <div key={label} className="border border-zinc-800 bg-zinc-900 rounded-xl p-5">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-sm text-zinc-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* === IMDB + Plataformas === */}
      <div className="grid md:grid-cols-2 gap-10 mb-12">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Notas IMDB</h2>
          <p className="text-xs text-zinc-500 mb-4">{summaryStats.conImdb.length} películas con nota registrada</p>
          <div className="space-y-3">
            {imdbRanges.map(([rango, count]) => (
              <div key={rango}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-300">{rango}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.round((count / maxImdb) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-4">Películas por plataforma</h2>
          <div className="space-y-3">
            {plataformas.map(plat => {
              const count = statsPlataformas[plat.id] ?? 0
              return (
                <div key={plat.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-300">{plat.nombre}</span>
                    <span className="text-zinc-500">{count} películas</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${plat.color} rounded-full`} style={{ width: `${Math.round((count / maxPlataforma) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* === Oscar highlights === */}
      {topOscarsMovies.length > 0 && (
        <div className="mb-12">
          <h2 className="text-lg font-bold text-white mb-1">Películas con Oscars</h2>
          <p className="text-xs text-zinc-500 mb-4">
            {summaryStats.conOscars.length} películas galardonadas — ordenadas por nota IMDB
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {topOscarsMovies.map(p => (
              <Link
                key={p.id}
                href={`/pelicula/${p.id}`}
                className="border border-zinc-800 bg-zinc-900 rounded-xl p-4 hover:border-zinc-600 transition-colors"
              >
                <p className="font-semibold text-white text-sm leading-snug mb-2 line-clamp-2">{p.titulo_ingles || p.titulo}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {p.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {p.nota_imdb}</span>}
                  <span className="flex items-center gap-1 text-yellow-500">
                    <img src="/oscar.png" alt="Oscar" className="h-3 w-auto" />
                    {p.oscars}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* === Top géneros + Por categoría === */}
      <div className="grid md:grid-cols-2 gap-10 mb-12">
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Top géneros</h2>
          <div className="space-y-3">
            {topGeneros.map(([genero, count]) => (
              <div key={genero}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-300">{genero}</span>
                  <span className="text-zinc-500">{count}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((count / maxGenero) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-4">Por categoría</h2>
          <div className="space-y-3">
            {porCategoria.map(([cat, count]) => (
              <div key={cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="truncate pr-2 text-zinc-300">{cat}</span>
                  <span className="text-zinc-500 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${Math.round((count / maxCategoria) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === Oscars por persona === */}
      <section className="mb-12">
        <h2 className="text-lg font-bold text-white mb-1">Hall of Fame — Oscars</h2>
        <p className="text-xs text-zinc-500 mb-4">Cantidad de Academy Awards ganados a lo largo de su carrera</p>

        <div className="flex gap-2 mb-6">
          {(['directores', 'actores', 'compositores'] as TipoEvaluado[]).map(tab => (
            <button
              key={tab}
              onClick={() => setTabOscars(tab)}
              className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                tabOscars === tab
                  ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {oscarsLista.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin datos aún — se completarán con el próximo enriquecimiento</p>
        ) : (
          <div className="space-y-2">
            {oscarsLista.map((entry, i) => (
              <div key={entry.nombre} className="flex items-center gap-4 py-3 border-b border-zinc-800">
                <span className="text-xs text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-white flex-1 font-medium truncate">{entry.nombre}</span>
                <Estatuillas count={entry.count} />
                <span className="text-xs text-zinc-500 shrink-0 w-16 text-right">
                  {entry.count} Oscar{entry.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === Mejores evaluados === */}
      <section className="mb-12">
        <h2 className="text-lg font-bold text-white mb-1">Mejores evaluados por IMDB</h2>
        <p className="text-xs text-zinc-500 mb-4">Mínimo 2 películas en el catálogo</p>

        <div className="flex gap-2 mb-6">
          {(['directores', 'actores', 'compositores'] as TipoEvaluado[]).map(tab => (
            <button
              key={tab}
              onClick={() => setTabEvaluado(tab)}
              className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                tabEvaluado === tab
                  ? 'border-zinc-200 bg-zinc-200 text-zinc-950 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {ranking.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay datos suficientes</p>
        ) : (
          <div className="space-y-2">
            {ranking.map((entry, i) => (
              <div key={entry.nombre} className="flex items-center gap-4 py-2 border-b border-zinc-800">
                <span className="text-xs text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-white flex-1 font-medium truncate">{entry.nombre}</span>
                <div className="w-28 shrink-0">
                  <BaraAvg avg={entry.avg} max={maxRankingAvg} />
                </div>
                <span className="text-xs text-yellow-400 font-bold w-10 text-right shrink-0">{entry.avg}</span>
                <span className="text-xs text-zinc-500 w-16 text-right shrink-0">
                  {entry.count} {entry.count === 1 ? 'película' : 'películas'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === Por plataforma === */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Análisis por plataforma</h2>

        <div className="flex flex-wrap gap-2 mb-6">
          {plataformas.map(plat => {
            const stats = porPlataforma[plat.id]
            const pctEnriq = stats && stats.totalEnPlataforma > 0
              ? Math.round((stats.enriquecidas / stats.totalEnPlataforma) * 100)
              : 0
            return (
              <button
                key={plat.id}
                onClick={() => setPlatSeleccionada(plat.id)}
                className={`border rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                  platSeleccionada === plat.id
                    ? `${plat.color} border-transparent text-white`
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                <div className="bg-white rounded px-1 py-0.5 shrink-0">
                  <img
                    src={`/${plat.id === 'amazon_prime' ? 'amazon_prime' : plat.id === 'disney_plus' ? 'disney_plus' : plat.id === 'hbo_max' ? 'hbo_max' : plat.id === 'apple_tv' ? 'apple_tv' : plat.id === 'paramount_plus' ? 'paramount_plus' : 'netflix'}.${['disney_plus', 'paramount_plus'].includes(plat.id) ? 'svg' : 'png'}`}
                    alt={plat.nombre}
                    className="h-3 w-auto object-contain"
                  />
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className={platSeleccionada === plat.id ? 'text-white/80' : 'text-zinc-500'}>
                    {statsPlataformas[plat.id] ?? 0} pelis
                  </span>
                  <span className={`text-xs ${platSeleccionada === plat.id ? 'text-white/60' : 'text-zinc-600'}`}>
                    {pctEnriq}% enriq.
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {!platStats || platStats.totalMovies === 0 ? (
          <p className="text-sm text-zinc-500">No hay películas en esta plataforma hoy</p>
        ) : (
          <>
            <div className="mb-10">
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Mapa de vibe por plataforma</h3>
              <p className="text-xs text-zinc-500 mb-4">Posición según distribución de categorías CineBret</p>
              <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl mx-auto" style={{ height: 320, maxWidth: 420 }}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-px bg-zinc-700" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-full w-px bg-zinc-700" />
                </div>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 italic max-w-16 leading-tight">Pa'l domingo de bajón</span>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 italic max-w-16 leading-tight text-right">Pa' quedar con el cerebro como licuadora</span>
                <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-zinc-500 italic whitespace-nowrap">Pa' saltar del sillón</span>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-zinc-500 italic whitespace-nowrap">Pa' llorar a moco tendido</span>
                {(() => {
                  const puntos = plataformas.map(plat => {
                    const platMovies = peliculasFiltradas.filter(p => p.plataformas.includes(plat.id))
                    let bajon = 0, licuadora = 0, sillon = 0, moco = 0
                    for (const p of platMovies) {
                      const w = p.nota_imdb ?? 0
                      const cat = p.categoria ?? ''
                      if (cat.includes('bajón')) bajon += w
                      else if (cat.includes('licuadora')) licuadora += w
                      else if (cat.includes('sillón')) sillon += w
                      else if (cat.includes('moco')) moco += w
                    }
                    const total = bajon + licuadora + sillon + moco
                    if (total === 0) return null
                    return { plat, x: (licuadora - bajon) / total, y: (sillon - moco) / total }
                  }).filter(Boolean) as { plat: Plataforma; x: number; y: number }[]

                  const xs = puntos.map(p => p.x)
                  const ys = puntos.map(p => p.y)
                  const minX = Math.min(...xs), maxX = Math.max(...xs)
                  const minY = Math.min(...ys), maxY = Math.max(...ys)
                  const rangeX = maxX - minX || 1
                  const rangeY = maxY - minY || 1

                  // Curva de potencia: normaliza a [-1,1] respecto al centro del rango,
                  // luego aplica |v|^0.55 manteniendo signo → amplifica los extremos
                  const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.55)

                  return puntos.map(({ plat, x, y }) => {
                    const midX = (minX + maxX) / 2
                    const midY = (minY + maxY) / 2
                    const normX = rangeX > 0 ? (x - midX) / (rangeX / 2) : 0
                    const normY = rangeY > 0 ? (y - midY) / (rangeY / 2) : 0
                    const left = `${50 + curve(normX) * 35}%`
                    const top = `${50 - curve(normY) * 35}%`
                    return (
                      <div
                        key={plat.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left, top }}
                        title={plat.nombre}
                      >
                        <div className="bg-white rounded px-1.5 py-0.5 shadow-lg opacity-70">
                          <img src={plat.logo} alt={plat.nombre} className="h-5 w-auto object-contain" />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
              {/* Géneros */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">Géneros</h3>
                <p className="text-xs text-zinc-500 mb-4">% de películas en la plataforma</p>
                {(() => {
                  const sorted = [...platStats.generos].sort((a, b) => b.count - a.count)
                  const top10 = sorted.slice(0, 10)
                  const siguientes3 = sorted.slice(10, 13)
                  return (
                    <>
                      <div className="space-y-2.5">
                        {top10.map(entry => {
                          const pct = Math.round((entry.count / platStats.totalMovies) * 100)
                          return (
                            <div key={entry.nombre}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="truncate pr-2 text-zinc-300">{entry.nombre}</span>
                                <div className="flex gap-2.5 shrink-0 text-xs">
                                  <span className="text-zinc-500">{entry.count} pelis</span>
                                  <span className="text-yellow-400 font-bold">⭐ {entry.avg}</span>
                                  <span className="text-zinc-400 w-8 text-right">{pct}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {siguientes3.length > 0 && (
                        <p className="text-xs text-zinc-600 italic mt-3">
                          {siguientes3.map(e => `${e.nombre} ${Math.round((e.count / platStats.totalMovies) * 100)}%`).join(' · ')}
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Directores */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">Directores</h3>
                <p className="text-xs text-zinc-500 mb-4">IMDB promedio · mínimo 2 películas en la plataforma</p>
                {platStats.directores.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sin datos suficientes</p>
                ) : (
                  <div className="space-y-1.5">
                    {platStats.directores.map((entry, i) => (
                      <div key={entry.nombre} className="flex items-center gap-3 py-2 border-b border-zinc-800">
                        <span className="text-xs text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-sm text-zinc-200 flex-1 truncate">{entry.nombre}</span>
                        <span className="text-xs text-yellow-400 font-bold shrink-0">⭐ {entry.avg}</span>
                        <span className="text-xs text-zinc-500 shrink-0">{entry.count}p</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actores */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">Actores</h3>
                <p className="text-xs text-zinc-500 mb-4">IMDB promedio · mínimo 2 películas en la plataforma</p>
                {platStats.actores.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sin datos suficientes</p>
                ) : (
                  <div className="space-y-1.5">
                    {platStats.actores.map((entry, i) => (
                      <div key={entry.nombre} className="flex items-center gap-3 py-2 border-b border-zinc-800">
                        <span className="text-xs text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                        <span className="text-sm text-zinc-200 flex-1 truncate">{entry.nombre}</span>
                        <span className="text-xs text-yellow-400 font-bold shrink-0">⭐ {entry.avg}</span>
                        <span className="text-xs text-zinc-500 shrink-0">{entry.count}p</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Categorías */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">Categorías CineBret</h3>
                <p className="text-xs text-zinc-500 mb-4">% de películas en la plataforma</p>
                {platStats.categorias.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sin datos suficientes</p>
                ) : (
                  <div className="space-y-2.5">
                    {[...platStats.categorias].sort((a, b) => b.count - a.count).map(entry => {
                      const pct = Math.round((entry.count / platStats.totalMovies) * 100)
                      return (
                        <div key={entry.nombre}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="truncate pr-2 text-zinc-300">{entry.nombre}</span>
                            <div className="flex gap-2.5 shrink-0 text-xs">
                              <span className="text-zinc-500">{entry.count} pelis</span>
                              <span className="text-zinc-400 w-8 text-right">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-zinc-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}
