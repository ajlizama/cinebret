'use client'

/**
 * MoviePosterCard — movie poster with title, year, rating and optional
 * platforms / genres.
 *
 * Wraps the poster in a Next.js Link (defaults to `/pelicula/${id}`). Supports
 * three sizes and a ranked badge (e.g. top-10 lists).
 *
 * @example
 *   <MoviePosterCard movie={movie} size="md" showRating showYear />
 *   <MoviePosterCard movie={movie} rank={1} showPlatforms />
 */

import Link from 'next/link'
import Image from 'next/image'
import { ScoreBadge } from './ScoreBadge'
import { PlatformLogo } from './PlatformLogo'
import type { PlatformLogoProps } from './PlatformLogo'

type MovieForCard = {
  id: string
  titulo: string
  titulo_ingles?: string | null
  poster_path: string | null
  anio?: number | null
  nota_imdb?: number | null
  generos?: string[]
  plataformas?: string[]
}

export type MoviePosterCardProps = {
  movie: MovieForCard
  /** Default `md`. sm=w-24, md=w-32, lg=w-44. */
  size?: 'sm' | 'md' | 'lg'
  showRating?: boolean
  showYear?: boolean
  showPlatforms?: boolean
  showGenres?: boolean
  /** Defaults to `/pelicula/${movie.id}`. */
  href?: string
  /** Shows a numbered gold badge at the top-left. */
  rank?: number
  className?: string
}

const SIZE_CLASSES = {
  sm: 'w-24',
  md: 'w-32',
  lg: 'w-44',
} as const

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

function resolvePoster(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  if (path.startsWith('/') && !path.startsWith('//')) {
    // Looks like a TMDB path "/abc.jpg"
    return `${TMDB_IMAGE_BASE}${path}`
  }
  return path
}

export function MoviePosterCard({
  movie,
  size = 'md',
  showRating = false,
  showYear = false,
  showPlatforms = false,
  showGenres = false,
  href,
  rank,
  className = '',
}: MoviePosterCardProps) {
  const linkHref = href ?? `/pelicula/${movie.id}`
  const poster = resolvePoster(movie.poster_path)

  return (
    <Link
      href={linkHref}
      className={`group block ${SIZE_CLASSES[size]} ${className}`}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 ring-1 ring-zinc-800/50 transition-all duration-200 group-hover:ring-2 group-hover:ring-yellow-400/40">
        {poster ? (
          <Image
            src={poster}
            alt={movie.titulo}
            fill
            sizes="(max-width: 768px) 33vw, 200px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs text-center px-2">
            {movie.titulo}
          </div>
        )}

        {typeof rank === 'number' ? (
          <div className="absolute top-2 left-2 w-7 h-7 rounded-full bg-yellow-400 text-zinc-950 text-xs font-black flex items-center justify-center shadow-md">
            {rank}
          </div>
        ) : null}

        {showRating && typeof movie.nota_imdb === 'number' ? (
          <div className="absolute bottom-2 left-2">
            <ScoreBadge source="imdb" value={movie.nota_imdb} size="sm" />
          </div>
        ) : null}
      </div>

      <div className="mt-2">
        <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug">
          {movie.titulo}
        </h3>
        {(showYear || (showRating && !movie.poster_path)) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            {showYear && movie.anio ? <span>{movie.anio}</span> : null}
          </div>
        )}
        {showGenres && movie.generos && movie.generos.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
            {movie.generos.slice(0, 2).join(' · ')}
          </p>
        ) : null}
        {showPlatforms && movie.plataformas && movie.plataformas.length > 0 ? (
          <div className="mt-2 flex items-center gap-1.5">
            {movie.plataformas.slice(0, 4).map((p) => (
              <PlatformLogo
                key={p}
                platform={p as PlatformLogoProps['platform']}
                size="sm"
              />
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  )
}
