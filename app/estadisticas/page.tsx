import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import EstadisticasInteractivas, { type PeliculaRow, type AnalisisCatalogo } from './EstadisticasInteractivas'
import BackButton from '@/components/BackButton'

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
  // Usar la fecha más reciente disponible en catalogos (no necesariamente hoy)
  const { data: fechaRow } = await supabase
    .from('catalogos')
    .select('fecha')
    .eq('activo', true)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fechaCatalogo = fechaRow?.fecha ?? new Date().toISOString().split('T')[0]

  const [peliculasRaw, catalogosRaw, analisisRow] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('peliculas').select(`
        id, titulo, titulo_ingles, nota_imdb, oscars, categoria,
        enriquecimiento (director, actores, compositor, generos, review_autor)
      `).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('catalogos')
        .select('pelicula_id, plataforma')
        .eq('fecha', fechaCatalogo)
        .eq('activo', true)
        .range(from, to)
    ),
    supabase
      .from('analisis_catalogo')
      .select('plataformas, comparativo, fecha_catalogo, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const analisis = analisisRow.data as {
    plataformas: Record<string, string>
    comparativo: string
    fecha_catalogo: string
    created_at: string
  } | null

  const platMap: Record<string, string[]> = {}
  catalogosRaw.forEach(c => {
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    if (!platMap[c.pelicula_id].includes(c.plataforma)) platMap[c.pelicula_id].push(c.plataforma)
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
      director_oscars: null,
      actores: (enr.actores as string) || null,
      actores_oscars: null,
      compositor: (enr.compositor as string) || null,
      compositor_oscars: null,
      generos: ((enr.generos as string[]) || []).map(normalizarGenero),
      plataformas: platMap[p.id] ?? [],
      es_review_autor: !!(enr.review_autor as string),
    }
  })

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav  />

      <div className="max-w-6xl mx-auto px-6 py-10">
        <BackButton />
        <EstadisticasInteractivas
          peliculas={peliculas}
          plataformas={PLATAFORMAS}
          analisis={analisis}
        />
      </div>
    </main>
  )
}
