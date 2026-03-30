import { NextResponse } from 'next/server'

export const revalidate = 3600

export async function GET() {
  const tmdbKey = process.env.TMDB_API_KEY
  if (!tmdbKey) return NextResponse.json({ badges: {} })

  try {
    const [np1, np2, up1, up2] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${tmdbKey}&region=CL&page=1`, { next: { revalidate: 3600 } }).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${tmdbKey}&region=CL&page=2`, { next: { revalidate: 3600 } }).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${tmdbKey}&region=CL&page=1`, { next: { revalidate: 3600 } }).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${tmdbKey}&region=CL&page=2`, { next: { revalidate: 3600 } }).then(r => r.json()),
    ])

    const today = new Date()
    const badges: Record<string, string> = {}

    // Process now_playing
    for (const m of [...(np1.results ?? []), ...(np2.results ?? [])]) {
      const rd = m.release_date ? new Date(m.release_date) : null
      if (!rd) continue
      const diff = Math.round((today.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24))
      badges[String(m.id)] = diff > 7 ? 'en_cines' : 'estreno'
    }

    // Process upcoming (overrides for future movies)
    for (const m of [...(up1.results ?? []), ...(up2.results ?? [])]) {
      const rd = m.release_date ? new Date(m.release_date) : null
      if (!rd) continue
      const diff = Math.round((rd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diff <= 7 && diff >= -7) badges[String(m.id)] = 'estreno'
      else if (diff > 7) badges[String(m.id)] = 'proximamente'
    }

    return NextResponse.json({ badges })
  } catch {
    return NextResponse.json({ badges: {} })
  }
}
