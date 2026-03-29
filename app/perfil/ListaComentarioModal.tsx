'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Comentario = {
  id: string
  from_user_id: string
  from_username: string
  from_avatar: string | null
  texto: string
  created_at: string
}

type MovieDetalle = {
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  rt_score: number | null
  metacritic_score: number | null
  runtime: number | null
  poster_path: string | null
  sinopsis: string | null
  director: string | null
  generos: string[] | null
}

type Props = {
  peliculaId: string
  peliculaTitulo: string
  peliculaPoster: string | null
  toUserId: string
  toUsername: string
  listaTipo: 'watchlist' | 'vistas'
  puedecomentar: boolean
  onClose: () => void
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

export default function ListaComentarioModal({
  peliculaId,
  peliculaTitulo,
  peliculaPoster,
  toUserId,
  toUsername,
  listaTipo,
  puedecomentar,
  onClose,
}: Props) {
  const { user } = useAuth()
  const [detalle, setDetalle] = useState<MovieDetalle | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchDetalle()
    fetchComentarios()
  }, [peliculaId, toUserId])

  const fetchDetalle = async () => {
    const { data } = await supabase
      .from('peliculas')
      .select('titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, poster_path, enriquecimiento(sinopsis_chilensis, director, generos)')
      .eq('id', peliculaId)
      .maybeSingle()
    if (!data) return
    const enr = (data as any).enriquecimiento ?? {}
    setDetalle({
      titulo: data.titulo,
      titulo_ingles: data.titulo_ingles ?? null,
      anio: data.anio ?? null,
      nota_imdb: data.nota_imdb ?? null,
      rt_score: data.rt_score ?? null,
      metacritic_score: data.metacritic_score ?? null,
      runtime: data.runtime ?? null,
      poster_path: data.poster_path ?? null,
      sinopsis: enr.sinopsis_chilensis ?? null,
      director: enr.director ?? null,
      generos: enr.generos ?? null,
    })
  }

  const fetchComentarios = async () => {
    const { data } = await supabase
      .from('lista_comentarios')
      .select('id, from_user_id, texto, created_at')
      .eq('pelicula_id', peliculaId)
      .eq('to_user_id', toUserId)
      .eq('lista_tipo', listaTipo)
      .order('created_at', { ascending: true })

    if (!data || data.length === 0) { setComentarios([]); return }

    const userIds = [...new Set(data.map((c: any) => c.from_user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, avatar_url')
      .in('user_id', userIds)

    const profileMap: Record<string, { username: string; avatar_url: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => {
      profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url ?? null }
    })

    setComentarios(data.map((c: any) => ({
      id: c.id,
      from_user_id: c.from_user_id,
      from_username: profileMap[c.from_user_id]?.username ?? '?',
      from_avatar: profileMap[c.from_user_id]?.avatar_url ?? null,
      texto: c.texto,
      created_at: c.created_at,
    })))
  }

  const enviar = async () => {
    if (!user || !texto.trim() || enviando) return
    setEnviando(true)

    const { data: inserted } = await supabase
      .from('lista_comentarios')
      .insert({
        from_user_id: user.id,
        to_user_id: toUserId,
        pelicula_id: peliculaId,
        lista_tipo: listaTipo,
        texto: texto.trim(),
      })
      .select('id')
      .single()

    await supabase.from('notifications').insert({
      user_id: toUserId,
      type: 'lista_comentario',
      from_user_id: user.id,
      meta: {
        pelicula_id: peliculaId,
        pelicula_titulo: peliculaTitulo,
        lista_tipo: listaTipo,
        comentario_id: inserted?.id ?? null,
        redirect_url: `/perfil/${toUsername}`,
      },
    })

    setTexto('')
    await fetchComentarios()
    setEnviando(false)
  }

  const eliminar = async (id: string) => {
    if (!user) return
    await supabase.from('lista_comentarios').delete().eq('id', id).eq('from_user_id', user.id)
    setComentarios(prev => prev.filter(c => c.id !== id))
  }

  const poster = detalle?.poster_path ?? peliculaPoster
  const titulo = detalle?.titulo_ingles || detalle?.titulo || peliculaTitulo

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Scroll interno */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Header: poster + info básica */}
          <div className="flex items-start gap-4">
            <Link
              href={`/pelicula/${peliculaId}`}
              onClick={onClose}
              className="relative w-16 shrink-0 rounded-lg overflow-hidden bg-zinc-800 hover:opacity-80 transition-opacity"
              style={{ aspectRatio: '2/3' }}
            >
              {poster && (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${poster}`}
                  alt={titulo}
                  fill
                  className="object-cover"
                />
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 mb-1">
                En la {listaTipo === 'watchlist' ? 'watchlist' : 'lista de vistas'} de{' '}
                <span className="text-zinc-300">@{toUsername}</span>
              </p>
              <h2 className="text-base font-bold text-white leading-snug">{titulo}</h2>
              {detalle?.anio && <p className="text-xs text-zinc-500 mt-0.5">{detalle.anio}</p>}

              {/* Scores */}
              {(detalle?.nota_imdb || detalle?.rt_score || detalle?.metacritic_score) && (
                <div className="flex gap-3 mt-2 flex-wrap">
                  {detalle.nota_imdb && (
                    <span className="text-xs text-yellow-400 font-semibold">⭐ {detalle.nota_imdb}</span>
                  )}
                  {detalle.rt_score != null && (
                    <span className={`text-xs font-semibold ${detalle.rt_score >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                      🍅 {detalle.rt_score}%
                    </span>
                  )}
                  {detalle.metacritic_score != null && (
                    <span className="text-xs text-zinc-400 font-semibold">MC {detalle.metacritic_score}</span>
                  )}
                </div>
              )}

              {detalle?.director && (
                <p className="text-xs text-zinc-500 mt-1">Dir. <span className="text-zinc-300">{detalle.director}</span></p>
              )}
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none shrink-0">✕</button>
          </div>

          {/* Sinopsis */}
          {detalle?.sinopsis && (
            <p className="text-xs text-zinc-400 leading-relaxed">{detalle.sinopsis}</p>
          )}

          {/* Link ficha */}
          <Link
            href={`/pelicula/${peliculaId}`}
            className="inline-block text-xs text-zinc-500 hover:text-yellow-400 transition-colors"
            onClick={onClose}
          >
            Ver ficha completa →
          </Link>

          {/* Separador comentarios */}
          <div className="border-t border-zinc-800 pt-4">
            {puedecomentar ? (
              <p className="text-xs text-zinc-400 mb-3">
                Déjale un comentario a <span className="text-white font-medium">@{toUsername}</span> sobre esta película
              </p>
            ) : (
              <p className="text-xs text-zinc-500 mb-3">Comentarios</p>
            )}

            {/* Lista comentarios */}
            <div className="space-y-3">
              {comentarios.length === 0 ? (
                puedecomentar
                  ? <p className="text-zinc-600 text-xs">Sin comentarios aún. ¡Sé el primero!</p>
                  : <p className="text-zinc-600 text-xs">Sin comentarios.</p>
              ) : (
                comentarios.map(c => (
                  <div key={c.id} className="flex items-start gap-2">
                    {c.from_avatar ? (
                      <img loading="lazy" src={c.from_avatar} alt={c.from_username} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 mt-0.5">
                        {c.from_username[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-zinc-300">@{c.from_username} </span>
                      <span className="text-xs text-zinc-400">{c.texto}</span>
                      <p className="text-xs text-zinc-600 mt-0.5">{tiempoRelativo(c.created_at)}</p>
                    </div>
                    {user?.id === c.from_user_id && (
                      <button
                        onClick={() => eliminar(c.id)}
                        className="text-zinc-700 hover:text-red-400 text-xs shrink-0 mt-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Input comentario — fijo al fondo */}
        {puedecomentar && (
          <div className="flex gap-2 items-end border-t border-zinc-800 p-4">
            <textarea
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              placeholder={`Comentar en la ${listaTipo === 'watchlist' ? 'watchlist' : 'lista'} de @${toUsername}...`}
              rows={2}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <button
              onClick={enviar}
              disabled={!texto.trim() || enviando}
              className="px-3 py-2 bg-yellow-400 text-zinc-950 rounded-lg text-xs font-medium hover:bg-yellow-300 disabled:opacity-40 transition-colors shrink-0"
            >
              {enviando ? '...' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
