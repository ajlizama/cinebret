'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const GENEROS_OPCIONES = [
  'Acción', 'Aventura', 'Comedia', 'Drama', 'Thriller', 'Terror',
  'Ciencia ficción', 'Romance', 'Documental', 'Animación', 'Crimen', 'Fantasía',
]

const MOODS_DEFAULT = [
  { key: "Pa'l domingo de bajón",                     emoji: '🛋️', label: "Pa'l domingo de bajón" },
  { key: "Pa' saltar del sillón",                     emoji: '⚡', label: "Pa' saltar del sillón" },
  { key: "Pa' quedar con el cerebro como licuadora",  emoji: '🤯', label: "Pa' quedar con el cerebro como licuadora" },
  { key: "Pa' llorar a moco tendido",                 emoji: '😭', label: "Pa' llorar a moco tendido" },
]

type MovieSuggestion = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
}

type FavSlot = {
  query: string
  results: MovieSuggestion[]
  selected: MovieSuggestion | null
  open: boolean
}

interface PreferenciasIniciales {
  birth_year: number | null
  fav_movies: string[]
  generos_preferidos: string[]
  mood_ranking: string[]
  peso_critica: number
  peso_seguidores: number
  peso_director?: number
  peso_actores?: number
  peso_historial?: number
}

interface Props {
  onComplete: (prefs?: PreferenciasIniciales) => void
  onDismiss: () => void
  preferenciasIniciales?: PreferenciasIniciales | null
  anonymous?: boolean
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function MovieSearchSlot({
  slot,
  index,
  onChange,
}: {
  slot: FavSlot
  index: number
  onChange: (updated: FavSlot) => void
}) {
  const debounced = useDebounce(slot.query, 400)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!debounced || debounced.length < 2 || slot.selected) {
      onChange({ ...slot, results: [], open: false })
      return
    }
    supabase
      .rpc('buscar_peliculas', { q: debounced })
      .then(({ data }) => {
        const results: MovieSuggestion[] = (data ?? []).slice(0, 8).map((p: any) => ({
          id: p.id, titulo: p.titulo, titulo_ingles: p.titulo_ingles ?? null, poster_path: p.poster_path ?? null,
        }))
        onChange({ ...slot, results, open: true })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onChange({ ...slot, open: false })
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot])

  const select = (movie: MovieSuggestion) => {
    onChange({ ...slot, selected: movie, query: movie.titulo_ingles || movie.titulo, results: [], open: false })
  }

