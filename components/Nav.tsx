'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import AuthModal from './AuthModal'

type Props = { active?: 'inicio' | 'catalogo' | 'cambios' | 'estadisticas' }

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
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">CineBret</Link>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            {link('/', 'Inicio', 'inicio')}
            {link('/catalogo', 'Catálogo', 'catalogo')}
            {link('/cambios', 'Cambios', 'cambios')}
            {link('/estadisticas', 'Estadísticas', 'estadisticas')}

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
                <div className="flex items-center gap-3">
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
                  className="border border-zinc-700 text-zinc-400 hover:border-yellow-400 hover:text-yellow-400 rounded-lg px-3 py-1.5 text-xs transition-colors"
                >
                  Iniciar sesión
                </button>
              )
            )}
          </div>
        </div>
      </nav>

      {modalAbierto && <AuthModal onClose={() => setModalAbierto(false)} />}
    </>
  )
}
