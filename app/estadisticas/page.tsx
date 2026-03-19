import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import EstadisticasInteractivas from './EstadisticasInteractivas'

const GENEROS_EN_A_ES: Record<string, string> = {
  'Action': 'Acción', 'Adventure': 'Aventura', 'Animation': 'Animación',
  'Comedy': 'Comedia', 'Crime': 'Crimen', 'Documentary': 'Documental',
  'Drama': 'Drama', 'Fantasy': 'Fantasía', 'History': 'Historia',
  'Horror': 'Terror', 'Music': 'Música', 'Mystery': 'Misterio',
  'Romance': 'Romance', 'Science Fiction': 'Ciencia ficción', 'Sci-Fi': 'Ciencia ficción',
  'Thriller': 'Thriller', 'War': 'Guerra', 'Western': 'Western',
  'Family': 'Familia', 'Biography': 'Biografía', 'Sport': 'Deporte', 'Musical': 'Musical',
}
const normalizarGenero = (g: string) => GENEROS_EN_A_ES[g] ?? g

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700' },
  { id: 'amazon_prime', nombre: 'Prime', color: 'bg-cyan-600' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-gray-800' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500' },
]

type RankingEntry = { nombre: string; avg: number; count: number }
type StatEntry = { nombre: string; avg: number; count: number }

type PeliculaRow = {
  id: string
  titulo: string
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

async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data } = await queryFn(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return results
}

