'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import AuthModal from './AuthModal'

type Props = { active?: 'inicio' | 'catalogo' | 'cambios' | 'estadisticas' | 'mi-lista' }

export default function Nav({ active }: Props) {
  const { user, loading, signOut } = useAuth()
  const [modalAbierto, setModalAbierto] = useState(false)

  const link = (href: string, label: string, key: Props['active']) => (
    <Link
      href={href}
      className={`hover:text-white transition-colors ${active === key ? 'text-white font-medium' : ''}`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <nav className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Fila 1: logo + auth */}
          <div className="flex items-center justify-between mb-2.5">
            <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
            <div className="flex items-center gap-3">
              <a
                href="https://open.spotify.com/playlist/4KR3H2OR7VzwZM0AMDskap?si=c8ac5239a4564661"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-green-400 transition-colors"
                aria-label="Playlist Spotify CineBret"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/>
                </svg>
              </a>
              <a
                href="https://www.instagram.com/cinebret/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-pink-400 transition-colors"
                aria-label="Instagram CineBret"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="3.5" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </a>
              {!loading && (
                user ? (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-xs hidden sm:block truncate max-w-36">{user.email}</span>
                    <button
                      onClick={signOut}
                      className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white rounded-lg px-3 py-1.5 text-xs transition-colors"
                    >
                      Salir
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setModalAbierto(true)}
                    className="border border-zinc-700 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400 rounded-lg px-3 py-1.5 text-xs transition-colors whitespace-nowrap"
                  >
                    Iniciar sesión
                  </button>
                )
              )}
            </div>
          </div>
          {/* Fila 2: links */}
          <div className="flex items-center gap-5 text-sm text-zinc-500 overflow-x-auto scrollbar-none">
            {link('/catalogo', 'Catálogo', 'catalogo')}
            {link('/cambios', 'Cambios', 'cambios')}
            {link('/estadisticas', 'Estadísticas', 'estadisticas')}
            {user && link('/mi-lista', 'Mi lista', 'mi-lista')}
          </div>
        </div>
      </nav>

      {modalAbierto && <AuthModal onClose={() => setModalAbierto(false)} />}
    </>
  )
}
