'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const PLATAFORMAS = [
  { id: 'netflix',        nombre: 'Netflix',    logo: '/netflix.png' },
  { id: 'disney_plus',   nombre: 'Disney+',    logo: '/disney_plus.svg' },
  { id: 'hbo_max',       nombre: 'HBO',         logo: '/hbo_max.png' },
  { id: 'amazon_prime',  nombre: 'Prime',       logo: '/amazon_prime.png' },
  { id: 'apple_tv',      nombre: 'Apple TV+',   logo: '/apple_tv.png' },
  { id: 'paramount_plus',nombre: 'Paramount+',  logo: '/paramount_plus.svg' },
]

const CATS = [
  { key: "Pa'l domingo de bajón",                        emoji: '😔', short: 'Bajón' },
  { key: "Pa' saltar del sillón",                        emoji: '🎢', short: 'Del sillón' },
  { key: "Pa' quedar con el cerebro como licuadora",     emoji: '🧠', short: 'Licuadora' },
  { key: "Pa' llorar a moco tendido",                    emoji: '😭', short: 'A moco tendido' },
]

type Rec = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  rt_score: number | null
  poster_path: string | null
  categoria: string | null
  director: string | null
  actores: string | null
  generos: string[]
  sinopsis: string | null
  razon: string
  score: number
  plataformas: string[]
  imdb_id: string | null
  youtube_trailer_key: string | null
}

type UserState = { visto: boolean; watchlist: boolean; rating: number | null }

