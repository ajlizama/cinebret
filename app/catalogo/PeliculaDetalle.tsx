'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AutorReviewLike from '@/app/pelicula/[id]/AutorReviewLike'
import ReviewSection from '@/app/pelicula/[id]/ReviewSection'

type Props = {
  peliculaId: string
  esReviewAutor: boolean
  sinopsisIa: string | null
  hideSinopsis?: boolean
}

export default function PeliculaDetalle({ peliculaId, esReviewAutor, sinopsisIa, hideSinopsis }: Props) {
  const [reviewAutor, setReviewAutor] = useState<string | null>(null)
  const [sinopsis, setSinopsis] = useState<string | null>(hideSinopsis ? null : sinopsisIa)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase
      .from('enriquecimiento')
      .select('review_autor, sinopsis_chilensis')
      .eq('pelicula_id', peliculaId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.review_autor) setReviewAutor(data.review_autor)
        if (!hideSinopsis && !sinopsisIa && data?.sinopsis_chilensis) setSinopsis(data.sinopsis_chilensis)
        setCargando(false)
      })
  }, [peliculaId, sinopsisIa])

  return (
    <div className="space-y-4 mt-4 pt-4 border-t border-zinc-800">
      {/* Review CineBret */}
      {esReviewAutor ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-yellow-400 text-zinc-950 font-bold px-2 py-0.5 rounded-full">
              ✍️ Review CineBret
            </span>
          </div>
          {sinopsis && (
            <p className="text-zinc-400 text-sm leading-relaxed mb-3 italic border-l-2 border-zinc-700 pl-3">
              {sinopsis}
            </p>
          )}
          {cargando ? (
            <p className="text-zinc-600 text-sm italic">Cargando reseña...</p>
          ) : reviewAutor ? (
            <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-line">{reviewAutor}</p>
          ) : null}
          <AutorReviewLike peliculaId={peliculaId} />
        </div>
      ) : sinopsis ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-medium">
              🤖 Sinopsis IA
            </span>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed italic">{sinopsis}</p>
        </div>
      ) : null}

      {/* Reviews de usuarios */}
      <ReviewSection peliculaId={peliculaId} />
    </div>
  )
}
