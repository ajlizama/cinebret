'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  PageShell,
  PageHeader,
  Section,
  Card,
  Button,
  IconButton,
  Pill,
  Modal,
  LoadingState,
  EmptyState,
  Icon,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'

// ── Types ──

type Prefs = {
  mood: string
  genres: string[]
  reference_movie?: string // movie ID
}

type SearchMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
}

type PoolMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  backdrop_path: string | null
  generos: string[]
  plataformas: string[]
  score: number
}

type ResultMovie = PoolMovie & {
  match_score: number
}

type RoomState = {
  code: string
  user1_prefs: Prefs | null
  user2_prefs: Prefs | null
  user1_swipes: Record<string, boolean> | null
  user2_swipes: Record<string, boolean> | null
  movie_pool: PoolMovie[]
  results: ResultMovie[]
  user2_joined: boolean
}

type Phase =
  | 'start'
  | 'platforms'
  | 'waiting'
  | 'prefs'
  | 'waiting_prefs'
  | 'swipe'
  | 'waiting_swipes'
  | 'results'

// ── Constants ──

const MOODS = [
  { key: 'bajon', label: 'Relax', emoji: '🛋️', desc: 'Comedia y entretenimiento ligero' },
  { key: 'sillon', label: 'Acción', emoji: '🔥', desc: 'Adrenalina y aventura' },
  { key: 'licuadora', label: 'Mente volada', emoji: '🧠', desc: 'Ciencia ficción e ideas complejas' },
  { key: 'llorar', label: 'Drama emocional', emoji: '😢', desc: 'Historias que conmueven' },
]

const GENRES = [
  'Accion', 'Comedia', 'Drama', 'Terror',
  'Ciencia ficcion', 'Thriller', 'Animacion', 'Romance',
]

const PLATFORMS = [
  { key: 'netflix', name: 'Netflix', icon: '/netflix.png' },
  { key: 'disney_plus', name: 'Disney+', icon: '/disney_plus.svg' },
  { key: 'hbo_max', name: 'Max', icon: '/hbo_max.png' },
  { key: 'amazon_prime', name: 'Prime Video', icon: '/amazon_prime.png' },
  { key: 'apple_tv', name: 'Apple TV+', icon: '/apple_tv.png' },
  { key: 'paramount_plus', name: 'Paramount+', icon: '/paramount_plus.svg' },
]

// ── Helpers ──

