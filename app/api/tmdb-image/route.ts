import { NextRequest, NextResponse } from 'next/server'

// Proxy TMDB images to avoid CORS issues when rendering to canvas
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  const size = req.nextUrl.searchParams.get('size') || 'w342'
  if (!path) return new NextResponse('Missing path', { status: 400 })

  try {
    const url = `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : '/' + path}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'cinebret-poster-proxy/1.0' },
      next: { revalidate: 86400 }, // cache 24h
    })
    if (!res.ok) return new NextResponse('Not found', { status: res.status })
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
