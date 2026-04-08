'use client'

/**
 * ReviewCard — review body with author row, optional movie reference and
 * action slot.
 *
 * Used in movie pages, home feed, and the admin panel. Long text is clamped
 * to 4 lines and can be expanded.
 *
 * @example
 *   <ReviewCard review={{ id, username: 'alberto', text: '...', createdAt: '...' }} />
 */

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Star } from './icons'

type Review = {
  id: string
  username: string
  avatar?: string | null
  rating?: number | null
  text: string
  createdAt: string
  isAutor?: boolean
}

type MovieRef = {
  id: string
  titulo: string
  poster_path: string | null
}

export type ReviewCardProps = {
  review: Review
  movie?: MovieRef
  actions?: React.ReactNode
  className?: string
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = (Date.now() - then) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`
  if (diff < 2629800) return `hace ${Math.floor(diff / 604800)} sem`
  return new Date(iso).toLocaleDateString('es')
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'

function resolvePoster(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  if (path.startsWith('/')) return `${TMDB_IMAGE_BASE}${path}`
  return path
}

export function ReviewCard({ review, movie, actions, className = '' }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article className={`bg-zinc-900 rounded-2xl p-5 ${className}`}>
      <header className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-400 font-bold text-sm shrink-0">
          {review.avatar ? (
            <Image
              src={review.avatar}
              alt={review.username}
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <span>{initials(review.username)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">
              {review.username}
            </span>
            {review.isAutor ? (
              <span className="inline-flex items-center rounded-full bg-yellow-400/15 border border-yellow-400/30 px-2 py-0.5 text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                CineBret
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-500">{formatRelative(review.createdAt)}</span>
            {typeof review.rating === 'number' ? (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-bold">
                <Star filled className="w-3 h-3" />
                {review.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p
        className={`mt-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap ${
          expanded ? '' : 'line-clamp-4'
        }`}
      >
        {review.text}
      </p>

      {review.text.length > 240 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}

      {movie ? (
        <Link
          href={`/pelicula/${movie.id}`}
          className="mt-4 flex items-center gap-3 p-2 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <div className="relative w-10 h-14 rounded-md overflow-hidden bg-zinc-800 shrink-0">
            {resolvePoster(movie.poster_path) ? (
              <Image
                src={resolvePoster(movie.poster_path)!}
                alt={movie.titulo}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : null}
          </div>
          <span className="text-sm font-semibold text-white line-clamp-2">
            {movie.titulo}
          </span>
        </Link>
      ) : null}

      {actions ? <div className="mt-4 flex items-center gap-2">{actions}</div> : null}
    </article>
  )
}
