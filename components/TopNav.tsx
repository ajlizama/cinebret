'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'

const ADMIN_ID = 'b5eafe05-9ec8-4b23-b0b4-137148ecbac2'

const MENU_ITEMS = [
  { href: '/reel', label: 'Tinder', color: 'text-orange-400', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { href: '/comunidad', label: 'Comunidad', color: 'text-violet-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  { href: '/cinereels', label: 'CineReels', color: 'text-pink-400', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" className="text-pink-400"/></svg> },
  { href: '/mapa', label: 'Mapa', color: 'text-emerald-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg> },
  null,
  { href: '/cast-crew', label: 'Cast & Crew', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> },
  { href: '/trailers', label: 'Trailers & Clips', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" strokeLinejoin="round"/></svg> },
  { href: '/estrenos', label: 'Estrenos', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> },
  { href: '/musica', label: 'Música', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg> },
  { href: '/cinequest', label: 'CineQuest', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { href: '/calculadora', label: 'Calculadora', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4m-4 4h4"/></svg> },
  null,
  { href: '/cineblitz', label: 'CineBlitz', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> },
  { href: '/actorchain', label: 'ActorChain', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg> },
  { href: '/posters', label: 'Posters', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/></svg> },
  { href: '/adivina', label: 'Adivina la Peli', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a9 9 0 11-6.219-8.56M12 3v4m0 14v-4m9-5h-4M3 12h4"/></svg> },
  { href: '/batalla', label: 'Batalla', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> },
  { href: '/tierlist', label: 'Tier List', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h12M4 14h8M4 18h14"/></svg> },
  { href: '/conexion', label: 'Conexión Cinéfila', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.59 8.59L15.42 15.42"/></svg> },
  { href: '/quien-soy', label: '¿Quién soy?', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
  { href: '/fusionador', label: 'Fusionador', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg> },
  { href: '/juntos', label: 'Ver Juntos', color: 'text-yellow-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg> },
  null,
  { href: '/estadisticas', label: 'Estadísticas', color: 'text-zinc-400', icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },
  { href: '/cambios', label: 'Plataformas', color: 'text-zinc-400', adminOnly: true, icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> },
]

type SearchResult = { id: string; titulo: string; titulo_ingles: string | null; poster_path: string | null; anio: number | null; nota_imdb: number | null; _isSerie?: boolean }

export default function TopNav() {
  const { user } = useAuth()
  const { mode, setMode, hydrated } = useMediaMode()
  const activeMode = hydrated ? mode : 'peliculas'
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<SearchResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Search debounce
  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const q = busqueda.trim().toLowerCase()
      const [{ data: pels }, { data: sers }] = await Promise.all([
        supabase.from('peliculas').select('id, titulo, titulo_ingles, poster_path, anio, nota_imdb').or(`titulo.ilike.%${q}%,titulo_ingles.ilike.%${q}%`).limit(8),
        supabase.from('series').select('id, titulo, titulo_ingles, poster_path, anio_inicio, nota_imdb').or(`titulo.ilike.%${q}%,titulo_ingles.ilike.%${q}%`).limit(4),
      ])
      const r: SearchResult[] = [
        ...(pels ?? []).map((p: any) => ({ ...p, _isSerie: false })),
        ...(sers ?? []).map((s: any) => ({ id: s.id, titulo: s.titulo, titulo_ingles: s.titulo_ingles, poster_path: s.poster_path, anio: s.anio_inicio, nota_imdb: s.nota_imdb, _isSerie: true })),
      ]
      r.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
      setResultados(r)
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setBusqueda('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

  return (
    <>
      {/* Top nav bar */}
      <nav className="sticky top-0 z-50 px-4 py-2.5 bg-zinc-950 border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Logo + Toggle */}
          <div className="flex items-center gap-2.5">
            <Link href="/catalogo" className="shrink-0">
              <img src="/logo-oficial.png" alt="CineBret" className="h-8 w-auto" />
            </Link>
            <div className="flex bg-zinc-800/80 rounded-lg p-0.5 gap-0.5" suppressHydrationWarning>
              <button onClick={() => setMode('peliculas')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${activeMode === 'peliculas' ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`} suppressHydrationWarning>Películas</button>
              <button onClick={() => setMode('series')} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${activeMode === 'series' ? 'bg-yellow-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`} suppressHydrationWarning>Series</button>
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center gap-2">
            {/* Home */}
            <Link href="/catalogo" className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
            </Link>

            {/* Search - overlays from right */}
            <div ref={searchRef} className="relative">
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
              </button>
              {searchOpen && (
                <div className="absolute top-full mt-2 right-0 w-72 z-30">
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-t-xl rounded-b-xl px-3 py-2 shadow-2xl" style={busqueda ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : undefined}>
                    <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
                    <input
                      type="text"
                      value={busqueda}
                      onChange={e => setBusqueda(e.target.value)}
                      autoFocus
                      placeholder="Buscar película, serie..."
                      className="flex-1 bg-transparent text-[16px] text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                    <button onClick={() => { setSearchOpen(false); setBusqueda('') }} className="text-zinc-500 text-xs cursor-pointer shrink-0">✕</button>
                  </div>
                  {busqueda && (
                    <div className="bg-zinc-900 border border-zinc-700 border-t-0 rounded-b-xl overflow-hidden max-h-[60vh] overflow-y-auto">
                      {buscando ? (
                        <p className="text-zinc-500 text-xs px-4 py-3">Buscando...</p>
                      ) : resultados.length === 0 ? (
                        <p className="text-zinc-500 text-xs px-4 py-3">Sin resultados</p>
                      ) : (
                        resultados.map(p => (
                          <Link
                            key={`${p._isSerie ? 's' : 'p'}-${p.id}`}
                            href={p._isSerie ? `/serie/${p.id}` : `/pelicula/${p.id}`}
                            onClick={() => { setBusqueda(''); setSearchOpen(false) }}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800/60 last:border-0 transition-colors"
                          >
                            <div className="w-8 shrink-0 rounded overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                              {p.poster_path && <img src={`https://image.tmdb.org/t/p/w92${p.poster_path}`} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-xs font-medium leading-snug line-clamp-1">{p.titulo_ingles ?? p.titulo}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${p._isSerie ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>{p._isSerie ? 'Serie' : 'Película'}</span>
                                {p.anio && <span className="text-zinc-500 text-[10px]">{p.anio}</span>}
                                {p.nota_imdb && <span className="text-yellow-400 text-[10px]">⭐ {p.nota_imdb}</span>}
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Menu button */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>

            {/* Profile */}
            {user ? (
              <Link href="/perfil" className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </Link>
            ) : (
              <button onClick={() => setShowAuth(true)} className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" className="text-zinc-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute top-16 right-4 w-72 max-h-[70vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl p-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            {MENU_ITEMS.map((item, i) => {
              if (!item) return <div key={`div-${i}`} className="border-t border-zinc-800 my-1" />
              if ((item as any).adminOnly && user?.id !== ADMIN_ID) return null
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

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
