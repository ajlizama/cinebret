import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import CatalogoInteractivo, { type Pelicula } from './CatalogoInteractivo'

export const revalidate = 3600

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

const ICONOS = [
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
]

export default async function CatalogoPage() {
  // Usar la última fecha disponible para evitar catálogo vacío por desfase UTC vs Chile
  const { data: ultimaFechaRow } = await supabase
    .from('catalogos')
    .select('fecha')
    .eq('activo', true)
    .order('fecha', { ascending: false })
    .limit(1)
    .single()
  const fechaCatalogo = ultimaFechaRow?.fecha ?? new Date().toISOString().split('T')[0]

  const [catalogosRaw, peliculasRaw] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('catalogos').select('pelicula_id, plataforma')
        .eq('fecha', fechaCatalogo).eq('activo', true).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from('peliculas').select(`
        id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, categoria, poster_path,
        enriquecimiento (es_review_autor, sello_bret, director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, generos, sinopsis_chilensis)
      `).range(from, to)
    ),
  ])

  const platMap: Record<string, string[]> = {}
  catalogosRaw.forEach((c: any) => {
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    platMap[c.pelicula_id].push(c.plataforma)
  })

  const peliculasEnPlataforma = peliculasRaw.filter((p: any) => platMap[p.id])

  const peliculas: Pelicula[] = peliculasEnPlataforma.map((p: any) => {
    const enr = p.enriquecimiento || {}
    return {
      id: p.id,
      titulo: p.titulo,
      titulo_ingles: p.titulo_ingles ?? null,
      anio: p.anio ?? null,
      nota_imdb: p.nota_imdb ?? null,
      rt_score: p.rt_score ?? null,
      metacritic_score: p.metacritic_score ?? null,
      runtime: p.runtime ?? null,
      boxoffice: p.boxoffice ?? null,
      categoria: p.categoria ?? null,
      poster_path: p.poster_path ?? null,
      oscars: p.oscars ?? null,
      sinopsis: enr.sinopsis_chilensis ?? null,
      plataformas: platMap[p.id] ?? [],
      es_review_autor: enr.es_review_autor || false,
      sello_bret: enr.sello_bret || false,
      director: enr.director ?? null,
      director_oscars: enr.director_oscars ?? null,
      actores: enr.actores ?? null,
      actores_oscars: enr.actores_oscars ?? null,
      compositor: enr.compositor ?? null,
      compositor_oscars: enr.compositor_oscars ?? null,
      generos: ((enr.generos as string[]) || []).map(normalizarGenero),
    }
  })

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="catalogo" />

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Catálogo</h1>
          <p className="text-zinc-500 text-sm mb-6">{peliculas.length} películas disponibles</p>
          <div className="hidden md:flex items-center justify-center gap-4 flex-wrap">
            {ICONOS.map(file => (
              <img key={file} src={`/iconos/${file}`} alt="" className="h-16 w-16 object-cover rounded-xl" />
            ))}
          </div>
        </div>

        <CatalogoInteractivo peliculas={peliculas} />
      </div>
    </main>
  )
}
