'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from './PeliculaDetalle'
import AgregarAListaButton from '@/app/pelicula/[id]/AgregarAListaButton'
import ParaTi, { type RecExport } from '@/app/comunidad/ParaTi'
import CuestionarioOnboarding from '@/app/perfil/CuestionarioOnboarding'

type UserPelicula = { visto: boolean; rating: number | null; watchlist: boolean }

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', logo: '/paramount_plus.svg' },
]

export type Pelicula = {
  id: string; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; rt_score: number | null; metacritic_score: number | null
  runtime: number | null; boxoffice: number | null; categoria: string | null
  plataformas: string[]; es_review_autor: boolean; sello_bret: boolean
  director: string | null; director_oscars: number | null; actores: string | null
  actores_oscars: Record<string, number> | null; compositor: string | null
  compositor_oscars: number | null; generos: string[]; poster_path: string | null
  oscars: string | null; imdb_id: string | null; youtube_trailer_key: string | null
  sinopsis: string | null
}

type Orden = 'imdb' | 'rt' | 'metacritic' | 'boxoffice' | 'anio_desc' | 'anio_asc' | 'titulo'

const OSCAR_OPCIONES = [
  'Ganadora Mejor Película', 'Ganadora Mejor Película Animada', 'Ganadora Mejor Película Internacional',
  'Ganadora de Oscar', 'Nominada al Oscar', 'Ganó Mejor Director', 'Ganó Mejor Actor',
  'Ganó Mejor Actriz', 'Ganó Mejor Guión', 'Ganó Mejor Banda Sonora', 'Ganó Mejor Fotografía',
  'Director con Oscar', 'Actor con Oscar', 'Compositor con Oscar',
]

function matchOscarFiltro(p: Pelicula, filtros: string[]): boolean {
  if (filtros.length === 0) return true
  return filtros.every(f => {
    const osc = (p.oscars ?? '').toLowerCase()
    const gano = osc.startsWith('ganó')
    if (f === 'Ganadora Mejor Película') return gano && osc.includes('mejor película') && !osc.includes('animad') && !osc.includes('internacional') && !osc.includes('extranjera') && !osc.includes('habla no inglesa')
    if (f === 'Ganadora Mejor Película Animada') return gano && osc.includes('animad')
    if (f === 'Ganadora Mejor Película Internacional') return gano && (osc.includes('internacional') || osc.includes('extranjera') || osc.includes('habla no inglesa'))
    if (f === 'Ganadora de Oscar') return gano
    if (f === 'Nominada al Oscar') return osc.includes('nominad')
    if (f === 'Ganó Mejor Director') return gano && osc.includes('mejor director')
    if (f === 'Ganó Mejor Actor') return gano && osc.includes('mejor actor') && !osc.includes('mejor actriz')
    if (f === 'Ganó Mejor Actriz') return gano && osc.includes('mejor actriz')
    if (f === 'Ganó Mejor Guión') return gano && (osc.includes('guión') || osc.includes('guion'))
    if (f === 'Ganó Mejor Banda Sonora') return gano && (osc.includes('banda sonora') || osc.includes('música original') || osc.includes('musica original'))
    if (f === 'Ganó Mejor Fotografía') return gano && (osc.includes('fotografía') || osc.includes('fotografia') || osc.includes('cinematografía'))
    if (f === 'Director con Oscar') return (p.director_oscars ?? 0) > 0
    if (f === 'Actor con Oscar') return p.actores_oscars != null && Object.values(p.actores_oscars).some(v => v > 0)
    if (f === 'Compositor con Oscar') return (p.compositor_oscars ?? 0) > 0
    return true
  })
}

type MultiSelectProps = { label: string; opciones: string[]; seleccionados: string[]; onChange: (s: string[]) => void }

