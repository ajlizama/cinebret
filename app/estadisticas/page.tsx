import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import EstadisticasInteractivas, { type PeliculaRow } from './EstadisticasInteractivas'

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
  { id: 'netflix', nombre: 'Netflix', color: 'bg-red-600', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', color: 'bg-blue-700', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO Max', color: 'bg-purple-700', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', color: 'bg-cyan-600', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', color: 'bg-gray-800', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', color: 'bg-blue-500', logo: '/paramount_plus.svg' },
]

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
        id, titulo, titulo_ingles, nota_imdb, oscars, categoria,
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

  const platMap: Record<string, string[]> = {}
  catalogosRaw.forEach(c => {
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    platMap[c.pelicula_id].push(c.plataforma)
  })

  const peliculas: PeliculaRow[] = peliculasRaw.map((p: any) => {
    const enr = p.enriquecimiento ?? {}
    return {
      id: p.id,
      titulo: p.titulo,
      titulo_ingles: p.titulo_ingles as string | null,
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

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="estadisticas" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Estadísticas</h1>
          <p className="text-zinc-500 text-sm">Resumen del catálogo CineBret</p>
        </div>

        <EstadisticasInteractivas
          peliculas={peliculas}
          plataformas={PLATAFORMAS}
        />
      </div>
    </main>
  )
}
