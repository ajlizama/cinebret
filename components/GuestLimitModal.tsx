'use client'

import { useState } from 'react'
import AuthModal from './AuthModal'

export default function GuestLimitModal({ onDismiss }: { onDismiss?: () => void }) {
  const [showAuth, setShowAuth] = useState(false)

  if (showAuth) {
    return <AuthModal onClose={() => setShowAuth(false)} />
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-4 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-400/20 flex items-center justify-center mx-auto mb-4">
            <img src="/logo-oficial.png" alt="CineBret" className="h-10 w-auto" />
          </div>
          <h2 className="text-white text-xl font-black">¡Te está gustando!</h2>
          <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
            Crea tu cuenta gratis para seguir explorando sin límites
          </p>
        </div>

        {/* Benefits */}
        <div className="px-6 pb-4 space-y-2.5">
          {[
            { icon: '🔥', text: 'Swipe ilimitado en Tinder' },
            { icon: '🎬', text: 'CineReels sin restricciones' },
            { icon: '🗺️', text: 'Mapa completo de conexiones' },
            { icon: '⭐', text: 'Guarda tu watchlist y ratings' },
            { icon: '🤖', text: 'Recomendaciones personalizadas' },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-lg">{b.icon}</span>
              <span className="text-zinc-300 text-sm">{b.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 pt-2 space-y-2">
          <button
            onClick={() => setShowAuth(true)}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold py-3 rounded-xl text-sm transition-colors"
          >
            Crear cuenta gratis
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="w-full text-zinc-500 hover:text-zinc-300 text-xs py-2 transition-colors"
          >
            Ya tengo cuenta · Iniciar sesión
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="w-full text-zinc-600 hover:text-zinc-400 text-xs py-1.5 transition-colors"
            >
              Seguir explorando el catálogo sin cuenta
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