export default function ParaTi() {
  const { user } = useAuth()
  const [recs, setRecs] = useState<Rec[]>([])
  const [cargando, setCargando] = useState(false)
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [userMap, setUserMap] = useState<Record<string, UserState>>({})

  useEffect(() => {
    if (!user) return
    compute()
  }, [user])

  useEffect(() => {
    if (!user || recs.length === 0) return
    supabase
      .from('user_peliculas')
      .select('pelicula_id, visto, rating, watchlist')
      .eq('user_id', user.id)
      .in('pelicula_id', recs.map(r => r.id))
      .then(({ data }) => {
        const map: Record<string, UserState> = {}
        ;(data ?? []).forEach((r: any) => { map[r.pelicula_id] = { visto: r.visto, watchlist: r.watchlist, rating: r.rating } })
        setUserMap(map)
      })
  }, [user, recs])

  const upsert = async (peliculaId: string, campos: Partial<UserState>) => {
    if (!user) return
    const actual = userMap[peliculaId] ?? { visto: false, watchlist: false, rating: null }
    const nuevo = { ...actual, ...campos }
    setUserMap(prev => ({ ...prev, [peliculaId]: nuevo }))
    await supabase.from('user_peliculas').upsert(
      { user_id: user.id, pelicula_id: peliculaId, visto: nuevo.visto, watchlist: nuevo.watchlist, rating: nuevo.rating },
      { onConflict: 'user_id,pelicula_id' }
    )
  }

  const compute = async () => {
    setCargando(true)
    const today = new Date().toISOString().split('T')[0]

    // Películas ya vistas
    const { data: vistasRaw } = await supabase
      .from('user_peliculas')
      .select('pelicula_id, rating')
      .eq('user_id', user!.id)
      .eq('visto', true)

    const vistasIds = (vistasRaw ?? []).map((v: any) => v.pelicula_id)
    const hasHistory = vistasIds.length >= 3

    // Helper: fetch candidatos excluyendo vistas
    const fetchCandidatos = async (minImdb: number, limit: number) => {
      let q = supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, categoria, imdb_id')
        .gte('nota_imdb', minImdb)
        .order('nota_imdb', { ascending: false })
        .limit(limit)
      if (vistasIds.length > 0) q = q.not('id', 'in', `(${vistasIds.join(',')})`)
      return q
    }

    if (hasHistory) {
      // ─── Algoritmo personalizado ───────────────────────────────
      const ratingMap: Record<string, number> = {}
      vistasRaw!.forEach((v: any) => { ratingMap[v.pelicula_id] = v.rating ?? 6 })

      const [{ data: pelisVistas }, { data: enrVistas }] = await Promise.all([
        supabase.from('peliculas').select('id, categoria').in('id', vistasIds),
        supabase.from('enriquecimiento').select('pelicula_id, generos, director').in('pelicula_id', vistasIds),
      ])

      const enrVistasMap: Record<string, { generos: string[]; director: string | null }> = {}
      ;(enrVistas ?? []).forEach((e: any) => {
        enrVistasMap[e.pelicula_id] = { generos: e.generos ?? [], director: e.director ?? null }
      })

      const genreWeight: Record<string, number> = {}
      const directorRatings: Record<string, number[]> = {}
      const catCount: Record<string, number> = {}

      ;(pelisVistas ?? []).forEach((p: any) => {
        const r = ratingMap[p.id] ?? 6
        const enr = enrVistasMap[p.id]
        enr?.generos.forEach((g: string) => { genreWeight[g] = (genreWeight[g] ?? 0) + r })
        if (enr?.director) directorRatings[enr.director] = [...(directorRatings[enr.director] ?? []), r]
        if (p.categoria) catCount[p.categoria] = (catCount[p.categoria] ?? 0) + 1
      })

      const maxGenreW = Math.max(...Object.values(genreWeight), 1)
      const normGenre = Object.fromEntries(Object.entries(genreWeight).map(([g, w]) => [g, w / maxGenreW]))
      const directorAvg = Object.fromEntries(
        Object.entries(directorRatings).map(([d, rs]) => [d, rs.reduce((a, b) => a + b, 0) / rs.length])
      )
      const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0]

      const { data: candidatos } = await fetchCandidatos(6, 300)
      if (!candidatos) { setCargando(false); return }

      const [{ data: enrCands }, { data: catsHoy }] = await Promise.all([
        supabase.from('enriquecimiento')
          .select('pelicula_id, generos, director, actores, sinopsis_chilensis, rt_score, youtube_trailer_key')
          .in('pelicula_id', candidatos.map((c: any) => c.id)),
        supabase.from('catalogos')
          .select('pelicula_id, plataforma')
          .eq('fecha', today).eq('activo', true)
          .in('pelicula_id', candidatos.map((c: any) => c.id)),
      ])

      const enrMap: Record<string, any> = {}
      ;(enrCands ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
      const platMap: Record<string, string[]> = {}
      ;(catsHoy ?? []).forEach((c: any) => { platMap[c.pelicula_id] = [...(platMap[c.pelicula_id] ?? []), c.plataforma] })

      const scored: Rec[] = candidatos.map((movie: any) => {
        const enr = enrMap[movie.id]
        const generos: string[] = enr?.generos ?? []
        const director: string | null = enr?.director ?? null
        let score = 0
        const razones: string[] = []

        const gs = Math.min(generos.reduce((s: number, g: string) => s + (normGenre[g] ?? 0), 0), 3)
        if (gs > 0.5) {
          score += gs
          const matched = generos.filter(g => (normGenre[g] ?? 0) > 0.3).slice(0, 2)
          if (matched.length) razones.push(matched.join(', '))
        }
        if (director && directorAvg[director]) {
          score += (directorAvg[director] / 10) * 2
          razones.push(`Dir. ${director.split(' ').pop()}`)
        }
        if (movie.categoria && movie.categoria === topCat) {
          score += 1
          if (!razones.length) razones.push(CATS.find(c => c.key === movie.categoria)?.short ?? '')
        }
        if ((movie.nota_imdb ?? 0) >= 8) score += 0.5

        return {
          id: movie.id, titulo: movie.titulo, titulo_ingles: movie.titulo_ingles, anio: movie.anio,
          nota_imdb: movie.nota_imdb, rt_score: enr?.rt_score ?? null,
          poster_path: movie.poster_path, categoria: movie.categoria,
          director, actores: enr?.actores ?? null, generos,
          sinopsis: enr?.sinopsis_chilensis ?? null,
          razon: razones.join(' · ') || 'Bien valorada',
          score, plataformas: platMap[movie.id] ?? [],
          imdb_id: movie.imdb_id, youtube_trailer_key: enr?.youtube_trailer_key ?? null,
        }
      })

      setRecs(scored.filter(r => r.score > 0.3).sort((a, b) => b.score - a.score))

    } else {
      // ─── Fallback: top películas por IMDB ────────────────────────
      const { data: topMovies } = await fetchCandidatos(7.5, 80)
      if (!topMovies) { setCargando(false); return }

      const [{ data: enrTop }, { data: catsHoy }] = await Promise.all([
        supabase.from('enriquecimiento')
          .select('pelicula_id, generos, director, actores, sinopsis_chilensis, rt_score, youtube_trailer_key')
          .in('pelicula_id', topMovies.map((c: any) => c.id)),
        supabase.from('catalogos')
          .select('pelicula_id, plataforma')
          .eq('fecha', today).eq('activo', true)
          .in('pelicula_id', topMovies.map((c: any) => c.id)),
      ])

      const enrMap: Record<string, any> = {}
      ;(enrTop ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
      const platMap: Record<string, string[]> = {}
      ;(catsHoy ?? []).forEach((c: any) => { platMap[c.pelicula_id] = [...(platMap[c.pelicula_id] ?? []), c.plataforma] })

      setRecs(topMovies.map((movie: any) => {
        const enr = enrMap[movie.id]
        return {
          id: movie.id, titulo: movie.titulo, titulo_ingles: movie.titulo_ingles, anio: movie.anio,
          nota_imdb: movie.nota_imdb, rt_score: enr?.rt_score ?? null,
          poster_path: movie.poster_path, categoria: movie.categoria,
          director: enr?.director ?? null, actores: enr?.actores ?? null,
          generos: enr?.generos ?? [], sinopsis: enr?.sinopsis_chilensis ?? null,
          razon: 'Mejor valoradas del catálogo',
          score: movie.nota_imdb ?? 0, plataformas: platMap[movie.id] ?? [],
          imdb_id: movie.imdb_id, youtube_trailer_key: enr?.youtube_trailer_key ?? null,
        }
      }))
    }

    setCargando(false)
  }

  if (!user) return null

  const displayed = (catFiltro ? recs.filter(r => r.categoria === catFiltro) : recs).slice(0, 14)

  return (
    <div className="mb-8">
      <h2 className="text-base font-bold text-white mb-4">🎬 Para ti</h2>

      {/* Filtro por categoría */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1 mb-4">
        <button
          onClick={() => { setCatFiltro(null); setExpanded(null) }}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-colors ${
            !catFiltro
              ? 'bg-white text-zinc-950 border-white'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
          }`}
        >
          Todas
        </button>
        {CATS.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setCatFiltro(catFiltro === cat.key ? null : cat.key); setExpanded(null) }}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              catFiltro === cat.key
                ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.short}</span>
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-zinc-500 text-sm animate-pulse">Calculando recomendaciones...</p>
      ) : displayed.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sin películas para esta categoría.</p>
      ) : (
        <div className="space-y-2">
          {displayed.map(rec => {
            const isExp = expanded === rec.id
            const us = userMap[rec.id] ?? { visto: false, watchlist: false, rating: null }
            const catInfo = CATS.find(c => c.key === rec.categoria)
            const platsActivas = PLATAFORMAS.filter(p => rec.plataformas.includes(p.id))

            return (
              <div key={rec.id} className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${isExp ? 'border-zinc-600' : 'border-zinc-800'}`}>

                {/* Fila colapsada */}
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onClick={() => setExpanded(isExp ? null : rec.id)}
                >
                  {/* Poster */}
                  <div className="relative w-14 h-20 shrink-0 rounded-xl overflow-hidden bg-zinc-800">
                    {rec.poster_path
                      ? <Image src={`https://image.tmdb.org/t/p/w92${rec.poster_path}`} alt={rec.titulo_ingles || rec.titulo} fill className="object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center p-1"><span className="text-zinc-600 text-xs text-center leading-snug">{rec.titulo_ingles || rec.titulo}</span></div>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold leading-snug mb-1 truncate pr-1">
                      {rec.titulo_ingles || rec.titulo}
                    </p>
                    <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                      {rec.anio && <span className="text-zinc-500">{rec.anio}</span>}
                      {rec.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {rec.nota_imdb}</span>}
                      {rec.rt_score && <span className="text-red-400">🍅 {rec.rt_score}%</span>}
                      {catInfo && (
                        <span className="text-zinc-500">{catInfo.emoji} {catInfo.short}</span>
                      )}
                    </div>
                    {/* Plataformas */}
                    {platsActivas.length > 0 && (
                      <div className="flex items-center gap-1 mb-2">
                        {platsActivas.map(p => (
                          <div key={p.id} className="bg-white rounded px-1.5 py-0.5 flex items-center">
                            <img src={p.logo} alt={p.nombre} className="h-3 w-auto object-contain" />
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-zinc-600 text-xs leading-snug">{rec.razon}</p>
                  </div>

                  {/* Botones + flecha */}
                  <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); upsert(rec.id, { visto: !us.visto }) }}
                      className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors ${
                        us.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 text-zinc-600 hover:border-zinc-400 hover:text-zinc-400'
                      }`}
                    >✓</button>
                    <button
                      onClick={e => { e.stopPropagation(); upsert(rec.id, { watchlist: !us.watchlist }) }}
                      className={`w-8 h-8 rounded-full border text-sm font-bold flex items-center justify-center transition-colors ${
                        us.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-600 text-zinc-600 hover:border-zinc-400 hover:text-zinc-400'
                      }`}
                    >★</button>
                    <span className="text-zinc-600 text-xs">{isExp ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Panel expandido */}
                {isExp && (
                  <div className="border-t border-zinc-800 px-4 py-4 space-y-4" onClick={e => e.stopPropagation()}>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => upsert(rec.id, { visto: !us.visto })}
                        className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-semibold transition-colors ${
                          us.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 text-zinc-400 hover:border-zinc-400'
                        }`}
                      >
                        {us.visto ? '✓ Vista' : '○ Marcar vista'}
                      </button>
                      <button
                        onClick={() => upsert(rec.id, { watchlist: !us.watchlist })}
                        className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-semibold transition-colors ${
                          us.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-600 text-zinc-400 hover:border-zinc-400'
                        }`}
                      >
                        {us.watchlist ? '★ En watchlist' : '☆ Watchlist'}
                      </button>
                      {us.visto && (
                        <select
                          value={us.rating ?? ''}
                          onChange={e => upsert(rec.id, { visto: true, rating: e.target.value ? Number(e.target.value) : null })}
                          className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none"
                        >
                          <option value="">Tu nota —</option>
                          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}/10</option>)}
                        </select>
                      )}
                    </div>

                    {/* Sinopsis */}
                    {rec.sinopsis && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">🤖 Sinopsis IA</p>
                        <p className="text-sm text-zinc-300 leading-relaxed italic">{rec.sinopsis}</p>
                      </div>
                    )}

                    {/* Plataformas expandido */}
                    {platsActivas.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Disponible hoy en</p>
                        <div className="flex gap-2 flex-wrap">
                          {platsActivas.map(p => (
                            <div key={p.id} className="bg-white rounded-lg px-3 py-1.5 flex items-center">
                              <img src={p.logo} alt={p.nombre} className="h-5 w-auto object-contain" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Crew */}
                    <div className="grid grid-cols-2 gap-3">
                      {rec.director && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Director</p>
                          <p className="text-sm text-zinc-200">{rec.director}</p>
                        </div>
                      )}
                      {rec.generos.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Géneros</p>
                          <p className="text-sm text-zinc-200">{rec.generos.slice(0, 3).join(', ')}</p>
                        </div>
                      )}
                    </div>
                    {rec.actores && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Reparto</p>
                        <p className="text-sm text-zinc-200">{rec.actores}</p>
                      </div>
                    )}

                    {/* Links */}
                    <div className="flex flex-wrap gap-4 pt-1">
                      <Link href={`/pelicula/${rec.id}`} className="text-xs font-medium text-zinc-300 hover:text-white transition-colors">
                        💬 Ver reviews →
                      </Link>
                      {rec.imdb_id && (
                        <a href={`https://www.imdb.com/title/${rec.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-yellow-500 hover:text-yellow-300 transition-colors">
                          IMDb ↗
                        </a>
                      )}
                      {rec.youtube_trailer_key && (
                        <a href={`https://www.youtube.com/watch?v=${rec.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-red-500 hover:text-red-300 transition-colors">
                          ▶ Trailer ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
