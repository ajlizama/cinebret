'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
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

type Props = {
  peliculaId: string
  peliculaTitulo: string
  peliculaPoster: string | null
  toUserId: string
  toUsername: string
  listaTipo: 'watchlist' | 'vistas'
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
  onClose,
}: Props) {
  const { user, username } = useAuth()
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchComentarios()
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [peliculaId, toUserId])

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

    // Notificación con redirect al perfil + película
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4 max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="relative w-10 h-14 rounded overflow-hidden bg-zinc-800 shrink-0">
            {peliculaPoster && (
              <Image
                src={`https://image.tmdb.org/t/p/w92${peliculaPoster}`}
                alt={peliculaTitulo}
                fill
                className="object-cover"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-500 mb-0.5">
              {listaTipo === 'watchlist' ? 'Watchlist' : 'Vistas'} de @{toUsername}
            </p>
            <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{peliculaTitulo}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none shrink-0">✕</button>
        </div>

        {/* Comentarios */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          {comentarios.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center py-4">Sin comentarios aún. ¡Sé el primero!</p>
          ) : (
            comentarios.map(c => (
              <div key={c.id} className="flex items-start gap-2">
                {c.from_avatar ? (
                  <img src={c.from_avatar} alt={c.from_username} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
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

        {/* Input */}
        {user ? (
          <div className="flex gap-2 items-end border-t border-zinc-800 pt-3">
            <textarea
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              placeholder="Escribe un comentario..."
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
        ) : (
          <p className="text-zinc-600 text-xs text-center border-t border-zinc-800 pt-3">Inicia sesión para comentar</p>
        )}
      </div>
    </div>
  )
}
