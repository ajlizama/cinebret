'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

type WatchProvider = {
  provider_name: string
  provider_type: 'flatrate' | 'rent' | 'buy'
  platform_key: string | null
  logo_path: string
  tmdb_link: string
}

const PLATFORM_URLS: Record<string, string> = {
  netflix: 'https://www.netflix.com',
  disney_plus: 'https://www.disneyplus.com',
  hbo_max: 'https://play.max.com',
  amazon_prime: 'https://www.primevideo.com',
  apple_tv: 'https://tv.apple.com',
  paramount_plus: 'https://www.paramountplus.com',
  mubi: 'https://mubi.com',
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
      .select('provider_name, provider_type, platform_key, logo_path, tmdb_link')
      .eq('pelicula_id', peliculaId)
      .then(({ data }) => {
        if (data) {
          // Group: prioritize flatrate (streaming), then rent, then buy
          const sorted = data.sort((a, b) => {
            const order: Record<string, number> = { flatrate: 0, rent: 1, buy: 2 }
            return (order[a.provider_type] ?? 3) - (order[b.provider_type] ?? 3)
          })
          // Deduplicate by provider_name (show streaming over rent)
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
  if (providers.length === 0) return null

  const streaming = providers.filter((p) => p.provider_type === 'flatrate')
  const rentBuy = providers.filter((p) => p.provider_type !== 'flatrate')

  const handleClick = (provider: WatchProvider) => {
    // Use TMDB link (redirects via JustWatch to the platform)
    const url = provider.tmdb_link || PLATFORM_URLS[provider.platform_key || ''] || '#'
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="space-y-3">
      {streaming.length > 0 && (
        <div>
          <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wider font-semibold">Streaming</p>
          <div className="flex flex-wrap gap-2">
            {streaming.map((p) => (
              <button
                key={p.provider_name}
                onClick={() => handleClick(p)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-white text-sm font-semibold transition-all
                  ${PLATFORM_COLORS[p.platform_key || ''] || 'bg-zinc-700 hover:bg-zinc-600'}
                `}
              >
                {p.logo_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                    alt={p.provider_name}
                    className="w-5 h-5 rounded"
                  />
                )}
                Ver en {p.provider_name}
              </button>
            ))}
          </div>
        </div>
      )}
      {rentBuy.length > 0 && (
        <div>
          <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wider font-semibold">Arriendo / Compra</p>
          <div className="flex flex-wrap gap-2">
            {rentBuy.map((p) => (
              <button
                key={`${p.provider_name}-${p.provider_type}`}
                onClick={() => handleClick(p)}
                className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 text-xs hover:border-zinc-500 transition-all"
              >
                {p.logo_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                    alt={p.provider_name}
                    className="w-4 h-4 rounded"
                  />
                )}
                {p.provider_type === 'rent' ? 'Arrendar' : 'Comprar'} en {p.provider_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
