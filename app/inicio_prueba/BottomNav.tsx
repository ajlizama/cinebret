'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function BottomNav() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* Menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64 bg-zinc-900 border border-zinc-700 rounded-2xl p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <Link href="/reel" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-orange-400">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-white text-sm font-medium">Tinder</span>
            </Link>
            <Link href="/comunidad" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-violet-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="text-white text-sm font-medium">Comunidad</span>
            </Link>
            <Link href="/cinereels" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" className="text-pink-400">
                <path d="M8 5v14l11-7z" fill="currentColor"/>
              </svg>
              <span className="text-white text-sm font-medium">CineReels</span>
            </Link>
            <Link href="/mapa" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-emerald-400">
                <circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/>
              </svg>
              <span className="text-white text-sm font-medium">Mapa</span>
            </Link>
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-8 bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-full px-8 py-2.5 shadow-2xl">
          <Link href="/inicio_prueba" className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-yellow-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            <span className="text-yellow-400 text-[10px] font-semibold">Inicio</span>
          </Link>

          <button onClick={() => setMenuOpen(!menuOpen)} className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className={menuOpen ? 'text-yellow-400' : 'text-zinc-400'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            <span className={`text-[10px] font-semibold ${menuOpen ? 'text-yellow-400' : 'text-zinc-400'}`}>Menú</span>
          </button>

          <Link href={user ? '/perfil' : '/login'} className="flex flex-col items-center gap-0.5 cursor-pointer">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span className="text-zinc-400 text-[10px] font-semibold">Perfil</span>
          </Link>
        </div>
      </div>
    </>
  )
}
