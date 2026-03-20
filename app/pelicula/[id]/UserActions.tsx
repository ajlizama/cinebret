'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function UserActions({ peliculaId }: { peliculaId: string }) {
  const { user } = useAuth()
  const [visto, setVisto] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase
      .from('user_peliculas')
      .select('visto, rating, watchlist')
      .eq('user_id', user.id)
      .eq('pelicula_id', peliculaId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setVisto(data.visto); setWatchlist(data.watchlist); setRating(data.rating) }
        setLoading(false)
      })
  }, [user, peliculaId])

  const upsert = async (campos: { visto?: boolean; watchlist?: boolean; rating?: number | null }) => {
    if (!user) return
    const nuevo = { visto, watchlist, rating, ...campos }
    setVisto(nuevo.visto ?? false)
    setWatchlist(nuevo.watchlist ?? false)
    setRating(nuevo.rating ?? null)
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: nuevo.rating },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  if (!user || loading) return null

  return (
    <div className="flex items-center gap-3 flex-wrap mt-4">
      <button
        onClick={() => upsert({ visto: !visto })}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
          visto
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
        }`}
      >
        {visto ? '✓ Vista' : '○ Marcar como vista'}
      </button>

      <button
        onClick={() => upsert({ watchlist: !watchlist })}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
          watchlist
            ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
        }`}
      >
        {watchlist ? '★ En watchlist' : '☆ Watchlist'}
      </button>

      {visto && (
        <select
          value={rating ?? ''}
          onChange={e => upsert({ visto: true, rating: e.target.value ? Number(e.target.value) : null })}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Tu nota —</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
            <option key={n} value={n}>{n}/10</option>
          ))}
        </select>
      )}
    </div>
  )
}
