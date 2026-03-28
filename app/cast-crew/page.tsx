'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import { supabase } from '@/lib/supabase'
import EnrichedDetails from '@/components/EnrichedDetails'

type PersonMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  poster_path: string | null
  anio: number | null
}

type Person = {
  name: string
  photo: string | null
  movieCount: number
  avgImdb: number
  score: number // avgImdb * sqrt(movieCount) + oscar boost
  oscars: number
  type: 'actor' | 'director' | 'compositor'
  topMovies: PersonMovie[]
}

export default function CastCrewPage() {
  const [tab, setTab] = useState<'actor' | 'director' | 'compositor'>('actor')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedMovies, setExpandedMovies] = useState<PersonMovie[]>([])
  const [expandedMovie, setExpandedMovie] = useState<string | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const allEnr: any[] = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento')
          .select('pelicula_id, director, director_oscars, actores, actores_oscars, compositor, compositor_oscars, cast_json')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allEnr.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }

      const allPels: any[] = []
      offset = 0
      while (true) {
        const { data } = await supabase.from('peliculas').select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio').range(offset, offset + 999)
        if (!data || data.length === 0) break
        allPels.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
      const pelMap: Record<string, any> = {}
      allPels.forEach(p => { pelMap[p.id] = p })

      const actors: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}
      const directors: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}
      const composers: Record<string, { photo: string | null; movies: string[]; oscars: number }> = {}

      // First pass: collect all cast photos by name for cross-referencing
      const photoByName: Record<string, string> = {}
      for (const enr of allEnr) {
        if (enr.cast_json) {
          for (const c of enr.cast_json) {
            if (c.profile_path && !photoByName[c.name]) photoByName[c.name] = c.profile_path
          }
        }
      }

      for (const enr of allEnr) {
        if (enr.director) {
          if (!directors[enr.director]) directors[enr.director] = { photo: photoByName[enr.director] ?? null, movies: [], oscars: enr.director_oscars ?? 0 }
          directors[enr.director].movies.push(enr.pelicula_id)
          if ((enr.director_oscars ?? 0) > directors[enr.director].oscars) directors[enr.director].oscars = enr.director_oscars
        }
        if (enr.compositor) {
          if (!composers[enr.compositor]) composers[enr.compositor] = { photo: photoByName[enr.compositor] ?? null, movies: [], oscars: enr.compositor_oscars ?? 0 }
          composers[enr.compositor].movies.push(enr.pelicula_id)
          if ((enr.compositor_oscars ?? 0) > composers[enr.compositor].oscars) composers[enr.compositor].oscars = enr.compositor_oscars
        }
        if (enr.cast_json) {
          for (const c of enr.cast_json) {
            if (!actors[c.name]) {
              const personalOscars = enr.actores_oscars?.[c.name] ?? 0
              actors[c.name] = { photo: c.profile_path, movies: [], oscars: personalOscars }
            }
            actors[c.name].movies.push(enr.pelicula_id)
            if (!actors[c.name].photo && c.profile_path) actors[c.name].photo = c.profile_path
            const po = enr.actores_oscars?.[c.name] ?? 0
            if (po > actors[c.name].oscars) actors[c.name].oscars = po
          }
        }
      }

      const INVALID_NAMES = ['desconocido', 'unknown', 'n/a', 'no data', '', 'none', 'sin datos', 'sin información']
      const buildList = (map: Record<string, { movies: string[]; photo?: string | null; oscars: number }>, type: 'actor' | 'director' | 'compositor'): Person[] => {
        return Object.entries(map)
          .filter(([name, v]) => v.movies.length >= 2 && !INVALID_NAMES.includes(name.toLowerCase().trim()))
          .map(([name, v]) => {
            const movieData = v.movies.map(id => pelMap[id]).filter(Boolean)
            const scores = movieData.filter((m: any) => m.nota_imdb).map((m: any) => m.nota_imdb as number)
            const avgImdb = scores.length > 0 ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 : 0
            const oscarBoost = v.oscars > 0 ? 0.5 * v.oscars : 0
            const rankScore = avgImdb * Math.sqrt(v.movies.length) + oscarBoost
            // Top 4 movies by IMDB
            const topMovies = movieData
              .filter((m: any) => m.poster_path)
              .sort((a: any, b: any) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0))
              .slice(0, 5)
              .map((m: any) => ({ id: m.id, titulo: m.titulo, titulo_ingles: m.titulo_ingles, nota_imdb: m.nota_imdb, poster_path: m.poster_path, anio: m.anio }))
            return {
              name, photo: (v as any).photo ?? null, movieCount: v.movies.length,
              avgImdb, score: rankScore, oscars: v.oscars, type, topMovies,
            }
          })
          .sort((a, b) => b.score - a.score)
      }

      setPeople([
        ...buildList(actors, 'actor'),
        ...buildList(directors, 'director'),
        ...buildList(composers, 'compositor'),
      ])
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => people.filter(p => p.type === tab), [people, tab])
  const linkBase = tab === 'actor' ? '/actor' : tab === 'director' ? '/director' : '/compositor'
  const [musicPlaying, setMusicPlaying] = useState<string | null>(null)
  const [musicUrls, setMusicUrls] = useState<Record<string, string | null>>({})

  const handleExpand = async (person: Person) => {
    if (expanded === person.name) { setExpanded(null); setExpandedMovies([]); setExpandedMovie(null); return }
    setExpanded(person.name)
    setExpandedMovie(null)
    setLoadingExpand(true)
    // Fetch full movie data for this person
    const enrField = tab === 'director' ? 'director' : tab === 'compositor' ? 'compositor' : null
    let movieIds: string[] = []
    if (enrField) {
      const { data } = await supabase.from('enriquecimiento').select('pelicula_id').eq(enrField, person.name)
      movieIds = (data ?? []).map((e: any) => e.pelicula_id)
    } else {
      // Actor — search cast_json
      const allEnr: any[] = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento').select('pelicula_id, cast_json').range(offset, offset + 999)
        if (!data || data.length === 0) break
        allEnr.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
      movieIds = allEnr.filter(e => e.cast_json?.some((c: any) => c.name === person.name)).map(e => e.pelicula_id)
    }
    if (movieIds.length > 0) {
      const { data } = await supabase.from('peliculas')
        .select('id, titulo, titulo_ingles, nota_imdb, poster_path, anio')
        .in('id', movieIds.slice(0, 50))
      setExpandedMovies((data ?? []).sort((a: any, b: any) => (b.nota_imdb ?? 0) - (a.nota_imdb ?? 0)))
    }
    setLoadingExpand(false)
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 mb-1">Cast & Crew</h1>
        <p className="text-zinc-500 text-sm mb-5">Ranking por IMDB promedio × raíz de películas</p>

        <div className="flex rounded-xl border border-zinc-700 overflow-hidden text-sm font-medium mb-6 w-fit">
          {([['actor', 'Actores'], ['director', 'Directores'], ['compositor', 'Compositores']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setExpanded(null) }}
              className={`px-5 py-2 transition-colors ${tab === key ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <video src="/loading.mp4" autoPlay muted loop playsInline className="w-14 h-14 object-contain" style={{ mixBlendMode: 'lighten' }} />
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.slice(0, 100).map((p, i) => {
              const isExpanded = expanded === p.name
              return (
                <div key={p.name}>
                  <div
                    onClick={() => handleExpand(p)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors cursor-pointer ${isExpanded ? 'bg-zinc-800' : 'bg-zinc-900/40 hover:bg-zinc-800/60'}`}>
                    <span className="text-zinc-600 text-sm font-bold w-7 text-right shrink-0">{i + 1}</span>
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                      {p.photo ? (
                        <img src={`https://image.tmdb.org/t/p/w185${p.photo}`} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-bold">{p.name[0]}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium truncate">{p.name}</p>
                        {p.oscars > 0 && <span className="text-amber-400 text-xs shrink-0">🏆 {p.oscars}</span>}
                      </div>
                      <p className="text-zinc-500 text-xs">{p.movieCount} películas</p>
                    </div>
                    {/* Movie posters */}
                    <div className="hidden sm:flex gap-1.5 shrink-0">
                      {p.topMovies.slice(0, 5).map(m => (
                        <div key={m.id} className="relative w-9 h-13 rounded-md overflow-hidden bg-zinc-800" style={{ height: '52px' }}>
                          {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" fill className="object-cover" sizes="36px" />}
                        </div>
                      ))}
                    </div>
                    <span className="text-yellow-400 font-bold text-sm shrink-0">⭐ {p.avgImdb}</span>
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className="bg-zinc-900 rounded-xl p-4 mb-2 mt-1">
                      <div className="flex items-center justify-between mb-3">
                        <Link href={`${linkBase}/${encodeURIComponent(p.name)}`} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">
                          Ver ficha completa →
                        </Link>
                        <p className="text-zinc-500 text-xs">{p.movieCount} películas · ⭐ {p.avgImdb} promedio{p.oscars > 0 ? ` · 🏆 ${p.oscars} Oscar${p.oscars > 1 ? 's' : ''}` : ''}</p>
                      </div>

                      {loadingExpand ? (
                        <div className="flex justify-center py-4">
                          <video src="/loading.mp4" autoPlay muted loop playsInline className="w-10 h-10 object-contain" style={{ mixBlendMode: 'lighten' }} />
                        </div>
                      ) : (
                        <>
                          {/* Movie grid */}
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2">
                            {expandedMovies.map(m => {
                              const isMovieExpanded = expandedMovie === m.id
                              return (
                                <div key={m.id} className={isMovieExpanded ? 'col-span-4 sm:col-span-5 md:col-span-7' : ''}>
                                  {!isMovieExpanded ? (
                                    <div className="cursor-pointer group" onClick={async () => {
                                      if (tab === 'compositor' && musicPlaying !== m.id) {
                                        setMusicPlaying(m.id)
                                        setExpandedMovie(null)
                                        if (!musicUrls[m.id]) {
                                          try {
                                            const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(m.titulo_ingles || m.titulo)}`)
                                            const data = await res.json()
                                            setMusicUrls(prev => ({ ...prev, [m.id]: data.album?.embedUrl ?? null }))
                                          } catch {}
                                        }
                                      } else {
                                        setMusicPlaying(null)
                                        setExpandedMovie(m.id)
                                      }
                                    }}>
                                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 ring-1 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                                        {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="100px" />}
                                        {m.nota_imdb && <div className="absolute top-1 left-1 bg-zinc-900/90 rounded-full px-1 py-0.5 text-[8px] font-bold text-yellow-400">⭐{m.nota_imdb}</div>}
                                        {tab === 'compositor' && musicPlaying === m.id && (
                                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
                                              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 14.424a.5.5 0 01-.7.17c-1.9-1.16-4.3-1.42-7.1-.78a.5.5 0 11-.22-.98c3.1-.7 5.7-.4 7.85.9a.5.5 0 01.17.66z"/></svg>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <p className="text-white text-[9px] font-medium leading-tight line-clamp-2 mt-1">{m.titulo_ingles || m.titulo}</p>
                                      {tab === 'compositor' && musicPlaying === m.id && musicUrls[m.id] && (
                                        <div className="mt-1 rounded-lg overflow-hidden">
                                          <iframe src={musicUrls[m.id]!} width="100%" height="80" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media" loading="lazy" className="rounded-lg" />
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-zinc-800 rounded-xl p-3 my-1">
                                      <div className="flex items-start gap-3">
                                        {m.poster_path && (
                                          <div className="relative w-16 shrink-0 rounded-lg overflow-hidden" style={{ aspectRatio: '2/3' }}>
                                            <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt="" fill className="object-cover" sizes="64px" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-2">
                                            <div>
                                              <p className="text-white font-bold text-sm">{m.titulo_ingles || m.titulo}</p>
                                              {m.titulo_ingles && m.titulo !== m.titulo_ingles && <p className="text-zinc-500 text-xs">{m.titulo}</p>}
                                              <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                                                {m.anio && <span>{m.anio}</span>}
                                                {m.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {m.nota_imdb}</span>}
                                              </div>
                                            </div>
                                            <button onClick={() => setExpandedMovie(null)} className="text-zinc-500 hover:text-white text-sm">✕</button>
                                          </div>
                                          <EnrichedDetails peliculaId={m.id} />
                                          <Link href={`/pelicula/${m.id}`} className="inline-block mt-2 text-xs text-yellow-400 hover:text-yellow-300 font-medium">Ver ficha →</Link>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
