import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import CatalogoInteractivo, { type Pelicula } from './CatalogoInteractivo'

export const revalidate = 21600 // 6 hours

const GENEROS_NORMALIZE: Record<string, string> = {
  // English → Spanish
  'Action': 'Acción', 'Adventure': 'Aventura', 'Animation': 'Animación',
  'Comedy': 'Comedia', 'Crime': 'Crimen', 'Documentary': 'Documental',
  'Drama': 'Drama', 'Fantasy': 'Fantasía', 'History': 'Historia',
  'Horror': 'Terror', 'Music': 'Música', 'Mystery': 'Misterio',
  'Romance': 'Romance', 'Science Fiction': 'Ciencia ficción', 'Sci-Fi': 'Ciencia ficción',
  'Thriller': 'Thriller', 'War': 'Guerra', 'Western': 'Western',
  'Family': 'Familia', 'Biography': 'Biografía', 'Sport': 'Deporte', 'Musical': 'Musical',
  'Sports': 'Deporte',
  // Variantes sin tilde / mayúsculas
  'Accion': 'Acción', 'Animacion': 'Animación', 'Biografia': 'Biografía',
  'Biográfico': 'Biografía', 'Fantasia': 'Fantasía', 'Familiar': 'Familia',
  'Ciencia Ficción': 'Ciencia ficción', 'Ciencia Ficcion': 'Ciencia ficción',
  'Musica': 'Música', 'Deportes': 'Deporte',
  'Unknown': 'Otros', 'Desconocido': 'Otros',
}
const normalizarGenero = (g: string) => GENEROS_NORMALIZE[g] ?? g

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


export default async function CatalogoPage() {
  const { data: ultimaFechaRow } = await supabase
    .from('catalogos')
    .select('fecha')
    .eq('activo', true)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const chileDate = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().split('T')[0]
  const fechaCatalogo = ultimaFechaRow?.fecha ?? chileDate

  const [catalogosRaw, peliculasRaw] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase.from('catalogos').select('pelicula_id, plataforma')
        .eq('fecha', fechaCatalogo).eq('activo', true).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from('peliculas').select(`
        id, tmdb_id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, categoria, poster_path, imdb_id, youtube_trailer_key, tagline, certification,
        enriquecimiento (es_review_autor, sello_bret, director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, generos, sinopsis_chilensis, video_clip_url, keywords)
      `).range(from, to)
    ),
  ])

  const platMap: Record<string, string[]> = {}
  catalogosRaw.forEach((c: any) => {
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    if (!platMap[c.pelicula_id].includes(c.plataforma)) platMap[c.pelicula_id].push(c.plataforma)
  })

  const peliculas: Pelicula[] = peliculasRaw.map((p: any) => {
    const enr = p.enriquecimiento || {}
    return {
      id: p.id,
      tmdb_id: p.tmdb_id ?? null,
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
      imdb_id: p.imdb_id ?? null,
      youtube_trailer_key: p.youtube_trailer_key ?? null,
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
      video_clip_url: enr.video_clip_url ?? null,
      keywords: ((enr.keywords as string[]) || []),
      tagline: p.tagline ?? null,
      certification: p.certification ?? null,
    }
  })

  // Fetch TMDB trending (20 pages = 400 movies)
  let trendingIds: number[] = []
  try {
    const tmdbKey = process.env.TMDB_API_KEY
    if (tmdbKey) {
      const pageNums = Array.from({ length: 20 }, (_, i) => i + 1)
      const pages = await Promise.all(
        pageNums.map(p =>
          fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=es-CL&page=${p}`, { next: { revalidate: 21600 } })
            .then(r => r.json()).catch(() => ({ results: [] }))
        )
      )
      trendingIds = pages.flatMap((d: any) => (d.results ?? []).map((m: any) => m.id as number))
    }
  } catch {}

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="inicio" />
      <CatalogoInteractivo peliculas={peliculas} trendingIds={trendingIds} />
    </main>
  )
}
