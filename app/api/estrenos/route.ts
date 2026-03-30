import { NextResponse } from 'next/server'

export const revalidate = 3600

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 14: 'Fantasía',
  36: 'Historia', 27: 'Terror', 10402: 'Música', 9648: 'Misterio',
  10749: 'Romance', 878: 'Ciencia ficción', 53: 'Thriller',
  10752: 'Guerra', 37: 'Western', 10751: 'Familia',
}

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

async function fetchTMDB(url: string) {
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return { results: [] }
  return res.json()
}

export async function GET() {
  const tmdbKey = process.env.TMDB_API_KEY
  if (!tmdbKey) {
    return NextResponse.json({ error: 'TMDB key missing' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  // 30 days ago (for currently in theaters)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentStart = thirtyDaysAgo.toISOString().split('T')[0]

  // End of current year (show all upcoming for the year)
  const sixMonths = new Date()
  sixMonths.setFullYear(sixMonths.getFullYear(), 11, 31)
  const futureEnd = sixMonths.toISOString().split('T')[0]

  const base = 'https://api.themoviedb.org/3'
  const quality = `&include_adult=false&with_original_language=${ALLOWED_LANGUAGES}`

  try {
    // 1. THEATRICAL: recently released + upcoming in theaters
    //    type=3 = Theatrical, sorted by popularity
    const theatricalUrls = [1, 2, 3].map(p =>
      `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${recentStart}&primary_release_date.lte=${futureEnd}&with_release_type=3${quality}&page=${p}`
    )

    // 2. DIGITAL: streaming releases
    //    type=4 = Digital
    const digitalUrls = [1, 2].map(p =>
      `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${recentStart}&primary_release_date.lte=${futureEnd}&with_release_type=4${quality}&page=${p}`
    )

    // 3. General upcoming for CL (catches things discover might miss)
    const upcomingUrls = [1, 2].map(p =>
      `${base}/movie/upcoming?api_key=${tmdbKey}&language=es-CL&region=CL&page=${p}`
    )

    const allUrls = [...theatricalUrls, ...digitalUrls, ...upcomingUrls]
    const allResponses = await Promise.all(allUrls.map(fetchTMDB))

    // Parse by source
    const theatricalMovies: RawMovie[] = []
    for (let i = 0; i < 3; i++) theatricalMovies.push(...(allResponses[i].results ?? []))

    const digitalMovies: RawMovie[] = []
    for (let i = 3; i < 5; i++) digitalMovies.push(...(allResponses[i].results ?? []))

    const upcomingMovies: RawMovie[] = []
    for (let i = 5; i < 7; i++) upcomingMovies.push(...(allResponses[i].results ?? []))

    // Build source sets
    const theatricalIds = new Set(theatricalMovies.map(m => m.id))
    const digitalIds = new Set(digitalMovies.map(m => m.id))
    // upcoming without digital source = theatrical
    upcomingMovies.forEach(m => {
      if (!digitalIds.has(m.id)) theatricalIds.add(m.id)
    })

    // Deduplicate all movies
    const allMovies = [...theatricalMovies, ...digitalMovies, ...upcomingMovies]
    const seen = new Set<number>()
    const unique = allMovies.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Filter quality: must have poster, not garbage rating
    const filtered = unique.filter(m => {
      if (!m.poster_path) return false
      if (m.vote_average > 0 && m.vote_average < 2) return false
      return true
    })

    // Sort by popularity
    filtered.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))

    // Limit
    const top = filtered.slice(0, 50)

    // Determine status using RELEASE DATE as source of truth
    const movies = top.map(m => {
      const isTheatrical = theatricalIds.has(m.id)
      const isDigital = digitalIds.has(m.id)
      const releasedAlready = m.release_date && m.release_date <= today

      // Determine WHERE it plays
      let medio: 'cine' | 'streaming' | 'ambos'
      if (isTheatrical && isDigital) {
        medio = 'ambos'
      } else if (isDigital) {
        medio = 'streaming'
      } else {
        medio = 'cine' // default: theatrical
      }

      // Determine WHEN based on actual release date
      // en_cines = already released theatrical
      // proximamente = not yet released
      // en_streaming = already released digital
      let status: 'en_cines' | 'proximamente_cine' | 'en_streaming' | 'proximamente_streaming' | 'proximamente'
      if (releasedAlready) {
        status = medio === 'streaming' ? 'en_streaming' : medio === 'ambos' ? 'en_cines' : 'en_cines'
      } else {
        if (medio === 'streaming') status = 'proximamente_streaming'
        else if (medio === 'ambos') status = 'proximamente'
        else status = 'proximamente_cine'
      }

      // Only show rating if movie has enough votes (>100) to be meaningful
      const showRating = m.vote_count > 100

      return {
        id: m.id,
        title: m.title,
        original_title: m.original_title,
        poster_path: m.poster_path,
        release_date: m.release_date,
        vote_average: showRating ? m.vote_average : null,
        genres: (m.genre_ids ?? []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean),
        status,
        medio,
      }
    })

    return NextResponse.json({ movies })
  } catch (err) {
    console.error('Estrenos error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
