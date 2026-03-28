import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Admin only
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
}: {
  username: string
  vistasCount: number
  avgRating: string | null
  trending: MovieCard[]
  recomendadas: MovieCard[]
}): string {
  const movieRow = (movies: MovieCard[]) => movies.map(m => `
    <td style="padding:4px;text-align:center;width:20%">
      <a href="${m.url}" style="text-decoration:none">
        <img src="https://image.tmdb.org/t/p/w185${m.poster}" alt="${m.titulo}" style="width:100%;border-radius:8px" />
        <p style="color:#e4e4e7;font-size:11px;margin:4px 0 0;font-weight:600;line-height:1.2">${m.titulo}</p>
        ${m.nota ? `<p style="color:#facc15;font-size:10px;margin:2px 0 0">⭐ ${m.nota}</p>` : ''}
      </a>
    </td>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#09090b;padding:0">

  <!-- Header -->
  <div style="background:#18181b;padding:24px;text-align:center;border-bottom:1px solid #27272a">
    <h1 style="color:#facc15;margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px">CineBret</h1>
    <p style="color:#71717a;margin:6px 0 0;font-size:13px">Tu resumen quincenal de cine</p>
  </div>

  <!-- Greeting -->
  <div style="padding:24px 24px 16px">
    <p style="color:#e4e4e7;font-size:16px;margin:0">Hola <strong style="color:white">${username}</strong> 👋</p>
    ${vistasCount > 0 ? `
    <div style="background:#18181b;border-radius:12px;padding:16px;margin-top:16px;border:1px solid #27272a">
      <p style="color:#a1a1aa;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:1px">Tu actividad</p>
      <p style="color:white;font-size:24px;font-weight:800;margin:8px 0 4px">${vistasCount} películas vistas</p>
      ${avgRating ? `<p style="color:#facc15;font-size:14px;margin:0">Rating promedio: ⭐ ${avgRating}</p>` : ''}
    </div>
    ` : `
    <p style="color:#71717a;font-size:14px;margin:12px 0 0">¿Aún no has marcado películas? Entra a CineBret y empieza a descubrir 🎬</p>
    `}
  </div>

  <!-- Trending -->
  ${trending.length > 0 ? `
  <div style="padding:8px 24px 16px">
    <p style="color:white;font-size:16px;font-weight:700;margin:0 0 12px">🔥 Trending esta semana</p>
    <table style="width:100%;border-collapse:collapse"><tr>
      ${movieRow(trending)}
    </tr></table>
  </div>
  ` : ''}

  <!-- Recomendadas -->
  ${recomendadas.length > 0 ? `
  <div style="padding:8px 24px 16px">
    <p style="color:white;font-size:16px;font-weight:700;margin:0 0 12px">🎬 Recomendadas para ti</p>
    <table style="width:100%;border-collapse:collapse"><tr>
      ${movieRow(recomendadas)}
    </tr></table>
  </div>
  ` : ''}

  <!-- CTA -->
  <div style="padding:16px 24px 24px;text-align:center">
    <a href="https://cinebret.cl" style="display:inline-block;background:#facc15;color:#09090b;text-decoration:none;font-weight:700;font-size:14px;padding:12px 32px;border-radius:12px">
      Ir a CineBret
    </a>
  </div>

  <!-- Footer -->
  <div style="padding:16px 24px;border-top:1px solid #27272a;text-align:center">
    <p style="color:#52525b;font-size:11px;margin:0">CineBret — Buscador y recomendador de películas</p>
    <p style="color:#3f3f46;font-size:10px;margin:4px 0 0">cinebret.cl</p>
  </div>

</div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { userId, email, username, testMode } = await req.json()

    // For now, only admin can trigger
    if (!testMode && userId !== ADMIN_ID) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build sample data for test
    const trending: MovieCard[] = [
      { titulo: 'Inception', poster: '/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg', nota: 8.8, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'The Dark Knight', poster: '/qJ2tW6WMUDux911BTUgMe1TaBLV.jpg', nota: 9.0, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'Interstellar', poster: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', nota: 8.7, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'Pulp Fiction', poster: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', nota: 8.9, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'The Matrix', poster: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', nota: 8.7, url: 'https://cinebret.cl/catalogo' },
    ]

    const recomendadas: MovieCard[] = [
      { titulo: 'Fight Club', poster: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', nota: 8.8, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'Se7en', poster: '/uVPcVz4b2hnSGrXYLdIGRXwcivs.jpg', nota: 8.6, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'The Prestige', poster: '/tRNlZbgNCNOpLpbPEz5L8G8A0JN.jpg', nota: 8.5, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'Memento', poster: '/yuNs09hvpHVU1cBTCAk9zxsL2oq.jpg', nota: 8.4, url: 'https://cinebret.cl/catalogo' },
      { titulo: 'Shutter Island', poster: '/kve20tXMHFuoSTW1Cd6B7FAQAe0.jpg', nota: 8.2, url: 'https://cinebret.cl/catalogo' },
    ]

    const html = buildEmailHtml({
      username: username || 'Cinéfilo',
      vistasCount: 12,
      avgRating: '8.3',
      trending,
      recomendadas,
    })

    const { data, error } = await resend.emails.send({
      from: 'CineBret <noreply@cinebret.cl>',
      to: email,
      subject: '🎬 Tu resumen quincenal — CineBret',
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
