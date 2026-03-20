'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type SeguidoVisto = {
  username: string
  rating: number | null
}

export default function SeguidosQueVieron({ peliculaId }: { peliculaId: string }) {
  const { user } = useAuth()
  const [vistos, setVistos] = useState<SeguidoVisto[]>([])

  useEffect(() => {
    if (!user) return

    // 1. IDs de usuarios que sigo
    supabase.from('follows').select('following_id').eq('follower_id', user.id)
      .then(async ({ data: follows }) => {
        if (!follows || follows.length === 0) return
        const ids = follows.map((f: any) => f.following_id)

        // 2. De esos, quiénes vieron esta película
        const { data: vistas } = await supabase
          .from('user_peliculas')
          .select('user_id, rating')
          .eq('pelicula_id', peliculaId)
          .eq('visto', true)
          .in('user_id', ids)

        if (!vistas || vistas.length === 0) return

        // 3. Obtener sus usernames
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username')
          .in('user_id', vistas.map((v: any) => v.user_id))

        if (!profiles) return

        const usernameMap: Record<string, string> = {}
        profiles.forEach((p: any) => { usernameMap[p.user_id] = p.username })

        setVistos(vistas
          .filter((v: any) => usernameMap[v.user_id])
          .map((v: any) => ({ username: usernameMap[v.user_id], rating: v.rating }))
        )
      })
  }, [user, peliculaId])

  if (!user || vistos.length === 0) return null

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Ya la vieron</p>
      <div className="flex flex-wrap gap-2">
        {vistos.map(v => (
          <Link
            key={v.username}
            href={`/perfil/${v.username}`}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <span className="text-zinc-300 text-xs font-medium">@{v.username}</span>
            {v.rating && <span className="text-yellow-400 text-xs">{v.rating}/10</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
