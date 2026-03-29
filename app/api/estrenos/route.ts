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
  if (!res.ok) return { results: [] }
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
  const qualityParams = `&include_adult=false&vote_count.gte=20&with_original_language=${ALLOWED_LANGUAGES}`

  try {
    // 1. Now playing in Chile (currently in theaters)
    const nowPlayingUrls = [1, 2].map(
      p => `${base}/movie/now_playing?api_key=${tmdbKey}&language=es-CL&region=CL&page=${p}`
    )

    // 2. Upcoming in Chile
    const upcomingUrls = [1, 2].map(
      p => `${base}/movie/upcoming?api_key=${tmdbKey}&language=es-CL&region=CL&page=${p}`
    )

    // 3. Theatrical releases (type=3)
    const theatricalUrls = [1, 2].map(
      p => `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsLater}&with_release_type=3${qualityParams}&page=${p}`
    )

    // 4. Digital/streaming releases (type=4)
    const digitalUrls = [1, 2].map(
      p => `${base}/discover/movie?api_key=${tmdbKey}&language=es-CL&region=CL&sort_by=popularity.desc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsLater}&with_release_type=4${qualityParams}&page=${p}`
    )

    const allUrls = [...nowPlayingUrls, ...upcomingUrls, ...theatricalUrls, ...digitalUrls]
    const allResponses = await Promise.all(allUrls.map(fetchJSON))

    // Parse by category
    const nowPlayingResults: RawMovie[] = []
    for (let i = 0; i < 2; i++) nowPlayingResults.push(...(allResponses[i].results ?? []))

    const upcomingResults: RawMovie[] = []
    for (let i = 2; i < 4; i++) upcomingResults.push(...(allResponses[i].results ?? []))

    const theatricalResults: RawMovie[] = []
    for (let i = 4; i < 6; i++) theatricalResults.push(...(allResponses[i].results ?? []))

    const digitalResults: RawMovie[] = []
    for (let i = 6; i < 8; i++) digitalResults.push(...(allResponses[i].results ?? []))

    // Build release type sets — keep each source separate
    const nowPlayingIds = new Set(nowPlayingResults.map(m => m.id))
    const upcomingIds = new Set(upcomingResults.map(m => m.id))
    const theatricalOnlyIds = new Set(theatricalResults.map(m => m.id))
    const digitalOnlyIds = new Set(digitalResults.map(m => m.id))

    // Collect all, deduplicate
    const allMovies = [...nowPlayingResults, ...upcomingResults, ...theatricalResults, ...digitalResults]
    const seen = new Set<number>()
    const unique = allMovies.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Filter quality
    const filtered = unique.filter((m) => {
      if (!m.poster_path) return false
      if (m.vote_average > 0 && m.vote_average < 3) return false
      return true
    })

    // Sort: now playing first, then by popularity
    const sorted = filtered.sort((a, b) => {
      const aPlaying = nowPlayingIds.has(a.id) ? 1 : 0
      const bPlaying = nowPlayingIds.has(b.id) ? 1 : 0
      if (bPlaying !== aPlaying) return bPlaying - aPlaying
      return (b.popularity ?? 0) - (a.popularity ?? 0)
    })

    const top = sorted.slice(0, 50)

    const movies = top.map((m) => {
      const isNowPlaying = nowPlayingIds.has(m.id)
      const isUpcoming = upcomingIds.has(m.id)
      const isTheatrical = theatricalOnlyIds.has(m.id)
      const isDigitalOnly = digitalOnlyIds.has(m.id) && !isNowPlaying && !isUpcoming && !isTheatrical

      // Determine release type with clear priority:
      // 1. Now playing = en cines (definitive)
      // 2. Upcoming from TMDB = pronto en cines (these are theatrical releases)
      // 3. Theatrical discover = pronto en cines
      // 4. Digital-only (not in any theatrical/upcoming source) = streaming
      let release_type: 'en_cines' | 'cine' | 'streaming' | 'ambos'
      if (isNowPlaying) {
        release_type = 'en_cines'
      } else if (isUpcoming || isTheatrical) {
        release_type = isDigitalOnly ? 'ambos' : 'cine'
      } else if (isDigitalOnly) {
        release_type = 'streaming'
      } else {
        // Default for anything else: pronto en cines
        release_type = 'cine'
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
        now_playing: isNowPlaying,
      }
    })

    return NextResponse.json({ movies })
  } catch (err) {
    console.error('Error fetching estrenos:', err)
    return NextResponse.json({ error: 'Failed to fetch releases' }, { status: 500 })
  }
}
