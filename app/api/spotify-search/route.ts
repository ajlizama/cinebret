import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET

let cachedToken: { token: string; expires: number } | null = null

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token
  if (!CLIENT_ID || !CLIENT_SECRET) return null
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
    })
    const data = await res.json()
    cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
    return data.access_token
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ album: null })

  const token = await getToken()
  if (!token) return NextResponse.json({ album: null })

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query + ' soundtrack')}&type=album&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    const album = data.albums?.items?.[0]
    if (!album) return NextResponse.json({ album: null })

    return NextResponse.json({
      album: {
        id: album.id,
        name: album.name,
        artist: album.artists[0]?.name ?? '',
        image: album.images?.[0]?.url ?? null,
        url: album.external_urls?.spotify ?? null,
        embedUrl: `https://open.spotify.com/embed/album/${album.id}?theme=0&autoplay=1`,
      }
    })
  } catch {
    return NextResponse.json({ album: null })
  }
}