  const clear = () => {
    onChange({ ...slot, selected: null, query: '', results: [], open: false })
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-sm w-4 shrink-0">{index + 1}.</span>
        {slot.selected?.poster_path && (
          <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
            <Image
              src={`https://image.tmdb.org/t/p/w92${slot.selected.poster_path}`}
              alt={slot.selected.titulo_ingles || slot.selected.titulo}
              fill
              className="object-cover"
            />
          </div>
        )}
        <input
          type="text"
          value={slot.query}
          placeholder="Buscar película..."
          onChange={e => {
            if (slot.selected) clear()
            onChange({ ...slot, query: e.target.value, selected: null })
          }}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors"
        />
        {slot.selected && (
          <button
            type="button"
            onClick={clear}
            className="text-zinc-500 hover:text-white text-xs px-2"
          >
            ✕
          </button>
        )}
      </div>
      {slot.open && slot.results.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
          {slot.results.map(movie => (
            <li key={movie.id}>
              <button
                type="button"
                onClick={() => select(movie)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 transition-colors text-left"
              >
                {movie.poster_path ? (
                  <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                      alt={movie.titulo_ingles || movie.titulo}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-8 h-12 rounded bg-zinc-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{movie.titulo_ingles || movie.titulo}</p>
                  {movie.titulo_ingles && movie.titulo !== movie.titulo_ingles && (
                    <p className="text-xs text-zinc-500 truncate">{movie.titulo}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CuestionarioOnboarding({ onComplete, onDismiss, preferenciasIniciales, anonymous }: Props) {
  const { user } = useAuth()
  const [birthYear, setBirthYear] = useState(preferenciasIniciales?.birth_year?.toString() ?? '')
  const [favSlots, setFavSlots] = useState<FavSlot[]>([
    { query: '', results: [], selected: null, open: false },
    { query: '', results: [], selected: null, open: false },
    { query: '', results: [], selected: null, open: false },
  ])
  const [generos, setGeneros] = useState<string[]>(preferenciasIniciales?.generos_preferidos ?? [])
  const [moods, setMoods] = useState<string[]>(() => {
    const saved = preferenciasIniciales?.mood_ranking ?? []
    if (saved.length === 0) return MOODS_DEFAULT.map(m => m.key)
    // Merge: saved moods first, then any missing ones appended
    const missing = MOODS_DEFAULT.map(m => m.key).filter(k => !saved.includes(k))
    return [...saved, ...missing]
  })
  const [pesoCritica, setPesoCritica] = useState(
    preferenciasIniciales ? Math.round(preferenciasIniciales.peso_critica * 10) : 5
  )
  const [pesoSeguidores, setPesoSeguidores] = useState(
    preferenciasIniciales ? Math.round(preferenciasIniciales.peso_seguidores * 10) : 5
  )
  const [pesoDirector, setPesoDirector] = useState(
    preferenciasIniciales ? Math.round((preferenciasIniciales.peso_director ?? 0.5) * 10) : 5
  )
  const [pesoActores, setPesoActores] = useState(
    preferenciasIniciales ? Math.round((preferenciasIniciales.peso_actores ?? 0.5) * 10) : 5
  )
  const [pesoHistorial, setPesoHistorial] = useState(
    preferenciasIniciales ? Math.round((preferenciasIniciales.peso_historial ?? 0.5) * 10) : 5
  )
  const [showDetalleExtra, setShowDetalleExtra] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Cargar películas favoritas existentes (solo al editar)
  useEffect(() => {
    const ids = preferenciasIniciales?.fav_movies ?? []
    if (ids.length === 0) return
    supabase
      .from('peliculas')
      .select('id, titulo, titulo_ingles, poster_path')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return
        // Ordenar según el orden guardado
        const map: Record<string, MovieSuggestion> = {}
        data.forEach((m: any) => { map[m.id] = m as MovieSuggestion })
        setFavSlots(prev => {
          const next = [...prev]
          ids.forEach((id, i) => {
            if (i < 3 && map[id]) {
              next[i] = {
                query: map[id].titulo_ingles || map[id].titulo,
                results: [],
                selected: map[id],
                open: false,
              }
            }
          })
          return next
        })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleGenero = (g: string) => {
    setGeneros(prev => {
      if (prev.includes(g)) return prev.filter(x => x !== g)
      if (prev.length >= 3) return prev
      return [...prev, g]
    })
  }

  const moveMood = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= moods.length) return
    setMoods(prev => {
      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
      return next
    })
  }

  const updateSlot = (index: number, updated: FavSlot) => {
    setFavSlots(prev => prev.map((s, i) => (i === index ? updated : s)))
  }

  const handleGuardar = async () => {
    setGuardando(true)
    const favMovies = favSlots
      .filter(s => s.selected)
      .map(s => s.selected!.id)

    const prefs: PreferenciasIniciales = {
      birth_year: birthYear ? parseInt(birthYear, 10) : null,
      fav_movies: favMovies,
      generos_preferidos: generos,
      mood_ranking: moods,
      peso_critica: pesoCritica / 10,
      peso_seguidores: anonymous ? 0 : pesoSeguidores / 10,
      peso_director: pesoDirector / 10,
      peso_actores: pesoActores / 10,
      peso_historial: anonymous ? 0.5 : pesoHistorial / 10,
    }

    if (user && !anonymous) {
      await supabase.from('perfil_preferencias').upsert(
        { user_id: user.id, ...prefs, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    }

    setGuardando(false)
    onComplete(prefs)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="p-6 space-y-8">
          {/* Header */}
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Cuéntanos sobre ti</h2>
            <p className="text-zinc-400 text-sm">para personalizar tus recomendaciones (opcional)</p>
          </div>

          {/* Paso 1: Año de nacimiento */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              1. Año de nacimiento
            </h3>
            <input
              type="number"
              placeholder="Ej: 1990"
              min={1920}
              max={2010}
              value={birthYear}
              onChange={e => setBirthYear(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </section>

          {/* Paso 2: Top 3 películas */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              2. Top 3 películas favoritas
            </h3>
            <div className="space-y-2">
              {favSlots.map((slot, i) => (
                <MovieSearchSlot
                  key={i}
                  slot={slot}
                  index={i}
                  onChange={updated => updateSlot(i, updated)}
                />
              ))}
            </div>
          </section>

          {/* Paso 3: Géneros */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              3. Géneros que más te gustan
              <span className="text-zinc-500 font-normal ml-2 normal-case">(máx. 3)</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {GENEROS_OPCIONES.map(g => {
                const activo = generos.includes(g)
                const lleno = generos.length >= 3 && !activo
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={lleno}
                    onClick={() => toggleGenero(g)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      activo
                        ? 'bg-yellow-400 border-yellow-400 text-zinc-950'
                        : lleno
                        ? 'border-zinc-800 text-zinc-700 cursor-not-allowed'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Paso 4: Mood ranking */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              4. ¿En qué mood ves más películas?
            </h3>
            <p className="text-zinc-500 text-xs">Ordena del 1 (favorito) al 4</p>
            <ol className="space-y-2">
              {moods.map((moodKey, index) => {
                const moodObj = MOODS_DEFAULT.find(m => m.key === moodKey)
                return (
                  <li key={moodKey} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-3 py-2.5">
                    <span className="text-yellow-400 font-bold text-sm w-4 shrink-0">{index + 1}</span>
                    <span className="text-sm mr-1">{moodObj?.emoji}</span>
                    <span className="text-sm text-white flex-1">{moodObj?.label}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveMood(index, -1)}
                        disabled={index === 0}
                        className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMood(index, 1)}
                        disabled={index === moods.length - 1}
                        className="w-6 h-6 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                        title="Bajar"
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* Paso 5: Crítica y seguidores */}
          <section className="space-y-5">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              5. ¿Qué tan importante es la crítica para ti?
            </h3>

            {/* Peso crítica */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Me da igual</span>
                <span className="text-white font-semibold">{pesoCritica}/10</span>
                <span>Lo primero que miro</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={pesoCritica}
                onChange={e => setPesoCritica(Number(e.target.value))}
                className="w-full accent-yellow-400"
              />
            </div>

            {/* Peso historial de vistas */}
            <div className={`space-y-2 ${anonymous ? 'opacity-40 pointer-events-none' : ''}`}>
              <p className="text-sm text-zinc-300">¿Cuánto peso darle a tus películas vistas?</p>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Poco</span>
                <span className="text-white font-semibold">{pesoHistorial}/10</span>
                <span>Mucho</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={pesoHistorial}
                onChange={e => setPesoHistorial(Number(e.target.value))}
                className="w-full accent-yellow-400"
              />
            </div>

            {/* Peso seguidores */}
            <div className={`space-y-2 ${anonymous ? 'opacity-40 pointer-events-none' : ''}`}>
              <p className="text-sm text-zinc-300">¿Cuánto te importa lo que ven tus seguidores?</p>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>No mucho</span>
                <span className="text-white font-semibold">{pesoSeguidores}/10</span>
                <span>Bastante</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={pesoSeguidores}
                onChange={e => setPesoSeguidores(Number(e.target.value))}
                className="w-full accent-yellow-400"
              />
            </div>
            {anonymous && (
              <p className="text-xs text-yellow-400/80 -mt-1">
                Inicia sesión para fortalecer tus gustos
              </p>
            )}
          </section>

          {/* Detalle Extra */}
          <section>
            <button type="button" onClick={() => setShowDetalleExtra(v => !v)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors w-full">
              <span className="text-xs">{showDetalleExtra ? '▲' : '▼'}</span>
              <span className="font-medium">Detalle extra</span>
            </button>
            {showDetalleExtra && (
              <div className="mt-3 space-y-5">
                <div className="space-y-2">
                  <p className="text-sm text-zinc-300">¿Qué tan importante es el director para ti?</p>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>No mucho</span>
                    <span className="text-white font-semibold">{pesoDirector}/10</span>
                    <span>Fundamental</span>
                  </div>
                  <input type="range" min={0} max={10} value={pesoDirector}
                    onChange={e => setPesoDirector(Number(e.target.value))} className="w-full accent-yellow-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-zinc-300">¿Qué tan importante es el reparto para ti?</p>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>No mucho</span>
                    <span className="text-white font-semibold">{pesoActores}/10</span>
                    <span>Fundamental</span>
                  </div>
                  <input type="range" min={0} max={10} value={pesoActores}
                    onChange={e => setPesoActores(Number(e.target.value))} className="w-full accent-yellow-400" />
                </div>
              </div>
            )}
          </section>

          {/* Botones */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full py-3 rounded-xl bg-yellow-400 text-zinc-950 font-semibold text-sm hover:bg-yellow-300 transition-colors disabled:opacity-60"
            >
              {guardando ? 'Guardando...' : 'Guardar preferencias'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-2 rounded-xl border border-zinc-700 text-zinc-500 text-xs hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              Saltar por ahora
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
