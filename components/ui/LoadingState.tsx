/**
 * LoadingState — centered spinner + optional text.
 *
 * @example
 *   <LoadingState text="Cargando películas..." />
 */

type Size = 'sm' | 'md' | 'lg'

export type LoadingStateProps = {
  text?: string
  size?: Size
  className?: string
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
}

export function LoadingState({
  text = 'Cargando...',
  size = 'md',
  className = '',
}: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`border-2 border-zinc-700 border-t-yellow-400 rounded-full animate-spin ${SIZE_CLASSES[size]}`}
      />
      {text ? <p className="text-zinc-400 text-sm">{text}</p> : null}
    </div>
  )
}
