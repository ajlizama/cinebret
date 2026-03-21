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

interface Props {
  onComplete: () => void
  onDismiss: () => void
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
      .from('peliculas')
      .select('id, titulo, titulo_ingles, poster_path')
      .ilike('titulo_ingles', `%${debounced}%`)
      .limit(6)
      .then(({ data }) => {
        onChange({ ...slot, results: (data ?? []) as MovieSuggestion[], open: true })
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

export default function CuestionarioOnboarding({ onComplete, onDismiss }: Props) {
  const { user } = useAuth()
  const [birthYear, setBirthYear] = useState('')
  const [favSlots, setFavSlots] = useState<FavSlot[]>([
    { query: '', results: [], selected: null, open: false },
    { query: '', results: [], selected: null, open: false },
    { query: '', results: [], selected: null, open: false },
  ])
  const [generos, setGeneros] = useState<string[]>([])
  const [moods, setMoods] = useState(MOODS_DEFAULT.map(m => m.key))
  const [pesoCritica, setPesoCritica] = useState(5)
  const [pesoSeguidores, setPesoSeguidores] = useState(5)
  const [guardando, setGuardando] = useState(false)

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
    if (!user) return
    setGuardando(true)
    const favMovies = favSlots
      .filter(s => s.selected)
      .map(s => s.selected!.id)

    await supabase.from('perfil_preferencias').upsert(
      {
        user_id: user.id,
        birth_year: birthYear ? parseInt(birthYear, 10) : null,
        fav_movies: favMovies,
        generos_preferidos: generos,
        mood_ranking: moods,
        peso_critica: pesoCritica / 10,
        peso_seguidores: pesoSeguidores / 10,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    setGuardando(false)
    onComplete()
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

            {/* Peso seguidores */}
            <div className="space-y-2">
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
