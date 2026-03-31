'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Loading from '@/components/Loading'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

const PLATAFORMAS = [
  { key: 'netflix', name: 'Netflix', icon: '/netflix.png' },
  { key: 'disney_plus', name: 'Disney+', icon: '/disney_plus.svg' },
  { key: 'hbo_max', name: 'Max', icon: '/hbo_max.png' },
  { key: 'amazon_prime', name: 'Prime Video', icon: '/amazon_prime.png' },
  { key: 'apple_tv', name: 'Apple TV+', icon: '/apple_tv.png' },
  { key: 'paramount_plus', name: 'Paramount+', icon: '/paramount_plus.svg' },
  { key: 'mubi', name: 'MUBI', icon: '/mubi.png' },
  { key: 'crunchyroll', name: 'Crunchyroll', icon: '/crunchyroll.png' },
]

type Participant = {
  user_id: string
  username: string
  avatar_url: string | null
}

type MovieResult = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  generos: string[]
  plataformas: string[]
  score: number
}

type Step = 1 | 2 | 3

function MiniAvatar({ url, username, size = 'md' }: { url: string | null; username: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'
  if (url) return <img loading="lazy" src={url} alt={username} className={`${dim} rounded-full object-cover shrink-0`} />
  return (
    <div className={`${dim} rounded-full bg-zinc-700 flex items-center justify-center ${text} font-bold text-zinc-300 shrink-0`}>
      {username[0]?.toUpperCase()}
    </div>
  )
}

export default function JuntosPage() {
  const { user, username, loading } = useAuth()
  const router = useRouter()

  // Step management
  const [step, setStep] = useState<Step>(1)

  // Step 1: Participants
  const [participants, setParticipants] = useState<Participant[]>([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Participant[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  // Step 2: Platforms
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // Step 3: Results
  const [results, setResults] = useState<MovieResult[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [error, setError] = useState('')

  // Auto-add logged in user as first participant
  useEffect(() => {
    if (!loading && user && username) {
      supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          setParticipants([{
            user_id: user.id,
            username,
            avatar_url: data?.avatar_url ?? null,
          }])
        })
    }
  }, [user, username, loading])

  // Search users
  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    setShowDropdown(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .ilike('username', `%${q}%`)
        .limit(8)

      const existing = new Set(participants.map(p => p.user_id))
      const filtered = (data ?? [])
        .filter((p: any) => !existing.has(p.user_id))
        .map((p: any) => ({
          user_id: p.user_id,
          username: p.username,
          avatar_url: p.avatar_url ?? null,
        }))

      setSearchResults(filtered)
      setSearching(false)
    }, 300)
  }, [search, participants])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addParticipant = (p: Participant) => {
    if (participants.length >= 4) return
    setParticipants(prev => [...prev, p])
    setSearch('')
    setSearchResults([])
    setShowDropdown(false)
  }

  const removeParticipant = (userId: string) => {
    if (userId === user?.id) return // Can't remove yourself
    setParticipants(prev => prev.filter(p => p.user_id !== userId))
  }

  const togglePlatform = (key: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const fetchResults = async () => {
    setLoadingResults(true)
    setError('')
    setResults([])
    try {
      const res = await fetch('/api/juntos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: participants.map(p => p.user_id),
          plataformas: selectedPlatforms,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al buscar recomendaciones')
      } else {
        setResults(data.movies ?? [])
      }
    } catch {
      setError('Error de conexión')
    }
    setLoadingResults(false)
  }

  const goToStep = (s: Step) => {
    if (s === 2 && participants.length < 2) return
    if (s === 3 && selectedPlatforms.length === 0) return
    if (s === 3) fetchResults()
    setStep(s)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav />
        <div className="flex items-center justify-center h-64">
          <Loading text="Cargando..." />
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <Nav />
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <div className="mb-4"><svg className="w-12 h-12 mx-auto text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M7 4v4M12 4v4M17 4v4" strokeLinecap="round"/></svg></div>
          <h1 className="text-2xl font-bold text-white mb-2">Inicia sesión</h1>
          <p className="text-zinc-400 text-sm max-w-xs">
            Necesitas una cuenta para usar "¿Qué vemos juntos?"
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            ¿Qué vemos juntos?
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base">
            Encuentra la película perfecta para el grupo
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (s < step) setStep(s as Step)
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  s === step
                    ? 'bg-amber-500 text-zinc-950'
                    : s < step
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 cursor-pointer hover:bg-amber-500/30'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}
              >
                {s < step ? '✓' : s}
              </button>
              {s < 3 && (
                <div className={`w-8 sm:w-12 h-0.5 ${s < step ? 'bg-amber-500/40' : 'bg-zinc-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ======= STEP 1: Participants ======= */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6">
              <h2 className="text-white font-bold text-lg mb-1">¿Quiénes van a ver?</h2>
              <p className="text-zinc-500 text-sm mb-5">Agrega entre 2 y 4 personas del grupo</p>

              {/* Current participants */}
              <div className="flex flex-wrap gap-3 mb-5">
                {participants.map(p => (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full pl-1 pr-3 py-1"
                  >
                    <MiniAvatar url={p.avatar_url} username={p.username} size="sm" />
                    <span className="text-white text-sm font-medium">@{p.username}</span>
                    {p.user_id === user.id ? (
                      <span className="text-amber-400 text-xs">(tú)</span>
                    ) : (
                      <button
                        onClick={() => removeParticipant(p.user_id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors ml-1 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Search */}
              {participants.length < 4 && (
                <div className="relative" ref={searchContainerRef}>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por username..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  {showDropdown && search.length >= 2 && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                      {searching ? (
                        <p className="text-zinc-500 text-xs px-4 py-3">Buscando...</p>
                      ) : searchResults.length === 0 ? (
                        <p className="text-zinc-500 text-xs px-4 py-3">No se encontraron usuarios</p>
                      ) : (
                        searchResults.map(p => (
                          <button
                            key={p.user_id}
                            onClick={() => addParticipant(p)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
                          >
                            <MiniAvatar url={p.avatar_url} username={p.username} size="sm" />
                            <span className="text-white text-sm font-medium">@{p.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {participants.length >= 4 && (
                <p className="text-amber-400/70 text-xs">Máximo 4 participantes</p>
              )}
            </div>

            <button
              onClick={() => goToStep(2)}
              disabled={participants.length < 2}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-xl py-3.5 text-sm transition-colors"
            >
              {participants.length < 2
                ? `Agrega ${2 - participants.length} persona${participants.length === 0 ? 's' : ''} más`
                : 'Siguiente: Plataformas'}
            </button>
          </div>
        )}

        {/* ======= STEP 2: Platforms ======= */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6">
              <h2 className="text-white font-bold text-lg mb-1">¿Qué plataformas tienen en común?</h2>
              <p className="text-zinc-500 text-sm mb-5">Selecciona las que comparte el grupo</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PLATAFORMAS.map(p => {
                  const active = selectedPlatforms.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      onClick={() => togglePlatform(p.key)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                        active
                          ? 'border-amber-500 bg-amber-500/10 text-white'
                          : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <Image
                        src={p.icon}
                        alt={p.name}
                        width={24}
                        height={24}
                        className="rounded-sm shrink-0"
                      />
                      <span className="text-sm font-medium">{p.name}</span>
                      {active && <span className="text-amber-400 ml-auto">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Participants summary */}
            <div className="flex items-center gap-2 justify-center">
              <span className="text-zinc-500 text-xs">Buscando para:</span>
              <div className="flex -space-x-2">
                {participants.map(p => (
                  <div key={p.user_id} className="border-2 border-zinc-950 rounded-full">
                    <MiniAvatar url={p.avatar_url} username={p.username} size="sm" />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => goToStep(3)}
              disabled={selectedPlatforms.length === 0}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-xl py-3.5 text-sm transition-colors"
            >
              {selectedPlatforms.length === 0
                ? 'Selecciona al menos una plataforma'
                : '¡Buscar películas!'}
            </button>
          </div>
        )}

        {/* ======= STEP 3: Results ======= */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Participants + platforms summary */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
              <div className="flex -space-x-2">
                {participants.map(p => (
                  <div key={p.user_id} className="border-2 border-zinc-950 rounded-full">
                    <MiniAvatar url={p.avatar_url} username={p.username} size="sm" />
                  </div>
                ))}
              </div>
              <span className="text-zinc-600 text-xs">en</span>
              <div className="flex gap-1.5">
                {PLATAFORMAS.filter(p => selectedPlatforms.includes(p.key)).map(p => (
                  <div key={p.key} className="rounded-lg px-1.5 py-1 bg-white/90 flex items-center justify-center" style={{ height: 22 }}>
                    <img loading="lazy" src={p.icon} alt={p.name} className="h-3.5 w-auto object-contain" />
                  </div>
                ))}
              </div>
            </div>

            {loadingResults && (
              <div className="flex items-center justify-center py-16">
                <Loading text="Analizando gustos del grupo..." />
              </div>
            )}

            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 text-center">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {!loadingResults && !error && results.length === 0 && (
              <div className="text-center py-12">
                <div className="mb-3"><svg className="w-10 h-10 mx-auto text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <p className="text-zinc-400 text-sm">
                  No encontramos películas que le gusten a todos en esas plataformas.
                </p>
                <button
                  onClick={() => setStep(2)}
                  className="mt-4 text-amber-400 text-sm hover:text-amber-300 transition-colors"
                >
                  Probar con otras plataformas
                </button>
              </div>
            )}

            {!loadingResults && results.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {results.map((movie, i) => {
                  const titulo = movie.titulo_ingles || movie.titulo
                  const isTop = i < 3
                  return (
                    <Link
                      key={movie.id}
                      href={`/pelicula/${movie.id}`}
                      className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-amber-500/40 transition-all"
                    >
                      <div className="relative aspect-[2/3] bg-zinc-800">
                        {movie.poster_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                            alt={titulo}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-zinc-600 text-xs text-center px-2">{titulo}</span>
                          </div>
                        )}

                        {/* Match score badge */}
                        <div className={`absolute top-2 left-2 rounded-lg px-2 py-1 text-xs font-bold ${
                          movie.score >= 80
                            ? 'bg-amber-500 text-zinc-950'
                            : movie.score >= 60
                            ? 'bg-amber-500/80 text-zinc-950'
                            : 'bg-zinc-800/90 text-amber-400 border border-amber-500/30'
                        }`}>
                          {movie.score}%
                        </div>

                        {/* Top match badge */}
                        {isTop && (
                          <div className="absolute top-2 right-2 bg-zinc-950/90 border border-amber-500/40 rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                            Perfecta
                          </div>
                        )}

                        {/* Platform logos */}
                        {movie.plataformas.length > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-4 pb-1.5 px-1.5">
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {PLATAFORMAS.filter(pl => movie.plataformas.includes(pl.key)).map(pl => (
                                <div key={pl.key} className="rounded px-0.5 py-0.5 bg-white/90" style={{ height: 14 }}>
                                  <img loading="lazy" src={pl.icon} alt={pl.name} className="h-2.5 w-auto object-contain" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{titulo}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {movie.anio && <span className="text-zinc-500 text-xs">{movie.anio}</span>}
                          {movie.nota_imdb && <span className="text-yellow-400 text-xs flex items-center gap-0.5"><svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg> {movie.nota_imdb}</span>}
                        </div>
                        {movie.generos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {movie.generos.slice(0, 2).map(g => (
                              <span key={g} className="text-[10px] text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{g}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Retry button */}
            {!loadingResults && results.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white font-medium rounded-xl py-3 text-sm transition-colors"
                >
                  Cambiar participantes
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white font-medium rounded-xl py-3 text-sm transition-colors"
                >
                  Cambiar plataformas
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
