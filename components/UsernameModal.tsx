'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export default function UsernameModal({ onClose, forced = false }: { onClose: () => void; forced?: boolean }) {
  const { user, refreshUsername } = useAuth()
  const [username, setUsername] = useState('')
  const [disponible, setDisponible] = useState<boolean | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sanitize = (val: string) => val.toLowerCase().replace(/[^a-z0-9_]/g, '')

  useEffect(() => {
    const val = sanitize(username)
    if (val.length < 3) { setDisponible(null); return }
    setVerificando(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('user_id').eq('username', val).maybeSingle()
      setDisponible(!data)
      setVerificando(false)
    }, 400)
  }, [username])

  const guardar = async () => {
    const val = sanitize(username)
    if (!val || val.length < 3) { setError('Mínimo 3 caracteres (letras, números y _)'); return }
    if (val.length > 20) { setError('Máximo 20 caracteres'); return }
    if (!disponible) { setError('Ese username no está disponible'); return }
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

  const val = sanitize(username)
  const mostrarEstado = val.length >= 3

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={forced ? undefined : onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        {forced ? (
          <>
            <div className="mb-3 text-center"><svg className="w-8 h-8 mx-auto text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
            <h2 className="text-white font-bold text-xl mb-1 text-center">¡Activa tu perfil y sigue a tus amigos!</h2>
            <p className="text-zinc-500 text-sm mb-6 text-center">Elige un username para tener perfil público, dar likes y seguir a otros.</p>
          </>
        ) : (
          <>
            <h2 className="text-white font-bold text-lg mb-1">Elige tu username</h2>
            <p className="text-zinc-500 text-sm mb-6">Con esto activas tu perfil público y otros te pueden seguir.</p>
          </>
        )}

        <div className={`flex items-center bg-zinc-800 border rounded-lg px-3 py-2.5 mb-1 transition-colors ${
          mostrarEstado
            ? disponible ? 'border-emerald-500' : 'border-red-500'
            : 'border-zinc-700'
        }`}>
          <span className="text-zinc-500 text-sm mr-1">@</span>
          <input
            autoFocus
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && guardar()}
            placeholder="tu_nombre"
            maxLength={20}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
          {mostrarEstado && (
            <span className="text-xs ml-2 shrink-0">
              {verificando ? <span className="text-zinc-500">...</span>
                : disponible ? <span className="text-emerald-400">✓ disponible</span>
                : <span className="text-red-400">✗ tomado</span>}
            </span>
          )}
        </div>
        <p className="text-zinc-600 text-xs mb-4">Solo letras, números y guión bajo. No se puede cambiar después.</p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          {!forced && (
            <button onClick={onClose} className="flex-1 border border-zinc-700 text-zinc-400 rounded-lg py-2.5 text-sm hover:border-zinc-500 transition-colors">
              Ahora no
            </button>
          )}
          <button
            onClick={guardar}
            disabled={cargando || !disponible || verificando}
            className="flex-1 bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
          >
            {cargando ? 'Guardando...' : 'Activar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
