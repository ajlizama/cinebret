'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { useMediaMode } from '@/context/MediaModeContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from './PeliculaDetalle'
import AgregarAListaButton from '@/app/pelicula/[id]/AgregarAListaButton'
import ParaTi, { type RecExport } from '@/app/comunidad/ParaTi'
import YouTubeClip from '@/components/YouTubeClip'
import { extractYouTubeId } from '@/lib/youtube'
import EnrichedDetails from '@/components/EnrichedDetails'
import SpotifyPlayer from '@/components/SpotifyPlayer'
import CuestionarioOnboarding from '@/app/perfil/CuestionarioOnboarding'
import SmartSearchBar from '@/components/SmartSearchBar'
import type { SmartFilters } from '@/lib/smart-search'

type UserPelicula = { visto: boolean; rating: number | null; watchlist: boolean }

const PLATAFORMAS = [
  { id: 'netflix', nombre: 'Netflix', logo: '/netflix.png' },
  { id: 'disney_plus', nombre: 'Disney+', logo: '/disney_plus.svg' },
  { id: 'hbo_max', nombre: 'HBO', logo: '/hbo_max.png' },
  { id: 'amazon_prime', nombre: 'Prime', logo: '/amazon_prime.png' },
  { id: 'apple_tv', nombre: 'Apple TV+', logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+', logo: '/paramount_plus.svg' },
  { id: 'mubi', nombre: 'MUBI', logo: '/mubi.png' },
  { id: 'crunchyroll', nombre: 'Crunchyroll', logo: '/crunchyroll.png' },
]

export type Pelicula = {
  id: string; tmdb_id?: number | null; titulo: string; titulo_ingles: string | null; anio: number | null
  nota_imdb: number | null; rt_score: number | null; metacritic_score: number | null
  runtime: number | null; boxoffice: number | null; categoria: string | null
  plataformas: string[]; es_review_autor: boolean; sello_bret: boolean
  director: string | null; director_oscars: number | null; actores: string | string[] | null
  actores_oscars: Record<string, number> | null; compositor: string | null
  compositor_oscars: number | null; generos: string[]; poster_path: string | null
  oscars: string | null; imdb_id: string | null; youtube_trailer_key: string | null
  sinopsis: string | null; video_clip_url: string | null
  keywords: string[]; tagline: string | null; certification: string | null
  backdrop_path: string | null
  _isSerie?: boolean
}

// Normalize actores: can be string, string[], or null
function actoresStr(a: string | string[] | null): string {
  if (!a) return ''
  if (Array.isArray(a)) return a.join(', ')
  return a
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

const CERT_OPTIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'TE', 'TE+7']

const ALLOWED_GENRES = [
  'Acción', 'Aventura', 'Animación', 'Comedia', 'Crimen', 'Documental',
  'Drama', 'Fantasía', 'Familia', 'Guerra', 'Historia', 'Misterio',
  'Música', 'Romance', 'Ciencia ficción', 'Thriller', 'Terror', 'Western', 'Biografía',
]

const GENRE_NORMALIZE: Record<string, string> = {
  'Biografico': 'Biografía',
  'Biografia': 'Biografía',
  'Bélico': 'Guerra',
  'Belico': 'Guerra',
  'Ciencia': 'Ciencia ficción',
  'Sci-Fi': 'Ciencia ficción',
  'Science Fiction': 'Ciencia ficción',
  'Action': 'Acción',
  'Adventure': 'Aventura',
  'Animation': 'Animación',
  'Comedy': 'Comedia',
  'Crime': 'Crimen',
  'Documentary': 'Documental',
  'Fantasy': 'Fantasía',
  'Family': 'Familia',
  'War': 'Guerra',
  'History': 'Historia',
  'Mystery': 'Misterio',
  'Music': 'Música',
  'Horror': 'Terror',
  'Biography': 'Biografía',
}

function normalizeGenre(g: string): string | null {
  if (ALLOWED_GENRES.includes(g)) return g
  const mapped = GENRE_NORMALIZE[g]
  if (mapped) return mapped
  return null
}

const POPULAR_KEYWORDS = [
  'prison', 'friendship', 'corruption', 'based on novel or book', 'freedom', 'hope',
  'time travel', 'revenge', 'love', 'family', 'heist', 'war', 'dystopia', 'survival',
  'space', 'detective', 'serial killer', 'dream', 'artificial intelligence', 'robot',
]

/* ─── Pill-based multi select (no keyboard trigger on mobile) ─── */
type PillSelectProps = {
  label: string
  opciones: string[]
  seleccionados: string[]
  onChange: (s: string[]) => void
  showSearch?: boolean /* enable text search for large lists like Director/Actor */
}

function PillSelect({ label, opciones, seleccionados, onChange, showSearch = false }: PillSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const toggle = (op: string) => onChange(seleccionados.includes(op) ? seleccionados.filter(s => s !== op) : [...seleccionados, op])
  const opcionesFiltradas = showSearch && busqueda
    ? opciones.filter(o => o.toLowerCase().includes(busqueda.toLowerCase()))
    : opciones
  const handleClose = () => { setAbierto(false); setBusqueda('') }

  return (
    <div className="relative">
      <button onClick={() => setAbierto(!abierto)}
        className={`rounded-full px-4 py-2 text-sm flex items-center gap-2 transition-all duration-200 ${seleccionados.length > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}>
        {label}
        {seleccionados.length > 0 && <span className="bg-amber-500 text-zinc-950 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{seleccionados.length}</span>}
        <svg className={`w-3 h-3 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {abierto && (
        <>
          {/* Desktop dropdown */}
          <div className="hidden md:block">
            <div className="fixed inset-0 z-10" onClick={handleClose} />
            <div className="absolute top-full mt-2 left-0 z-20 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl shadow-black/40 min-w-64 max-w-80 flex flex-col max-h-80 overflow-hidden">
              {showSearch && (
                <div className="p-3 border-b border-zinc-800/50 shrink-0">
                  <input type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} onClick={e => e.stopPropagation()}
                    className="w-full px-3 py-2 text-sm bg-zinc-800/80 border border-zinc-700/50 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              )}
              {seleccionados.length > 0 && (
                <div className="border-b border-zinc-800/50 px-3 py-2 shrink-0 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {seleccionados.map(s => (
                      <span key={s} onClick={() => toggle(s)} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                        {s} <span className="text-amber-400/60">x</span>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => onChange([])} className="text-xs text-zinc-500 hover:text-white transition-colors ml-2 shrink-0">Limpiar</button>
                </div>
              )}
              <div className="overflow-y-auto p-2">
                {opcionesFiltradas.length === 0 ? <p className="text-xs text-zinc-500 px-3 py-3">Sin resultados</p> : (
                  <div className="flex flex-wrap gap-1.5">
                    {opcionesFiltradas.map(op => (
                      <button key={op} onClick={() => toggle(op)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${seleccionados.includes(op)
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700 hover:text-zinc-200'
                        }`}>
                        {op}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Mobile bottom sheet */}
          <div className="md:hidden fixed inset-0 z-50" onClick={handleClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800/50">
                <h3 className="text-white font-semibold text-base">{label}</h3>
                <button onClick={handleClose} className="text-zinc-400 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800">x</button>
              </div>
              {showSearch && (
                <div className="px-4 pt-3 shrink-0">
                  <input type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-zinc-800/80 border border-zinc-700/50 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors" />
                </div>
              )}
              {seleccionados.length > 0 && (
                <div className="px-4 pt-3 shrink-0 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {seleccionados.map(s => (
                      <span key={s} onClick={() => toggle(s)} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer">
                        {s} <span className="text-amber-400/60">x</span>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => onChange([])} className="text-xs text-zinc-500 shrink-0">Limpiar</button>
                </div>
              )}
              <div className="overflow-y-auto p-4 flex flex-wrap gap-2 content-start">
                {opcionesFiltradas.length === 0 ? <p className="text-xs text-zinc-500 py-3">Sin resultados</p> : (
                  opcionesFiltradas.map(op => (
                    <button key={op} onClick={() => toggle(op)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${seleccionados.includes(op)
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'
                      }`}>
                      {op}
                    </button>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-zinc-800/50 shrink-0">
                <button onClick={handleClose} className="w-full bg-amber-500 text-zinc-950 font-semibold rounded-xl py-3 text-sm transition-colors hover:bg-amber-400">
                  Aplicar {seleccionados.length > 0 ? `(${seleccionados.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Keyword filter with popular pills + custom input ─── */
function KeywordFilter({ selected, onChange }: { selected: string[]; onChange: (s: string[]) => void }) {
  const [custom, setCustom] = useState('')
  const toggle = (kw: string) => onChange(selected.includes(kw) ? selected.filter(s => s !== kw) : [...selected, kw])
  const addCustom = () => {
    const trimmed = custom.trim().toLowerCase()
    if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed])
    setCustom('')
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Keywords</span>
        {selected.length > 0 && <span className="bg-amber-500 text-zinc-950 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{selected.length}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {POPULAR_KEYWORDS.map(kw => (
          <button key={kw} onClick={() => toggle(kw)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${selected.includes(kw)
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700 hover:text-zinc-200'
            }`}>
            {kw}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        <input type="text" placeholder="Agregar keyword..." value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/80 border border-zinc-700/50 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors" />
        <button onClick={addCustom} className="bg-zinc-800 text-zinc-400 hover:text-white px-3 py-2 rounded-xl text-sm transition-colors">+</button>
      </div>
      {selected.filter(s => !POPULAR_KEYWORDS.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.filter(s => !POPULAR_KEYWORDS.includes(s)).map(kw => (
            <span key={kw} onClick={() => toggle(kw)} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
              {kw} <span className="text-amber-400/60">x</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Inline pill row for certification ─── */
function CertFilter({ selected, onChange }: { selected: string[]; onChange: (s: string[]) => void }) {
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter(s => s !== c) : [...selected, c])
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Clasificacion</span>
        {selected.length > 0 && <span className="bg-amber-500 text-zinc-950 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{selected.length}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CERT_OPTIONS.map(c => (
          <button key={c} onClick={() => toggle(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${selected.includes(c)
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700 hover:text-zinc-200'
            }`}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}

const MOOD_CATS = [
  { id: "Pa'l domingo de bajón", emoji: '🛋️', label: 'Domingo de bajón' },
  { id: "Pa' saltar del sillón", emoji: '⚡', label: 'Saltar del sillón' },
  { id: "Pa' quedar con el cerebro como licuadora", emoji: '🤯', label: 'Quedar con el cerebro como licuadora' },
  { id: "Pa' llorar a moco tendido", emoji: '😭', label: 'Llorar a moco tendido' },
]

/* ─────────── Click-to-play video clip ─────────── */
function ClickToPlayClip({ url }: { url: string }) {
  const ytId = extractYouTubeId(url)
  if (ytId) {
    return (
      <div className="px-4 md:px-6 py-3">
        <YouTubeClip videoId={ytId} />
      </div>
    )
  }
  // Fallback for mp4
  return (
    <div className="px-4 md:px-6 py-3">
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video src={url} autoPlay muted loop playsInline preload="metadata"
          className="w-full max-h-64 object-contain"
          onClick={e => { e.currentTarget.muted = !e.currentTarget.muted }} />
      </div>
    </div>
  )
}

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
  const { mode, hydrated } = useMediaMode()
  const activeMode = hydrated ? mode : 'peliculas'
  const detailPrefix = activeMode === 'series' ? '/serie' : '/pelicula'
  const platsActivas = PLATAFORMAS.filter(pl => p.plataformas.includes(pl.id))
  const oscarGano = p.oscars?.toLowerCase().startsWith('ganó')
  const oscarNum = p.oscars?.match(/\d+/)?.[0]

  return (
    <div id={`expand-${p.id}`} className="col-span-2 md:col-span-4 rounded-2xl overflow-hidden my-2 shadow-2xl scroll-mt-28" onClick={e => e.stopPropagation()}>
      <div className="bg-zinc-900 relative">
        {/* Close button */}
        <button onClick={() => setExpandida(null)}
          className="absolute top-3 right-3 z-20 bg-black/60 hover:bg-black/80 text-white rounded-full w-11 h-11 flex items-center justify-center text-sm transition-colors">✕</button>

        {/* ══ MOBILE layout ══ */}
        <div className="md:hidden">
          {/* Banner backdrop */}
          <div className="relative h-44 overflow-hidden">
            {(p.backdrop_path || p.poster_path) && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy" src={p.backdrop_path ? `https://image.tmdb.org/t/p/w1280${p.backdrop_path}` : `https://image.tmdb.org/t/p/w780${p.poster_path}`} alt="" className={`w-full h-full object-cover ${p.backdrop_path ? 'object-center' : 'object-top'}`} />
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/30 via-transparent to-zinc-900" />
              </>
            )}
          </div>

          {/* Poster overlapping + title */}
          <div className="px-4 -mt-16 relative z-10">
            <div className="flex gap-3 items-end">
              <div className="flex flex-col items-center gap-1.5">
                <Link href={`${p._isSerie ? '/serie' : '/pelicula'}/${p.id}`} className="relative w-24 shrink-0 rounded-lg overflow-hidden shadow-2xl border-2 border-zinc-900 block" style={{ aspectRatio: '2/3' }}>
                  {p.poster_path ? (
                    <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="96px" />
                  ) : (
                    <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><svg className="w-8 h-8 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
                  )}
                </Link>
                <Link href={`${p._isSerie ? '/serie' : '/pelicula'}/${p.id}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors">Ver ficha</Link>
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
            {/* Tagline */}
            {p.tagline && <p className="text-zinc-400 text-xs italic">&ldquo;{p.tagline}&rdquo;</p>}

            {/* Ratings */}
            <div className="flex items-center gap-3 flex-wrap">
              {p.nota_imdb != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-yellow-400 flex items-center justify-center">
                    <span className="text-yellow-400 font-bold text-xs">{p.nota_imdb}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">IMDB</span>
                </div>
              )}
              {p.rt_score != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-red-400 flex items-center justify-center">
                    <span className="text-red-400 font-bold text-xs">{p.rt_score}%</span>
                  </div>
                  <span className="text-zinc-500 text-xs">RT</span>
                </div>
              )}
              {p.metacritic_score != null && (
                <div className="flex items-center gap-1">
                  <div className="w-9 h-9 rounded-full border-2 border-green-400 flex items-center justify-center">
                    <span className="text-green-400 font-bold text-xs">{p.metacritic_score}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">MC</span>
                </div>
              )}
              {p.oscars && p.oscars !== 'N/A' && (
                <div className="flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src="/oscar.png" alt="Oscar" className={`h-8 w-auto ${oscarGano ? '' : 'opacity-30'}`} />
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
                    <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
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

            {/* Links */}
            <div className="flex flex-wrap gap-3 items-center">
              {p.imdb_id && <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-yellow-400 text-zinc-950 font-black text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300 transition-colors tracking-tight">IMDb</a>}
              <AgregarAListaButton peliculaId={p.id} />
            </div>

            {/* Synopsis */}
            {p.sinopsis && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium">Sinopsis IA</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{p.sinopsis}</p>
              </div>
            )}

            {/* Team */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {p.director && <div><p className="text-white text-sm font-medium">{p.director}</p><p className="text-zinc-500 text-xs">Director</p></div>}
              {p.compositor && <div><p className="text-white text-sm font-medium">{p.compositor}</p><p className="text-zinc-500 text-xs">Compositor</p></div>}
            </div>
            {/* Enriched: tagline, cast, similar, keywords, budget */}
            <EnrichedDetails peliculaId={p.id} isSerie={!!p._isSerie} />

            {/* Badges — after cast */}
            <div className="flex gap-2 flex-wrap">
              {p.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-2 py-0.5 rounded">CB Review</span>}
              {p.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 px-2 py-0.5 rounded font-bold">★ Recomendada</span>}
            </div>
          </div>
        </div>

        {/* ══ DESKTOP layout ══ */}
        <div className="hidden md:block relative overflow-hidden">
          {/* Background backdrop — right 55% */}
          {(p.backdrop_path || p.poster_path) && (
            <div className="absolute inset-y-0 right-0 w-[55%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" src={p.backdrop_path ? `https://image.tmdb.org/t/p/w1280${p.backdrop_path}` : `https://image.tmdb.org/t/p/w780${p.poster_path}`} alt="" className={`w-full h-full object-cover object-center ${!p.backdrop_path ? 'blur-sm scale-105' : ''}`} />
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-900/50" />
              <div className="absolute inset-0 bg-zinc-900/40" />
            </div>
          )}

          <div className="relative z-10 p-6 flex gap-8">
            {/* Poster + Ver ficha */}
            <div className="flex flex-col items-center gap-2 shrink-0 self-start">
              <Link href={`${p._isSerie ? '/serie' : '/pelicula'}/${p.id}`} className="relative w-48 rounded-xl overflow-hidden shadow-2xl block" style={{ aspectRatio: '2/3' }}>
                {p.poster_path ? (
                  <Image src={`https://image.tmdb.org/t/p/w342${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="192px" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center"><svg className="w-12 h-12 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
                )}
              </Link>
              <Link href={`${p._isSerie ? '/serie' : '/pelicula'}/${p.id}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors">Ver ficha</Link>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">
                  {p.titulo_ingles || p.titulo}
                  {p.anio && <span className="text-zinc-300 font-normal ml-2">({p.anio})</span>}
                </h3>
                {p.titulo_ingles && p.titulo !== p.titulo_ingles && <p className="text-zinc-400 text-sm mt-0.5 drop-shadow">{p.titulo}</p>}
                {p.tagline && <p className="text-zinc-400 text-xs italic mt-1 drop-shadow">&ldquo;{p.tagline}&rdquo;</p>}
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
                    <img loading="lazy" src="/oscar.png" alt="Oscar" className={`h-10 w-auto drop-shadow-lg ${oscarGano ? '' : 'opacity-30'}`} />
                    <div>
                      {oscarNum && <span className={`text-sm font-bold drop-shadow ${oscarGano ? 'text-yellow-400' : 'text-zinc-500'}`}>{oscarNum}</span>}
                      <p className="text-zinc-400 text-xs leading-none drop-shadow">{oscarGano ? 'Ganó' : 'Nom.'}</p>
                    </div>
                  </div>
                )}
              </div>

              {platsActivas.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {platsActivas.map(pl => (
                    <div key={pl.id} className="rounded-lg bg-white px-2 py-1 flex items-center shadow">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-4 w-auto object-contain" />
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
                {p.imdb_id && <a href={`https://www.imdb.com/title/${p.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center bg-yellow-400 text-zinc-950 font-black text-xs px-1.5 py-0.5 rounded hover:bg-yellow-300 transition-colors tracking-tight">IMDb</a>}
                <a href={`https://open.spotify.com/search/${encodeURIComponent((p.titulo_ingles || p.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 drop-shadow"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.527-1.07 9.394-.863 13.098 1.382a.937.937 0 01-.938 1.569z"/></svg></a>
                <AgregarAListaButton peliculaId={p.id} />
              </div>

              {p.sinopsis && (
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1 font-medium drop-shadow">Sinopsis IA</p>
                  <p className="text-sm text-zinc-200 leading-relaxed drop-shadow">{p.sinopsis}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {p.director && <div><p className="text-white text-sm font-medium drop-shadow">{p.director}</p><p className="text-zinc-400 text-xs drop-shadow">Director</p></div>}
                {p.compositor && <div><p className="text-white text-sm font-medium drop-shadow">{p.compositor}</p><p className="text-zinc-400 text-xs drop-shadow">Compositor</p></div>}
              </div>
              {/* Enriched: tagline, cast, similar, keywords, budget */}
              <EnrichedDetails peliculaId={p.id} isSerie={!!p._isSerie} />

              <div className="flex gap-3 items-center flex-wrap">
                {p.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-2 py-0.5 rounded shadow">CB Review</span>}
                {p.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 bg-black/30 px-2 py-0.5 rounded font-bold shadow">★ Recomendada</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Spotify */}
        <div className="px-4 md:px-6 w-full" style={{ minWidth: 0 }}>
          <SpotifyPlayer movieTitle={p.titulo_ingles || p.titulo} />
        </div>

        {/* Video clip or trailer */}
        {p.video_clip_url
          ? <ClickToPlayClip url={p.video_clip_url} />
          : p.youtube_trailer_key && (
            <div className="px-4 md:px-6 py-3">
              <YouTubeClip videoId={p.youtube_trailer_key} />
            </div>
          )
        }

        {/* Reviews — both layouts */}
        <div className="px-4 md:px-6 pb-5 pt-2 border-t border-zinc-800">
          <PeliculaDetalle peliculaId={p.id} esReviewAutor={p.es_review_autor} sinopsisIa={null} hideSinopsis />
        </div>
      </div>
    </div>
  )
}

/* ─────────── Trending carousel ─────────── */
function TrendingCarousel({ peliculas, trendingIds, plataformas, onSelect, categoriasFiltro, plataformasFiltro, generosFiltro, cinemaBadges = {} }: {
  peliculas: Pelicula[]; trendingIds: number[]; plataformas: typeof PLATAFORMAS; onSelect: (p: Pelicula) => void
  categoriasFiltro: string[]; plataformasFiltro: string[]; generosFiltro: string[]; cinemaBadges?: Record<string, string>
}) {
  const trendingSet = new Set(trendingIds)
  let trendingMovies = peliculas
    .filter(p => p.tmdb_id && trendingSet.has(p.tmdb_id) && p.poster_path)
  if (categoriasFiltro.length > 0) trendingMovies = trendingMovies.filter(p => categoriasFiltro.includes(p.categoria ?? ''))
  if (plataformasFiltro.length > 0) trendingMovies = trendingMovies.filter(p => plataformasFiltro.some(pl => p.plataformas.includes(pl)))
  if (generosFiltro.length > 0) trendingMovies = trendingMovies.filter(p => p.generos.some(g => generosFiltro.includes(g)))
  trendingMovies.sort((a, b) => trendingIds.indexOf(a.tmdb_id!) - trendingIds.indexOf(b.tmdb_id!))

  if (trendingMovies.length === 0) return null

  return (
    <div className="mb-4">
      <h2 className="text-base md:text-xl font-bold text-white mb-2">Trending</h2>
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-3 px-3">
        {trendingMovies.map((p, i) => (
          <div key={p.id} className="shrink-0 w-32 cursor-pointer" onClick={() => onSelect(p)}>
            <div className="relative w-32 h-48 rounded-xl overflow-hidden bg-zinc-800 mb-1">
              <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="128px" />
              <div className="absolute top-0 left-0 bg-zinc-950/80 rounded-br-lg px-2 py-1">
                <span className="text-white font-black text-lg leading-none">{i + 1}</span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-4 pb-1 px-1" suppressHydrationWarning>
                {p.plataformas.length > 0 ? (
                  <div className="flex items-center gap-0.5">
                    {plataformas.filter(pl => p.plataformas.includes(pl.id)).slice(0, 3).map(pl => (
                      <div key={pl.id} className="bg-white rounded px-0.5 py-0.5" style={{ height: 12 }}>
                        <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-2 w-auto object-contain" />
                      </div>
                    ))}
                  </div>
                ) : p.tmdb_id && cinemaBadges[String(p.tmdb_id)] === 'en_cines' ? (
                  <span className="bg-amber-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">En cines</span>
                ) : p.tmdb_id && cinemaBadges[String(p.tmdb_id)] === 'estreno' ? (
                  <span className="bg-red-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Estreno</span>
                ) : p.tmdb_id && cinemaBadges[String(p.tmdb_id)] === 'proximamente' ? (
                  <span className="bg-blue-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Pronto</span>
                ) : null}
              </div>
            </div>
            <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{p.titulo_ingles || p.titulo}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────── Main component ─────────── */
export default function CatalogoInteractivo({ peliculas, series = [], trendingIds = [], trendingSeriesIds = [] }: { peliculas: Pelicula[]; series?: Pelicula[]; trendingIds?: number[]; trendingSeriesIds?: number[] }) {
  const { mode, hydrated } = useMediaMode()
  const activeMode = hydrated ? mode : 'peliculas'
  const contenido = activeMode === 'series' ? series : peliculas
  const activeTrendingIds = activeMode === 'series' ? trendingSeriesIds : trendingIds
  const detailPrefix = activeMode === 'series' ? '/serie' : '/pelicula'
  const [cinemaBadges, setCinemaBadges] = useState<Record<string, string>>({})

  // Fetch cinema badges client-side (avoids hydration mismatch)
  useEffect(() => {
    fetch('/api/cinema-badges')
      .then(r => r.json())
      .then(data => setCinemaBadges(data.badges || {}))
      .catch(() => {})
  }, [])
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
  const [filtroVistas, setFiltroVistas] = useState<'todas' | 'vistas' | 'no_vistas'>('todas')
  const [soloWatchlist, setSoloWatchlist] = useState(false)
  const [smartKeywords, setSmartKeywords] = useState<string[]>([])
  const [certFiltro, setCertFiltro] = useState<string[]>([])
  const [certExclude, setCertExclude] = useState<string[]>([])
  const catalogRef = useRef<HTMLDivElement>(null)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('imdb')
  const [pagina, setPagina] = useState(0)
  const [mostrarFiltrosAvanzados, setMostrarFiltrosAvanzados] = useState(false)
  const [vistaMode, setVistaMode] = useState<'grilla' | 'lista'>('grilla')
  const [showCuestionario, setShowCuestionario] = useState(false)
  const [userPrefs, setUserPrefs] = useState<any>(null)

  // Load user preferences for cuestionario
  useEffect(() => {
    if (!user) return
    supabase.from('perfil_preferencias').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setUserPrefs(data) })
  }, [user])
  const [prefKey, setPrefKey] = useState(0)
  const [anonPrefs, setAnonPrefs] = useState<{ birth_year: number | null; fav_movies: string[]; generos_preferidos: string[]; mood_ranking: string[]; peso_critica: number; peso_seguidores: number; peso_director?: number; peso_actores?: number } | null>(null)
  const [paraTiMovie, setParaTiMovie] = useState<Pelicula | null>(null)
  const [trendingMovie, setTrendingMovie] = useState<Pelicula | null>(null)

  const recToPelicula = (rec: RecExport): Pelicula => ({
    id: rec.id, titulo: rec.titulo, titulo_ingles: rec.titulo_ingles, anio: rec.anio,
    nota_imdb: rec.nota_imdb, rt_score: rec.rt_score, metacritic_score: rec.metacritic_score,
    runtime: rec.runtime, boxoffice: rec.boxoffice, categoria: rec.categoria,
    plataformas: rec.plataformas, es_review_autor: rec.esReviewAutor, sello_bret: false,
    director: rec.director, director_oscars: null, actores: rec.actores,
    actores_oscars: null, compositor: rec.compositor, compositor_oscars: null,
    generos: rec.generos, poster_path: rec.poster_path, oscars: rec.oscars,
    imdb_id: rec.imdb_id, youtube_trailer_key: rec.youtube_trailer_key, sinopsis: rec.sinopsis,
    video_clip_url: (rec as any).video_clip_url ?? null,
    keywords: [], tagline: null, certification: null,
    backdrop_path: (rec as any).backdrop_path ?? null,
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

  const generosDisponibles = ALLOWED_GENRES.filter(g =>
    contenido.some(p => p.generos.some(pg => pg === g || normalizeGenre(pg) === g))
  )
  const directoresDisponibles = [...new Set(contenido.map(p => p.director).filter(Boolean) as string[])].sort()
  const actoresDisponibles = [...new Set(contenido.flatMap(p => actoresStr(p.actores).split(',').map(s => s.trim()).filter(Boolean)))].sort()
  const compositoresDisponibles = [...new Set(contenido.map(p => p.compositor).filter(Boolean) as string[])].sort()

  const peliculasFiltradas = contenido
    .filter(p => {
      const terminos = busqueda.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      const matchBusqueda = terminos.length === 0 || terminos.every(q =>
        p.titulo.toLowerCase().includes(q) || (p.titulo_ingles || '').toLowerCase().includes(q) ||
        (p.director || '').toLowerCase().includes(q) || actoresStr(p.actores).toLowerCase().includes(q) ||
        p.generos.some(g => g.toLowerCase().includes(q)) || (p.compositor || '').toLowerCase().includes(q)
      )
      return matchBusqueda &&
        (plataformasFiltro.length === 0 || plataformasFiltro.some(plat => p.plataformas.includes(plat))) &&
        (categoriasFiltro.length === 0 || categoriasFiltro.includes(p.categoria || '')) &&
        (generosFiltro.length === 0 || generosFiltro.every(g => p.generos.some(pg => pg === g || normalizeGenre(pg) === g))) &&
        (directoresFiltro.length === 0 || directoresFiltro.includes(p.director || '')) &&
        (actoresFiltro.length === 0 || actoresFiltro.some(a => actoresStr(p.actores).includes(a))) &&
        (compositoresFiltro.length === 0 || compositoresFiltro.includes(p.compositor || '')) &&
        (!soloReviews || p.es_review_autor) && (!soloSello || p.sello_bret) &&
        (filtroVistas === 'todas' || (filtroVistas === 'vistas' ? userPeliculas[p.id]?.visto : !userPeliculas[p.id]?.visto)) &&
        (!soloWatchlist || userPeliculas[p.id]?.watchlist) &&
        matchOscarFiltro(p, oscarsFiltro) &&
        (!anioDesde || (p.anio ?? 0) >= Number(anioDesde)) &&
        (!anioHasta || (p.anio ?? 9999) <= Number(anioHasta)) &&
        (certFiltro.length === 0 || certFiltro.includes(p.certification ?? '')) &&
        (certExclude.length === 0 || !certExclude.includes(p.certification ?? '')) &&
        (smartKeywords.length === 0 || smartKeywords.some(kw => {
          const kwl = kw.toLowerCase()
          return p.keywords.some(k => k.toLowerCase().includes(kwl)) ||
            (p.tagline || '').toLowerCase().includes(kwl) ||
            (p.sinopsis || '').toLowerCase().includes(kwl) ||
            p.generos.some(g => g.toLowerCase().includes(kwl)) ||
            p.titulo.toLowerCase().includes(kwl) ||
            (p.titulo_ingles || '').toLowerCase().includes(kwl)
        }))
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
    compositoresFiltro.length > 0 || oscarsFiltro.length > 0 || soloReviews || soloSello || filtroVistas !== 'todas' || soloWatchlist || anioDesde || anioHasta || smartKeywords.length > 0 || certFiltro.length > 0

  useEffect(() => { setPagina(0) }, [busqueda, plataformasFiltro, categoriasFiltro, generosFiltro, directoresFiltro, actoresFiltro, compositoresFiltro, oscarsFiltro, soloReviews, soloSello, filtroVistas, soloWatchlist, orden])

  const limpiarFiltros = () => {
    setBusqueda(''); setPlataformasFiltro([]); setCategoriasFiltro([]); setGenerosFiltro([])
    setDirectoresFiltro([]); setActoresFiltro([]); setCompositoresFiltro([])
    setOscarsFiltro([]); setSoloReviews(false); setSoloSello(false); setFiltroVistas('todas'); setSoloWatchlist(false); setAnioDesde(''); setAnioHasta(''); setSmartKeywords([]); setCertFiltro([]); setCertExclude([]); setPagina(0)
  }

  const POR_PAGINA = 200
  const totalPaginas = Math.ceil(peliculasFiltradas.length / POR_PAGINA)
  const peliculasPagina = peliculasFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const keywordsFiltro = smartKeywords
  const setKeywordsFiltro = setSmartKeywords
  const filtrosAvanzadosCount = [...generosFiltro, ...directoresFiltro, ...actoresFiltro, ...oscarsFiltro, ...compositoresFiltro, ...certFiltro, ...keywordsFiltro].length

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
      <div className="relative overflow-hidden bg-zinc-950 pt-4 pb-4">
        <div className="relative flex flex-col items-center justify-center px-4">
          <h1 className="text-xl md:text-2xl font-bold text-white mb-3">Bienvenido a <span className="text-amber-400">CineBret</span></h1>
          <SmartSearchBar
            value={busqueda}
            onChange={v => { setBusqueda(v); setPagina(0) }}
            onScrollToCatalog={() => catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onSmartFilters={(f: SmartFilters) => {
              // Set platforms and categories (these also filter trending + para ti)
              setPlataformasFiltro(f.plataformas)
              setCategoriasFiltro(f.categorias)
              // Genres vs keywords: use one or the other, not both
              if (f.keywordSearch?.length) {
                setSmartKeywords(f.keywordSearch)
                setGenerosFiltro([]) // keywords are broader, don't restrict with genres
              } else {
                setSmartKeywords([])
                setGenerosFiltro(f.generos)
              }
              setDirectoresFiltro(f.directores)
              setActoresFiltro(f.actores)
              setAnioDesde(f.anioDesde || '')
              setAnioHasta(f.anioHasta || '')
              if (f.orden) setOrden(f.orden as any)
              setCertFiltro(f.certification ?? [])
              setCertExclude(f.excludeCertification ?? [])
              setBusqueda(f.searchText || '')
              setPagina(0)
            }}
            placeholder="Buscar película o pedir recomendación..."
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-2">
        {/* ── ¿En qué mood estás? ── */}
        <div className="mb-3">
          <h2 className="text-base md:text-xl font-bold text-white mb-2">¿En qué mood estás?</h2>
          <div className="grid grid-cols-4 gap-2">
            {MOOD_CATS.map(cat => {
              const activa = categoriasFiltro.includes(cat.id)
              return (
                <button key={cat.id}
                  onClick={() => setCategoriasFiltro(prev => activa ? prev.filter(c => c !== cat.id) : [...prev, cat.id])}
                  className={`py-2.5 md:py-3.5 rounded-xl text-xs md:text-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all ${activa ? 'bg-zinc-600 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)] scale-105' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 opacity-70'}`}>
                  <span className="text-lg md:text-xl leading-none">{cat.emoji}</span>
                  <span className="text-center leading-tight">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Plataformas ── */}
        <div className="mb-3">
          <h2 className="text-base md:text-xl font-bold text-white mb-2">¿Qué plataformas tienes?</h2>
          <div className="flex flex-wrap items-center gap-2">
            {PLATAFORMAS.map(plat => {
              const activa = plataformasFiltro.includes(plat.id)
              return (
                <button key={plat.id}
                  onClick={() => setPlataformasFiltro(prev => activa ? prev.filter(p => p !== plat.id) : [...prev, plat.id])}
                  className={`h-10 w-16 md:h-10 md:w-18 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${activa ? 'bg-white border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-110 ring-2 ring-amber-400/50' : 'border-zinc-600 bg-white/90 hover:border-zinc-400 opacity-60'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={plat.logo} alt={plat.nombre} className="h-4 md:h-4.5 w-auto object-contain" />
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Más filtros + Genre pills in one row ── */}
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setMostrarFiltrosAvanzados(!mostrarFiltrosAvanzados)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all duration-200 ${mostrarFiltrosAvanzados ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${mostrarFiltrosAvanzados ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" /></svg>
            Mas filtros
            {filtrosAvanzadosCount > 0 && <span className="bg-amber-500 text-zinc-950 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">{filtrosAvanzadosCount}</span>}
          </button>
          <div className="flex-1 overflow-x-auto flex gap-1.5 scrollbar-none">
            {generosDisponibles.map(g => (
              <button key={g}
                onClick={() => setGenerosFiltro(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${generosFiltro.includes(g)
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700 hover:text-zinc-200'
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* ── Active non-genre filters ── */}
        {(plataformasFiltro.length > 0 || categoriasFiltro.length > 0 || directoresFiltro.length > 0 || actoresFiltro.length > 0 || anioDesde || anioHasta) && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {plataformasFiltro.map(pl => {
              const plat = PLATAFORMAS.find(p => p.id === pl)
              return plat ? (
                <span key={`pl-${pl}`} onClick={() => setPlataformasFiltro(prev => prev.filter(x => x !== pl))}
                  className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                  {plat.nombre} <span className="text-amber-400/60">x</span>
                </span>
              ) : null
            })}
            {categoriasFiltro.map(c => (
              <span key={`c-${c}`} onClick={() => setCategoriasFiltro(prev => prev.filter(x => x !== c))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {c} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {directoresFiltro.map(d => (
              <span key={`d-${d}`} onClick={() => setDirectoresFiltro(prev => prev.filter(x => x !== d))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {d} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {actoresFiltro.map(a => (
              <span key={`a-${a}`} onClick={() => setActoresFiltro(prev => prev.filter(x => x !== a))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {a} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {oscarsFiltro.map(o => (
              <span key={`o-${o}`} onClick={() => setOscarsFiltro(prev => prev.filter(x => x !== o))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {o} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {certFiltro.map(c => (
              <span key={`cert-${c}`} onClick={() => setCertFiltro(prev => prev.filter(x => x !== c))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {c} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {keywordsFiltro.map(k => (
              <span key={`kw-${k}`} onClick={() => setKeywordsFiltro(prev => prev.filter(x => x !== k))}
                className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">
                {k} <span className="text-amber-400/60">x</span>
              </span>
            ))}
            {(soloReviews || soloSello || soloWatchlist || filtroVistas !== 'todas' || anioDesde || anioHasta) && (
              <>
                {soloReviews && <span onClick={() => setSoloReviews(false)} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">CB Reviews <span className="text-amber-400/60">x</span></span>}
                {soloSello && <span onClick={() => setSoloSello(false)} className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-emerald-500/30 transition-colors">Recomendadas <span className="text-emerald-400/60">x</span></span>}
                {soloWatchlist && <span onClick={() => setSoloWatchlist(false)} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">Watchlist <span className="text-amber-400/60">x</span></span>}
                {filtroVistas !== 'todas' && <span onClick={() => setFiltroVistas('todas')} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">{filtroVistas === 'vistas' ? 'Vistas' : 'No vistas'} <span className="text-amber-400/60">x</span></span>}
                {(anioDesde || anioHasta) && <span onClick={() => { setAnioDesde(''); setAnioHasta('') }} className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2.5 py-1 text-xs cursor-pointer hover:bg-amber-500/30 transition-colors">{anioDesde || '...'}-{anioHasta || '...'} <span className="text-amber-400/60">x</span></span>}
              </>
            )}
            <button onClick={limpiarFiltros} className="rounded-full px-3 py-1 text-xs text-zinc-500 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors">Limpiar todo</button>
          </div>
        )}

        {/* ── Panel filtros avanzados ── */}
        {mostrarFiltrosAvanzados && (
          <div className="mb-4 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-4 md:p-5 space-y-4">
            {/* Pill-based selectors row */}
            <div className="flex flex-wrap gap-2">
              <PillSelect label="Director" opciones={directoresDisponibles} seleccionados={directoresFiltro} onChange={setDirectoresFiltro} showSearch />
              <PillSelect label="Actor" opciones={actoresDisponibles} seleccionados={actoresFiltro} onChange={setActoresFiltro} showSearch />
              <PillSelect label="Oscars" opciones={OSCAR_OPCIONES} seleccionados={oscarsFiltro} onChange={setOscarsFiltro} />
              <PillSelect label="Compositor" opciones={compositoresDisponibles} seleccionados={compositoresFiltro} onChange={setCompositoresFiltro} showSearch />
            </div>

            {/* Certification pills */}
            <CertFilter selected={certFiltro} onChange={setCertFiltro} />

            {/* Keyword pills */}
            <KeywordFilter selected={keywordsFiltro} onChange={setKeywordsFiltro} />

            {/* Toggle row */}
            <div className="flex items-center flex-wrap gap-2 pt-1 border-t border-zinc-800/50">
              <div className="flex rounded-full border border-zinc-700/50 overflow-hidden text-xs font-medium">
                {(['todas', 'vistas', 'no_vistas'] as const).map(v => (
                  <button key={v} onClick={() => setFiltroVistas(v)}
                    className={`px-3 py-1.5 transition-all duration-200 ${filtroVistas === v ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
                    {v === 'todas' ? 'Todas' : v === 'vistas' ? 'Vistas' : 'No vistas'}
                  </button>
                ))}
              </div>
              <button onClick={() => setSoloWatchlist(!soloWatchlist)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${soloWatchlist ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}>
                Watchlist
              </button>
              <button onClick={() => setSoloReviews(!soloReviews)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${soloReviews ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}>
                CB Reviews
              </button>
              <button onClick={() => setSoloSello(!soloSello)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${soloSello ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'}`}>
                Recomendadas
              </button>
              <div className="flex items-center gap-2 md:ml-auto">
                <span className="text-zinc-500 text-xs">Ano</span>
                <input type="number" placeholder="Desde" value={anioDesde} onChange={e => setAnioDesde(e.target.value)} min={1900} max={2099}
                  className={`bg-zinc-800/80 border rounded-xl px-2.5 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${anioDesde ? 'border-amber-500/50' : 'border-zinc-700/50'}`} />
                <span className="text-zinc-600 text-xs">-</span>
                <input type="number" placeholder="Hasta" value={anioHasta} onChange={e => setAnioHasta(e.target.value)} min={1900} max={2099}
                  className={`bg-zinc-800/80 border rounded-xl px-2.5 py-1.5 text-xs w-20 text-white placeholder:text-zinc-600 focus:outline-none transition-colors ${anioHasta ? 'border-amber-500/50' : 'border-zinc-700/50'}`} />
              </div>
            </div>
          </div>
        )}

        {/* ── Trending ── */}
        <TrendingCarousel
          peliculas={contenido}
          trendingIds={activeTrendingIds}
          cinemaBadges={cinemaBadges}
          plataformas={PLATAFORMAS}
          categoriasFiltro={categoriasFiltro}
          plataformasFiltro={plataformasFiltro}
          generosFiltro={generosFiltro}
          onSelect={p => { setTrendingMovie(prev => prev?.id === p.id ? null : p); setParaTiMovie(null); setExpandida(null) }}
        />

        {/* Trending expansion panel */}
        {trendingMovie && (
          <div className="mb-4">
            <PanelExpandido
              p={trendingMovie} up={userPeliculas[trendingMovie.id]} user={user}
              generosFiltro={generosFiltro} setGenerosFiltro={setGenerosFiltro}
              setExpandida={() => setTrendingMovie(null)} toggleVisto={toggleVisto}
              toggleWatchlist={toggleWatchlist} setRating={setRatingFn}
            />
          </div>
        )}

        {/* ── Para Ti ── */}
        <div className="mb-4 border-t border-zinc-800 pt-3">
          {user ? (
            <ParaTi key={prefKey} onEditPreferences={() => setShowCuestionario(true)}
              onMovieExpand={rec => { setParaTiMovie(recToPelicula(rec)); setTrendingMovie(null); setExpandida(null) }}
              filtrosCategorias={categoriasFiltro} filtrosPlataformas={plataformasFiltro} />
          ) : anonPrefs ? (
            <ParaTi key={prefKey} onEditPreferences={() => setShowCuestionario(true)} preferenciasExternas={anonPrefs}
              onMovieExpand={rec => { setParaTiMovie(recToPelicula(rec)); setTrendingMovie(null); setExpandida(null) }}
              filtrosCategorias={categoriasFiltro} filtrosPlataformas={plataformasFiltro} />
          ) : (
            <div>
              <h2 className="text-base md:text-xl font-bold text-white mb-2">Para Ti</h2>
              {/* Carrusel para usuarios sin cuestionario — contenido con plataforma, con filtros */}
              <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-3 px-3">
                {(() => {
                  let pool = contenido.filter(p => p.poster_path && p.plataformas.length > 0)

                  // Apply mood filter
                  if (categoriasFiltro.length > 0) {
                    pool = pool.filter(p => categoriasFiltro.includes(p.categoria ?? ''))
                  }
                  // Apply platform filter
                  if (plataformasFiltro.length > 0) {
                    pool = pool.filter(p => plataformasFiltro.some(pl => p.plataformas.includes(pl)))
                  }
                  // Apply genre filter
                  if (generosFiltro.length > 0) {
                    pool = pool.filter(p => p.generos.some(g => generosFiltro.includes(g)))
                  }

                  pool.sort((a, b) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))

                  return pool.slice(0, 30).map(p => (
                    <div key={p.id} className="shrink-0 w-32 cursor-pointer" onClick={() => { setParaTiMovie(p); setTrendingMovie(null); setExpandida(null) }}>
                      <div className="relative w-32 h-48 rounded-xl overflow-hidden bg-zinc-800 mb-1">
                        <Image src={`https://image.tmdb.org/t/p/w185${p.poster_path}`} alt={p.titulo_ingles || p.titulo} fill className="object-cover" sizes="128px" />
                        {p.nota_imdb && (
                          <div className="absolute top-1.5 left-1.5 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400"><svg className="w-3 h-3 inline-block fill-yellow-400 -mt-px" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {p.nota_imdb}</div>
                        )}
                        {p.plataformas.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-4 pb-1 px-1">
                            <div className="flex items-center gap-0.5">
                              {PLATAFORMAS.filter(pl => p.plataformas.includes(pl.id)).slice(0, 3).map(pl => (
                                <div key={pl.id} className="bg-white rounded px-0.5 py-0.5" style={{ height: 12 }}>
                                  <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-2 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{p.titulo_ingles || p.titulo}</p>
                    </div>
                  ))
                })()}
              </div>
              {/* CTA compacto */}
              <div className="bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent rounded-xl px-4 py-3 flex items-center gap-3 mt-1">
                <p className="text-zinc-300 text-xs flex-1">
                  Completa el cuestionario para recomendaciones personalizadas
                </p>
                <button
                  onClick={() => setShowCuestionario(true)}
                  className="shrink-0 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-semibold rounded-lg px-3 py-1.5 text-xs transition-colors"
                >
                  Completar
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
        <div className="border-t border-zinc-800 pt-4 mb-4" ref={catalogRef}>
          {/* Row 1: title + toggle + badges */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-bold text-white">Catálogo</h2>
            <div className="flex rounded-full border border-zinc-700 overflow-hidden text-xs font-medium">
              <button onClick={() => setVistaMode('grilla')}
                className={`px-4 py-1.5 transition-colors ${vistaMode === 'grilla' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
                Grilla
              </button>
              <button onClick={() => setVistaMode('lista')}
                className={`px-4 py-1.5 transition-colors ${vistaMode === 'lista' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
                Lista
              </button>
            </div>
            <button onClick={() => setSoloReviews(!soloReviews)} className={`flex items-center gap-1 transition-opacity ${soloReviews ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
              <span className={`font-serif italic font-bold px-1.5 py-0.5 rounded text-xs ${soloReviews ? 'bg-yellow-400 text-zinc-950 ring-1 ring-yellow-300' : 'bg-yellow-400 text-zinc-950'}`}>CB</span>
            </button>
            <button onClick={() => setSoloSello(!soloSello)} className={`flex items-center gap-1 transition-opacity ${soloSello ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
              <span className={`font-serif italic font-bold border px-1.5 py-0.5 rounded text-xs ${soloSello ? 'border-emerald-400 text-emerald-400 ring-1 ring-emerald-400/40' : 'border-emerald-400 text-emerald-400'}`}>★</span>
            </button>
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
              className="ml-auto bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 shrink-0">
              <option value="imdb">IMDB</option>
              <option value="rt">RT</option>
              <option value="metacritic">MC</option>
              <option value="boxoffice">Taquilla</option>
              <option value="anio_desc">Recientes</option>
              <option value="anio_asc">Antiguas</option>
              <option value="titulo">A-Z</option>
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
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-800"><svg className="w-14 h-14 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-transparent" />
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                      {pelicula.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded leading-none shadow">CB</span>}
                      {pelicula.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 bg-black/70 px-1.5 py-0.5 rounded leading-none font-bold shadow">★</span>}
                    </div>
                    {user && (
                      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                        <button onClick={e => toggleVisto(pelicula.id, e)}
                          className={`w-11 h-11 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/70 bg-black/60 text-white hover:border-emerald-400'}`}>✓</button>
                        <button onClick={e => toggleWatchlist(pelicula.id, e)}
                          className={`w-11 h-11 rounded-full border text-sm font-bold flex items-center justify-center transition-colors shadow ${up?.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-white/70 bg-black/60 text-white hover:border-yellow-400'}`}>★</button>
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
                                  <img loading="lazy" src={pl.logo} alt={pl.nombre} className="h-3.5 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-white font-bold text-sm md:text-base leading-tight line-clamp-2">{pelicula.titulo_ingles || pelicula.titulo}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {pelicula.anio && <span className="text-zinc-300 text-xs md:text-sm">{pelicula.anio}</span>}
                            {pelicula.nota_imdb != null && <span className="text-yellow-400 font-bold text-xs md:text-sm"><svg className="w-3 h-3 inline-block fill-yellow-400 -mt-px" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {pelicula.nota_imdb}</span>}
                          </div>
                          {pelicula.categoria && (
                            <span className="inline-block mt-1.5 text-xs md:text-[11px] bg-white/15 backdrop-blur-sm text-zinc-200 px-2 py-0.5 rounded-full leading-tight">
                              {pelicula.categoria}
                            </span>
                          )}
                        </div>
                        {pelicula.oscars && pelicula.oscars !== 'N/A' && (
                          <div className="shrink-0 self-end flex flex-col items-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img loading="lazy" src="/oscar.png" alt="Oscar" className={`h-9 w-auto ${oscarGano ? 'opacity-100' : 'opacity-30'}`} />
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
                    <th className="text-left px-4 py-3 w-80">Película</th>
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
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-600 text-xs">{isExpanded ? <svg className="w-3 h-3 inline-block" viewBox="0 0 20 20" fill="currentColor"><path d="M5.293 12.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 9.414l-3.293 3.293a1 1 0 01-1.414 0z"/></svg> : <svg className="w-3 h-3 inline-block" viewBox="0 0 20 20" fill="currentColor"><path d="M14.707 7.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L10 10.586l3.293-3.293a1 1 0 011.414 0z"/></svg>}</span>
                              <div className="relative w-[72px] shrink-0 rounded-lg overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                                {pelicula.poster_path && <Image src={`https://image.tmdb.org/t/p/w154${pelicula.poster_path}`} alt="" fill className="object-cover" sizes="72px" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {pelicula.es_review_autor && <span className="font-serif italic font-bold text-xs bg-yellow-400 text-zinc-950 px-1.5 py-0.5 rounded leading-none">CB</span>}
                                  {pelicula.sello_bret && <span className="text-xs border border-emerald-400 text-emerald-400 px-1.5 py-0.5 rounded leading-none font-bold">★</span>}
                                </div>
                                <span className="text-white font-semibold text-sm truncate max-w-52 block">{pelicula.titulo_ingles || pelicula.titulo}</span>
                                {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                                  <span className="text-xs text-zinc-500 truncate max-w-52 block">{pelicula.titulo}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center text-zinc-400 text-xs">{pelicula.anio || '—'}</td>
                          <td className="px-2 py-2.5 text-center">
                            {pelicula.nota_imdb != null ? <span className="font-bold text-yellow-400"><svg className="w-3 h-3 inline-block fill-yellow-400 -mt-px" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {pelicula.nota_imdb}</span> : <span className="text-zinc-700">—</span>}
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
                                  <img loading="lazy" src={plat.logo} alt={plat.nombre} className="h-4 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {pelicula.oscars && pelicula.oscars !== 'N/A' ? (
                              <span className="flex items-center justify-center gap-0.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img loading="lazy" src="/oscar.png" alt="Oscar" className={`h-7 w-auto ${oscarGano ? '' : 'opacity-25'}`} />
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
                        <div className="relative w-28 shrink-0 rounded-lg overflow-hidden bg-zinc-800" style={{ aspectRatio: '2/3' }}>
                          {pelicula.poster_path && <Image src={`https://image.tmdb.org/t/p/w154${pelicula.poster_path}`} alt="" fill className="object-cover" sizes="112px" />}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-white font-semibold text-base leading-snug">{pelicula.titulo_ingles || pelicula.titulo}</p>
                              {pelicula.titulo_ingles && pelicula.titulo !== pelicula.titulo_ingles && (
                                <p className="text-zinc-500 text-xs mt-0.5">{pelicula.titulo}</p>
                              )}
                            </div>
                            <span className="text-zinc-600 text-xs shrink-0 mt-1">{isExpanded ? <svg className="w-3 h-3 inline-block" viewBox="0 0 20 20" fill="currentColor"><path d="M5.293 12.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 9.414l-3.293 3.293a1 1 0 01-1.414 0z"/></svg> : <svg className="w-3 h-3 inline-block" viewBox="0 0 20 20" fill="currentColor"><path d="M14.707 7.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L10 10.586l3.293-3.293a1 1 0 011.414 0z"/></svg>}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm mt-1.5 flex-wrap">
                            {pelicula.anio && <span className="text-zinc-400">{pelicula.anio}</span>}
                            {pelicula.nota_imdb != null && <span className="text-yellow-400 font-bold"><svg className="w-3 h-3 inline-block fill-yellow-400 -mt-px" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {pelicula.nota_imdb}</span>}
                          </div>
                          {pelicula.categoria && <p className="text-zinc-500 text-xs mt-1">{pelicula.categoria}</p>}
                        </div>
                      </div>
                      {/* All platforms row */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {PLATAFORMAS.map(plat => (
                          <div key={plat.id} className={`rounded px-1 py-0.5 bg-white flex items-center justify-center transition-opacity ${pelicula.plataformas.includes(plat.id) ? 'opacity-100' : 'opacity-20'}`} style={{ height: 20 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img loading="lazy" src={plat.logo} alt={plat.nombre} className="h-3.5 w-auto object-contain" />
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
          preferenciasIniciales={user ? userPrefs : anonPrefs}
          onComplete={(prefs) => {
            setShowCuestionario(false)
            if (prefs && !user) {
              setAnonPrefs(prefs)
            }
            if (prefs && user) {
              setUserPrefs(prefs)
            }
            // Clear recommendation cache so it recalculates with new prefs
            try {
              const key = user ? `cinebret-recs-${user.id}` : 'cinebret-recs-anon'
              sessionStorage.removeItem(key)
              sessionStorage.removeItem(`${key}-scroll`)
              sessionStorage.removeItem(`${key}-page`)
              sessionStorage.setItem(`${key}-dirty`, '1')
            } catch {}
            setPrefKey(k => k + 1)
          }}
          onDismiss={() => setShowCuestionario(false)}
        />
      )}
    </>
  )
}
