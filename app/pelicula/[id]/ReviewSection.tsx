'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Review = {
  id: string
  review_text: string
  created_at: string
  user_id: string
  username: string
  avatar_url: string | null
  rating: number | null
  esMia: boolean
  likes: number
  youLiked: boolean
}

function Avatar({ url, username, size = 8 }: { url: string | null; username: string; size?: number }) {
  const px = size * 4
  if (url) return <img src={url} alt={username} className="rounded-full object-cover shrink-0" style={{ width: px, height: px }} />
  return (
    <div className="rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0" style={{ width: px, height: px }}>
      {username[0]?.toUpperCase()}
    </div>
  )
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

export default function ReviewSection({ peliculaId }: { peliculaId: string }) {
  const { user, username } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [miReview, setMiReview] = useState('')
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargarReviews = async () => {
    const { data: rawReviews } = await supabase
      .from('user_reviews')
      .select('id, review_text, created_at, user_id')
      .eq('pelicula_id', peliculaId)
      .order('created_at', { ascending: false })

    if (!rawReviews || rawReviews.length === 0) { setCargando(false); return }

    const userIds = [...new Set(rawReviews.map((r: any) => r.user_id))]
    const reviewIds = rawReviews.map((r: any) => r.id)

    const [{ data: profiles }, { data: ratings }, { data: likes }] = await Promise.all([
      supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', userIds),
      supabase.from('user_peliculas').select('user_id, rating').eq('pelicula_id', peliculaId).in('user_id', userIds),
      supabase.from('review_likes').select('review_id, user_id').in('review_id', reviewIds),
    ])

    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null } })

    const ratingMap: Record<string, number | null> = {}
    ;(ratings ?? []).forEach((r: any) => { ratingMap[r.user_id] = r.rating ?? null })

    const likesCount: Record<string, number> = {}
    const myLikes = new Set<string>()
    ;(likes ?? []).forEach((l: any) => {
      likesCount[l.review_id] = (likesCount[l.review_id] ?? 0) + 1
      if (l.user_id === user?.id) myLikes.add(l.review_id)
    })

    const mapped: Review[] = rawReviews
      .filter((r: any) => profileMap[r.user_id])
      .map((r: any) => ({
        id: r.id,
        review_text: r.review_text,
        created_at: r.created_at,
        user_id: r.user_id,
        username: profileMap[r.user_id].username,
        avatar_url: profileMap[r.user_id].avatar_url,
        rating: ratingMap[r.user_id] ?? null,
        esMia: r.user_id === user?.id,
        likes: likesCount[r.id] ?? 0,
        youLiked: myLikes.has(r.id),
      }))

    setReviews(mapped)
    const mia = mapped.find(r => r.esMia)
    if (mia) setMiReview(mia.review_text)
    setCargando(false)
  }

  useEffect(() => { cargarReviews() }, [peliculaId, user])

  const guardar = async () => {
    if (!user || !miReview.trim()) return
    setGuardando(true)
    await supabase.from('user_reviews').upsert(
      { user_id: user.id, pelicula_id: peliculaId, review_text: miReview.trim() },
      { onConflict: 'user_id,pelicula_id' }
    )
    setEditando(false)
    setGuardando(false)
    await cargarReviews()
  }

  const eliminar = async () => {
    if (!user) return
    await supabase.from('user_reviews').delete().eq('user_id', user.id).eq('pelicula_id', peliculaId)
    setMiReview('')
    setReviews(prev => prev.filter(r => !r.esMia))
  }

  const toggleLike = async (review: Review) => {
    if (!user) return
    if (review.youLiked) {
      await supabase.from('review_likes').delete().eq('user_id', user.id).eq('review_id', review.id)
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, likes: r.likes - 1, youLiked: false } : r))
    } else {
      await supabase.from('review_likes').insert({ user_id: user.id, review_id: review.id })
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, likes: r.likes + 1, youLiked: true } : r))
      if (review.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: review.user_id,
          type: 'like',
          from_user_id: user.id,
          review_id: review.id,
        })
      }
    }
  }

  if (cargando) return null

  const miReviewObj = reviews.find(r => r.esMia)
  const otrasReviews = reviews.filter(r => !r.esMia)

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Reviews</p>

      {/* Mi review */}
      {user && username && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-zinc-400 text-xs font-medium">Tu review</span>
            {miReviewObj && !editando && (
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setEditando(true)} className="text-xs text-zinc-500 hover:text-white transition-colors">Editar</button>
                <button onClick={eliminar} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Eliminar</button>
              </div>
            )}
          </div>

          {editando || !miReviewObj ? (
            <>
              <textarea
                value={miReview}
                onChange={e => setMiReview(e.target.value)}
                placeholder="¿Qué te pareció? Sé honesto..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none mb-3"
              />
              <div className="flex gap-2 justify-end">
                {editando && (
                  <button onClick={() => setEditando(false)} className="text-xs text-zinc-500 hover:text-white px-3 py-1.5">Cancelar</button>
                )}
                <button
                  onClick={guardar}
                  disabled={guardando || !miReview.trim()}
                  className="bg-yellow-400 text-zinc-950 font-semibold text-xs px-4 py-1.5 rounded-lg hover:bg-yellow-300 disabled:opacity-40 transition-colors"
                >
                  {guardando ? 'Guardando...' : 'Publicar review'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-zinc-300 text-sm leading-relaxed">{miReviewObj.review_text}</p>
          )}
        </div>
      )}

      {/* Otras reviews */}
      {otrasReviews.length > 0 && (
        <div className="space-y-3">
          {otrasReviews.map(r => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Avatar url={r.avatar_url} username={r.username} size={7} />
                <Link href={`/perfil/${r.username}`} className="text-white text-xs font-medium hover:text-zinc-300">
                  @{r.username}
                </Link>
                {r.rating && <span className="text-yellow-400 text-xs ml-auto">{r.rating}/10</span>}
                <span className="text-zinc-600 text-xs">{tiempoRelativo(r.created_at)}</span>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed mb-3">{r.review_text}</p>
              <button
                onClick={() => toggleLike(r)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  r.youLiked ? 'text-yellow-400' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <span className="text-sm leading-none">{r.youLiked ? '♥' : '♡'}</span>
                {r.likes > 0 && <span>{r.likes}</span>}
              </button>
            </div>
          ))}
        </div>
      )}

      {reviews.length === 0 && !user && (
        <p className="text-zinc-600 text-xs">Inicia sesión para escribir una review</p>
      )}
      {reviews.length === 0 && user && !username && (
        <p className="text-zinc-600 text-xs">Activa tu perfil para escribir reviews</p>
      )}
    </div>
  )
}