export default async function EstadisticasPage() {
  const hoy = new Date().toISOString().split('T')[0]

  const [peliculasRaw, catalogosRaw] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('peliculas').select(`
        id, titulo, nota_imdb, oscars, categoria,
        enriquecimiento (director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, generos, es_review_autor)
      `).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('catalogos')
        .select('pelicula_id, plataforma')
        .eq('fecha', hoy)
        .eq('activo', true)
        .range(from, to)
    ),
  ])

  // Build platform map
  const platMap: Record<string, string[]> = {}
  catalogosRaw.forEach(c => {
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    platMap[c.pelicula_id].push(c.plataforma)
  })

  // Merge into single enriched array
  const peliculas: PeliculaRow[] = peliculasRaw.map((p: any) => {
    const enr = p.enriquecimiento ?? {}
    return {
      id: p.id,
      titulo: p.titulo,
      nota_imdb: p.nota_imdb as number | null,
      oscars: p.oscars as string | null,
      categoria: p.categoria as string | null,
      director: (enr.director as string) || null,
      director_oscars: (enr.director_oscars as number) ?? null,
      actores: (enr.actores as string) || null,
      actores_oscars: (enr.actores_oscars as Record<string, number>) || null,
      compositor: (enr.compositor as string) || null,
      compositor_oscars: (enr.compositor_oscars as number) ?? null,
      generos: ((enr.generos as string[]) || []).map(normalizarGenero),
      plataformas: platMap[p.id] ?? [],
      es_review_autor: (enr.es_review_autor as boolean) || false,
    }
  })

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalPeliculas = peliculas.length
  const conImdb = peliculas.filter(p => p.nota_imdb !== null)
  const conOscars = peliculas.filter(p => p.oscars && p.oscars !== 'N/A')
  const reviewsAutor = peliculas.filter(p => p.es_review_autor).length
  const totalEntradas = peliculas.reduce((acc, p) => acc + p.plataformas.length, 0)

  // ── Platform counts ────────────────────────────────────────────────────────
  const statsPlataformas: Record<string, number> = {}
  PLATAFORMAS.forEach(p => { statsPlataformas[p.id] = 0 })
  peliculas.forEach(p => p.plataformas.forEach(plat => {
    if (plat in statsPlataformas) statsPlataformas[plat]++
  }))
  const maxPlataforma = Math.max(...Object.values(statsPlataformas), 1)

  // ── IMDB distribution ──────────────────────────────────────────────────────
  const imdbRanges: [string, number][] = [
    ['< 6', 0], ['6 – 7', 0], ['7 – 8', 0], ['8 – 9', 0], ['≥ 9', 0], ['Sin nota', 0],
  ]
  peliculas.forEach(p => {
    const n = p.nota_imdb
    if (n === null) imdbRanges[5][1]++
    else if (n < 6) imdbRanges[0][1]++
    else if (n < 7) imdbRanges[1][1]++
    else if (n < 8) imdbRanges[2][1]++
    else if (n < 9) imdbRanges[3][1]++
    else imdbRanges[4][1]++
  })
  const maxImdb = Math.max(...imdbRanges.map(([, v]) => v), 1)

  // ── Por categoría ──────────────────────────────────────────────────────────
  const catMap = new Map<string, number>()
  peliculas.forEach(p => {
    const cat = p.categoria || 'Sin categoría'
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
  })
  const porCategoria = Array.from(catMap.entries()).sort(([, a], [, b]) => b - a)
  const maxCategoria = porCategoria[0]?.[1] ?? 1

  // ── Top géneros globales ───────────────────────────────────────────────────
  const genCountMap = new Map<string, number>()
  peliculas.forEach(p => p.generos.forEach(g => genCountMap.set(g, (genCountMap.get(g) ?? 0) + 1)))
  const topGeneros = Array.from(genCountMap.entries()).sort(([, a], [, b]) => b - a).slice(0, 10)
  const maxGenero = topGeneros[0]?.[1] ?? 1

  // ── Oscar highlights ───────────────────────────────────────────────────────
  const topOscarsMovies = conOscars
    .filter(p => p.nota_imdb !== null)
    .sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
    .slice(0, 8)
    .map(p => ({ id: p.id, titulo: p.titulo, nota_imdb: p.nota_imdb, oscars: p.oscars }))

  // ── Oscars por persona ─────────────────────────────────────────────────────
  const oscarsDirectores = new Map<string, number>()
  const oscarsCompositores = new Map<string, number>()
  const oscarsActores = new Map<string, number>()

  peliculas.forEach(p => {
    if (p.director && p.director_oscars != null && p.director_oscars > 0)
      oscarsDirectores.set(p.director, Math.max(oscarsDirectores.get(p.director) ?? 0, p.director_oscars))
    if (p.compositor && p.compositor_oscars != null && p.compositor_oscars > 0)
      oscarsCompositores.set(p.compositor, Math.max(oscarsCompositores.get(p.compositor) ?? 0, p.compositor_oscars))
    if (p.actores_oscars) {
      Object.entries(p.actores_oscars).forEach(([actor, count]) => {
        if (count > 0)
          oscarsActores.set(actor, Math.max(oscarsActores.get(actor) ?? 0, count))
      })
    }
  })

  const oscarsPersonas = {
    directores: Array.from(oscarsDirectores.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    compositores: Array.from(oscarsCompositores.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    actores: Array.from(oscarsActores.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count).slice(0, 15),
  }

  // ── Mejores evaluados ──────────────────────────────────────────────────────
  const mejoresEvaluados = {
    directores: computeRanking(peliculas, p => p.director ? [p.director] : []),
    actores: computeRanking(
      peliculas,
      p => p.actores?.split(',').map(a => a.trim()).filter(Boolean) ?? [],
    ),
    compositores: computeRanking(peliculas, p => p.compositor ? [p.compositor] : []),
  }

  // ── Por plataforma ─────────────────────────────────────────────────────────
  const porPlataforma: Record<string, {
    generos: StatEntry[]
    categorias: StatEntry[]
    directores: RankingEntry[]
    actores: RankingEntry[]
    totalMovies: number
  }> = {}

  for (const plat of PLATAFORMAS) {
    const platMovies = peliculas.filter(p => p.plataformas.includes(plat.id))
    porPlataforma[plat.id] = {
      generos: computeAvgByKey(platMovies, p => p.generos),
      categorias: computeAvgByKey(platMovies, p => [p.categoria || 'Sin categoría']),
      directores: computeRanking(platMovies, p => p.director ? [p.director] : [], 2).slice(0, 8),
      actores: computeRanking(
        platMovies,
        p => p.actores?.split(',').map(a => a.trim()).filter(Boolean) ?? [],
        2,
      ).slice(0, 8),
      totalMovies: platMovies.filter(p => p.generos.length > 0).length,
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950">
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/" className="hover:text-white transition-colors">Inicio</Link>
            <Link href="/catalogo" className="hover:text-white transition-colors">Catálogo</Link>
            <Link href="/cambios" className="hover:text-white transition-colors">Cambios</Link>
            <Link href="/estadisticas" className="text-white font-medium">Estadísticas</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-1">Estadísticas</h1>
          <p className="text-zinc-500 text-sm">Resumen del catálogo CineBret</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: 'Películas en catálogo', value: totalPeliculas },
            { label: 'Entradas en plataformas', value: totalEntradas },
            { label: 'Con Oscars', value: conOscars.length },
            { label: 'Reviews CineBret', value: reviewsAutor },
          ].map(({ label, value }) => (
            <div key={label} className="border border-zinc-800 bg-zinc-900 rounded-xl p-5">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-sm text-zinc-500 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* IMDB + Plataformas */}
        <div className="grid md:grid-cols-2 gap-10 mb-12">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Notas IMDB</h2>
            <p className="text-xs text-zinc-500 mb-4">{conImdb.length} películas con nota registrada</p>
            <div className="space-y-3">
              {imdbRanges.map(([rango, count]) => (
                <div key={rango}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-300">{rango}</span>
                    <span className="text-zinc-500">{count}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full"
                      style={{ width: `${Math.round((count / maxImdb) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white mb-4">Películas por plataforma</h2>
            <div className="space-y-3">
              {PLATAFORMAS.map(plat => {
                const count = statsPlataformas[plat.id] ?? 0
                return (
                  <div key={plat.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-300">{plat.nombre}</span>
                      <span className="text-zinc-500">{count} películas</span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${plat.color} rounded-full`}
                        style={{ width: `${Math.round((count / maxPlataforma) * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Oscar highlights */}
        {topOscarsMovies.length > 0 && (
          <div className="mb-12">
            <h2 className="text-lg font-bold text-white mb-1">Películas con Oscars</h2>
            <p className="text-xs text-zinc-500 mb-4">
              {conOscars.length} películas galardonadas — ordenadas por nota IMDB
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {topOscarsMovies.map(p => (
                <Link
                  key={p.id}
                  href={`/pelicula/${p.id}`}
                  className="border border-zinc-800 bg-zinc-900 rounded-xl p-4 hover:border-zinc-600 transition-colors"
                >
                  <p className="font-semibold text-white text-sm leading-snug mb-2 line-clamp-2">{p.titulo}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {p.nota_imdb && (
                      <span className="text-yellow-400 font-bold">⭐ {p.nota_imdb}</span>
                    )}
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

        {/* Top géneros + Por categoría */}
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
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.round((count / maxGenero) * 100)}%` }}
                    />
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
                    <div
                      className="h-full bg-zinc-400 rounded-full"
                      style={{ width: `${Math.round((count / maxCategoria) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive sections */}
        <EstadisticasInteractivas
          mejoresEvaluados={mejoresEvaluados}
          porPlataforma={porPlataforma}
          plataformas={PLATAFORMAS}
          statsPlataformas={statsPlataformas}
          oscarsPersonas={oscarsPersonas}
        />
      </div>
    </main>
  )
}