function MultiSelect({ label, opciones, seleccionados, onChange }: MultiSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const toggle = (op: string) => onChange(seleccionados.includes(op) ? seleccionados.filter(s => s !== op) : [...seleccionados, op])
  const opcionesFiltradas = opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))
  const handleClose = () => { setAbierto(false); setBusqueda('') }

  return (
    <div className="relative">
      <button onClick={() => setAbierto(!abierto)}
        className={`border rounded-lg px-4 py-2 text-sm flex items-center gap-2 transition-colors ${seleccionados.length > 0 ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
        {label}
        {seleccionados.length > 0 && <span className="bg-zinc-950 text-yellow-400 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{seleccionados.length}</span>}
        <span className="text-xs">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={handleClose} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl min-w-52 flex flex-col max-h-72">
            <div className="p-2 border-b border-zinc-800 shrink-0">
              <input autoFocus type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} onClick={e => e.stopPropagation()}
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500" />
            </div>
            {seleccionados.length > 0 && <div className="border-b border-zinc-800 px-3 py-2 shrink-0"><button onClick={() => onChange([])} className="text-xs text-zinc-500 hover:text-white transition-colors">Limpiar selección</button></div>}
            <div className="overflow-y-auto">
              {opcionesFiltradas.length === 0 ? <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p> : opcionesFiltradas.map(op => (
                <div key={op} onClick={() => toggle(op)} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer text-sm">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${seleccionados.includes(op) ? 'bg-yellow-400 border-yellow-400' : 'border-zinc-600'}`}>
                    {seleccionados.includes(op) && <span className="text-zinc-950 text-xs font-bold">✓</span>}
                  </div>
                  <span className="truncate text-zinc-300">{op}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const MOOD_CATS = [
  { id: "Pa'l domingo de bajón", emoji: '🛋️', short: 'Bajón', grad: 'from-amber-500 to-orange-600', dim: 'from-amber-950/70 to-orange-950/70 border-amber-800' },
  { id: "Pa' saltar del sillón", emoji: '⚡', short: 'Del sillón', grad: 'from-violet-500 to-blue-600', dim: 'from-violet-950/70 to-blue-950/70 border-violet-800' },
  { id: "Pa' quedar con el cerebro como licuadora", emoji: '🤯', short: 'Licuadora', grad: 'from-rose-500 to-pink-600', dim: 'from-rose-950/70 to-pink-950/70 border-rose-800' },
  { id: "Pa' llorar a moco tendido", emoji: '😭', short: 'A moco tendido', grad: 'from-cyan-500 to-teal-600', dim: 'from-cyan-950/70 to-teal-950/70 border-cyan-800' },
]

/* ─────────── Expanded detail panel (TMDB-style) ─────────── */
function PanelExpandido({
  p, up, user, generosFiltro, setGenerosFiltro, setExpandida,
  toggleVisto, toggleWatchlist, setRating,
}: {
  p: Pelicula; up: UserPelicula | undefined; user: any
  generosFiltro: string[]; setGenerosFiltro: (g: string[]) => void
  setExpandida: (id: string | null) => void
  toggleVisto: (id: string, e: React.MouseEvent) => void
  toggleWatchlist: (id: string, e: React.MouseEvent) => void
  setRating: (id: string, r: number, e: any) => void
}) {
  const platsActivas = PLATAFORMAS.filter(pl => p.plataformas.includes(pl.id))
  const oscarGano = p.oscars?.toLowerCase().startsWith('ganó')
  const oscarNum = p.oscars?.match(/\d+/)?.[0]

  return (
    <div id={`expand-${p.id}`} className="col-span-2 md:col-span-4 rounded-2xl overflow-hidden my-2 shadow-2xl scroll-mt-28" onClick={e => e.stopPropagation()}>
      <div className="bg-zinc-900 relative">
        {/* Close button */}
        <button onClick={() => setExpandida(null)}
          className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm transition-colors">✕</button>

        {/* ══ MOBILE layout ══ */}
        <div className="md:hidden">
          {/* Banner backdrop */}
          <div className="relative h-44 overflow-hidden">
            {p.poster_path && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://image.tmdb.org/t/p/w780${p.poster_path}`} alt="" className="w-full h-full object-cover object-top" />
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/30 via-transparent to-zinc-900" />
              </>
            )}
          </div>

          {/* Poster overlapping + title */}
          <div className="px-4 -mt-16 relative z-10">
            <div className="flex gap-3 items-end">
              <div className="flex flex-col items-center gap-1.5">
                <Link href={`/pelicula/${p.id}`} className="relative w-24 shrink-0 rounded-lg overflow-hidden shadow-2xl border-2 border-zinc-900 block" style={{ aspectRatio: '2/3' }}>
                  {p.poster_path ? (
                    <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="96px" />
                  ) : (
                    <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><span className="text-2xl">🎬</span></div>
                  )}
                </Link>
                <Link href={`/pelicula/${p.id}`} className="text-[10px] text-yellow-400 hover:text-yellow-300 font-medium transition-colors">Ver ficha</Link>
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <h3 className="text-lg font-bold text-white leading-tight">
                  {p.titulo_ingles || p.titulo}
                  {p.anio && <span className="text-zinc-400 font-normal ml-1 text-base">({p.anio})</span>}
                </h3>
                {p.titulo_ingles && p.titulo !== p.titulo_ingles && (
                  <p className="text-zinc-500 text-xs mt-0.5">{p.titulo}</p>
                )}
              </div>
            </div>
          </div>

          {/* Info stacked */}
          <div className="px-4 pt-3 pb-4 space-y-3">
            {/* Ratings */}
            <div className="flex items-center gap-3 flex-wrap">
              {p.nota_imdb != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                    <span className="text-yellow-400 font-bold text-xs">{p.nota_imdb}</span>
                  </div>
                  <span className="text-zinc-500 text-[10px]">IMDB</span>
                </div>
              )}
              {p.rt_score != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-red-400 flex items-center justify-center">
                    <span className="text-red-400 font-bold text-xs">{p.rt_score}%</span>
                  </div>
                  <span className="text-zinc-500 text-[10px]">RT</span>
                </div>
              )}
              {p.metacritic_score != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-green-400 flex items-center justify-center">
                    <span className="text-green-400 font-bold text-xs">{p.metacritic_score}</span>
                  </div>
                  <span className="text-zinc-500 text-[10px]">MC</span>
                </div>
              )}
              {p.oscars && p.oscars !== 'N/A' && (
                <div className="flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/oscar.png" alt="Oscar" className={`h-8 w-auto ${oscarGano ? '' : 'opacity-30'}`} />
                  {oscarNum && <span className={`text-xs font-bold ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="text-xs text-zinc-400 flex flex-wrap gap-1">
              {p.generos.length > 0 && <span>{p.generos.join(', ')}</span>}
              {p.runtime != null && <span>· {Math.floor(p.runtime / 60)}h {p.runtime % 60}min</span>}
              {p.categoria && <span>· {p.categoria}</span>}
            </div>

            {/* Platforms */}
            {platsActivas.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {platsActivas.map(pl => (
                  <div key={pl.id} className="rounded-md bg-white px-1.5 py-0.5 flex items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
                  </div>
                ))}
              </div>
            )}

            {/* User actions */}
            {user && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={e => toggleVisto(p.id, e)}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 text-zinc-400 hover:border-emerald-400'}`}>
                  {up?.visto ? '✓ Vista' : '○ Vista'}
                </button>
                <button onClick={e => toggleWatchlist(p.id, e)}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-600 text-zinc-400 hover:border-yellow-400'}`}>
                  {up?.watchlist ? '★ Watchlist' : '☆ Watchlist'}
                </button>
                {up?.visto && (
                  <select value={up.rating ?? ''} onChange={e => { if (e.target.value) setRating(p.id, Number(e.target.value), e as any) }}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
                    <option value="">Rating</option>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}/10</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Trailer + links */}
            <div className="flex flex-wrap gap-3 items-center">
              {p.youtube_trailer_key && (
                <a href={`https://www.youtube.com/watch?v=${p.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-white bg-zinc-800 rounded-lg px-3 py-1.5">▶ Tráiler</a>
              )}
              {p.imdb_id && <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-yellow-500 hover:text-yellow-300"><svg className="w-5 h-3.5" viewBox="0 0 64 32" fill="currentColor"><path d="M0 0h8v32H0zm13 0h7l3 12 3-12h7v32h-6V12l-3 11h-2l-3-11v19h-6zm26 0h12c3 0 5 1 6 3s2 5 2 9v8c0 4-1 7-2 9s-3 3-6 3H39zm7 6v20h3c1 0 2-1 2-2V8c0-1-1-2-2-2zm17-6h8c4 0 6 1 7 4 1 2 1 5 1 8 0 4-1 6-3 7 2 1 3 4 3 8v5c0 0 0 1 0 0h-7v-7c0-3-1-5-3-5h-1v12h-5zm5 6v8h1c2 0 3-1 3-4s-1-4-3-4z"/></svg>IMDb</a>}
              <a href={`https://open.spotify.com/search/${encodeURIComponent((p.titulo_ingles || p.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-500 hover:text-green-300"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/></svg>Soundtrack</a>
              <AgregarAListaButton peliculaId={p.id} />
            </div>

            {/* Synopsis */}
            {p.sinopsis && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium">Vista general</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{p.sinopsis}</p>
              </div>
            )}

            {/* Team */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {p.director && <div><p className="text-white text-sm font-medium">{p.director}</p><p className="text-zinc-500 text-xs">Director</p></div>}
              {p.compositor && <div><p className="text-white text-sm font-medium">{p.compositor}</p><p className="text-zinc-500 text-xs">Compositor</p></div>}
            </div>
            {p.actores && <div><p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Reparto</p><p className="text-sm text-zinc-300">{p.actores}</p></div>}

            {/* Badges */}
            <div className="flex gap-2 flex-wrap">
              {p.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-2 py-0.5 rounded">CB Review</span>}
              {p.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 px-2 py-0.5 rounded font-bold">★ Recomendada</span>}
              {p.boxoffice != null && <span className="text-xs text-zinc-400">Taquilla: ${(p.boxoffice / 1_000_000).toFixed(0)}M</span>}
            </div>
          </div>
        </div>

        {/* ══ DESKTOP layout ══ */}
        <div className="hidden md:block relative overflow-hidden">
          {/* Background poster — right 55% */}
          {p.poster_path && (
            <div className="absolute inset-y-0 right-0 w-[55%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://image.tmdb.org/t/p/w780${p.poster_path}`} alt="" className="w-full h-full object-cover object-center" />
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-900/50" />
              <div className="absolute inset-0 bg-zinc-900/40" />
            </div>
          )}

          <div className="relative z-10 p-6 flex gap-8">
            {/* Poster + Ver ficha */}
            <div className="flex flex-col items-center gap-2 shrink-0 self-start">
              <Link href={`/pelicula/${p.id}`} className="relative w-48 rounded-xl overflow-hidden shadow-2xl block" style={{ aspectRatio: '2/3' }}>
                {p.poster_path ? (
                  <Image src={`https://image.tmdb.org/t/p/w342${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="192px" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><span className="text-4xl">🎬</span></div>
                )}
              </Link>
              <Link href={`/pelicula/${p.id}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors">Ver ficha</Link>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">
                  {p.titulo_ingles || p.titulo}
                  {p.anio && <span className="text-zinc-300 font-normal ml-2">({p.anio})</span>}
                </h3>
                {p.titulo_ingles && p.titulo !== p.titulo_ingles && <p className="text-zinc-400 text-sm mt-0.5 drop-shadow">{p.titulo}</p>}
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-300 flex-wrap drop-shadow">
                {p.generos.length > 0 && <span>{p.generos.join(', ')}</span>}
                {p.runtime != null && <span>· {Math.floor(p.runtime / 60)}h {p.runtime % 60}min</span>}
                {p.categoria && <span>· {p.categoria}</span>}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {p.nota_imdb != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-10 rounded-full border-2 border-yellow-400 bg-black/40 backdrop-blur-sm flex items-center justify-center"><span className="text-yellow-400 font-bold text-sm">{p.nota_imdb}</span></div>
                    <span className="text-zinc-400 text-xs drop-shadow">IMDB</span>
                  </div>
                )}
                {p.rt_score != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-10 rounded-full border-2 border-red-400 bg-black/40 backdrop-blur-sm flex items-center justify-center"><span className="text-red-400 font-bold text-sm">{p.rt_score}%</span></div>
                    <span className="text-zinc-400 text-xs drop-shadow">RT</span>
                  </div>
                )}
                {p.metacritic_score != null && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-10 rounded-full border-2 border-green-400 bg-black/40 backdrop-blur-sm flex items-center justify-center"><span className="text-green-400 font-bold text-sm">{p.metacritic_score}</span></div>
                    <span className="text-zinc-400 text-xs drop-shadow">MC</span>
                  </div>
                )}
                {p.oscars && p.oscars !== 'N/A' && (
                  <div className="flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/oscar.png" alt="Oscar" className={`h-10 w-auto drop-shadow-lg ${oscarGano ? '' : 'opacity-30'}`} />
                    <div>
                      {oscarNum && <span className={`text-sm font-bold drop-shadow ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                      <p className="text-zinc-400 text-[10px] leading-none drop-shadow">{oscarGano ? 'Ganó' : 'Nom.'}</p>
                    </div>
                  </div>
                )}
              </div>

              {platsActivas.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {platsActivas.map(pl => (
                    <div key={pl.id} className="rounded-lg bg-white px-2 py-1 flex items-center shadow">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pl.logo} alt={pl.nombre} className="h-4 w-auto object-contain" />
                    </div>
                  ))}
                </div>
              )}

              {user && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={e => toggleVisto(p.id, e)}
                    className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors backdrop-blur-sm ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-400 text-zinc-200 bg-black/30 hover:border-emerald-400'}`}>
                    {up?.visto ? '✓ Vista' : '○ Marcar vista'}
                  </button>
                  <button onClick={e => toggleWatchlist(p.id, e)}
                    className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border font-medium transition-colors backdrop-blur-sm ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-400 text-zinc-200 bg-black/30 hover:border-yellow-400'}`}>
                    {up?.watchlist ? '★ En watchlist' : '☆ Watchlist'}
                  </button>
                  {up?.visto && (
                    <select value={up.rating ?? ''} onChange={e => { if (e.target.value) setRating(p.id, Number(e.target.value), e as any) }}
                      className="bg-black/40 backdrop-blur-sm border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                      <option value="">Tu rating</option>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}/10</option>)}
                    </select>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-center">
                {p.youtube_trailer_key && (
                  <a href={`https://www.youtube.com/watch?v=${p.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-white bg-black/40 backdrop-blur-sm hover:bg-black/60 border border-zinc-600 rounded-lg px-3 py-1.5 transition-colors">▶ Reproducir tráiler</a>
                )}
                {p.imdb_id && <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 drop-shadow"><svg className="w-5 h-3.5" viewBox="0 0 64 32" fill="currentColor"><path d="M0 0h8v32H0zm13 0h7l3 12 3-12h7v32h-6V12l-3 11h-2l-3-11v19h-6zm26 0h12c3 0 5 1 6 3s2 5 2 9v8c0 4-1 7-2 9s-3 3-6 3H39zm7 6v20h3c1 0 2-1 2-2V8c0-1-1-2-2-2zm17-6h8c4 0 6 1 7 4 1 2 1 5 1 8 0 4-1 6-3 7 2 1 3 4 3 8v5c0 0 0 1 0 0h-7v-7c0-3-1-5-3-5h-1v12h-5zm5 6v8h1c2 0 3-1 3-4s-1-4-3-4z"/></svg>IMDb</a>}
                <a href={`https://open.spotify.com/search/${encodeURIComponent((p.titulo_ingles || p.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 drop-shadow"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/></svg>Soundtrack</a>
                <AgregarAListaButton peliculaId={p.id} />
              </div>

              {p.sinopsis && (
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1 font-medium drop-shadow">Vista general</p>
                  <p className="text-sm text-zinc-200 leading-relaxed drop-shadow">{p.sinopsis}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {p.director && <div><p className="text-white text-sm font-medium drop-shadow">{p.director}</p><p className="text-zinc-400 text-xs drop-shadow">Director</p></div>}
                {p.compositor && <div><p className="text-white text-sm font-medium drop-shadow">{p.compositor}</p><p className="text-zinc-400 text-xs drop-shadow">Compositor</p></div>}
              </div>
              {p.actores && <div><p className="text-xs text-zinc-400 uppercase tracking-wide mb-1 drop-shadow">Reparto</p><p className="text-sm text-zinc-200 drop-shadow">{p.actores}</p></div>}

              <div className="flex gap-3 items-center flex-wrap">
                {p.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-2 py-0.5 rounded shadow">CB Review</span>}
                {p.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 bg-black/30 px-2 py-0.5 rounded font-bold shadow">★ Recomendada</span>}
                {p.boxoffice != null && <span className="text-xs text-zinc-400 drop-shadow">Taquilla: <span className="text-zinc-200">${(p.boxoffice / 1_000_000).toFixed(0)}M</span></span>}
              </div>
            </div>
          </div>
        </div>

        {/* Reviews — both layouts */}
        <div className="px-4 md:px-6 pb-5 pt-2 border-t border-zinc-800">
          <PeliculaDetalle peliculaId={p.id} esReviewAutor={p.es_review_autor} sinopsisIa={p.sinopsis} />
        </div>
      </div>
    </div>
  )
}

/* ─────────── Main component ─────────── */
export default function CatalogoInteractivo({ peliculas }: { peliculas: Pelicula[] }) {
  const { user } = useAuth()
  const [userPeliculas, setUserPeliculas] = useState<Record<string, UserPelicula>>({})
  const [busqueda, setBusqueda] = useState('')
  const [plataformasFiltro, setPlataformasFiltro] = useState<string[]>([])
  const [categoriasFiltro, setCategoriasFiltro] = useState<string[]>([])
  const [generosFiltro, setGenerosFiltro] = useState<string[]>([])
  const [directoresFiltro, setDirectoresFiltro] = useState<string[]>([])
  const [actoresFiltro, setActoresFiltro] = useState<string[]>([])
  const [compositoresFiltro, setCompositoresFiltro] = useState<string[]>([])
  const [oscarsFiltro, setOscarsFiltro] = useState<string[]>([])
  const [anioDesde, setAnioDesde] = useState<string>('')
  const [anioHasta, setAnioHasta] = useState<string>('')
  const [soloReviews, setSoloReviews] = useState(false)
  const [soloSello, setSoloSello] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('imdb')
  const [pagina, setPagina] = useState(0)
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false)
  const [vistaMode, setVistaMode] = useState<'grilla' | 'lista'>('grilla')
  const [showCuestionario, setShowCuestionario] = useState(false)
  const [prefKey, setPrefKey] = useState(0)
  const [anonPrefs, setAnonPrefs] = useState<{ birth_year: number | null; fav_movies: string[]; generos_preferidos: string[]; mood_ranking: string[]; peso_critica: number; peso_seguidores: number } | null>(null)
  const [paraTiMovie, setParaTiMovie] = useState<Pelicula | null>(null)

  const recToPelicula = (rec: RecExport): Pelicula => ({
    id: rec.id, titulo: rec.titulo, titulo_ingles: rec.titulo_ingles, anio: rec.anio,
    nota_imdb: rec.nota_imdb, rt_score: rec.rt_score, metacritic_score: rec.metacritic_score,
    runtime: rec.runtime, boxoffice: rec.boxoffice, categoria: rec.categoria,
    plataformas: rec.plataformas, es_review_autor: rec.esReviewAutor, sello_bret: false,
    director: rec.director, director_oscars: null, actores: rec.actores,
    actores_oscars: null, compositor: rec.compositor, compositor_oscars: null,
    generos: rec.generos, poster_path: rec.poster_path, oscars: rec.oscars,
    imdb_id: rec.imdb_id, youtube_trailer_key: rec.youtube_trailer_key, sinopsis: rec.sinopsis,
  })
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) { setUserPeliculas({}); return }
    supabase.from('user_peliculas').select('pelicula_id, visto, rating, watchlist').eq('user_id', user.id)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, UserPelicula> = {}
        data.forEach(r => { map[r.pelicula_id] = { visto: r.visto, rating: r.rating, watchlist: r.watchlist } })
        setUserPeliculas(map)
      })
  }, [user])

  const upsertUserPelicula = async (peliculaId: string, campos: Partial<UserPelicula>) => {
    if (!user) return
    const actual = userPeliculas[peliculaId] ?? { visto: false, rating: null, watchlist: false }
    const nuevo = { ...actual, ...campos }
    setUserPeliculas(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, rating: nuevo.rating, watchlist: nuevo.watchlist },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  const toggleVisto = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: !userPeliculas[peliculaId]?.visto })
  }
  const toggleWatchlist = (peliculaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    upsertUserPelicula(peliculaId, { watchlist: !userPeliculas[peliculaId]?.watchlist })
  }
  const setRatingFn = (peliculaId: string, rating: number, e: any) => {
    if (e?.stopPropagation) e.stopPropagation()
    upsertUserPelicula(peliculaId, { visto: true, rating })
  }

  const generosDisponibles = [...new Set(peliculas.flatMap(p => p.generos))].sort()
  const directoresDisponibles = [...new Set(peliculas.map(p => p.director).filter(Boolean) as string[])].sort()
  const actoresDisponibles = [...new Set(peliculas.flatMap(p => (p.actores || '').split(',').map(a => a.trim()).filter(Boolean)))].sort()
  const compositoresDisponibles = [...new Set(peliculas.map(p => p.compositor).filter(Boolean) as string[])].sort()

  const peliculasFiltradas = peliculas
    .filter(p => {
      const terminos = busqueda.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      const matchBusqueda = terminos.length === 0 || terminos.every(q =>
        p.titulo.toLowerCase().includes(q) || (p.titulo_ingles || '').toLowerCase().includes(q) ||
        (p.director || '').toLowerCase().includes(q) || (p.actores || '').toLowerCase().includes(q) ||
        p.generos.some(g => g.toLowerCase().includes(q)) || (p.compositor || '').toLowerCase().includes(q)
      )
      return matchBusqueda &&
        (plataformasFiltro.length === 0 || plataformasFiltro.some(plat => p.plataformas.includes(plat))) &&
        (categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria || '')) &&
        (generosFiltro.length === 0 || generosFiltro.every(g => p.generos.includes(g))) &&
        (directoresFiltro.length === 0 || directoresFiltro.includes(p.director || '')) &&
        (actoresFiltro.length === 0 || actoresFiltro.some(a => (p.actores || '').includes(a))) &&
        (compositoresFiltro.length === 0 || compositoresFiltro.includes(p.compositor || '')) &&
        (!soloReviews || p.es_review_autor) && (!soloSello || p.sello_bret) &&
        matchOscarFiltro(p, oscarsFiltro) &&
        (!anioDesde || (p.anio ?? 0) >= Number(anioDesde)) &&
        (!anioHasta || (p.anio ?? 9999) <= Number(anioHasta))
    })
    .sort((a, b) => {
      if (orden === 'imdb') return (b.nota_imdb || 0) - (a.nota_imdb || 0)
      if (orden === 'rt') return (b.rt_score || 0) - (a.rt_score || 0)
      if (orden === 'metacritic') return (b.metacritic_score || 0) - (a.metacritic_score || 0)
      if (orden === 'boxoffice') return (b.boxoffice || 0) - (a.boxoffice || 0)
      if (orden === 'anio_desc') return (b.anio || 0) - (a.anio || 0)
      if (orden === 'anio_asc') return (a.anio || 0) - (b.anio || 0)
      if (orden === 'titulo') return (a.titulo_ingles || a.titulo).localeCompare(b.titulo_ingles || b.titulo)
      return 0
    })

  const hayFiltros = busqueda || plataformasFiltro.length > 0 || categoriasFiltro.length > 0 ||
    generosFiltro.length > 0 || directoresFiltro.length > 0 || actoresFiltro.length > 0 ||
    compositoresFiltro.length > 0 || oscarsFiltro.length > 0 || soloReviews || soloSello || anioDesde || anioHasta

  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, oscarsFiltro, soloReviews, soloSello, orden])

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([]); setGenerosFiltro([])
    setDirectoresFiltro([]); setActoresFiltro([]); setCompositoresFiltro([])
    setOscarsFiltro([]); setSoloReviews(false); setSoloSello(false); setAnioDesde(''); setAnioHasta(''); setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const filtrosAvanzadosCount = [...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro].length

  // Auto-scroll to expanded panel
  useEffect(() => {
    if (expandida) {
      setTimeout(() => {
        const el = document.getElementById(`expand-${expandida}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 80)
    }
  }, [expandida])

  return (
    <>
      {/* ── HERO ── */}
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fondo-interstellar.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950" />
        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white text-center mb-1.5 tracking-tight">
            Bienvenido a <span className="text-yellow-400">CineBret</span>
          </h1>
          <p className="text-zinc-300 text-sm md:text-base text-center mb-6 max-w-md">
            Buscador y recomendador inteligente de las mejores películas
          </p>
          <div className="relative w-full max-w-xl">
            <input type="text" placeholder="Buscar película, director, actor..." value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(0) }}
              className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder:text-zinc-400 focus:outline-none focus:border-white/50 text-sm" />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-6">
        {/* ── ¿En qué mood estás? ── */}
        <div className="mb-5">
          <h2 className="text-base font-bold text-white mb-2">¿En qué mood estás?</h2>
          <div className="grid grid-cols-4 gap-2">
            {MOOD_CATS.map(cat => {
              const activa = categoriasFiltro.includes(cat.id)
              return (
                <button key={cat.id}
                  onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                  className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-gradient-to-br ${activa ? `${cat.grad} border-transparent text-white shadow-md` : `${cat.dim} text-zinc-300 hover:text-white`}`}>
                  <span className="text-base md:text-sm">{cat.emoji}</span>
                  <span className="hidden md:inline truncate">{cat.id}</span>
                  <span className="md:hidden text-[10px] text-center leading-tight">{cat.short}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── ¿Qué plataformas tienes? ── */}
        <div className="mb-5">
          <h2 className="text-base font-bold text-white mb-2">¿Qué plataformas tienes?</h2>
          <div className="flex flex-wrap items-center gap-2">
            {PLATAFORMAS.map(plat => {
              const activa = plataformasFiltro.includes(plat.id)
              return (
                <button key={plat.id}
                  onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                  className={`h-8 w-14 rounded-lg border flex items-center justify-center transition-colors ${activa ? 'bg-white border-white' : 'border-zinc-600 bg-zinc-800 hover:border-zinc-400'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
                </button>
              )
            })}
            <div className="w-px h-6 bg-zinc-700 mx-1 hidden md:block" />
            <button onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${mostrarFiltrosAvanzados ? 'bg-zinc-700 border-zinc-600 text-white' : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-white'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" /></svg>
              Más filtros
              {filtrosAvanzadosCount > 0 && <span className="bg-yellow-400 text-zinc-950 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold leading-none">{filtrosAvanzadosCount}</span>}
            </button>
            {hayFiltros && <button onClick={limpiarFiltros} className="h-8 px-3 rounded-lg border border-zinc-600 text-xs text-zinc-500 hover:text-white transition-colors">✕ Limpiar</button>}
          </div>

          {/* Panel filtros avanzados */}
          {mostrarFiltrosAvanzados && (
            <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MultiSelect label="Género" opciones={generosDisponibles} seleccionados={generosFiltro} onChange={setGenerosFiltro} />
                <MultiSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} />
                <MultiSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} />
                <MultiSelect label="🏆 Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
                <MultiSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} />
              </div>
              <div className="flex items-center flex-wrap gap-3 pt-1">
                <button onClick={() => setSoloReviews(!soloReviews)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloReviews ? 'bg-yellow-400 text-zinc-950 border-yellow-400 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>Solo reviews CineBret</button>
                <button onClick={() => setSoloSello(!soloSello)} className={`border rounded-lg px-3 py-1.5 text-xs transition-colors ${soloSello ? 'bg-emerald-500 text-white border-emerald-500 font-medium' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>Solo recomendadas</button>
                <div className="flex items-center gap-2 md:ml-auto">
                  <span className="text-zinc-500 text-xs">Año</span>
                  <input type="number" placeholder="Desde" value={anioDesde} onChange={e => setAnioDesde(e.target.value)} min={1900} max={2099}
                    className={`bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none ${anioDesde ? 'border-yellow-400' : 'border-zinc-700'}`} />
                  <span className="text-zinc-600 text-xs">—</span>
                  <input type="number" placeholder="Hasta" value={anioHasta} onChange={e => setAnioHasta(e.target.value)} min={1900} max={2099}
                    className={`bg-zinc-800 border rounded-lg px-2 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none ${anioHasta ? 'border-yellow-400' : 'border-zinc-700'}`} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Para Ti ── */}
        <div className="mb-6 border-t border-zinc-800 pt-5">
          {user ? (
            <ParaTi key={prefKey} onEditPreferences={() => setShowCuestionario(true)}
              onMovieExpand={rec => { setParaTiMovie(recToPelicula(rec)); setExpandida(null) }} />
          ) : anonPrefs ? (
            <ParaTi key={prefKey} onEditPreferences={() => setShowCuestionario(true)} preferenciasExternas={anonPrefs}
              onMovieExpand={rec => { setParaTiMovie(recToPelicula(rec)); setExpandida(null) }} />
          ) : (
            <div>
              <h2 className="text-base font-bold text-white mb-3">🎬 Para Ti</h2>
              <div className="bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent border border-yellow-400/30 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm md:text-base mb-1">
                    ✨ Completa el cuestionario para recibir recomendaciones personalizadas
                  </p>
                  <p className="text-zinc-400 text-xs md:text-sm">
                    Inicia sesión y cuéntanos tus gustos para descubrir aún mejores películas para ti
                  </p>
                </div>
                <button
                  onClick={() => setShowCuestionario(true)}
                  className="shrink-0 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
                >
                  Completar cuestionario
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Para Ti expansion panel */}
        {paraTiMovie && (
          <div className="mb-4">
            <PanelExpandido
              p={paraTiMovie} up={userPeliculas[paraTiMovie.id]} user={user}
              generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
              setExpandida={() => setParaTiMovie(null)} toggleVisto={toggleVisto}
              toggleWatchlist={toggleWatchlist} setRating={setRatingFn}
            />
          </div>
        )}

        {/* ── Catálogo ── */}
        <div className="border-t border-zinc-800 pt-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">Catálogo</h2>
              {/* Toggle Grilla / Lista */}
              <div className="flex rounded-full border border-zinc-700 overflow-hidden text-xs font-medium">
                <button onClick={() => setVistaMode('grilla')}
                  className={`px-3 py-1 transition-colors ${vistaMode === 'grilla' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
                  Grilla
                </button>
                <button onClick={() => setVistaMode('lista')}
                  className={`px-3 py-1 transition-colors ${vistaMode === 'lista' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
                  Lista
                </button>
              </div>
              <p className="text-sm text-zinc-500">{peliculasFiltradas.length} resultado{peliculasFiltradas.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setSoloReviews(!soloReviews)} className={`flex items-center gap-1 transition-opacity ${soloReviews ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                <span className={`font-serif italic font-bold px-1.5 py-0.5 rounded text-[10px] ${soloReviews ? 'bg-yellow-400 text-zinc-950 ring-1 ring-yellow-300' : 'bg-yellow-400 text-zinc-950'}`}>CB</span>
              </button>
              <button onClick={() => setSoloSello(!soloSello)} className={`flex items-center gap-1 transition-opacity ${soloSello ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                <span className={`font-serif italic font-bold border px-1.5 py-0.5 rounded text-[10px] ${soloSello ? 'border-emerald-400 text-emerald-400 ring-1 ring-emerald-400/40' : 'border-emerald-400 text-emerald-400'}`}>★</span>
              </button>
            </div>
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500">
              <option value="imdb">Mayor IMDB</option>
              <option value="rt">Mayor RT</option>
              <option value="metacritic">Mayor MC</option>
              <option value="boxoffice">Mayor taquilla</option>
              <option value="anio_desc">Más recientes</option>
              <option value="anio_asc">Más antiguas</option>
              <option value="titulo">Título A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── CONTENIDO: GRILLA o LISTA ── */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 pb-6">

        {vistaMode === 'grilla' ? (
          /* ── GRILLA con expansión full-width ── */
          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 grid-flow-row-dense items-start">
            {peliculasPagina.map(pelicula => {
              const isExpanded = expandida === pelicula.id
              const up = userPeliculas[pelicula.id]
              const platsActivas = PLATAFORMAS.filter(pl => pelicula.plataformas.includes(pl.id))
              const oscarGano = pelicula.oscars?.toLowerCase().startsWith('ganó')
              const oscarNum = pelicula.oscars?.match(/\d+/)?.[0]

              return (
                <React.Fragment key={pelicula.id}>
                  <div
                    onClick={() => { setExpandida(isExpanded ? null : pelicula.id); setParaTiMovie(null) }}
                    className={`relative rounded-xl overflow-hidden cursor-pointer group bg-zinc-800 shadow-lg hover:shadow-2xl transition-all ${isExpanded ? 'ring-2 ring-yellow-400' : ''}`}
                    style={{ aspectRatio: '2/3' }}
                  >
                    {pelicula.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w342${pelicula.poster_path}`} alt={pelicula.titulo_ingles || pelicula.titulo} fill
                        className={`object-cover transition-transform duration-500 ${isExpanded ? '' : 'group-hover:scale-105'}`} sizes="(max-width: 768px) 50vw, 25vw" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-800"><span className="text-zinc-600 text-5xl">🎬</span></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                      {pelicula.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded leading-none shadow">CB</span>}
                      {pelicula.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 bg-black/70 px-1.5 py-0.5 rounded leading-none font-bold shadow">★</span>}
                    </div>
                    {user && (
                      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                        <button onClick={e => toggleVisto(pelicula.id, e)}
                          className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 bg-black/60 text-white hover:border-emerald-400'}`}>✓</button>
                        <button onClick={e => toggleWatchlist(pelicula.id, e)}
                          className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-white/70 bg-black/60 text-white hover:border-yellow-400'}`}>★</button>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3 z-10">
                      <div className="flex items-end justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {platsActivas.length > 0 && (
                            <div className="flex gap-1 mb-2 flex-wrap">
                              {platsActivas.map(pl => (
                                <div key={pl.id} className="rounded bg-white px-1 py-0.5 flex items-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-white font-bold text-sm md:text-base leading-tight line-clamp-2">{pelicula.titulo_ingles || pelicula.titulo}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {pelicula.anio && <span className="text-zinc-300 text-xs md:text-sm">{pelicula.anio}</span>}
                            {pelicula.nota_imdb != null && <span className="text-yellow-400 font-bold text-xs md:text-sm">⭐ {pelicula.nota_imdb}</span>}
                          </div>
                          {pelicula.categoria && (
                            <span className="inline-block mt-1.5 text-[10px] md:text-[11px] bg-white/15 backdrop-blur-sm text-zinc-200 px-2 py-0.5 rounded-full leading-tight">
                              {pelicula.categoria}
                            </span>
                          )}
                        </div>
                        {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                          <div className="shrink-0 self-end flex flex-col items-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/oscar.png" alt="Oscar" className={`h-9 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`} />
                            {oscarNum && <span className={`text-xs font-bold leading-none -mt-1 ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <PanelExpandido p={pelicula} up={up} user={user}
                      generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
                      setExpandida={setExpandida} toggleVisto={toggleVisto}
                      toggleWatchlist={toggleWatchlist} setRating={setRatingFn} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        ) : (
          /* ── LISTA ── */
          <div ref={gridRef}>
            {/* Desktop table */}
            <div className="hidden md:block border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    <th className="text-left px-4 py-3 w-72">Película</th>
                    <th className="text-center px-2 py-3 w-16">Año</th>
                    <th className="text-center px-2 py-3 w-16">IMDB</th>
                    <th className="text-center px-3 py-3 w-48">Géneros</th>
                    <th className="text-center px-2 py-3 w-40">Plataformas</th>
                    <th className="text-center px-2 py-3 w-20">Oscars</th>
                    <th className="text-center px-3 py-3 w-48">Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  {peliculasPagina.map(pelicula => {
                    const isExpanded = expandida === pelicula.id
                    const up = userPeliculas[pelicula.id]
                    const oscarGano = pelicula.oscars?.toLowerCase().startsWith('ganó')
                    const oscarNum = pelicula.oscars?.match(/\d+/)?.[0]
                    return (
                      <React.Fragment key={pelicula.id}>
                        <tr
                          onClick={() => { setExpandida(isExpanded ? null : pelicula.id); setParaTiMovie(null) }}
                          className={`cursor-pointer border-t border-zinc-800/60 transition-colors ${isExpanded ? 'bg-zinc-800' : 'hover:bg-zinc-900/60'}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                              <div className="relative w-9 shrink-0 rounded overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                                {pelicula.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`} alt="" fill className="object-cover" sizes="36px" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {pelicula.es_review_autor && <span className="font-serif italic font-bold text-[9px] bg-yellow-400 text-zinc-950 px-1 py-0.5 rounded leading-none">CB</span>}
                                  {pelicula.sello_bret && <span className="text-[9px] border border-emerald-400 text-emerald-400 px-1 py-0.5 rounded leading-none font-bold">★</span>}
                                  <span className="text-white font-semibold truncate max-w-52 block">{pelicula.titulo_ingles || pelicula.titulo}</span>
                                </div>
                                {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                                  <span className="text-xs text-zinc-500 truncate max-w-52 block">{pelicula.titulo}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center text-zinc-400 text-xs">{pelicula.anio || '—'}</td>
                          <td className="px-2 py-2.5 text-center">
                            {pelicula.nota_imdb != null ? <span className="font-bold text-yellow-400">⭐ {pelicula.nota_imdb}</span> : <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {pelicula.generos.length > 0 ? pelicula.generos.map(g => (
                                <span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{g}</span>
                              )) : <span className="text-zinc-700">—</span>}
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="grid grid-cols-3 gap-1">
                              {PLATAFORMAS.map(plat => (
                                <div key={plat.id} className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${pelicula.plataformas.includes(plat.id) ? 'opacity-100' : 'opacity-20'}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={plat.logo} alt={plat.nombre} className="h-4 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {pelicula.oscars && pelicula.oscars !== 'N/A' ? (
                              <span className="flex items-center justify-center gap-0.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/oscar.png" alt="Oscar" className={`h-7 w-auto ${oscarGano ? '' : 'opacity-25'}`} />
                                <span className={`text-sm font-bold ${oscarGano ? 'text-yellow-400' : 'text-zinc-600'}`}>{oscarNum}</span>
                              </span>
                            ) : <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-zinc-400">{pelicula.categoria || '—'}</td>
                        </tr>
                        {isExpanded && (
                          <tr><td colSpan={7} className="p-0">
                            <PanelExpandido p={pelicula} up={up} user={user}
                              generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
                              setExpandida={setExpandida} toggleVisto={toggleVisto}
                              toggleWatchlist={toggleWatchlist} setRating={setRatingFn} />
                          </td></tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {peliculasPagina.map(pelicula => {
                const isExpanded = expandida === pelicula.id
                const up = userPeliculas[pelicula.id]
                return (
                  <React.Fragment key={pelicula.id}>
                    <div
                      onClick={() => { setExpandida(isExpanded ? null : pelicula.id); setParaTiMovie(null) }}
                      className={`bg-zinc-900/50 rounded-xl p-3 cursor-pointer transition-colors ${isExpanded ? 'ring-1 ring-yellow-400/50' : ''}`}
                    >
                      <div className="flex gap-3">
                        {/* Poster */}
                        <div className="relative w-16 shrink-0 rounded-lg overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                          {pelicula.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${pelicula.poster_path}`} alt="" fill className="object-cover" sizes="64px" />}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-white font-semibold text-sm leading-snug">{pelicula.titulo_ingles || pelicula.titulo}</p>
                              {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                                <p className="text-zinc-500 text-xs">{pelicula.titulo}</p>
                              )}
                            </div>
                            <span className="text-zinc-600 text-xs shrink-0 mt-1">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
                            {pelicula.anio && <span className="text-zinc-400">{pelicula.anio}</span>}
                            {pelicula.nota_imdb != null && <span className="text-yellow-400 font-bold">⭐ {pelicula.nota_imdb}</span>}
                          </div>
                          {pelicula.categoria && <p className="text-zinc-500 text-xs mt-0.5">{pelicula.categoria}</p>}
                        </div>
                      </div>
                      {/* All platforms row */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {PLATAFORMAS.map(plat => (
                          <div key={plat.id} className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${pelicula.plataformas.includes(plat.id) ? 'opacity-100' : 'opacity-20'}`} style={{ height: 20 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
                          </div>
                        ))}
                      </div>
                    </div>
                    {isExpanded && (
                      <PanelExpandido p={pelicula} up={userPeliculas[pelicula.id]} user={user}
                        generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
                        setExpandida={setExpandida} toggleVisto={toggleVisto}
                        toggleWatchlist={toggleWatchlist} setRating={setRatingFn} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button onClick={() => { setPagina(p => Math.max(0, p - 1)); gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              disabled={pagina === 0} className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors">← Anterior</button>
            <span className="text-sm text-zinc-500">Página <span className="text-white font-medium">{pagina + 1}</span> de {totalPaginas}</span>
            <button onClick={() => { setPagina(p => Math.min(totalPaginas - 1, p + 1)); gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              disabled={pagina === totalPaginas - 1} className="border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm transition-colors">Siguiente →</button>
          </div>
        )}
      </div>

      {/* ── Cuestionario modal ── */}
      {showCuestionario && (
        <CuestionarioOnboarding
          anonymous={!user}
          onComplete={(prefs) => {
            setShowCuestionario(false)
            if (prefs && !user) {
              setAnonPrefs(prefs)
            }
            setPrefKey(k => k + 1)
          }}
          onDismiss={() => setShowCuestionario(false)}
        />
      )}
    </>
  )
}
