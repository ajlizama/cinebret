import { NextResponse } from 'next/server'

export const revalidate = 3600 // 1 hour cache

export async function GET() {
  const tmdbKey = process.env.TMDB_API_KEY
  if (!tmdbKey) return NextResponse.json({ tmdbIds: [] })

  try {
    // Fetch now_playing for Chile (2 pages for more coverage)
    const [page1, page2] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${tmdbKey}&region=CL&page=1`, { next: { revalidate: 3600 } }).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${tmdbKey}&region=CL&page=2`, { next: { revalidate: 3600 } }).then(r => r.json()),
    ])

    // Only include movies already released (filter out future dates)
    const today = new Date().toISOString().split('T')[0]
    const ids = new Set<number>()
    for (const r of [...(page1.results ?? []), ...(page2.results ?? [])]) {
      if (r.release_date && r.release_date <= today) {
        ids.add(r.id)
      }
    }

    return NextResponse.json({ tmdbIds: Array.from(ids) })
  } catch {
    return NextResponse.json({ tmdbIds: [] })
  }
}
