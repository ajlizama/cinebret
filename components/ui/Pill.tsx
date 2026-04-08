/**
 * Pill — small inline label / badge. Use for metadata, filters, tags.
 *
 * @example
 *   <Pill variant="gold">Top 10</Pill>
 *   <Pill variant="filter" active onClick={...}>Drama</Pill>
 */

type Variant = 'default' | 'gold' | 'success' | 'warning' | 'danger' | 'filter'
type Size = 'sm' | 'md'

export type PillProps = {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  /** Only used by the `filter` variant. */
  active?: boolean
  icon?: React.ReactNode
  onClick?: () => void
  className?: string
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

function variantClasses(variant: Variant, active: boolean): string {
  switch (variant) {
    case 'gold':
      return 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
    case 'success':
      return 'bg-emerald-500/15 text-emerald-400'
    case 'warning':
      return 'bg-amber-500/15 text-amber-400'
    case 'danger':
      return 'bg-red-500/15 text-red-400'
    case 'filter':
      return active
        ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30 cursor-pointer'
        : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 cursor-pointer'
    case 'default':
    default:
      return 'bg-zinc-800 text-zinc-300'
  }
}

export function Pill({
  children,
  variant = 'default',
  size = 'sm',
  active = false,
  icon,
  onClick,
  className = '',
}: PillProps) {
  const base = `inline-flex items-center gap-1.5 rounded-full font-medium transition-colors ${
    SIZE_CLASSES[size]
  } ${variantClasses(variant, active)} ${className}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{children}</span>
      </button>
    )
  }

  return (
    <span className={base}>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </span>
  )
}
