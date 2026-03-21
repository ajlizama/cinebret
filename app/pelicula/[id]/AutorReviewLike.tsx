'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function AutorReviewLike({ peliculaId }: { peliculaId: string }) {
  const { user } = useAuth()
  const [likes, setLikes] = useState(0)
  const [youLiked, setYouLiked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const { count } = await supabase
        .from('autor_review_likes')
        .select('*', { count: 'exact', head: true })
        .eq('pelicula_id', peliculaId)
      setLikes(count ?? 0)

      if (user) {
        const { data } = await supabase
          .from('autor_review_likes')
          .select('pelicula_id')
          .eq('pelicula_id', peliculaId)
          .eq('user_id', user.id)
          .maybeSingle()
        setYouLiked(!!data)
      }
    }
    fetch()
  }, [peliculaId, user])

  const toggle = async () => {
    if (!user || loading) return
    setLoading(true)
    if (youLiked) {
      await supabase.from('autor_review_likes').delete().eq('pelicula_id', peliculaId).eq('user_id', user.id)
      setLikes(l => l - 1)
      setYouLiked(false)
    } else {
      await supabase.from('autor_review_likes').insert({ pelicula_id: peliculaId, user_id: user.id })
      setLikes(l => l + 1)
      setYouLiked(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={!user}
      title={user ? (youLiked ? 'Quitar like' : 'Me gusta esta reseña') : 'Inicia sesión para dar like'}
      className={`flex items-center gap-1.5 text-xs mt-4 transition-colors ${
        youLiked ? 'text-yellow-400' : user ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-700 cursor-default'
      }`}
    >
      <span className="text-sm leading-none">{youLiked ? '♥' : '♡'}</span>
      {likes > 0 && <span>{likes}</span>}
    </button>
  )
}
