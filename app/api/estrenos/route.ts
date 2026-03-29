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

// Languages that a Chilean audience would care about
const ALLOWED_LANGUAGES = 'en|es|fr|de|it|ja|ko|pt|zh'

type RawMovie = {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  popularity: number
  genre_ids: number[]
}

async function fetchJSON(url: string) {
  const res = await fetch(url, { next: { revalidate: 3600 } })
  return res.json()
}

export async function GET() {
  const tmdbKey = process.env.TMDB_API_KEY
  if (!tmdbKey) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  const sixMonthsLater = sixMonths.toISOString().split('T')[0]

  const base = 'https://api.themoviedb.org/3'

  // Common quality filters for discover endpoints
  const qualityParams = `&include_adult=false&vote_count.gte=50&with_original_language=${ALLOWED_LANGUAGES}`

  try {
    // Fetch upcoming (2 pages) - upcoming endpoint has its own filters
    const upcomingUrls = [1, 2].map(
      p => `${base}/movie/upcoming?api_key=${tmdbKey}&language=es-CL&region=CL&page=${p}`
    )

    // Discover theatrical releases (type=3) - sorted by popularity
    const theatricalUrls = [1, 2].map(
      p => `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsLater}&with_release_type=3${qualityParams}&page=${p}`
    )

    // Discover digital/streaming releases (type=4) - sorted by popularity
    const digitalUrls = [1, 2].map(
      p => `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsLater}&with_release_type=4${qualityParams}&page=${p}`
    )

    // Discover broad (types 2,3,4,5,6) for Chile - sorted by popularity
    const broadUrls = [1, 2].map(
      p => `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsLater}&with_release_type=2|3|4|5|6${qualityParams}&page=${p}`
    )

    const allUrls = [...upcomingUrls, ...theatricalUrls, ...digitalUrls, ...broadUrls]
    const allResponses = await Promise.all(allUrls.map(fetchJSON))

    // Parse results by category
    const upcomingResults: RawMovie[] = []
    for (let i = 0; i < 2; i++) {
      upcomingResults.push(...(allResponses[i].results ?? []))
    }

    const theatricalResults: RawMovie[] = []
    for (let i = 2; i < 4; i++) {
      theatricalResults.push(...(allResponses[i].results ?? []))
    }

    const digitalResults: RawMovie[] = []
    for (let i = 4; i < 6; i++) {
      digitalResults.push(...(allResponses[i].results ?? []))
    }

    const broadResults: RawMovie[] = []
    for (let i = 6; i < 8; i++) {
      broadResults.push(...(allResponses[i].results ?? []))
    }

    // Build a map of movie id -> release types
    const theatricalIds = new Set(theatricalResults.map(m => m.id))
    const digitalIds = new Set(digitalResults.map(m => m.id))

    // Collect all movies
    const allMovies = [
      ...upcomingResults,
      ...theatricalResults,
      ...digitalResults,
      ...broadResults,
    ]

    // Deduplicate keeping first occurrence
    const seen = new Set<number>()
    const unique = allMovies.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Filter: must have poster, release date >= today, and meet quality bar
    // For upcoming movies (no vote_count filter from API), apply a softer filter
    const filtered = unique.filter((m) => {
      if (!m.release_date || m.release_date < today) return false
      if (!m.poster_path) return false
      // Filter out adult-looking or very low quality content
      if (m.vote_average > 0 && m.vote_average < 3) return false
      return true
    })

    // Sort by popularity descending (most anticipated first)
    const sorted = filtered.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))

    // Limit to top 40 movies
    const top = sorted.slice(0, 40)

    const movies = top.map((m) => {
      // Determine release type
      const isTheatrical = theatricalIds.has(m.id)
      const isDigital = digitalIds.has(m.id)

      let release_type: 'cine' | 'streaming' | 'ambos' | null = null
      if (isTheatrical && isDigital) {
        release_type = 'ambos'
      } else if (isTheatrical) {
        release_type = 'cine'
      } else if (isDigital) {
        release_type = 'streaming'
      }

      return {
        id: m.id,
        title: m.title,
        original_title: m.original_title,
        overview: m.overview,
        poster_path: m.poster_path,
        release_date: m.release_date,
        vote_average: m.vote_average,
        genres: (m.genre_ids ?? []).map((id: number) => TMDB_GENRE_MAP[id]).filter(Boolean),
        release_type,
      }
    })

    return NextResponse.json({ movies })
  } catch (err) {
    console.error('Error fetching estrenos:', err)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}