async function apiCall(action: string, extra: Record<string, any> = {}) {
  const res = await fetch('/api/juntos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
  return res.json()
}

async function fetchRoom(code: string): Promise<RoomState | null> {
  const res = await fetch(`/api/juntos?code=${code}`)
  const data = await res.json()
  return data.room ?? null
}

// ── Component ──

export default function JuntosNuevoPage() {
  const [phase, setPhase] = useState<Phase>('start')
  const [roomCode, setRoomCode] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [slot, setSlot] = useState<'user1' | 'user2'>('user1')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Platform selection (room creation)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // Prefs state
  const [selectedMood, setSelectedMood] = useState('')
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [prefsStep, setPrefsStep] = useState(1) // 1=mood, 2=genres, 3=reference movie

  // Reference movie search
  const [allMovies, setAllMovies] = useState<SearchMovie[]>([])
  const [movieSearch, setMovieSearch] = useState('')
  const [selectedReference, setSelectedReference] = useState<SearchMovie | null>(null)

  // Swipe state
  const [pool, setPool] = useState<PoolMovie[]>([])
  const [swipeIndex, setSwipeIndex] = useState(0)
  const [swipes, setSwipes] = useState<Record<string, boolean>>({})
  const [swipeAnim, setSwipeAnim] = useState<'left' | 'right' | null>(null)

  // Results
  const [results, setResults] = useState<ResultMovie[]>([])

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // Load movies for reference search on mount
  useEffect(() => {
    async function loadMovies() {
      const { data } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, poster_path')
        .not('poster_path', 'is', null)
        .range(0, 2999)
      if (data) setAllMovies(data as SearchMovie[])
    }
    loadMovies()
  }, [])

  // Filtered movie results for typeahead
  const movieSearchResults = movieSearch.length >= 2
    ? allMovies.filter(m => {
        const q = movieSearch.toLowerCase()
        return (
          m.titulo.toLowerCase().includes(q) ||
          (m.titulo_ingles && m.titulo_ingles.toLowerCase().includes(q))
        )
      }).slice(0, 6)
    : []

  // ── Create Room ──
  const handleCreate = async () => {
    setPhase('platforms')
    setSelectedPlatforms([])
    setError('')
  }

  const handleCreateWithPlatforms = async () => {
    if (selectedPlatforms.length === 0) {
      setError('Elige al menos una plataforma')
      return
    }
    setLoading(true)
    setError('')
    const data = await apiCall('create', { platforms: selectedPlatforms })
    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }
    setRoomCode(data.code)
    setSlot('user1')
    setPhase('waiting')
    setLoading(false)

    // Start polling for user2 to join
    pollingRef.current = setInterval(async () => {
      const room = await fetchRoom(data.code)
      if (room?.user2_joined) {
        stopPolling()
        setPhase('prefs')
      }
    }, 2000)
  }

  // ── Join Room ──
  const handleJoin = async () => {
    const code = joinInput.toUpperCase().trim()
    if (code.length !== 6) {
      setError('El código debe tener 6 caracteres')
      return
    }
    setLoading(true)
    setError('')
    const data = await apiCall('join', { code })
    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }
    setRoomCode(code)
    setSlot('user2')
    setPhase('prefs')
    setLoading(false)
  }

  // ── Submit Preferences ──
  const handleSubmitPrefs = async () => {
    if (!selectedMood || selectedGenres.length === 0 || !selectedReference) {
      setError('Completa todas las preferencias')
      return
    }
    setLoading(true)
    setError('')

    const prefs: Prefs = {
      mood: selectedMood,
      genres: selectedGenres,
      reference_movie: selectedReference.id,
    }

    // For user1, include platforms in the prefs so generate_pool can read them
    if (slot === 'user1') {
      (prefs as any).platforms = selectedPlatforms
    } else {
      (prefs as any).platforms = []
    }

    await apiCall('submit_prefs', { code: roomCode, slot, prefs })
    setPhase('waiting_prefs')

    // Poll until both prefs are in, then generate pool
    pollingRef.current = setInterval(async () => {
      const room = await fetchRoom(roomCode)
      if (!room) return

      const u1Done = room.user1_prefs && typeof (room.user1_prefs as any).mood === 'string'
      const u2Done = room.user2_prefs && typeof (room.user2_prefs as any).mood === 'string'

      if (u1Done && u2Done) {
        stopPolling()

        // Only user1 triggers pool generation
        if (slot === 'user1') {
          await apiCall('generate_pool', { code: roomCode })
        }

        // Now poll for movie_pool to be populated
        pollingRef.current = setInterval(async () => {
          const updated = await fetchRoom(roomCode)
          if (updated?.movie_pool && Array.isArray(updated.movie_pool) && updated.movie_pool.length > 0) {
            stopPolling()
            setPool(updated.movie_pool)
            setSwipeIndex(0)
            setSwipes({})
            setPhase('swipe')
            setLoading(false)
          }
        }, 2000)

        // Timeout: if no pool after 30s, show error
        setTimeout(() => {
          if (pollingRef.current) {
            stopPolling()
            setError('No encontramos películas con esas preferencias. Intenten de nuevo.')
            setPhase('prefs')
            setPrefsStep(1)
            setSelectedMood('')
            setSelectedGenres([])
            setSelectedReference(null)
            setMovieSearch('')
            setLoading(false)
          }
        }, 30000)
      }
    }, 2000)

    setLoading(false)
  }

  // ── Swipe ──
  const handleSwipe = async (liked: boolean) => {
    if (swipeIndex >= pool.length) return

    const movie = pool[swipeIndex]
    const newSwipes = { ...swipes, [movie.id]: liked }
    setSwipes(newSwipes)
    setSwipeAnim(liked ? 'right' : 'left')

    setTimeout(() => {
      setSwipeAnim(null)
      const nextIndex = swipeIndex + 1

      if (nextIndex >= pool.length) {
        // Done swiping — submit
        submitSwipes(newSwipes)
      } else {
        setSwipeIndex(nextIndex)
      }
    }, 300)
  }

  const submitSwipes = async (finalSwipes: Record<string, boolean>) => {
    setLoading(true)
    await apiCall('submit_swipes', { code: roomCode, slot, swipes: finalSwipes })
    setPhase('waiting_swipes')

    // Poll until both swipes are in
    pollingRef.current = setInterval(async () => {
      const room = await fetchRoom(roomCode)
      if (!room) return

      const s1Done = room.user1_swipes && Object.keys(room.user1_swipes).length > 0
      const s2Done = room.user2_swipes && Object.keys(room.user2_swipes).length > 0

      if (s1Done && s2Done) {
        stopPolling()

        // Only user1 triggers calculation
        if (slot === 'user1') {
          const data = await apiCall('calculate_results', { code: roomCode })
          if (data.results) {
            setResults(data.results)
            setPhase('results')
            setLoading(false)
            return
          }
        }

        // user2 polls for results
        pollingRef.current = setInterval(async () => {
          const updated = await fetchRoom(roomCode)
          if (updated?.results && updated.results.length > 0) {
            stopPolling()
            setResults(updated.results as ResultMovie[])
            setPhase('results')
            setLoading(false)
          }
        }, 2000)
      }
    }, 2000)
  }

  // ── Reset ──
  const handleReset = () => {
    stopPolling()
    setPhase('start')
    setRoomCode('')
    setJoinInput('')
    setSlot('user1')
    setError('')
    setSelectedMood('')
    setSelectedGenres([])
    setSelectedPlatforms([])
    setPrefsStep(1)
    setSelectedReference(null)
    setMovieSearch('')
    setPool([])
    setSwipeIndex(0)
    setSwipes({})
    setResults([])
    setLoading(false)
  }

  // ── Share ──
  const handleShare = async () => {
    if (!results.length) return
    const top = results[0]
    const text = `Usamos Ver Juntos en CineBret y nuestra película perfecta es: ${top.titulo_ingles || top.titulo} (${top.anio ?? ''}) - Match ${top.match_score}%`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ver Juntos - CineBret', text })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      alert('Copiado al portapapeles')
    }
  }

  // ── Render Helpers ──

  const toggleGenre = (g: string) => {
    setSelectedGenres(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    )
  }

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  const currentMovie = pool[swipeIndex] ?? null

  return (
    <PageShell maxWidth="lg">

      {/* ════════ START SCREEN ════════ */}
      {phase === 'start' && (
        <div className="flex flex-col items-center pt-12">
          <Icon.Users className="w-14 h-14 text-yellow-400 mb-4" />
          <PageHeader
            title="Ver Juntos"
            subtitle="¿Qué vemos esta noche? Encuentren la película perfecta para los dos, desde sus celulares."
            className="text-center mb-10 [&_header]:justify-center [&_h1]:text-center [&_p]:mx-auto"
          />

          <div className="w-full space-y-4">
            <Button
              onClick={handleCreate}
              disabled={loading}
              loading={loading}
              size="lg"
              fullWidth
              className="rounded-2xl py-4 text-lg"
            >
              Crear sala
            </Button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-zinc-600 text-xs uppercase tracking-wider">o</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={joinInput}
                onChange={e => setJoinInput(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="Código de sala (6 letras)"
                maxLength={6}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-center text-white text-xl font-mono tracking-[0.3em] placeholder:text-zinc-600 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-yellow-400/50 transition-colors min-h-[44px]"
              />
              <Button
                onClick={handleJoin}
                disabled={loading || joinInput.length !== 6}
                variant="secondary"
                size="lg"
                fullWidth
                className="rounded-2xl"
              >
                Unirse a sala
              </Button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      )}

      {/* ════════ PLATFORM SELECTION (room creation) ════════ */}
      {phase === 'platforms' && (
        <div className="pt-6">
          <div className="text-center mb-6">
            <Icon.Tv className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white mb-1">¿Qué plataformas tienen?</h2>
            <p className="text-zinc-400 text-sm">Elige las plataformas que comparten. Aplican para ambos.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {PLATFORMS.map(p => (
              <button
                key={p.key}
                onClick={() => togglePlatform(p.key)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 transition-all min-h-[44px] ${
                  selectedPlatforms.includes(p.key)
                    ? 'border-yellow-400 bg-yellow-400/10'
                    : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <Image
                  src={p.icon}
                  alt={p.name}
                  width={28}
                  height={28}
                  className="rounded-md shrink-0"
                />
                <span className={`text-sm font-medium ${selectedPlatforms.includes(p.key) ? 'text-white' : 'text-zinc-400'}`}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => { setPhase('start'); setSelectedPlatforms([]); setError('') }}
              variant="ghost"
              size="lg"
              className="flex-1 border border-zinc-700 rounded-2xl"
            >
              Atrás
            </Button>
            <Button
              onClick={handleCreateWithPlatforms}
              disabled={selectedPlatforms.length === 0 || loading}
              loading={loading}
              size="lg"
              className="flex-1 rounded-2xl"
            >
              Crear sala
            </Button>
          </div>

          {error && (
            <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      )}

      {/* ════════ WAITING ROOM ════════ */}
      {phase === 'waiting' && (
        <div className="flex flex-col items-center pt-16">
          <Icon.Eye className="w-12 h-12 text-yellow-400 mb-6" />
          <h2 className="text-2xl font-bold text-white mb-3">Tu sala está lista</h2>
          <p className="text-zinc-400 text-sm mb-8 text-center">
            Comparte este código con tu compañero/a
          </p>

          <Card padding="lg" className="border-2 border-yellow-400/30 mb-6">
            <p className="text-yellow-400 text-5xl font-mono font-black tracking-[0.4em] text-center select-all">
              {roomCode}
            </p>
          </Card>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'Ver Juntos', text: `Únete a mi sala en CineBret: ${roomCode}` })
              } else {
                navigator.clipboard.writeText(roomCode)
                alert('Código copiado')
              }
            }}
            iconLeft={<Icon.Share className="w-4 h-4" />}
            className="text-yellow-400 mb-10"
          >
            Copiar / Compartir código
          </Button>

          <LoadingState text="Esperando a tu compañero/a..." />

          <Button
            onClick={handleReset}
            variant="ghost"
            size="sm"
            className="mt-8 text-zinc-600"
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* ════════ PREFERENCES ════════ */}
      {phase === 'prefs' && (
        <div className="pt-6">
          <div className="text-center mb-6">
            <p className="text-zinc-500 text-xs font-mono mb-1">Sala {roomCode}</p>
            <h2 className="text-2xl font-bold text-white mb-1">Tus preferencias</h2>
            <p className="text-zinc-400 text-sm">
              {slot === 'user1' ? 'Persona 1' : 'Persona 2'} — Paso {prefsStep} de 3
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s === prefsStep ? 'bg-yellow-400' : s < prefsStep ? 'bg-yellow-400/40' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>

          {/* Q1: Mood */}
          {prefsStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold text-lg text-center mb-2">¿Qué ánimo tienes?</h3>
              <div className="grid grid-cols-2 gap-3">
                {MOODS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setSelectedMood(m.key)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all min-h-[44px] ${
                      selectedMood === m.key
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    <span className="text-3xl">{m.emoji}</span>
                    <span className="text-white font-bold text-sm">{m.label}</span>
                    <span className="text-zinc-500 text-xs">{m.desc}</span>
                  </button>
                ))}
              </div>
              <Button
                onClick={() => selectedMood && setPrefsStep(2)}
                disabled={!selectedMood}
                size="lg"
                fullWidth
                className="rounded-2xl mt-4"
              >
                Siguiente
              </Button>
            </div>
          )}

          {/* Q2: Genres */}
          {prefsStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold text-lg text-center mb-2">¿Qué géneros quieres?</h3>
              <p className="text-zinc-500 text-xs text-center">Elige al menos 1</p>
              <div className="flex flex-wrap justify-center gap-2.5">
                {GENRES.map(g => (
                  <Pill
                    key={g}
                    variant="filter"
                    size="md"
                    active={selectedGenres.includes(g)}
                    onClick={() => toggleGenre(g)}
                    className="border-2"
                  >
                    {g}
                  </Pill>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <Button
                  onClick={() => setPrefsStep(1)}
                  variant="ghost"
                  size="lg"
                  className="flex-1 border border-zinc-700 rounded-2xl"
                >
                  Atrás
                </Button>
                <Button
                  onClick={() => selectedGenres.length > 0 && setPrefsStep(3)}
                  disabled={selectedGenres.length === 0}
                  size="lg"
                  className="flex-1 rounded-2xl"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}

          {/* Q3: Reference Movie */}
          {prefsStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold text-lg text-center mb-2">Elige una película de referencia</h3>
              <p className="text-zinc-500 text-xs text-center">Busca una película que te guste para afinar las recomendaciones</p>

              {/* Selected movie display */}
              {selectedReference ? (
                <div className="flex items-center gap-3 bg-zinc-900 border-2 border-yellow-400 rounded-xl p-3">
                  <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    {selectedReference.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${selectedReference.poster_path}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">
                      {selectedReference.titulo_ingles || selectedReference.titulo}
                    </p>
                    {selectedReference.titulo_ingles && selectedReference.titulo !== selectedReference.titulo_ingles && (
                      <p className="text-zinc-500 text-xs truncate">{selectedReference.titulo}</p>
                    )}
                  </div>
                  <IconButton
                    icon={<Icon.Close className="w-5 h-5" />}
                    label="Quitar selección"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedReference(null); setMovieSearch('') }}
                  />
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={movieSearch}
                    onChange={e => setMovieSearch(e.target.value)}
                    placeholder="Buscar película..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50 transition-colors min-h-[44px]"
                  />
                  {/* Dropdown results */}
                  {movieSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden z-20 shadow-xl">
                      {movieSearchResults.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedReference(m)
                            setMovieSearch('')
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors text-left min-h-[44px]"
                        >
                          <div className="w-8 h-11 rounded-md overflow-hidden bg-zinc-800 shrink-0">
                            {m.poster_path && (
                              <img
                                src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {m.titulo_ingles || m.titulo}
                            </p>
                            {m.titulo_ingles && m.titulo !== m.titulo_ingles && (
                              <p className="text-zinc-500 text-xs truncate">{m.titulo}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button
                  onClick={() => setPrefsStep(2)}
                  variant="ghost"
                  size="lg"
                  className="flex-1 border border-zinc-700 rounded-2xl"
                >
                  Atrás
                </Button>
                <Button
                  onClick={handleSubmitPrefs}
                  disabled={!selectedReference || loading}
                  loading={loading}
                  size="lg"
                  className="flex-1 rounded-2xl"
                >
                  Listo
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      )}

      {/* ════════ WAITING FOR OTHER PERSON'S PREFS ════════ */}
      {phase === 'waiting_prefs' && (
        <div className="flex flex-col items-center pt-20">
          <LoadingState text="Esperando las preferencias de tu compañero/a..." />
          <p className="text-zinc-600 text-xs mt-6">Cuando ambos terminen, generaremos las películas</p>
        </div>
      )}

      {/* ════════ SWIPE PHASE ════════ */}
      {phase === 'swipe' && currentMovie && (
        <div className="pt-4">
          <div className="text-center mb-4">
            <p className="text-zinc-500 text-xs font-mono mb-1">Sala {roomCode}</p>
            <h2 className="text-xl font-bold text-white">¿Te interesa?</h2>
          </div>

          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-zinc-500 text-xs">{swipeIndex + 1}/{pool.length}</span>
            <div className="flex-1 mx-3 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                style={{ width: `${((swipeIndex + 1) / pool.length) * 100}%` }}
              />
            </div>
            <span className="text-zinc-500 text-xs">{pool.length - swipeIndex - 1} restantes</span>
          </div>

          {/* Movie Card */}
          <div
            className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-all duration-300 ${
              swipeAnim === 'right' ? 'translate-x-[120%] rotate-12 opacity-0' :
              swipeAnim === 'left' ? '-translate-x-[120%] -rotate-12 opacity-0' :
              ''
            }`}
          >
            {/* Backdrop */}
            <div className="relative h-56 sm:h-72 bg-zinc-800">
              {currentMovie.backdrop_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w780${currentMovie.backdrop_path}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : currentMovie.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w342${currentMovie.poster_path}`}
                  alt=""
                  className="w-full h-full object-cover blur-sm scale-110"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
            </div>

            {/* Info */}
            <div className="relative -mt-16 px-5 pb-5">
              <h3 className="text-white text-xl sm:text-2xl font-black leading-tight mb-1.5">
                {currentMovie.titulo_ingles || currentMovie.titulo}
              </h3>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {currentMovie.anio && (
                  <span className="text-zinc-400 text-sm">{currentMovie.anio}</span>
                )}
                {currentMovie.nota_imdb && (
                  <span className="text-yellow-400 text-sm font-semibold flex items-center gap-1">
                    <Icon.Star filled className="w-3.5 h-3.5" />
                    {currentMovie.nota_imdb}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {currentMovie.generos.slice(0, 4).map(g => (
                  <Pill key={g} variant="default" size="sm">{g}</Pill>
                ))}
              </div>

              {/* Platforms */}
              {currentMovie.plataformas.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">En:</span>
                  {PLATFORMS.filter(pl => currentMovie.plataformas.includes(pl.key)).map(pl => (
                    <div key={pl.key} className="rounded-lg px-1.5 py-1 bg-white/90" style={{ height: 22 }}>
                      <img src={pl.icon} alt={pl.name} className="h-3.5 w-auto object-contain" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Swipe Buttons */}
          <div className="flex items-center justify-center gap-6 mt-6">
            <IconButton
              icon={<Icon.Close className="w-7 h-7" />}
              label="No me interesa"
              variant="secondary"
              size="lg"
              onClick={() => handleSwipe(false)}
              className="w-16 h-16 rounded-full hover:border-red-400 hover:bg-red-400/10 active:scale-90 transition-all"
            />
            <IconButton
              icon={<Icon.Heart filled className="w-9 h-9 text-yellow-400" />}
              label="Me interesa"
              variant="secondary"
              size="lg"
              onClick={() => handleSwipe(true)}
              className="w-20 h-20 rounded-full border-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20 active:scale-90 transition-all"
            />
          </div>

          <p className="text-center text-zinc-600 text-xs mt-3">
            Desliza o usa los botones
          </p>
        </div>
      )}

      {/* Swipe phase done, pool empty edge case */}
      {phase === 'swipe' && !currentMovie && swipeIndex >= pool.length && (
        <div className="flex flex-col items-center pt-20">
          <LoadingState text="Enviando tus respuestas..." />
        </div>
      )}

      {/* ════════ WAITING FOR OTHER PERSON'S SWIPES ════════ */}
      {phase === 'waiting_swipes' && (
        <div className="flex flex-col items-center pt-20">
          <LoadingState text="Esperando a que tu compañero/a termine de elegir..." />
          <p className="text-zinc-600 text-xs mt-6">Ya casi está</p>
        </div>
      )}

      {/* ════════ RESULTS ════════ */}
      {phase === 'results' && (
        <div className="pt-4">
          {results.length === 0 ? (
            <EmptyState
              icon={<Icon.Close className="w-16 h-16" />}
              title="No hubo match"
              description="No coincidieron en ninguna película. Intenten de nuevo."
              action={
                <Button onClick={handleReset} size="lg" className="rounded-2xl">
                  Jugar de nuevo
                </Button>
              }
              className="pt-16"
            />
          ) : (
            <>
              {/* Header celebration */}
              <div className="text-center mb-6">
                <Icon.Sparkles className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                <h2 className="text-2xl font-bold text-white">Match perfecto</h2>
                <p className="text-zinc-400 text-sm">Esta es su película</p>
              </div>

              {/* #1 Big Card */}
              {(() => {
                const top = results[0]
                return (
                  <Link href={`/pelicula/${top.id}`} className="block mb-8">
                    <div className="relative overflow-hidden rounded-2xl border-2 border-yellow-400/40 bg-zinc-900">
                      <div className="relative h-52 sm:h-64 bg-zinc-800">
                        {top.backdrop_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w780${top.backdrop_path}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : top.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${top.poster_path}`}
                            alt=""
                            className="w-full h-full object-cover blur-sm scale-110"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent" />

                        {/* Match badge */}
                        <Pill variant="gold" className="absolute top-3 right-3 bg-yellow-400 text-zinc-950 font-black border-0">
                          Match {top.match_score}%
                        </Pill>

                        {/* #1 badge */}
                        <Pill variant="default" className="absolute top-3 left-3 bg-zinc-950/80 border border-yellow-400/50 text-yellow-400 font-bold">
                          #1
                        </Pill>
                      </div>

                      <div className="px-5 pb-5 -mt-10 relative">
                        <h3 className="text-white text-2xl font-black mb-1.5">
                          {top.titulo_ingles || top.titulo}
                        </h3>
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          {top.anio && <span className="text-zinc-400 text-sm">{top.anio}</span>}
                          {top.nota_imdb && (
                            <span className="text-yellow-400 text-sm font-semibold flex items-center gap-1">
                              <Icon.Star filled className="w-3.5 h-3.5" />
                              {top.nota_imdb}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {top.generos.slice(0, 4).map(g => (
                            <Pill key={g} variant="default" size="sm">{g}</Pill>
                          ))}
                        </div>
                        {top.plataformas.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-600 text-xs">Disponible en:</span>
                            {PLATFORMS.filter(pl => top.plataformas.includes(pl.key)).map(pl => (
                              <div key={pl.key} className="rounded-lg px-1.5 py-1 bg-white/90" style={{ height: 22 }}>
                                <img src={pl.icon} alt={pl.name} className="h-3.5 w-auto object-contain" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })()}

              {/* Rest of results */}
              {results.length > 1 && (
                <Section label="También les gustó">
                  <div className="space-y-3">
                    {results.slice(1).map((movie, i) => (
                      <Link
                        key={movie.id}
                        href={`/pelicula/${movie.id}`}
                        className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 hover:border-yellow-400/30 transition-colors min-h-[44px]"
                      >
                        {/* Rank */}
                        <span className="text-zinc-600 text-xs font-mono w-5 text-center shrink-0">
                          #{i + 2}
                        </span>

                        {/* Poster */}
                        <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                          {movie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[8px]">
                              ?
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            {movie.titulo_ingles || movie.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {movie.anio && <span className="text-zinc-500 text-xs">{movie.anio}</span>}
                            {movie.nota_imdb && (
                              <span className="text-yellow-400 text-xs flex items-center gap-0.5">
                                <Icon.Star filled className="w-2.5 h-2.5" />
                                {movie.nota_imdb}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Match score */}
                        <Pill
                          variant={movie.match_score >= 80 ? 'gold' : 'default'}
                          size="sm"
                          className="shrink-0 font-bold"
                        >
                          {movie.match_score}%
                        </Pill>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-8">
                <Button
                  onClick={handleShare}
                  size="lg"
                  className="flex-1 rounded-2xl"
                  iconLeft={<Icon.Share className="w-4 h-4" />}
                >
                  Compartir
                </Button>
                <Button
                  onClick={handleReset}
                  variant="secondary"
                  size="lg"
                  className="flex-1 rounded-2xl"
                  iconLeft={<Icon.Refresh className="w-4 h-4" />}
                >
                  Jugar de nuevo
                </Button>
              </div>
            </>
          )}
        </div>
      )}

    </PageShell>
  )
}
