'use client'

/**
 * ErrorState — shown when something fails. Matches EmptyState layout but
 * uses an error icon and an optional retry button.
 *
 * @example
 *   <ErrorState description="No pudimos cargar las películas." onRetry={refetch} />
 */

import { Error as ErrorIcon } from './icons'
import { Button } from './Button'

export type ErrorStateProps = {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Algo salió mal',
  description,
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 py-16 px-4 ${className}`}
      role="alert"
    >
      <div className="w-16 h-16 text-red-500/80 inline-flex items-center justify-center">
        <ErrorIcon className="w-full h-full" />
      </div>
      <h3 className="text-white font-bold text-lg">{title}</h3>
      {description ? (
        <p className="max-w-sm text-zinc-500 text-sm leading-relaxed">{description}</p>
      ) : null}
      {onRetry ? (
        <div className="mt-2">
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : null}
    </div>
  )
}
