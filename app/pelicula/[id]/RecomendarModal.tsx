'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

type Seguido = {
  user_id: string
  username: string
  avatar_url: string | null
}

type Props = {
  peliculaId: string
  peliculaTitulo: string
  onClose: () => void
}

export default function RecomendarModal({ peliculaId, peliculaTitulo, onClose }: Props) {
  const { user } = useAuth()
  const [seguidos, setSeguidos] = useState<Seguido[]>([])
  const [cargando, setCargando] = useState(true)

  const [step, setStep] = useState<1 | 2>(1)
  const [selectedUser, setSelectedUser] = useState<Seguido | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      if (!follows || follows.length === 0) { setCargando(false); return }

      const ids = follows.map((f: any) => f.following_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', ids)

      setSeguidos((profiles ?? []).map((p: any) => ({
        user_id: p.user_id, username: p.username, avatar_url: p.avatar_url ?? null,
      })))
      setCargando(false)
    })()
  }, [user])

  const enviar = async () => {
    if (!user || !selectedUser || enviando) return
    setEnviando(true)
    await supabase.from('notifications').insert({
      user_id: selectedUser.user_id,
      type: 'recomendacion',
      from_user_id: user.id,
      meta: {
        pelicula_id: peliculaId,
        pelicula_titulo: peliculaTitulo,
        mensaje: mensaje.trim() || null,
        redirect_url: `/pelicula/${peliculaId}`,
      },
    })
    setEnviando(false)
    setExito(true)
    setTimeout(() => onClose(), 1200)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-w-sm mx-auto max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          {step === 2 ? (
            <button
              onClick={() => { setStep(1); setSelectedUser(null); setMensaje('') }}
              className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>
          ) : (
            <p className="text-white font-semibold text-sm">Recomendar a...</p>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {exito ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-3xl mb-3">✈️</p>
              <p className="text-white font-semibold">¡Recomendación enviada!</p>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {cargando && <p className="text-zinc-500 text-xs text-center py-4">Cargando...</p>}
            {!cargando && seguidos.length === 0 && (
              <p className="text-zinc-500 text-xs text-center py-4">No seguís a nadie todavía.</p>
            )}
            <div className="space-y-2">
              {seguidos.map(s => (
                <button
                  key={s.user_id}
                  onClick={() => { setSelectedUser(s); setStep(2) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-zinc-600 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300">
                    {s.avatar_url
                      ? <img loading="lazy" src={s.avatar_url} alt={s.username} className="w-full h-full object-cover" />
                      : s.username[0]?.toUpperCase()
                    }
                  </div>
                  <span className="text-white text-sm flex-1 text-left">@{s.username}</span>
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 px-5 py-4 gap-4">
            {/* Selected user */}
            {selectedUser && (
              <div className="flex items-center gap-3 bg-zinc-800 rounded-xl px-3 py-2.5">
                <div className="w-9 h-9 rounded-full bg-zinc-600 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300">
                  {selectedUser.avatar_url
                    ? <img loading="lazy" src={selectedUser.avatar_url} alt={selectedUser.username} className="w-full h-full object-cover" />
                    : selectedUser.username[0]?.toUpperCase()
                  }
                </div>
                <div>
                  <p className="text-white text-sm font-medium">@{selectedUser.username}</p>
                  <p className="text-zinc-500 text-xs line-clamp-1">{peliculaTitulo}</p>
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1.5">¿Qué le querés decir? (opcional)</label>
              <textarea
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                placeholder="Te va a encantar porque..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            <button
              onClick={enviar}
              disabled={enviando}
              className="w-full bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-3 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              {enviando ? 'Enviando...' : 'Enviar recomendación'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
