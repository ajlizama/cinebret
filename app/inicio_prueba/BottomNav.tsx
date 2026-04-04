'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

const MENU_ITEMS = [
  { href: '/reel', label: 'Tinder', color: 'text-orange-400', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/comunidad', label: 'Comunidad', color: 'text-violet-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  { href: '/cinereels', label: 'CineReels', color: 'text-pink-400', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" className="text-pink-400"/></svg> },
  { href: '/mapa', label: 'Mapa', color: 'text-emerald-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg> },
  null, // divider
  { href: '/cast-crew', label: 'Cast & Crew', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> },
  { href: '/trailers', label: 'Trailers & Clips', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" strokeLinejoin="round"/></svg> },
  { href: '/estrenos', label: 'Estrenos', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> },
  { href: '/musica', label: 'Música', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg> },
  { href: '/cinequest', label: 'CineQuest', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { href: '/calculadora', label: 'Calculadora', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4m-4 4h4"/></svg> },
  { href: '/juntos', label: 'Juntos', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  null, // divider
  { href: '/estadisticas', label: 'Estadísticas', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },
  { href: '/cambios', label: 'Plataformas', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> },
]

export default function BottomNav() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-72 max-h-[60vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl p-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            {MENU_ITEMS.map((item, i) => {
              if (!item) return <div key={`div-${i}`} className="border-t border-zinc-800 my-1" />
              return (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-zinc-800 transition-colors"
                  onClick={() => setMenuOpen(false)}>
                  <span className={item.color}>{item.icon}</span>
                  <span className="text-white text-sm font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

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

          <Link href="/perfil" className="flex flex-col items-center gap-0.5 cursor-pointer">
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
