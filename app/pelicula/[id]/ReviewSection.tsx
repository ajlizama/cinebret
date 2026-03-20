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
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

export default function ReviewSection({ peliculaId }: { peliculaId: string }) {
  const { user, username } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [miReview, setMiReview] = useState('')
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargarReviews = async () => {
    const { data } = await supabase
      .from('user_reviews')
      .select('id, review_text, created_at, user_id, profiles(username, avatar_url), user_peliculas!inner(rating)')
      .eq('pelicula_id', peliculaId)
      .order('created_at', { ascending: false })

    if (!data) { setCargando(false); return }

    const mapped: Review[] = (data as any[]).map(r => ({
      id: r.id,
      review_text: r.review_text,
      created_at: r.created_at,
      user_id: r.user_id,
      username: r.profiles?.username ?? 'usuario',
      avatar_url: r.profiles?.avatar_url ?? null,
      rating: r.user_peliculas?.rating ?? null,
      esMia: r.user_id === user?.id,
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
    cargarReviews()
  }

  const eliminar = async () => {
    if (!user) return
    await supabase.from('user_reviews').delete().eq('user_id', user.id).eq('pelicula_id', peliculaId)
    setMiReview('')
    cargarReviews()
  }

  if (cargando) return null

  const otrasReviews = reviews.filter(r => !r.esMia)
  const miReviewObj = reviews.find(r => r.esMia)

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
              <p className="text-zinc-300 text-sm leading-relaxed">{r.review_text}</p>
            </div>
          ))}
        </div>
      )}

      {!user && (
        <p className="text-zinc-600 text-xs">Inicia sesión para escribir una review</p>
      )}
    </div>
  )
}
