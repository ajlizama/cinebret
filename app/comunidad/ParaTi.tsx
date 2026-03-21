'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import PeliculaDetalle from '@/app/catalogo/PeliculaDetalle'

const PLATAFORMAS = [
  { id: 'netflix',         nombre: 'Netflix',     logo: '/netflix.png' },
  { id: 'disney_plus',    nombre: 'Disney+',     logo: '/disney_plus.svg' },
  { id: 'hbo_max',        nombre: 'HBO',          logo: '/hbo_max.png' },
  { id: 'amazon_prime',   nombre: 'Prime',        logo: '/amazon_prime.png' },
  { id: 'apple_tv',       nombre: 'Apple TV+',    logo: '/apple_tv.png' },
  { id: 'paramount_plus', nombre: 'Paramount+',   logo: '/paramount_plus.svg' },
]

const CATS = [
  { key: "Pa'l domingo de bajón",                       emoji: '😔', short: 'Bajón' },
  { key: "Pa' saltar del sillón",                       emoji: '🎢', short: 'Del sillón' },
  { key: "Pa' quedar con el cerebro como licuadora",    emoji: '🧠', short: 'Licuadora' },
  { key: "Pa' llorar a moco tendido",                   emoji: '😭', short: 'A moco tendido' },
]

// Mood bonus multipliers by rank position
const MOOD_BONUS = [1.5, 1.0, 0.5, 0]

type Rec = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  rt_score: number | null
  metacritic_score: number | null
  runtime: number | null
  boxoffice: number | null
  oscars: string | null
  poster_path: string | null
  categoria: string | null
  director: string | null
  actores: string | null
  compositor: string | null
  generos: string[]
  sinopsis: string | null
  razon: string
  score: number
  plataformas: string[]
  imdb_id: string | null
  youtube_trailer_key: string | null
  esReviewAutor: boolean
}

type UserState = { visto: boolean; watchlist: boolean; rating: number | null }

type UserProfile = {
  birth_year: number | null
  fav_movies: string[]
  generos_preferidos: string[]
  mood_ranking: string[]
  peso_critica: number
  peso_seguidores: number
}

/**
 * Returns true if the title contains only allowed scripts:
 * ASCII printable, Latin Extended, Japanese (hiragana, katakana, kanji/CJK), CJK symbols.
 * Rejects Devanagari, Arabic, Cyrillic, Bengali, Tamil, etc.
 */
function tituloValido(titulo: string | null): boolean {
  if (!titulo) return false
  // eslint-disable-next-line no-control-regex
  const allowed = /^[\u0020-\u007E\u00C0-\u024F\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]+$/
  return allowed.test(titulo)
}

let fechaCatalogoCache = ''

async function getFechaCatalogo(): Promise<string> {
  if (fechaCatalogoCache) return fechaCatalogoCache

  const { data } = await supabase
    .from('catalogos')
    .select('fecha')
    .eq('activo', true)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  fechaCatalogoCache = data?.fecha ?? new Date().toISOString().split('T')[0]
  return fechaCatalogoCache as string
}

async function fetchCatalogosHoy(ids: string[]): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {}
  const fecha = await getFechaCatalogo()
  const platMap: Record<string, string[]> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const { data } = await supabase
      .from('catalogos')
      .select('pelicula_id, plataforma')
      .eq('fecha', fecha)
      .eq('activo', true)
      .in('pelicula_id', chunk)
    ;(data ?? []).forEach((c: any) => {
      platMap[c.pelicula_id] = [...(platMap[c.pelicula_id] ?? []), c.plataforma]
    })
  }
  return platMap
}

/** Fetch candidate IDs from today's catalog */
async function fetchCandidatosHoy(): Promise<string[]> {
  const fecha = await getFechaCatalogo()
  const ids: string[] = []
  let offset = 0
  const batchSize = 1000
  while (true) {
    const { data } = await supabase
      .from('catalogos')
      .select('pelicula_id')
      .eq('fecha', fecha)
      .eq('activo', true)
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    data.forEach((r: any) => ids.push(r.pelicula_id))
    if (data.length < batchSize) break
    offset += batchSize
  }
  // Deduplicate
  return Array.from(new Set(ids))
}

