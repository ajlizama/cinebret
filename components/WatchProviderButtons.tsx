'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type WatchProvider = {
  provider_name: string
  provider_type: 'flatrate' | 'rent' | 'buy'
  platform_key: string | null
  logo_path: string
  tmdb_link: string
  tmdb_id: number | null
}

// Direct deep links — open the platform app on mobile/TV
const PLATFORM_DEEP_LINKS: Record<string, (tmdbId: number | null) => string> = {
  netflix: () => 'https://www.netflix.com/browse',
  disney_plus: () => 'https://www.disneyplus.com',
  hbo_max: () => 'https://play.max.com',
  amazon_prime: () => 'https://www.primevideo.com',
  apple_tv: () => 'https://tv.apple.com',
  paramount_plus: () => 'https://www.paramountplus.com',
  mubi: () => 'https://mubi.com',
}

const PLATFORM_LOGOS: Record<string, string> = {
  netflix: '/netflix.png',
  disney_plus: '/disney_plus.svg',
  hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png',
  apple_tv: '/apple_tv.png',
  paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png',
}

const PLATFORM_NAMES: Record<string, string> = {
  netflix: 'Netflix',
  disney_plus: 'Disney+',
  hbo_max: 'Max',
  amazon_prime: 'Prime Video',
  apple_tv: 'Apple TV+',
  paramount_plus: 'Paramount+',
  mubi: 'MUBI',
}

const PLATFORM_COLORS: Record<string, string> = {
  netflix: 'bg-red-600 hover:bg-red-500',
  disney_plus: 'bg-blue-700 hover:bg-blue-600',
  hbo_max: 'bg-purple-700 hover:bg-purple-600',
  amazon_prime: 'bg-sky-700 hover:bg-sky-600',
  apple_tv: 'bg-zinc-700 hover:bg-zinc-600',
  paramount_plus: 'bg-blue-600 hover:bg-blue-500',
  mubi: 'bg-zinc-700 hover:bg-zinc-600',
}

export default function WatchProviderButtons({ peliculaId }: { peliculaId: string }) {
  const [providers, setProviders] = useState<WatchProvider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('watch_providers')
      .select('provider_name, provider_type, platform_key, logo_path, tmdb_link, tmdb_id')
      .eq('pelicula_id', peliculaId)
      .then(({ data }) => {
        if (data) {
          const sorted = data.sort((a, b) => {
            const order: Record<string, number> = { flatrate: 0, rent: 1, buy: 2 }
            return (order[a.provider_type] ?? 3) - (order[b.provider_type] ?? 3)
          })
          const seen = new Set<string>()
          const unique = sorted.filter((p) => {
            if (seen.has(p.provider_name)) return false
            seen.add(p.provider_name)
            return true
          })
          setProviders(unique)
        }
        setLoading(false)
      })
  }, [peliculaId])

  if (loading) return null
  if (providers.length === 0) {
    return (
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible en</p>
        <p className="text-sm text-zinc-600">No disponible en streaming actualmente</p>
      </div>
    )
  }

  const streaming = providers.filter((p) => p.provider_type === 'flatrate')
  const rentBuy = providers.filter((p) => p.provider_type !== 'flatrate')

  const handleClick = (provider: WatchProvider) => {
    // Priority: platform direct URL > TMDB link
    const platformKey = provider.platform_key || ''
    const deepLinkFn = PLATFORM_DEEP_LINKS[platformKey]
    const url = deepLinkFn ? deepLinkFn(provider.tmdb_id) : (provider.tmdb_link || '#')
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="space-y-3">
      {streaming.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible en</p>
          <div className="flex flex-wrap gap-2">
            {streaming.map((p) => {
              const key = p.platform_key || ''
              const logo = PLATFORM_LOGOS[key]
              const name = PLATFORM_NAMES[key] || p.provider_name
              return (
                <button
                  key={p.provider_name}
                  onClick={() => handleClick(p)}
                  className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-white text-sm font-semibold transition-all min-h-[44px]
                    ${PLATFORM_COLORS[key] || 'bg-zinc-700 hover:bg-zinc-600'}
                  `}
                >
                  {logo ? (
                    <div className="bg-white rounded px-1.5 py-1 shrink-0">
                      <img loading="lazy" src={logo} alt={name} className="h-5 w-auto object-contain" />
                    </div>
                  ) : p.logo_path ? (
                    <img
                      loading="lazy"
                      src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                      alt={name}
                      className="w-5 h-5 rounded"
                    />
                  ) : null}
                  Ver en {name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {rentBuy.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Arriendo / Compra</p>
          <div className="flex flex-wrap gap-2">
            {rentBuy.map((p) => {
              const key = p.platform_key || ''
              const name = PLATFORM_NAMES[key] || p.provider_name
              return (
                <button
                  key={`${p.provider_name}-${p.provider_type}`}
                  onClick={() => handleClick(p)}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 text-xs hover:border-zinc-500 transition-all min-h-[44px]"
                >
                  {p.logo_path && (
                    <img
                      loading="lazy"
                      src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                      alt={name}
                      className="w-4 h-4 rounded"
                    />
                  )}
                  {p.provider_type === 'rent' ? 'Arrendar' : 'Comprar'} en {name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
