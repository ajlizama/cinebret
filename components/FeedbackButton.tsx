'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export default function FeedbackButton() {
  const { user } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  if (!user) return null

  const enviar = async () => {
    if (!mensaje.trim()) return
    setEnviando(true)
    await supabase.from('feedback').insert({
      user_id: user.id,
      email: user.email,
      mensaje: mensaje.trim(),
      pagina: window.location.pathname,
    })
    setEnviado(true)
    setEnviando(false)
    setMensaje('')
    setTimeout(() => { setAbierto(false); setEnviado(false) }, 2000)
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-6 right-6 z-40 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-white rounded-full w-11 h-11 flex items-center justify-center shadow-lg transition-colors"
        title="Dejar comentario"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Modal */}
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6" onClick={() => setAbierto(false)}>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">¿Encontraste algo raro?</h3>
              <button onClick={() => setAbierto(false)} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="text-zinc-500 text-xs mb-3">Cuéntame errores, películas mal clasificadas, o lo que sea.</p>

            {enviado ? (
              <p className="text-emerald-400 text-sm text-center py-4">¡Gracias! 🙌</p>
            ) : (
              <>
                <textarea
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                  placeholder="Ej: Inception aparece en la categoría equivocada..."
                  rows={4}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                />
                <button
                  onClick={enviar}
                  disabled={enviando || !mensaje.trim()}
                  className="mt-3 w-full bg-yellow-400 text-zinc-950 font-semibold rounded-xl py-2.5 text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
                >
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
