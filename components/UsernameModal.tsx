'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export default function UsernameModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUsername } = useAuth()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const guardar = async () => {
    const val = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!val || val.length < 3) { setError('Mínimo 3 caracteres (letras, números y _)'); return }
    if (val.length > 20) { setError('Máximo 20 caracteres'); return }
    setCargando(true)
    setError('')
    const { error: err } = await supabase.from('profiles').insert({ user_id: user!.id, username: val })
    if (err) {
      setError(err.code === '23505' ? 'Ese username ya está tomado' : 'Error al guardar, intenta otro')
      setCargando(false)
      return
    }
    await refreshUsername()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-white font-bold text-lg mb-1">Elige tu username</h2>
        <p className="text-zinc-500 text-sm mb-6">Con esto activas tu perfil público y otros te pueden seguir.</p>

        <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 mb-1">
          <span className="text-zinc-500 text-sm mr-1">@</span>
          <input
            autoFocus
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && guardar()}
            placeholder="tu_nombre"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <p className="text-zinc-600 text-xs mb-4">Solo letras, números y guión bajo. No se puede cambiar después.</p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-zinc-700 text-zinc-400 rounded-lg py-2.5 text-sm hover:border-zinc-500 transition-colors">
            Ahora no
          </button>
          <button
            onClick={guardar}
            disabled={cargando || !username.trim()}
            className="flex-1 bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
          >
            {cargando ? 'Guardando...' : 'Activar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
