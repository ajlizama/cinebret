import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import CatalogoInteractivo, { type Pelicula } from './CatalogoInteractivo'
import FeatureWidgets from '@/components/FeatureWidgets'

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

  const [watchProvidersRaw, catalogosRaw, peliculasRaw, seriesRaw, wpSeriesRaw] = await Promise.all([
    // Primary source: TMDB watch_providers (more accurate)
    fetchAllPages((from, to) =>
      supabase.from('watch_providers').select('pelicula_id, platform_key')
        .eq('provider_type', 'flatrate')
        .not('platform_key', 'is', null)
        .range(from, to)
    ),
    // Fallback: catalogos (scraping, less accurate)
    fetchAllPages((from, to) =>
      supabase.from('catalogos').select('pelicula_id, plataforma')
        .eq('fecha', fechaCatalogo).eq('activo', true).range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from('peliculas').select(`
        id, tmdb_id, titulo, titulo_ingles, titulo_latino, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, categoria, poster_path, backdrop_path, imdb_id, youtube_trailer_key, tagline, certification,
        enriquecimiento (es_review_autor, sello_bret, director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, generos, sinopsis_chilensis, video_clip_url, keywords)
      `).range(from, to)
    ),
    // Series
    fetchAllPages((from, to) =>
      supabase.from('series').select(`
        id, tmdb_id, titulo, titulo_ingles, titulo_latino, anio_inicio, nota_imdb, num_temporadas, num_episodios, estado, categoria, poster_path, backdrop_path, imdb_id, youtube_trailer_key, tagline, certification, episode_runtime, networks,
        enriquecimiento_series (director, actores, compositor, generos, sinopsis_chilensis, keywords, cast_json)
      `).range(from, to)
    ),
    // Watch providers for series
    fetchAllPages((from, to) =>
      supabase.from('watch_providers_series').select('serie_id, platform_key')
        .eq('provider_type', 'flatrate')
        .not('platform_key', 'is', null)
        .range(from, to)
    ),
  ])

  // Build platform map: prefer watch_providers (TMDB), fallback to catalogos
  const platMap: Record<string, string[]> = {}

  // First load watch_providers (TMDB - accurate)
  const moviesWithTmdbProviders = new Set<string>()
  watchProvidersRaw.forEach((wp: any) => {
    if (!wp.platform_key) return
    if (!platMap[wp.pelicula_id]) platMap[wp.pelicula_id] = []
    if (!platMap[wp.pelicula_id].includes(wp.platform_key)) {
      platMap[wp.pelicula_id].push(wp.platform_key)
    }
    moviesWithTmdbProviders.add(wp.pelicula_id)
  })

  // Then fill gaps with catalogos only for movies WITHOUT TMDB data
  catalogosRaw.forEach((c: any) => {
    if (moviesWithTmdbProviders.has(c.pelicula_id)) return // TMDB data takes priority
    if (!platMap[c.pelicula_id]) platMap[c.pelicula_id] = []
    if (!platMap[c.pelicula_id].includes(c.plataforma)) platMap[c.pelicula_id].push(c.plataforma)
  })

  const peliculas: Pelicula[] = peliculasRaw.map((p: any) => {
    const enr = p.enriquecimiento || {}
    return {
      id: p.id,
      tmdb_id: p.tmdb_id ?? null,
      titulo: p.titulo_latino || p.titulo,
      titulo_ingles: p.titulo_ingles ?? null,
      anio: p.anio ?? null,
      nota_imdb: p.nota_imdb ?? null,
      rt_score: p.rt_score ?? null,
      metacritic_score: p.metacritic_score ?? null,
      runtime: p.runtime ?? null,
      boxoffice: p.boxoffice ?? null,
      categoria: p.categoria ?? null,
      poster_path: p.poster_path ?? null,
      backdrop_path: p.backdrop_path ?? null,
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

  // Build series platform map
  const seriesPlatMap: Record<string, string[]> = {}
  wpSeriesRaw.forEach((wp: any) => {
    if (!wp.platform_key) return
    if (!seriesPlatMap[wp.serie_id]) seriesPlatMap[wp.serie_id] = []
    if (!seriesPlatMap[wp.serie_id].includes(wp.platform_key)) seriesPlatMap[wp.serie_id].push(wp.platform_key)
  })

  const series: Pelicula[] = seriesRaw.map((s: any) => {
    const enr = s.enriquecimiento_series || {}
    // Normalize actores array to comma-separated string (series DB stores as TEXT[])
    const actoresRaw = enr.actores
    const actoresNorm = Array.isArray(actoresRaw) ? actoresRaw.join(', ') : (actoresRaw ?? null)
    return {
      id: s.id,
      tmdb_id: s.tmdb_id ?? null,
      titulo: s.titulo_latino || s.titulo,
      titulo_ingles: s.titulo_ingles ?? null,
      anio: s.anio_inicio ?? null,
      nota_imdb: s.nota_imdb ?? null,
      rt_score: null,
      metacritic_score: null,
      runtime: s.episode_runtime ?? null,
      boxoffice: null,
      categoria: s.categoria ?? null,
      poster_path: s.poster_path ?? null,
      backdrop_path: s.backdrop_path ?? null,
      oscars: null,
      imdb_id: s.imdb_id ?? null,
      youtube_trailer_key: s.youtube_trailer_key ?? null,
      sinopsis: enr.sinopsis_chilensis ?? null,
      plataformas: seriesPlatMap[s.id] ?? [],
      es_review_autor: false,
      sello_bret: false,
      director: enr.director ?? null,
      director_oscars: null,
      actores: actoresNorm,
      actores_oscars: null,
      compositor: enr.compositor ?? null,
      compositor_oscars: null,
      generos: ((enr.generos as string[]) || []).map(normalizarGenero),
      video_clip_url: null,
      keywords: ((enr.keywords as string[]) || []),
      tagline: s.tagline ?? null,
      certification: s.certification ?? null,
      // Series-specific fields stored in existing Pelicula type
      num_temporadas: s.num_temporadas ?? null,
      num_episodios: s.num_episodios ?? null,
      estado: s.estado ?? null,
      networks: s.networks ?? null,
      _isSerie: true,
    } as Pelicula
  })

  // Fetch TMDB trending
  let trendingIds: number[] = []
  let trendingSeriesIds: number[] = []
  try {
    const tmdbKey = process.env.TMDB_API_KEY
    if (tmdbKey) {
      const pageNums = Array.from({ length: 30 }, (_, i) => i + 1)
      const [trendingMoviePages, trendingSeriesPages] = await Promise.all([
        Promise.all(pageNums.map(p =>
          fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=es-CL&page=${p}`, { next: { revalidate: 21600 } })
            .then(r => r.json()).catch(() => ({ results: [] }))
        )),
        Promise.all(pageNums.slice(0, 15).map(p =>
          fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${tmdbKey}&language=es-CL&page=${p}`, { next: { revalidate: 21600 } })
            .then(r => r.json()).catch(() => ({ results: [] }))
        )),
      ])
      trendingIds = trendingMoviePages.flatMap((d: any) => (d.results ?? []).map((m: any) => m.id as number))
      trendingSeriesIds = trendingSeriesPages.flatMap((d: any) => (d.results ?? []).map((m: any) => m.id as number))
    }
  } catch {}

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="inicio" />
      <CatalogoInteractivo peliculas={peliculas} series={series} trendingIds={trendingIds} trendingSeriesIds={trendingSeriesIds} widgetSlot={<FeatureWidgets />} />
    </main>
  )
}
