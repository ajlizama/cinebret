'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = { onClose: () => void }

export default function AuthModal({ onClose }: Props) {
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMensaje('')
    setCargando(true)

    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('Correo o contraseña incorrectos')
      else onClose()
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMensaje('Revisa tu correo para confirmar tu cuenta')
    }

    setCargando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">
            {modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Correo</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              placeholder="tu@correo.com"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {mensaje && <p className="text-emerald-400 text-sm">{mensaje}</p>}

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-yellow-400 text-zinc-950 font-semibold rounded-lg py-2.5 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50"
          >
            {cargando ? 'Cargando...' : modo === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500 mt-4">
          {modo === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button
            onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setError(''); setMensaje('') }}
            className="text-zinc-300 hover:text-white transition-colors"
          >
            {modo === 'login' ? 'Créala aquí' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
