import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import InicioPrueba from './InicioPrueba'

export const revalidate = 21600

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

type SimpleMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  titulo_latino: string | null
  poster_path: string | null
  backdrop_path: string | null
  nota_imdb: number | null
  anio: number | null
  categoria: string | null
  plataformas: string[]
  generos: string[]
  sinopsis: string | null
  _isSerie?: boolean
}

export default async function InicioPruebaPage() {
  // Fetch trending movies
  let trendingMovies: SimpleMovie[] = []
  try {
    const tmdbKey = process.env.TMDB_API_KEY
    if (tmdbKey) {
      const pages = await Promise.all(
        Array.from({ length: 5 }, (_, i) => i + 1).map(p =>
          fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=es-CL&page=${p}`, { next: { revalidate: 21600 } })
            .then(r => r.json()).catch(() => ({ results: [] }))
        )
      )
      const tmdbIds = pages.flatMap((d: any) => (d.results ?? []).map((m: any) => m.id))

      // Get these movies from our DB
      const { data: pels } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, titulo_latino, poster_path, backdrop_path, nota_imdb, anio, categoria, tmdb_id')
        .in('tmdb_id', tmdbIds.slice(0, 30))
        .not('poster_path', 'is', null)

      if (pels) {
        // Get enrichment
        const { data: enrs } = await supabase.from('enriquecimiento').select('pelicula_id, generos, sinopsis_chilensis').in('pelicula_id', pels.map(p => p.id))
        const enrMap = new Map((enrs || []).map(e => [e.pelicula_id, e]))

        // Get platforms
        const { data: wps } = await supabase.from('watch_providers').select('pelicula_id, platform_key').in('pelicula_id', pels.map(p => p.id)).eq('provider_type', 'flatrate').not('platform_key', 'is', null)
        const wpMap = new Map<string, string[]>()
        ;(wps || []).forEach((w: any) => {
          if (!wpMap.has(w.pelicula_id)) wpMap.set(w.pelicula_id, [])
          if (!wpMap.get(w.pelicula_id)!.includes(w.platform_key)) wpMap.get(w.pelicula_id)!.push(w.platform_key)
        })

        // Sort by trending order
        const orderMap = new Map(tmdbIds.map((id: number, i: number) => [id, i]))
        trendingMovies = pels
          .sort((a: any, b: any) => (orderMap.get(a.tmdb_id) ?? 99) - (orderMap.get(b.tmdb_id) ?? 99))
          .map((p: any) => ({
            id: p.id,
            titulo: p.titulo_latino || p.titulo,
            titulo_ingles: p.titulo_ingles,
            titulo_latino: p.titulo_latino,
            poster_path: p.poster_path,
            backdrop_path: p.backdrop_path,
            nota_imdb: p.nota_imdb,
            anio: p.anio,
            categoria: p.categoria,
            plataformas: wpMap.get(p.id) || [],
            generos: (enrMap.get(p.id) as any)?.generos || [],
            sinopsis: (enrMap.get(p.id) as any)?.sinopsis_chilensis || null,
          }))
      }
    }
  } catch {}

  // Fetch top rated for "best" section
  const topRated = await fetchAllPages((from, to) =>
    supabase.from('peliculas')
      .select('id, titulo, titulo_ingles, titulo_latino, poster_path, backdrop_path, nota_imdb, anio, categoria')
      .not('poster_path', 'is', null)
      .gte('nota_imdb', 8.5)
      .order('nota_imdb', { ascending: false })
      .range(from, to)
  )

  const topMovies: SimpleMovie[] = topRated.slice(0, 20).map((p: any) => ({
    id: p.id, titulo: p.titulo_latino || p.titulo, titulo_ingles: p.titulo_ingles,
    titulo_latino: p.titulo_latino, poster_path: p.poster_path, backdrop_path: p.backdrop_path,
    nota_imdb: p.nota_imdb, anio: p.anio, categoria: p.categoria, plataformas: [], generos: [], sinopsis: null,
  }))

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav active="inicio" />
      <InicioPrueba trending={trendingMovies} topRated={topMovies} />
    </main>
  )
}
