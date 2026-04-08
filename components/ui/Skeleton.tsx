/**
 * Skeleton — loading placeholder block with a subtle pulse animation.
 *
 * @example
 *   <Skeleton width="100%" height="12rem" rounded="lg" />
 */

type Rounded = 'sm' | 'md' | 'lg' | 'full'

export type SkeletonProps = {
  width?: string
  height?: string
  rounded?: Rounded
  className?: string
}

const ROUNDED_CLASSES: Record<Rounded, string> = {
  sm: 'rounded-md',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  rounded = 'md',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`bg-zinc-800 animate-pulse ${ROUNDED_CLASSES[rounded]} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
