import { NextResponse } from 'next/server'

export const revalidate = 3600 // 1 hour cache

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 14: 'Fantasía',
  36: 'Historia', 27: 'Terror', 10402: 'Música', 9648: 'Misterio',
  10749: 'Romance', 878: 'Ciencia ficción', 53: 'Thriller',
  10752: 'Guerra', 37: 'Western', 10751: 'Familia',
  10770: 'TV Movie',
}

export async function GET() {
  const tmdbKey = process.env.TMDB_API_KEY
  if (!tmdbKey) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]
  const threeMonths = new Date()
  threeMonths.setMonth(threeMonths.getMonth() + 3)
  const threeMonthsLater = threeMonths.toISOString().split('T')[0]

  try {
    const [upcomingRes, discoverRes] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/movie/upcoming?api_key=${tmdbKey}&language=es-CL&region=CL&page=1`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&language=es-CL&with_watch_monetization_types=flatrate&watch_region=CL&sort_by=primary_release_date.asc&primary_release_date.gte=${today}&primary_release_date.lte=${threeMonthsLater}&page=1`,
        { next: { revalidate: 3600 } }
      ),
    ])

    const [upcomingData, discoverData] = await Promise.all([
      upcomingRes.json(),
      discoverRes.json(),
    ])

    const allMovies = [
      ...(upcomingData.results ?? []),
      ...(discoverData.results ?? []),
    ]

    // Deduplicate by TMDB id
    const seen = new Set<number>()
    const unique = allMovies.filter((m: any) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Filter to only movies with a release date >= today
    const movies = unique
      .filter((m: any) => m.release_date && m.release_date >= today)
      .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date))
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        original_title: m.original_title,
        overview: m.overview,
        poster_path: m.poster_path,
        release_date: m.release_date,
        vote_average: m.vote_average,
        genres: (m.genre_ids ?? []).map((id: number) => TMDB_GENRE_MAP[id]).filter(Boolean),
      }))

    return NextResponse.json({ movies })
  } catch (err) {
    console.error('Error fetching estrenos:', err)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}