export default function ParaTi({ onEditPreferences }: { onEditPreferences?: () => void }) {
  const { user, username: miUsername } = useAuth()
  const [recs, setRecs] = useState<Rec[]>([])
  const [cargando, setCargando] = useState(false)
  const [catFiltro, setCatFiltro] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userMap, setUserMap] = useState<Record<string, UserState>>({})
  const [sinPerfil, setSinPerfil] = useState(false)

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
        ;(data ?? []).forEach((r: any) => {
          map[r.pelicula_id] = { visto: r.visto, watchlist: r.watchlist, rating: r.rating }
        })
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

    // 1. Candidatos: películas del catálogo de hoy
    const allCandidatoIds = await fetchCandidatosHoy()
    if (allCandidatoIds.length === 0) { setCargando(false); return }

    // 2. Vistas del usuario para excluir
    const { data: vistasRaw } = await supabase
      .from('user_peliculas')
      .select('pelicula_id, rating')
      .eq('user_id', user!.id)
      .eq('visto', true)
    const vistasSet = new Set((vistasRaw ?? []).map((v: any) => v.pelicula_id))
    const candidatoIds = allCandidatoIds.filter(id => !vistasSet.has(id))
    if (candidatoIds.length === 0) { setCargando(false); return }

    // 3. Fetch perfil_preferencias
    const { data: prefData } = await supabase
      .from('perfil_preferencias')
      .select('birth_year, fav_movies, generos_preferidos, mood_ranking, peso_critica, peso_seguidores')
      .eq('user_id', user!.id)
      .maybeSingle()

    const perfil: UserProfile | null = prefData as UserProfile | null
    const tienePerfilCompleto = !!perfil

    // Si no tiene perfil y no tiene historial, mostrar banner
    const hasHistory = (vistasRaw ?? []).length >= 5
    if (!tienePerfilCompleto && !hasHistory) {
      setSinPerfil(true)
    } else {
      setSinPerfil(false)
    }

    // 4. Fetch películas y enriquecimiento en paralelo por chunks
    const pelMap: Record<string, any> = {}
    const enrMap: Record<string, any> = {}
    for (let i = 0; i < candidatoIds.length; i += 50) {
      const chunk = candidatoIds.slice(i, i + 50)
      const [{ data: pels }, { data: enrs }] = await Promise.all([
        supabase.from('peliculas')
          .select('id, titulo, titulo_ingles, anio, nota_imdb, rt_score, metacritic_score, runtime, boxoffice, oscars, poster_path, categoria, imdb_id')
          .in('id', chunk),
        supabase.from('enriquecimiento')
          .select('pelicula_id, generos, director, actores, compositor, sinopsis_chilensis, youtube_trailer_key, es_review_autor')
          .in('pelicula_id', chunk),
      ])
      ;(pels ?? []).forEach((p: any) => { pelMap[p.id] = p })
      ;(enrs ?? []).forEach((e: any) => { enrMap[e.pelicula_id] = e })
    }

    // 5. Señal de seguidores
    const followersMap: Record<string, number> = {}
    const { data: followsData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user!.id)
    const followingIds: string[] = (followsData ?? []).map((f: any) => f.following_id)

    if (followingIds.length > 0) {
      for (let i = 0; i < followingIds.length; i += 50) {
        const chunk = followingIds.slice(i, i + 50)
        const { data: fvistas } = await supabase
          .from('user_peliculas')
          .select('pelicula_id')
          .in('user_id', chunk)
          .eq('visto', true)
        ;(fvistas ?? []).forEach((r: any) => {
          followersMap[r.pelicula_id] = (followersMap[r.pelicula_id] ?? 0) + 1
        })
      }
    }
    const maxFollowers = Math.max(...Object.values(followersMap), 1)

    // 6. Scoring con historial del usuario
    let normGenre: Record<string, number> = {}
    let directorAvg: Record<string, number> = {}
    let topCat = ''
    let eraAvg = 2005

    if (hasHistory) {
      const ratingMap: Record<string, number> = {}
      ;(vistasRaw ?? []).forEach((v: any) => { ratingMap[v.pelicula_id] = v.rating ?? 6 })

      const [{ data: pelisVistas }, { data: enrVistas }] = await Promise.all([
        supabase.from('peliculas').select('id, anio, categoria').in('id', Array.from(vistasSet)),
        supabase.from('enriquecimiento').select('pelicula_id, generos, director').in('pelicula_id', Array.from(vistasSet)),
      ])

      const evMap: Record<string, any> = {}
      ;(enrVistas ?? []).forEach((e: any) => { evMap[e.pelicula_id] = e })

      const genreWeight: Record<string, number> = {}
      const dirRatings: Record<string, number[]> = {}
      const catCount: Record<string, number> = {}
      const years: number[] = []

      ;(pelisVistas ?? []).forEach((p: any) => {
        const r = ratingMap[p.id] ?? 6
        const enr = evMap[p.id]
        enr?.generos?.forEach((g: string) => { genreWeight[g] = (genreWeight[g] ?? 0) + r })
        if (enr?.director) dirRatings[enr.director] = [...(dirRatings[enr.director] ?? []), r]
        if (p.categoria) catCount[p.categoria] = (catCount[p.categoria] ?? 0) + 1
        if (p.anio) years.push(p.anio)
      })

      const maxW = Math.max(...Object.values(genreWeight), 1)
      normGenre = Object.fromEntries(Object.entries(genreWeight).map(([g, w]) => [g, w / maxW]))
      directorAvg = Object.fromEntries(
        Object.entries(dirRatings).map(([d, rs]) => [d, rs.reduce((a, b) => a + b, 0) / rs.length])
      )
      topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      if (years.length > 0) {
        eraAvg = Math.round(years.reduce((a, b) => a + b, 0) / years.length)
      }
    }

    // 7. Era desde perfil (edad)
    const anoActual = new Date().getFullYear()
    let preferredYear: number | null = null
    if (perfil?.birth_year) {
      const edad = anoActual - perfil.birth_year
      preferredYear = anoActual - edad + 15
    }

    // 8. Score todos los candidatos
    const scored: Rec[] = candidatoIds
      .filter(id => {
        const movie = pelMap[id]
        if (!movie) return false
        return tituloValido(movie.titulo_ingles)
      })
      .map(id => {
        const movie = pelMap[id]
        const enr = enrMap[id]
        const generos: string[] = enr?.generos ?? []
        const director: string | null = enr?.director ?? null
        const razones: string[] = []

        // Calidad normalizada 0-1
        const imdb = movie.nota_imdb ?? 5
        const calidadRaw = imdb / 10

        // Era score
        const anioMovie = movie.anio ?? 2000
        let eraScore = 0
        if (hasHistory) {
          eraScore = Math.exp(-Math.abs(anioMovie - eraAvg) / 20)
        } else if (preferredYear !== null) {
          eraScore = Math.exp(-Math.abs(anioMovie - preferredYear) / 20)
        } else {
          // Sin nada: bonus para post-2010
          eraScore = anioMovie >= 2010 ? 1 : Math.exp(-(2010 - anioMovie) / 15)
        }

        // Followers score 0-1
        const followersScore = (followersMap[id] ?? 0) / maxFollowers

        // Peso crítica
        const pesoCritica = perfil?.peso_critica ?? 0.5
        const calidadFinal = calidadRaw * (0.5 + pesoCritica * 0.5)

        let score = 0

        if (hasHistory) {
          // Con historial (>= 5 vistas)
          // calidad: 15%, género: 35%, era: 15%, director: 20%, seguidores: 10%, mood: 5%
          score += calidadFinal * 0.15 * 10

          const gs = Math.min(generos.reduce((s: number, g: string) => s + (normGenre[g] ?? 0), 0), 3) / 3
          score += gs * 0.35 * 10
          if (gs > 0.3) {
            const matched = generos.filter(g => (normGenre[g] ?? 0) > 0.2).slice(0, 2)
            if (matched.length) razones.push(matched.join(', '))
          }

          score += eraScore * 0.15 * 10

          if (director && directorAvg[director]) {
            const dirScore = (directorAvg[director] / 10)
            score += dirScore * 0.20 * 10
            razones.push(`Dir. ${director.split(' ').pop()}`)
          }

          score += followersScore * 0.10 * 10

          // Mood desde historial (topCat)
          const moodRanking = perfil?.mood_ranking ?? []
          const catRankIdx = moodRanking.indexOf(movie.categoria ?? '')
          const moodBonus = catRankIdx >= 0 ? MOOD_BONUS[catRankIdx] : 0
          if (movie.categoria && movie.categoria === topCat) {
            score += (0.5 + moodBonus * 0.5) * 0.05 * 10
          }

        } else if (tienePerfilCompleto && perfil) {
          // Sin historial, con perfil
          // calidad: 25%, género: 30%, era: 20%, mood: 15%, seguidores: 10%
          score += calidadFinal * 0.25 * 10

          // Género desde questionnaire
          const genPrefs = perfil.generos_preferidos ?? []
          const genMatch = generos.filter(g => genPrefs.includes(g)).length
          const genScore = genPrefs.length > 0 ? genMatch / genPrefs.length : 0
          score += genScore * 0.30 * 10
          if (genMatch > 0) {
            razones.push(generos.filter(g => genPrefs.includes(g)).slice(0, 2).join(', '))
          }

          score += eraScore * 0.20 * 10

          // Mood desde questionnaire
          const moodRanking = perfil.mood_ranking ?? []
          const catRankIdx = moodRanking.indexOf(movie.categoria ?? '')
          const moodBonus = catRankIdx >= 0 ? MOOD_BONUS[catRankIdx] : 0
          score += moodBonus * 0.15 * 10

          score += followersScore * 0.10 * 10

        } else {
          // Sin nada
          // calidad: 50%, era reciente: 20%, seguidores: 30%
          score += calidadFinal * 0.50 * 10
          score += eraScore * 0.20 * 10
          score += followersScore * 0.30 * 10
        }

        if (!razones.length && movie.categoria) {
          const cat = CATS.find(c => c.key === movie.categoria)
          if (cat) razones.push(cat.short)
        }

        return {
          id, titulo: movie.titulo, titulo_ingles: movie.titulo_ingles,
          anio: movie.anio, nota_imdb: movie.nota_imdb,
          rt_score: movie.rt_score ?? null,
          metacritic_score: movie.metacritic_score ?? null,
          runtime: movie.runtime ?? null,
          boxoffice: movie.boxoffice ?? null,
          oscars: movie.oscars ?? null,
          poster_path: movie.poster_path, categoria: movie.categoria,
          director, actores: enr?.actores ?? null, compositor: enr?.compositor ?? null, generos,
          sinopsis: enr?.sinopsis_chilensis ?? null,
          razon: razones.join(' · ') || 'Recomendada por CineBret',
          score, plataformas: [],
          imdb_id: movie.imdb_id, youtube_trailer_key: enr?.youtube_trailer_key ?? null,
          esReviewAutor: enr?.es_review_autor ?? false,
        }
      })

    // 9. Balancear por categoría (hasta 30 por cat), máx 150 total
    const sortedAll = scored.sort((a, b) => b.score - a.score)
    const byCat: Record<string, Rec[]> = {}
    for (const r of sortedAll) {
      const k = r.categoria ?? '__none__'
      if (!byCat[k]) byCat[k] = []
      byCat[k].push(r)
    }
    const seen = new Set<string>()
    const balanced: Rec[] = []
    for (const list of Object.values(byCat)) {
      for (const r of list.slice(0, 30)) {
        if (!seen.has(r.id)) { balanced.push(r); seen.add(r.id) }
      }
    }
    for (const r of sortedAll) {
      if (balanced.length >= 150) break
      if (!seen.has(r.id)) { balanced.push(r); seen.add(r.id) }
    }

    // 10. Plataformas
    const platMap = await fetchCatalogosHoy(balanced.map(r => r.id))
    balanced.forEach(r => { r.plataformas = platMap[r.id] ?? [] })

    setRecs(balanced.sort((a, b) => b.score - a.score))
    setCargando(false)
  }

  if (!user) return null

  const filtered = catFiltro ? recs.filter(r => r.categoria === catFiltro) : recs
  const displayed = filtered.slice(page * 25, (page + 1) * 25)
  const hayMas = filtered.length > (page + 1) * 25
  const expandedRec = expandedId ? displayed.find(r => r.id === expandedId) ?? null : null

  const cambiarFiltro = (key: string | null) => {
    setCatFiltro(key === catFiltro ? null : key)
    setPage(0)
    setExpandedId(null)
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white">🎬 Para ti</h2>
        {onEditPreferences && (
          <button
            type="button"
            onClick={onEditPreferences}
            className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors"
          >
            ⚙️ Editar recomendaciones
          </button>
        )}
      </div>

      {/* Banner sin perfil */}
      {sinPerfil && miUsername && (
        <div className="mb-4 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-300">✨ Completa tu perfil para mejores recomendaciones</span>
          <Link
            href={`/perfil/${miUsername}`}
            className="text-xs font-medium text-yellow-400 hover:text-yellow-300 transition-colors whitespace-nowrap ml-auto"
          >
            Personalizar →
          </Link>
        </div>
      )}

      {/* Filtros de categoría — grid 2×2 + botón Todas */}
      <div className="mb-4 space-y-2">
        <button
          onClick={() => cambiarFiltro(null)}
          className={`w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            !catFiltro ? 'bg-white text-zinc-950 border-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
          }`}
        >
          Todas
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { key: "Pa'l domingo de bajón",                       emoji: '🛋️', label: "Pa'l domingo de bajón",                   grad: 'from-amber-500 to-orange-600',  dim: 'from-amber-950/60 to-orange-950/60 border-amber-800'  },
            { key: "Pa' saltar del sillón",                       emoji: '⚡', label: "Pa' saltar del sillón",                   grad: 'from-violet-500 to-blue-600',   dim: 'from-violet-950/60 to-blue-950/60 border-violet-800'  },
            { key: "Pa' quedar con el cerebro como licuadora",    emoji: '🤯', label: "Pa' quedar con el cerebro como licuadora", grad: 'from-rose-500 to-pink-600',     dim: 'from-rose-950/60 to-pink-950/60 border-rose-800'      },
            { key: "Pa' llorar a moco tendido",                   emoji: '😭', label: "Pa' llorar a moco tendido",               grad: 'from-cyan-500 to-teal-600',     dim: 'from-cyan-950/60 to-teal-950/60 border-cyan-800'      },
          ]).map(cat => {
            const activa = catFiltro === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => cambiarFiltro(cat.key)}
                className={`h-24 px-2 rounded-xl border text-[11px] font-semibold leading-tight transition-all text-center flex flex-col items-center justify-center gap-1 bg-gradient-to-br ${
                  activa ? `${cat.grad} border-transparent text-white shadow-lg` : `${cat.dim} text-zinc-300`
                }`}
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {cargando ? (
        <p className="text-zinc-500 text-sm animate-pulse">Calculando recomendaciones...</p>
      ) : displayed.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sin películas para esta categoría.</p>
      ) : (
        <>
          {/* Carrusel */}
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none -mx-6 px-6">
            {displayed.map(rec => {
              const isExp = expandedId === rec.id
              const us = userMap[rec.id] ?? { visto: false, watchlist: false, rating: null }
              const platsActivas = PLATAFORMAS.filter(p => rec.plataformas.includes(p.id))

              return (
                <div
                  key={rec.id}
                  onClick={() => setExpandedId(isExp ? null : rec.id)}
                  className="shrink-0 w-36 text-left cursor-pointer"
                >
                  <div className={`relative w-36 h-52 rounded-2xl overflow-hidden bg-zinc-800 mb-2 ring-2 transition-all ${
                    isExp ? 'ring-yellow-400' : 'ring-transparent'
                  }`}>
                    {rec.poster_path
                      ? <Image src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`} alt={rec.titulo_ingles || rec.titulo} fill className="object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center p-2"><span className="text-zinc-600 text-xs text-center leading-snug">{rec.titulo_ingles || rec.titulo}</span></div>
                    }
                    {/* IMDB */}
                    {rec.nota_imdb && (
                      <div className="absolute top-2 left-2 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-xs font-bold text-yellow-400">
                        ⭐ {rec.nota_imdb}
                      </div>
                    )}
                    {/* Vista + Watchlist buttons */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => upsert(rec.id, { visto: !us.visto })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          us.visto ? 'bg-emerald-500 text-white' : 'bg-zinc-900/80 text-zinc-400 hover:bg-emerald-500/30 hover:text-emerald-400'
                        }`}
                        title={us.visto ? 'Quitar vista' : 'Marcar como vista'}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => upsert(rec.id, { watchlist: !us.watchlist })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          us.watchlist ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-900/80 text-zinc-400 hover:bg-yellow-400/30 hover:text-yellow-400'
                        }`}
                        title={us.watchlist ? 'Quitar watchlist' : 'Agregar a watchlist'}
                      >
                        ★
                      </button>
                    </div>
                    {/* Plataformas */}
                    {platsActivas.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-6 pb-2 px-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {platsActivas.map(p => (
                            <div key={p.id} className="bg-white rounded px-1 py-0.5">
                              <img src={p.logo} alt={p.nombre} className="h-3 w-auto object-contain block" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold leading-snug line-clamp-2 mb-0.5">
                    {rec.titulo_ingles || rec.titulo}
                  </p>
                  <p className="text-zinc-500 text-xs leading-snug line-clamp-1">{rec.razon}</p>
                </div>
              )
            })}
          </div>

          {/* Refresh / Ver otras */}
          <div className="flex items-center justify-between mt-2 mb-1">
            <p className="text-zinc-600 text-xs">{filtered.length} películas</p>
            <div className="flex gap-2">
              {page > 0 && (
                <button
                  type="button"
                  onClick={() => { setPage(p => p - 1); setExpandedId(null) }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  ← Anteriores
                </button>
              )}
              {hayMas && (
                <button
                  type="button"
                  onClick={() => { setPage(p => p + 1); setExpandedId(null) }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  🔄 Ver otras 25
                </button>
              )}
            </div>
          </div>

          {/* Panel expandido — idéntico al catálogo móvil */}
          {expandedRec && (() => {
            const us = userMap[expandedRec.id] ?? { visto: false, watchlist: false, rating: null }
            const platsActivas = PLATAFORMAS.filter(p => expandedRec.plataformas.includes(p.id))
            return (
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-3">
                {/* Acciones arriba */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => upsert(expandedRec.id, { visto: !us.visto })}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        us.visto ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-600 text-zinc-500 hover:border-zinc-400'
                      }`}
                    >
                      {us.visto ? '✓ Vista' : '○ Vista'}
                    </button>
                    <button
                      type="button"
                      onClick={() => upsert(expandedRec.id, { watchlist: !us.watchlist })}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        us.watchlist ? 'bg-yellow-400 border-yellow-400 text-zinc-950' : 'border-zinc-600 text-zinc-500 hover:border-zinc-400'
                      }`}
                    >
                      {us.watchlist ? '★ Watchlist' : '☆ Watchlist'}
                    </button>
                    {us.visto && (
                      <select
                        value={us.rating ?? ''}
                        onChange={e => upsert(expandedRec.id, { visto: true, rating: e.target.value ? Number(e.target.value) : null })}
                        className="bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-2 py-1.5 focus:outline-none"
                      >
                        <option value="">Tu rating —</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}/10</option>)}
                      </select>
                    )}
                  </div>
                  <button type="button" onClick={() => setExpandedId(null)} className="text-zinc-600 text-xs">▲ colapsar</button>
                </div>

                {/* Poster + título + plataformas */}
                <div className="flex gap-3 items-start">
                  {expandedRec.poster_path && (
                    <div className="relative w-20 shrink-0 rounded overflow-hidden bg-zinc-800" style={{ height: 120 }}>
                      <Image src={`https://image.tmdb.org/t/p/w154${expandedRec.poster_path}`} alt={expandedRec.titulo_ingles || expandedRec.titulo} fill className="object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-white text-sm font-semibold leading-snug">{expandedRec.titulo_ingles || expandedRec.titulo}</p>
                    {expandedRec.titulo_ingles && expandedRec.titulo !== expandedRec.titulo_ingles && (
                      <p className="text-zinc-500 text-xs">{expandedRec.titulo}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {expandedRec.anio && <span className="text-zinc-400">{expandedRec.anio}</span>}
                      {expandedRec.nota_imdb != null && <span className="font-bold text-yellow-400">⭐ {expandedRec.nota_imdb}</span>}
                      {expandedRec.categoria && <span className="text-zinc-500">{expandedRec.categoria}</span>}
                    </div>
                    {platsActivas.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {platsActivas.map(p => (
                          <div key={p.id} className="rounded px-1 py-0.5 bg-white flex items-center justify-center" style={{ height: 20 }}>
                            <img src={p.logo} alt={p.nombre} className="h-3.5 w-auto object-contain" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scores adicionales */}
                {(expandedRec.rt_score != null || expandedRec.metacritic_score != null) && (
                  <div className="flex gap-4 flex-wrap">
                    {expandedRec.rt_score != null && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Rotten Tomatoes</p>
                        <p className="text-sm font-bold text-red-400">🍅 {expandedRec.rt_score}%</p>
                      </div>
                    )}
                    {expandedRec.metacritic_score != null && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Metacritic</p>
                        <p className="text-sm font-bold text-green-400">{expandedRec.metacritic_score}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Runtime + Boxoffice */}
                {(expandedRec.runtime != null || expandedRec.boxoffice != null) && (
                  <div className="flex gap-6">
                    {expandedRec.runtime != null && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Duración</p>
                        <p className="text-sm text-zinc-200">{Math.floor(expandedRec.runtime / 60)}h {expandedRec.runtime % 60}min</p>
                      </div>
                    )}
                    {expandedRec.boxoffice != null && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Taquilla</p>
                        <p className="text-sm text-zinc-200">${(expandedRec.boxoffice / 1_000_000).toFixed(0)}M</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Oscars */}
                {expandedRec.oscars && expandedRec.oscars !== 'N/A' && (
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Oscars</p>
                    <p className="text-sm text-yellow-500">{expandedRec.oscars}</p>
                  </div>
                )}

                {/* Equipo */}
                <div className="space-y-2">
                  {expandedRec.director && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Director</p>
                      <p className="text-sm text-zinc-200">{expandedRec.director}</p>
                    </div>
                  )}
                  {expandedRec.compositor && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Compositor</p>
                      <p className="text-sm text-zinc-200">{expandedRec.compositor}</p>
                    </div>
                  )}
                  {expandedRec.actores && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Reparto</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {expandedRec.actores.split(',').map(a => (
                          <span key={a.trim()} className="text-sm text-zinc-200">{a.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Links externos */}
                <div className="flex flex-wrap gap-3 items-center">
                  {expandedRec.imdb_id && (
                    <a href={`https://www.imdb.com/title/${expandedRec.imdb_id}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors">IMDb ↗</a>
                  )}
                  {expandedRec.youtube_trailer_key && (
                    <a href={`https://www.youtube.com/watch?v=${expandedRec.youtube_trailer_key}`} target="_blank" rel="noopener noreferrer" className="text-xs text-red-500 hover:text-red-300 transition-colors">▶ Trailer ↗</a>
                  )}
                  <a href={`https://open.spotify.com/search/${encodeURIComponent((expandedRec.titulo_ingles || expandedRec.titulo) + ' soundtrack')}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-300 transition-colors">♫ Soundtrack ↗</a>
                </div>

                {/* Review CineBret + reviews usuarios */}
                <PeliculaDetalle
                  peliculaId={expandedRec.id}
                  esReviewAutor={expandedRec.esReviewAutor}
                  sinopsisIa={expandedRec.sinopsis}
                />
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
