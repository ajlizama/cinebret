import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const tmdbId = req.nextUrl.searchParams.get('id')
  const type = req.nextUrl.searchParams.get('type') || 'movie'
  if (!tmdbId) return NextResponse.json({ logo: null })

  const key = process.env.TMDB_API_KEY
  if (!key) return NextResponse.json({ logo: null })

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${key}`,
      { next: { revalidate: 86400 } } // cache 24h
    )
    const data = await res.json()
    // Prefer Spanish logo, then English, then any
    const logos = data.logos || []
    const esLogo = logos.find((l: any) => l.iso_639_1 === 'es')
    const enLogo = logos.find((l: any) => l.iso_639_1 === 'en')
    const anyLogo = logos[0]
    const best = esLogo || enLogo || anyLogo
    return NextResponse.json({ logo: best?.file_path || null })
  } catch {
    return NextResponse.json({ logo: null })
  }
}
