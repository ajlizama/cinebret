'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { supabase } from '@/lib/supabase'

type BattleMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
  backdrop_path: string | null
  generos: string[]
}

type BracketMatch = {
  a: BattleMovie | null
  b: BattleMovie | null
  winner: BattleMovie | null
}

const ROUND_NAMES = ['Octavos', 'Cuartos', 'Semifinal', 'Final']

export default function BatallaPage() {
  const [movies, setMovies] = useState<BattleMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bracket state: rounds[0] = 8 matches, rounds[1] = 4, rounds[2] = 2, rounds[3] = 1
  const [rounds, setRounds] = useState<BracketMatch[][]>([])
  const [currentRound, setCurrentRound] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const [chosen, setChosen] = useState<'a' | 'b' | null>(null)
  const [champion, setChampion] = useState<BattleMovie | null>(null)
  const [showCopied, setShowCopied] = useState(false)
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchMovies = useCallback(async () => {
    setLoading(true)
    setError(null)
    setChampion(null)
    setChosen(null)
    setCurrentRound(0)
    setCurrentMatch(0)
    setRounds([])

    try {
      // Fetch random movies with good ratings and images
      // Use a random offset approach: get count first, then pick random offset
      const { count } = await supabase
        .from('peliculas')
        .select('id', { count: 'exact', head: true })
        .gte('nota_imdb', 7.5)
        .not('poster_path', 'is', null)
        .not('backdrop_path', 'is', null)

      if (!count || count < 16) {
        setError('No hay suficientes peliculas para la batalla')
        setLoading(false)
        return
      }

      // Fetch a pool and shuffle client-side (Supabase doesn't have random ordering)
      const poolSize = Math.min(count, 200)
      const randomOffset = Math.max(0, Math.floor(Math.random() * (count - poolSize)))

      const { data: pool, error: fetchErr } = await supabase
        .from('peliculas')
        .select('id, titulo, titulo_ingles, anio, nota_imdb, poster_path, backdrop_path')
        .gte('nota_imdb', 7.5)
        .not('poster_path', 'is', null)
        .not('backdrop_path', 'is', null)
        .range(randomOffset, randomOffset + poolSize - 1)

      if (fetchErr || !pool) {
        setError('Error cargando peliculas')
        setLoading(false)
        return
      }

      // Shuffle and pick 16
      const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 16)

      // Fetch enriquecimiento for genres
      const ids = shuffled.map(m => m.id)
      const { data: enrichData } = await supabase
        .from('enriquecimiento')
        .select('pelicula_id, generos')
        .in('pelicula_id', ids)

      const genMap: Record<string, string[]> = {}
      if (enrichData) {
        for (const e of enrichData) {
          genMap[e.pelicula_id] = e.generos ?? []
        }
      }

      const battleMovies: BattleMovie[] = shuffled.map(m => ({
        id: m.id,
        titulo: m.titulo,
        titulo_ingles: m.titulo_ingles,
        anio: m.anio,
        nota_imdb: m.nota_imdb,
        poster_path: m.poster_path,
        backdrop_path: m.backdrop_path,
        generos: genMap[m.id] ?? [],
      }))

      setMovies(battleMovies)

      // Build initial bracket: round 0 = 8 matchups
      const initialMatches: BracketMatch[] = []
      for (let i = 0; i < 16; i += 2) {
        initialMatches.push({ a: battleMovies[i], b: battleMovies[i + 1], winner: null })
      }
      setRounds([initialMatches])
      setLoading(false)
    } catch {
      setError('Error inesperado')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMovies()
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
    }
  }, [fetchMovies])

  const handleChoice = (side: 'a' | 'b') => {
    if (chosen) return // prevent double-click
    setChosen(side)

    const match = rounds[currentRound][currentMatch]
    const winner = side === 'a' ? match.a! : match.b!

    // Update bracket with winner
    const updatedRounds = [...rounds]
    updatedRounds[currentRound] = [...updatedRounds[currentRound]]
    updatedRounds[currentRound][currentMatch] = { ...match, winner }

    animTimeoutRef.current = setTimeout(() => {
      const roundMatches = updatedRounds[currentRound]
      const nextMatchIdx = currentMatch + 1

      if (nextMatchIdx < roundMatches.length) {
        // More matches in this round
        setRounds(updatedRounds)
        setCurrentMatch(nextMatchIdx)
        setChosen(null)
      } else {
        // Round complete — build next round
        const winners = roundMatches.map((m, i) =>
          i === roundMatches.length - 1 ? winner : m.winner!
        )
        // Actually re-read all winners from updated round
        const allWinners = updatedRounds[currentRound].map((m, i) =>
          i === currentMatch ? winner : m.winner!
        )

        if (allWinners.length === 1) {
          // We have a champion
          setRounds(updatedRounds)
          setChampion(allWinners[0])
          setChosen(null)
        } else {
          // Build next round matchups
          const nextRoundMatches: BracketMatch[] = []
          for (let i = 0; i < allWinners.length; i += 2) {
            nextRoundMatches.push({ a: allWinners[i], b: allWinners[i + 1], winner: null })
          }
          updatedRounds.push(nextRoundMatches)
          setRounds(updatedRounds)
          setCurrentRound(currentRound + 1)
          setCurrentMatch(0)
          setChosen(null)
        }
      }
    }, 350)
  }

  const handleShare = async () => {
    if (!champion) return
    const text = `\u{1F3C6} Mi campeon en Batalla CineBret: ${champion.titulo}${champion.anio ? ` (${champion.anio})` : ''}\n\u{2B50} IMDb ${champion.nota_imdb}\ncinebret.cl/batalla`
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(text)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 2000)
  }

  const totalMatchesInRound = rounds[currentRound]?.length ?? 0

  // Bracket tree visualization
  const renderBracketTree = () => {
    if (rounds.length === 0) return null

    return (
      <div className="mt-10 overflow-x-auto pb-4">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 text-center">Cuadro del torneo</h3>
        <div className="flex items-center justify-center gap-2 md:gap-4 min-w-[700px] mx-auto">
          {rounds.map((round, ri) => (
            <div key={ri} className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 12}px` }}>
              <div className="text-[10px] text-zinc-500 text-center mb-1 font-medium uppercase tracking-wide">
                {ROUND_NAMES[ri] ?? `R${ri + 1}`}
              </div>
              {round.map((match, mi) => (
                <div key={mi} className="flex flex-col border border-zinc-800 rounded bg-zinc-900/80 overflow-hidden text-[11px]">
                  <div className={`px-2 py-1 truncate border-b border-zinc-800 ${match.winner?.id === match.a?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                    {match.a?.titulo ?? '—'}
                  </div>
                  <div className={`px-2 py-1 truncate ${match.winner?.id === match.b?.id ? 'text-yellow-400 font-bold bg-zinc-800/60' : 'text-zinc-500'}`}>
                    {match.b?.titulo ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {champion && (
            <div className="flex flex-col justify-center flex-shrink-0">
              <div className="text-[10px] text-zinc-500 text-center mb-1 font-medium uppercase tracking-wide">
                Campeon
              </div>
              <div className="border-2 border-yellow-400 rounded bg-zinc-900 px-3 py-2 text-yellow-400 font-bold text-xs text-center max-w-[120px] truncate">
                {champion.titulo}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Movie card for battle
  const renderMovieCard = (movie: BattleMovie, side: 'a' | 'b') => {
    const isChosen = chosen === side
    const isLoser = chosen !== null && chosen !== side

    return (
      <button
        onClick={() => handleChoice(side)}
        disabled={chosen !== null}
        className={`
          relative w-full aspect-[16/10] md:aspect-[16/9] rounded-xl overflow-hidden
          transition-all duration-300 ease-out group
          ${isChosen ? 'scale-[1.03] ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20 z-10' : ''}
          ${isLoser ? 'opacity-30 scale-95 grayscale' : ''}
          ${!chosen ? 'hover:scale-[1.02] hover:ring-1 hover:ring-yellow-400/50 cursor-pointer active:scale-[0.98]' : ''}
        `}
      >
        {movie.backdrop_path && (
          <Image
            src={`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`}
            alt={movie.titulo}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        {/* Content at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
          <h3 className="text-white font-bold text-base md:text-xl leading-tight drop-shadow-lg">
            {movie.titulo}
          </h3>
          {movie.titulo_ingles && movie.titulo_ingles !== movie.titulo && (
            <p className="text-zinc-300 text-xs mt-0.5 italic">{movie.titulo_ingles}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {movie.nota_imdb && (
              <span className="bg-yellow-400 text-black text-xs font-bold px-1.5 py-0.5 rounded">
                IMDb {movie.nota_imdb}
              </span>
            )}
            {movie.anio && (
              <span className="text-zinc-300 text-xs">{movie.anio}</span>
            )}
          </div>
          {movie.generos.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {movie.generos.slice(0, 3).map(g => (
                <span key={g} className="text-[10px] bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded-full">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Selection indicator */}
        {isChosen && (
          <div className="absolute inset-0 flex items-center justify-center bg-yellow-400/10">
            <span className="text-4xl">&#x2714;&#xFE0F;</span>
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Nav active="inicio" />

      <main className="max-w-5xl mx-auto px-4 pt-4 pb-20">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-4xl font-black">
            <span className="text-yellow-400">Batalla</span> CineBret
          </h1>
          <p className="text-zinc-400 text-sm mt-1">16 peliculas entran. Solo una sobrevive.</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">Preparando el torneo...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={fetchMovies} className="bg-yellow-400 text-black font-bold px-6 py-2 rounded-lg hover:bg-yellow-300 transition">
              Intentar de nuevo
            </button>
          </div>
        )}

        {/* Active Battle */}
        {!loading && !error && !champion && rounds.length > 0 && rounds[currentRound]?.[currentMatch] && (
          <div>
            {/* Progress bar */}
            <div className="text-center mb-4">
              <p className="text-yellow-400 font-bold text-sm md:text-base">
                {ROUND_NAMES[currentRound]} &mdash; Partido {currentMatch + 1} de {totalMatchesInRound}
              </p>
              <p className="text-zinc-500 text-xs mt-0.5">
                Ronda {currentRound + 1} de {currentRound + Math.ceil(Math.log2(totalMatchesInRound * 2))}
              </p>
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mt-2">
                {rounds[currentRound].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < currentMatch ? 'bg-yellow-400' :
                      i === currentMatch ? 'bg-yellow-400 animate-pulse' :
                      'bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <p className="text-center text-zinc-300 font-medium mb-4 text-lg">
              Cual es mejor?
            </p>

            {/* Battle cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {renderMovieCard(rounds[currentRound][currentMatch].a!, 'a')}
              {/* VS divider */}
              <div className="md:hidden flex items-center justify-center -my-1">
                <span className="text-yellow-400 font-black text-sm tracking-widest">VS</span>
              </div>
              {renderMovieCard(rounds[currentRound][currentMatch].b!, 'b')}
            </div>

            {/* Hidden VS on desktop (overlaid) */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              {/* intentionally empty — the grid gap provides visual separation on desktop */}
            </div>
          </div>
        )}

        {/* Champion screen */}
        {champion && (
          <div className="flex flex-col items-center text-center">
            {/* Celebration header */}
            <p className="text-yellow-400 text-sm font-bold uppercase tracking-widest mb-1 animate-pulse">
              Elige tu campeon!
            </p>
            <h2 className="text-3xl md:text-5xl font-black mb-6">
              Tu campeon es...
            </h2>

            {/* Champion card */}
            <div className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl shadow-yellow-400/10 border border-yellow-400/30">
              {champion.backdrop_path && (
                <div className="relative w-full aspect-[16/9]">
                  <Image
                    src={`https://image.tmdb.org/t/p/w780${champion.backdrop_path}`}
                    alt={champion.titulo}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 512px"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                </div>
              )}

              {/* Poster overlay */}
              <div className="absolute top-4 left-4 w-24 md:w-32 rounded-lg overflow-hidden shadow-xl border-2 border-yellow-400/50">
                {champion.poster_path && (
                  <Image
                    src={`https://image.tmdb.org/t/p/w342${champion.poster_path}`}
                    alt={champion.titulo}
                    width={128}
                    height={192}
                    className="w-full h-auto"
                  />
                )}
              </div>

              {/* Champion info */}
              <div className="relative -mt-16 md:-mt-20 px-5 pb-5 pt-0 z-10">
                <h3 className="text-2xl md:text-3xl font-black text-yellow-400 drop-shadow-lg">
                  {champion.titulo}
                </h3>
                {champion.titulo_ingles && champion.titulo_ingles !== champion.titulo && (
                  <p className="text-zinc-300 text-sm italic mt-0.5">{champion.titulo_ingles}</p>
                )}
                <div className="flex items-center gap-2 mt-2 justify-center flex-wrap">
                  {champion.nota_imdb && (
                    <span className="bg-yellow-400 text-black text-sm font-bold px-2 py-0.5 rounded">
                      IMDb {champion.nota_imdb}
                    </span>
                  )}
                  {champion.anio && (
                    <span className="text-zinc-300 text-sm">{champion.anio}</span>
                  )}
                </div>
                {champion.generos.length > 0 && (
                  <div className="flex gap-1.5 mt-2 justify-center flex-wrap">
                    {champion.generos.map(g => (
                      <span key={g} className="text-xs bg-white/10 text-zinc-300 px-2 py-0.5 rounded-full">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full max-w-lg">
              <Link
                href={`/pelicula/${champion.id}`}
                className="flex-1 bg-yellow-400 text-black font-bold py-3 px-6 rounded-xl text-center hover:bg-yellow-300 transition text-sm"
              >
                Ver ficha de la pelicula
              </Link>
              <button
                onClick={handleShare}
                className="flex-1 bg-zinc-800 text-white font-bold py-3 px-6 rounded-xl hover:bg-zinc-700 transition text-sm relative"
              >
                {showCopied ? 'Copiado!' : 'Compartir'}
              </button>
            </div>

            <button
              onClick={fetchMovies}
              className="mt-4 text-yellow-400 hover:text-yellow-300 font-bold text-sm underline underline-offset-4 transition"
            >
              Juega de nuevo wn!
            </button>

            {/* Bracket tree */}
            {renderBracketTree()}
          </div>
        )}
      </main>
    </div>
  )
}
