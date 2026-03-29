import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || 'CineBret'
  const poster = searchParams.get('poster') || ''
  const rating = searchParams.get('rating') || ''
  const year = searchParams.get('year') || ''
  const director = searchParams.get('director') || ''
  const userRating = searchParams.get('userRating') || ''
  const username = searchParams.get('username') || ''

  const posterUrl = poster ? `https://image.tmdb.org/t/p/w342${poster}` : ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: 'linear-gradient(135deg, #09090b 0%, #1c1917 50%, #09090b 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative gradient */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '630px',
            background: 'radial-gradient(circle at 80% 50%, rgba(212, 160, 23, 0.15), transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Poster */}
        {posterUrl && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 0 40px 50px',
            }}
          >
            <img
              src={posterUrl}
              alt=""
              width={330}
              height={495}
              style={{
                borderRadius: '16px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        )}

        {/* Info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '40px 50px',
            flex: 1,
          }}
        >
          {/* CineBret branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                background: '#d4a017',
                borderRadius: '8px',
                padding: '4px 12px',
                color: '#000',
                fontSize: '14px',
                fontWeight: 800,
                letterSpacing: '1px',
                display: 'flex',
              }}
            >
              CINEBRET
            </div>
            {username && (
              <span style={{ color: '#a1a1aa', fontSize: '14px', display: 'flex' }}>
                @{username}
              </span>
            )}
          </div>

          {/* Title */}
          <h1
            style={{
              color: '#ffffff',
              fontSize: title.length > 30 ? '36px' : '48px',
              fontWeight: 800,
              margin: '0 0 12px',
              lineHeight: 1.1,
              display: 'flex',
            }}
          >
            {title}
          </h1>

          {/* Year + Director */}
          <p style={{ color: '#a1a1aa', fontSize: '20px', margin: '0 0 24px', display: 'flex' }}>
            {[year, director].filter(Boolean).join(' — ')}
          </p>

          {/* Ratings */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {rating && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(212, 160, 23, 0.15)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                }}
              >
                <span style={{ fontSize: '24px', display: 'flex' }}>⭐</span>
                <span style={{ color: '#d4a017', fontSize: '28px', fontWeight: 800, display: 'flex' }}>
                  {rating}
                </span>
                <span style={{ color: '#a1a1aa', fontSize: '14px', display: 'flex' }}>IMDB</span>
              </div>
            )}
            {userRating && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                }}
              >
                <span style={{ color: '#ffffff', fontSize: '28px', fontWeight: 800, display: 'flex' }}>
                  {userRating}
                </span>
                <span style={{ color: '#a1a1aa', fontSize: '14px', display: 'flex' }}>/10</span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div
            style={{
              marginTop: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: '#71717a', fontSize: '16px', display: 'flex' }}>
              cinebret.cl
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
