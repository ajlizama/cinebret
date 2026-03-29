import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')
  return new Resend(key)
}

let _supabaseAdmin: ReturnType<typeof createClient> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('Supabase credentials not configured')
    _supabaseAdmin = createClient(url, key)
  }
  return _supabaseAdmin
}

const ADMIN_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2'

type MovieCard = {
  titulo: string
  poster: string
  nota: number | null
  url: string
}

function buildEmailHtml({
  username,
  vistasCount,
  avgRating,
  trending,
  recomendadas,
  heroBackdrop,
}: {
  username: string
  vistasCount: number
  avgRating: string | null
  trending: MovieCard[]
  recomendadas: MovieCard[]
  heroBackdrop?: string
}): string {

  const posterCard = (m: MovieCard) => `
    <td style="padding:0 6px;vertical-align:top;width:33.33%">
      <a href="${m.url}" style="text-decoration:none;display:block">
        <img src="https://image.tmdb.org/t/p/w342${m.poster}" alt="${m.titulo}"
          style="width:100%;border-radius:10px;display:block" />
        <p style="color:#1a1a1a;font-size:12px;font-weight:600;margin:8px 0 2px;line-height:1.3">${m.titulo}</p>
        ${m.nota ? `<p style="color:#b8860b;font-size:11px;margin:0;font-weight:700">IMDB ${m.nota}</p>` : ''}
      </a>
    </td>`

  const posterRow = (movies: MovieCard[]) => {
    const rows: string[] = []
    for (let i = 0; i < movies.length; i += 3) {
      const chunk = movies.slice(i, i + 3)
      rows.push(`<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tr>${chunk.map(posterCard).join('')}</tr></table>`)
    }
    return rows.join('')
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CineBret Newsletter</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">

<!-- Outer wrapper -->
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:0">

  <!-- Hero Section -->
  <div style="position:relative;background:#1a1a1a;text-align:center;padding:0;overflow:hidden;border-radius:0 0 0 0">
    ${heroBackdrop ? `
    <img src="https://image.tmdb.org/t/p/w780${heroBackdrop}" alt=""
      style="width:100%;height:220px;object-fit:cover;display:block;opacity:0.4" />
    <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom,rgba(26,26,26,0.3),rgba(26,26,26,0.95))"></div>
    ` : '<div style="height:40px"></div>'}
    <div style="${heroBackdrop ? 'position:absolute;bottom:0;left:0;right:0;' : ''}padding:30px 24px 24px">
      <img src="https://cinebret.cl/logo-oficial.png" alt="CineBret" style="height:60px;width:auto;margin-bottom:8px" />
      <p style="color:#d4d4d8;font-size:13px;margin:0;letter-spacing:0.5px">Buscador y recomendador de películas</p>
    </div>
  </div>

  <!-- Greeting -->
  <div style="padding:28px 24px 20px">
    <h2 style="color:#1a1a1a;font-size:20px;font-weight:700;margin:0">Hola ${username},</h2>
    <p style="color:#6b6b6b;font-size:14px;margin:8px 0 0;line-height:1.5">
      Aquí tienes tu resumen quincenal con lo mejor del cine para ti.
    </p>
  </div>

  ${vistasCount > 0 ? `
  <!-- Activity Card -->
  <div style="margin:0 24px 24px;background:linear-gradient(135deg,#1a1a1a 0%,#2d2318 100%);border-radius:16px;padding:24px;text-align:center">
    <p style="color:#a1a1aa;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:2px;font-weight:600">Tu actividad reciente</p>
    <p style="color:#ffffff;font-size:36px;font-weight:800;margin:12px 0 4px">${vistasCount}</p>
    <p style="color:#d4d4d8;font-size:14px;margin:0">películas vistas</p>
    ${avgRating ? `<p style="color:#d4a017;font-size:15px;font-weight:700;margin:12px 0 0">Nota promedio: ${avgRating}</p>` : ''}
  </div>
  ` : ''}

  ${trending.length > 0 ? `
  <!-- Trending Section -->
  <div style="padding:0 24px 24px">
    <div style="border-top:1px solid #e5e5e5;padding-top:24px;margin-bottom:16px">
      <h3 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0">Trending esta semana</h3>
      <p style="color:#8b8b8b;font-size:12px;margin:4px 0 0">Las más populares del momento</p>
    </div>
    ${posterRow(trending)}
  </div>
  ` : ''}

  ${recomendadas.length > 0 ? `
  <!-- Recommendations Section -->
  <div style="padding:0 24px 24px">
    <div style="border-top:1px solid #e5e5e5;padding-top:24px;margin-bottom:16px">
      <h3 style="color:#1a1a1a;font-size:17px;font-weight:700;margin:0">Recomendadas para ti</h3>
      <p style="color:#8b8b8b;font-size:12px;margin:4px 0 0">Basadas en tus gustos</p>
    </div>
    ${posterRow(recomendadas)}
  </div>
  ` : ''}

  <!-- CTA -->
  <div style="padding:8px 24px 32px;text-align:center">
    <a href="https://cinebret.cl"
      style="display:inline-block;background:#d4a017;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 40px;border-radius:50px;letter-spacing:0.3px">
      Explorar CineBret
    </a>
  </div>

  <!-- Footer -->
  <div style="background:#fafafa;padding:24px;text-align:center;border-top:1px solid #e5e5e5">
    <p style="color:#8b8b8b;font-size:11px;margin:0;line-height:1.5">
      CineBret — Buscador y recomendador de películas<br>
      <a href="https://cinebret.cl" style="color:#d4a017;text-decoration:none">cinebret.cl</a>
    </p>
  </div>

</div>

</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { userId, email, username, testMode } = await req.json()

    if (!testMode && userId !== ADMIN_ID) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const sb = getSupabaseAdmin()

    // --- Trending: fetch from TMDB API ---
    let trending: MovieCard[] = []
    let heroBackdrop: string | undefined
    const tmdbKey = process.env.TMDB_API_KEY
    if (tmdbKey) {
      try {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=es-CL`
        )
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json()
          const results = (tmdbData.results ?? []).slice(0, 6)
          trending = results.map((m: any) => ({
            titulo: m.title ?? m.original_title,
            poster: m.poster_path ?? '',
            nota: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
            url: `https://cinebret.cl/pelicula/${m.id}`,
          }))
          heroBackdrop = results[0]?.backdrop_path ?? undefined
        }
      } catch {
        // TMDB unavailable, trending stays empty
      }
    }

    // --- User stats: visto count and average rating ---
    let vistasCount = 0
    let avgRating: string | null = null
    if (userId) {
      const { data: userPelis } = await sb
        .from('user_peliculas')
        .select('rating')
        .eq('user_id', userId)
        .eq('visto', true)

      if (userPelis && userPelis.length > 0) {
        vistasCount = userPelis.length
        const rated = userPelis.filter((p: any) => p.rating != null)
        if (rated.length > 0) {
          const avg = rated.reduce((sum: number, p: any) => sum + Number(p.rating), 0) / rated.length
          avgRating = avg.toFixed(1)
        }
      }
    }

    // --- Recommendations: highest nota_imdb the user hasn't seen ---
    let recomendadas: MovieCard[] = []
    if (userId) {
      // Get IDs of movies the user has already seen
      const { data: seenRows } = await sb
        .from('user_peliculas')
        .select('pelicula_id')
        .eq('user_id', userId)
        .eq('visto', true)

      const seenIds = (seenRows ?? []).map((r: any) => r.pelicula_id)

      let query = sb
        .from('peliculas')
        .select('id, titulo, nota_imdb, enriquecimiento(poster_path)')
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(seenIds.length > 0 ? 50 : 6)

      const { data: pelisData } = await query

      if (pelisData) {
        const filtered = seenIds.length > 0
          ? pelisData.filter((p: any) => !seenIds.includes(p.id)).slice(0, 6)
          : pelisData.slice(0, 6)

        recomendadas = filtered.map((p: any) => {
          const posterPath = Array.isArray(p.enriquecimiento)
            ? p.enriquecimiento[0]?.poster_path
            : p.enriquecimiento?.poster_path
          return {
            titulo: p.titulo,
            poster: posterPath ?? '',
            nota: p.nota_imdb,
            url: `https://cinebret.cl/pelicula/${p.id}`,
          }
        })
      }
    }

    const html = buildEmailHtml({
      username: username || 'Cinéfilo',
      vistasCount,
      avgRating,
      trending,
      recomendadas,
      heroBackdrop,
    })

    const { data, error } = await getResend().emails.send({
      from: 'CineBret <noreply@cinebret.cl>',
      to: email,
      subject: 'Tu resumen quincenal — CineBret',
      html,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
