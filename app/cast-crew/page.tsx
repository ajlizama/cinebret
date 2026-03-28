'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Nav from '@/components/Nav'
import BackButton from '@/components/BackButton'
import { supabase } from '@/lib/supabase'

type Person = {
  name: string
  photo: string | null
  movieCount: number
  avgImdb: number
  type: 'actor' | 'director' | 'compositor'
}

export default function CastCrewPage() {
  const [tab, setTab] = useState<'actor' | 'director' | 'compositor'>('actor')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // Fetch all enrichment data
      const allEnr: any[] = []
      let offset = 0
      while (true) {
        const { data } = await supabase.from('enriquecimiento')
          .select('pelicula_id, director, actores, compositor, cast_json')
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allEnr.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }

      // Fetch movie IMDB scores
      const allPels: any[] = []
      offset = 0
      while (true) {
        const { data } = await supabase.from('peliculas').select('id, nota_imdb').range(offset, offset + 999)
        if (!data || data.length === 0) break
        allPels.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
      const imdbMap: Record<string, number> = {}
      allPels.forEach(p => { if (p.nota_imdb) imdbMap[p.id] = p.nota_imdb })

      // Build person maps
      const actors: Record<string, { photo: string | null; movies: string[] }> = {}
      const directors: Record<string, { movies: string[] }> = {}
      const composers: Record<string, { movies: string[] }> = {}

      for (const enr of allEnr) {
        // Directors
        if (enr.director) {
          if (!directors[enr.director]) directors[enr.director] = { movies: [] }
          directors[enr.director].movies.push(enr.pelicula_id)
        }
        // Composers
        if (enr.compositor) {
          if (!composers[enr.compositor]) composers[enr.compositor] = { movies: [] }
          composers[enr.compositor].movies.push(enr.pelicula_id)
        }
        // Actors from cast_json (has photos)
        if (enr.cast_json) {
          for (const c of enr.cast_json) {
            if (!actors[c.name]) actors[c.name] = { photo: c.profile_path, movies: [] }
            actors[c.name].movies.push(enr.pelicula_id)
            if (!actors[c.name].photo && c.profile_path) actors[c.name].photo = c.profile_path
          }
        }
      }

      const buildList = (map: Record<string, { movies: string[]; photo?: string | null }>, type: 'actor' | 'director' | 'compositor'): Person[] => {
        return Object.entries(map)
          .filter(([, v]) => v.movies.length >= 2) // at least 2 movies
          .map(([name, v]) => {
            const scores = v.movies.map(id => imdbMap[id]).filter(Boolean)
            return {
              name,
              photo: (v as any).photo ?? null,
              movieCount: v.movies.length,
              avgImdb: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
              type,
            }
          })
          .sort((a, b) => b.avgImdb - a.avgImdb)
      }

      const all = [
        ...buildList(actors, 'actor'),
        ...buildList(directors, 'director'),
        ...buildList(composers, 'compositor'),
      ]
      setPeople(all)
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => people.filter(p => p.type === tab), [people, tab])

  const linkBase = tab === 'actor' ? '/actor' : tab === 'director' ? '/director' : '/compositor'

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 mb-1">Cast & Crew</h1>
        <p className="text-zinc-500 text-sm mb-5">Actores, directores y compositores ordenados por IMDB promedio</p>

        {/* Tabs */}
        <div className="flex rounded-xl border border-zinc-700 overflow-hidden text-sm font-medium mb-6 w-fit">
          {([['actor', 'Actores'], ['director', 'Directores'], ['compositor', 'Compositores']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
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
          <div className="space-y-2">
            {filtered.slice(0, 100).map((p, i) => (
              <Link key={p.name} href={`${linkBase}/${encodeURIComponent(p.name)}`}
                className="flex items-center gap-3 bg-zinc-900/60 hover:bg-zinc-800 rounded-xl px-4 py-3 transition-colors group">
                <span className="text-zinc-600 text-sm font-bold w-6 text-right shrink-0">{i + 1}</span>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                  {p.photo ? (
                    <img src={`https://image.tmdb.org/t/p/w185${p.photo}`} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-bold">{p.name[0]}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium group-hover:text-yellow-400 transition-colors truncate">{p.name}</p>
                  <p className="text-zinc-500 text-xs">{p.movieCount} películas</p>
                </div>
                <span className="text-yellow-400 font-bold text-sm shrink-0">⭐ {p.avgImdb}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
