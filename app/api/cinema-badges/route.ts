import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // 1. Process TMDB now_playing
    for (const m of [...(np1.results ?? []), ...(np2.results ?? [])]) {
      const rd = m.release_date ? new Date(m.release_date) : null
      if (!rd) continue
      const diff = Math.round((today.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24))
      badges[String(m.id)] = diff > 7 ? 'en_cines' : 'estreno'
    }

    // 2. Process TMDB upcoming (overrides for future movies)
    for (const m of [...(up1.results ?? []), ...(up2.results ?? [])]) {
      const rd = m.release_date ? new Date(m.release_date) : null
      if (!rd) continue
      const diff = Math.round((rd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diff <= 7 && diff >= -7) badges[String(m.id)] = 'estreno'
      else if (diff > 7) badges[String(m.id)] = 'proximamente'
    }

    // 3. Check our DB for upcoming movies not covered by TMDB endpoints
    // Movies with anio >= 2025, no streaming platform, not already badged
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supaKey = process.env.SUPABASE_SECRET_KEY
    if (supaUrl && supaKey) {
      const supabase = createClient(supaUrl, supaKey)

      // Get movies from 2025+ that have tmdb_id
      const { data: upcomingMovies } = await supabase
        .from('peliculas')
        .select('tmdb_id, anio, nota_imdb')
        .gte('anio', 2025)
        .not('tmdb_id', 'is', null)

      if (upcomingMovies) {
        // Get which of these have streaming platforms
        const tmdbIds = upcomingMovies.map(m => m.tmdb_id).filter(Boolean)
        const { data: withProviders } = await supabase
          .from('watch_providers')
          .select('tmdb_id')
          .eq('provider_type', 'flatrate')
          .in('tmdb_id', tmdbIds)

        const hasStreaming = new Set((withProviders ?? []).map(p => p.tmdb_id))

        for (const m of upcomingMovies) {
          const tid = String(m.tmdb_id)
          // Skip if already has a badge from TMDB endpoints
          if (badges[tid]) continue
          // Skip if has streaming platform
          if (hasStreaming.has(m.tmdb_id)) continue
          // No IMDB rating = likely not released yet = proximamente
          // Has IMDB but no streaming and recent = could be in theaters or just released
          if (!m.nota_imdb) {
            badges[tid] = 'proximamente'
          }
        }
      }
    }

    return NextResponse.json({ badges })
  } catch {
    return NextResponse.json({ badges: {} })
  }
}
