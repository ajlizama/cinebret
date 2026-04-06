'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Loading from '@/components/Loading'

// ── Types ──

type Prefs = {
  mood: string
  genres: string[]
  platforms: string[]
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
  pool_ready: boolean
}

type Phase =
  | 'start'
  | 'waiting'
  | 'prefs'
  | 'waiting_prefs'
  | 'swipe'
  | 'waiting_swipes'
  | 'results'

// ── Constants ──

const MOODS = [
  { key: 'bajon', label: "Pa'l bajón", emoji: '🛋️', desc: 'Relax y risas' },
  { key: 'sillon', label: "Pa'l sillón", emoji: '🔥', desc: 'Acción y adrenalina' },
  { key: 'licuadora', label: 'Licuadora', emoji: '🧠', desc: 'Mente volada' },
  { key: 'llorar', label: 'Pa\' llorar', emoji: '😢', desc: 'Sentir todo' },
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
  const res = await fetch('/api/juntos-nuevo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
  return res.json()
}

async function fetchRoom(code: string): Promise<RoomState | null> {
  const res = await fetch(`/api/juntos-nuevo?code=${code}`)
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

  // Prefs state
  const [selectedMood, setSelectedMood] = useState('')
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [prefsStep, setPrefsStep] = useState(1) // 1=mood, 2=genres, 3=platforms

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

  // ── Create Room ──
  const handleCreate = async () => {
    setLoading(true)
    setError('')
    const data = await apiCall('create')
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
      setError('El codigo debe tener 6 caracteres')
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
    if (!selectedMood || selectedGenres.length === 0 || selectedPlatforms.length === 0) {
      setError('Completa todas las preferencias')
      return
    }
    setLoading(true)
    setError('')

    const prefs: Prefs = {
      mood: selectedMood,
      genres: selectedGenres,
      platforms: selectedPlatforms,
    }

    await apiCall('submit_prefs', { code: roomCode, slot, prefs })
    setPhase('waiting_prefs')

    // Poll until both prefs are in, then generate pool
    pollingRef.current = setInterval(async () => {
      const room = await fetchRoom(roomCode)
      if (!room) return

      const u1Done = room.user1_prefs && Object.keys(room.user1_prefs).length > 0 && (room.user1_prefs as any).mood
      const u2Done = room.user2_prefs && Object.keys(room.user2_prefs).length > 0 && (room.user2_prefs as any).mood

      if (u1Done && u2Done) {
        stopPolling()

        // Only user1 triggers pool generation
        if (slot === 'user1') {
          await apiCall('generate_pool', { code: roomCode })
        }

        // Now poll for pool_ready
        pollingRef.current = setInterval(async () => {
          const updated = await fetchRoom(roomCode)
          if (updated?.pool_ready && updated.movie_pool.length > 0) {
            stopPolling()
            setPool(updated.movie_pool)
            setSwipeIndex(0)
            setSwipes({})
            setPhase('swipe')
          } else if (updated?.pool_ready && updated.movie_pool.length === 0) {
            stopPolling()
            setError('No encontramos peliculas con esas preferencias. Intenten de nuevo.')
            setPhase('prefs')
            setPrefsStep(1)
            setSelectedMood('')
            setSelectedGenres([])
            setSelectedPlatforms([])
          }
        }, 2000)
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
    const text = `Usamos Ver Juntos en CineBret y nuestra pelicula perfecta es: ${top.titulo_ingles || top.titulo} (${top.anio ?? ''}) - Match ${top.match_score}%`
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
    <main className="min-h-screen bg-zinc-950">
      <Nav active="inicio" />

      <div className="max-w-lg mx-auto px-4 py-6 pb-24">

        {/* ════════ START SCREEN ════════ */}
        {phase === 'start' && (
          <div className="flex flex-col items-center pt-12">
            <div className="text-6xl mb-4">🎬</div>
            <h1 className="text-3xl sm:text-4xl font-black text-white text-center mb-2">
              Ver Juntos
            </h1>
            <p className="text-zinc-400 text-center text-sm mb-10 max-w-xs">
              ¿Que vemos esta noche? Encuentren la pelicula perfecta para los dos, desde sus celulares.
            </p>

            <div className="w-full space-y-4">
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-zinc-950 font-bold rounded-2xl py-4 text-lg transition-colors"
              >
                {loading ? 'Creando...' : 'Crear sala'}
              </button>

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
                  placeholder="Codigo de sala (6 letras)"
                  maxLength={6}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-center text-white text-xl font-mono tracking-[0.3em] placeholder:text-zinc-600 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-yellow-400/50 transition-colors"
                />
                <button
                  onClick={handleJoin}
                  disabled={loading || joinInput.length !== 6}
                  className="w-full border-2 border-yellow-400/50 hover:border-yellow-400 disabled:border-zinc-800 disabled:text-zinc-600 text-yellow-400 font-bold rounded-2xl py-3.5 text-base transition-colors"
                >
                  Unirse a sala
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
            )}
          </div>
        )}

        {/* ════════ WAITING ROOM ════════ */}
        {phase === 'waiting' && (
          <div className="flex flex-col items-center pt-16">
            <div className="text-5xl mb-6">👀</div>
            <h2 className="text-2xl font-bold text-white mb-3">Tu sala esta lista</h2>
            <p className="text-zinc-400 text-sm mb-8 text-center">
              Comparte este codigo con tu complice
            </p>

            <div className="bg-zinc-900 border-2 border-yellow-400/30 rounded-2xl px-8 py-6 mb-6">
              <p className="text-yellow-400 text-5xl font-mono font-black tracking-[0.4em] text-center select-all">
                {roomCode}
              </p>
            </div>

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'Ver Juntos', text: `Unite a mi sala en CineBret: ${roomCode}` })
                } else {
                  navigator.clipboard.writeText(roomCode)
                  alert('Codigo copiado')
                }
              }}
              className="text-yellow-400 text-sm font-medium mb-10 hover:text-yellow-300 transition-colors"
            >
              Copiar / Compartir codigo
            </button>

            <Loading text="Esperando a tu complice..." />

            <button
              onClick={handleReset}
              className="mt-8 text-zinc-600 text-xs hover:text-zinc-400 transition-colors"
            >
              Cancelar
            </button>
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
                <h3 className="text-white font-semibold text-lg text-center mb-2">¿Que mood tienes?</h3>
                <div className="grid grid-cols-2 gap-3">
                  {MOODS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => setSelectedMood(m.key)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all ${
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
                <button
                  onClick={() => selectedMood && setPrefsStep(2)}
                  disabled={!selectedMood}
                  className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-2xl py-3.5 mt-4 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            )}

            {/* Q2: Genres */}
            {prefsStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-white font-semibold text-lg text-center mb-2">¿Que generos quieres?</h3>
                <p className="text-zinc-500 text-xs text-center">Elige al menos 1</p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {GENRES.map(g => (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={`px-4 py-2.5 rounded-full border-2 text-sm font-medium transition-all ${
                        selectedGenres.includes(g)
                          ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setPrefsStep(1)}
                    className="flex-1 border border-zinc-700 text-zinc-400 font-medium rounded-2xl py-3 transition-colors hover:border-zinc-500"
                  >
                    Atras
                  </button>
                  <button
                    onClick={() => selectedGenres.length > 0 && setPrefsStep(3)}
                    disabled={selectedGenres.length === 0}
                    className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-2xl py-3 transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {/* Q3: Platforms */}
            {prefsStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-white font-semibold text-lg text-center mb-2">¿Que plataformas tienen?</h3>
                <p className="text-zinc-500 text-xs text-center">Elige las que tengas</p>
                <div className="grid grid-cols-2 gap-3">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => togglePlatform(p.key)}
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 transition-all ${
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
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setPrefsStep(2)}
                    className="flex-1 border border-zinc-700 text-zinc-400 font-medium rounded-2xl py-3 transition-colors hover:border-zinc-500"
                  >
                    Atras
                  </button>
                  <button
                    onClick={handleSubmitPrefs}
                    disabled={selectedPlatforms.length === 0 || loading}
                    className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-2xl py-3 transition-colors"
                  >
                    {loading ? 'Enviando...' : 'Listo'}
                  </button>
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
            <Loading text="Esperando las preferencias de tu complice..." />
            <p className="text-zinc-600 text-xs mt-6">Cuando ambos terminen, generaremos las peliculas</p>
          </div>
        )}

        {/* ════════ SWIPE PHASE ════════ */}
        {phase === 'swipe' && currentMovie && (
          <div className="pt-4">
            <div className="text-center mb-4">
              <p className="text-zinc-500 text-xs font-mono mb-1">Sala {roomCode}</p>
              <h2 className="text-xl font-bold text-white">¿Te tinca?</h2>
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
                      <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20">
                        <path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/>
                      </svg>
                      {currentMovie.nota_imdb}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {currentMovie.generos.slice(0, 4).map(g => (
                    <span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">{g}</span>
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
              <button
                onClick={() => handleSwipe(false)}
                className="w-16 h-16 rounded-full border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center text-2xl hover:border-red-400 hover:bg-red-400/10 transition-all active:scale-90"
                aria-label="No me tinca"
              >
                <svg className="w-7 h-7 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
              <button
                onClick={() => handleSwipe(true)}
                className="w-20 h-20 rounded-full border-2 border-yellow-400 bg-yellow-400/10 flex items-center justify-center text-3xl hover:bg-yellow-400/20 transition-all active:scale-90"
                aria-label="Me tinca"
              >
                <svg className="w-9 h-9 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
            </div>

            <p className="text-center text-zinc-600 text-xs mt-3">
              Desliza o usa los botones
            </p>
          </div>
        )}

        {/* Swipe phase done, pool empty edge case */}
        {phase === 'swipe' && !currentMovie && swipeIndex >= pool.length && (
          <div className="flex flex-col items-center pt-20">
            <Loading text="Enviando tus respuestas..." />
          </div>
        )}

        {/* ════════ WAITING FOR OTHER PERSON'S SWIPES ════════ */}
        {phase === 'waiting_swipes' && (
          <div className="flex flex-col items-center pt-20">
            <Loading text="Esperando a que tu complice termine de elegir..." />
            <p className="text-zinc-600 text-xs mt-6">Ya casi esta</p>
          </div>
        )}

        {/* ════════ RESULTS ════════ */}
        {phase === 'results' && (
          <div className="pt-4">
            {results.length === 0 ? (
              <div className="text-center pt-16">
                <div className="text-5xl mb-4">😅</div>
                <h2 className="text-2xl font-bold text-white mb-2">No hubo match</h2>
                <p className="text-zinc-400 text-sm mb-8">No coincidieron en ninguna pelicula. Intenten de nuevo.</p>
                <button
                  onClick={handleReset}
                  className="bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold rounded-2xl px-8 py-3.5 transition-colors"
                >
                  Jugar de nuevo
                </button>
              </div>
            ) : (
              <>
                {/* Header celebration */}
                <div className="text-center mb-6">
                  <div className="text-5xl mb-2">🎉</div>
                  <h2 className="text-2xl font-bold text-white">Match perfecto</h2>
                  <p className="text-zinc-400 text-sm">Esta es su pelicula</p>
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
                          <div className="absolute top-3 right-3 bg-yellow-400 text-zinc-950 font-black text-sm rounded-full px-3 py-1">
                            Match {top.match_score}%
                          </div>

                          {/* #1 badge */}
                          <div className="absolute top-3 left-3 bg-zinc-950/80 border border-yellow-400/50 text-yellow-400 font-bold text-xs rounded-full px-2.5 py-1">
                            #1
                          </div>
                        </div>

                        <div className="px-5 pb-5 -mt-10 relative">
                          <h3 className="text-white text-2xl font-black mb-1.5">
                            {top.titulo_ingles || top.titulo}
                          </h3>
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            {top.anio && <span className="text-zinc-400 text-sm">{top.anio}</span>}
                            {top.nota_imdb && (
                              <span className="text-yellow-400 text-sm font-semibold flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20">
                                  <path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/>
                                </svg>
                                {top.nota_imdb}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {top.generos.slice(0, 4).map(g => (
                              <span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">{g}</span>
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
                  <>
                    <h3 className="text-white font-bold text-sm mb-3">Tambien les gusto:</h3>
                    <div className="space-y-3">
                      {results.slice(1).map((movie, i) => (
                        <Link
                          key={movie.id}
                          href={`/pelicula/${movie.id}`}
                          className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 hover:border-yellow-400/30 transition-colors"
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
                                  <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20">
                                    <path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/>
                                  </svg>
                                  {movie.nota_imdb}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Match score */}
                          <div className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
                            movie.match_score >= 80
                              ? 'bg-yellow-400/20 text-yellow-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {movie.match_score}%
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={handleShare}
                    className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold rounded-2xl py-3.5 text-sm transition-colors"
                  >
                    Compartir
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white font-medium rounded-2xl py-3.5 text-sm transition-colors"
                  >
                    Jugar de nuevo
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
