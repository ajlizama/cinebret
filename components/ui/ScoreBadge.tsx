/**
 * ScoreBadge — IMDb / Rotten Tomatoes / Metacritic score badge.
 *
 * Each variant uses the brand color of the source (these are the only
 * places where red/green brand colors are allowed). Values are formatted
 * as-is (IMDb: 0-10, RT: 0-100, MC: 0-100).
 *
 * @example
 *   <ScoreBadge source="imdb" value={8.7} />
 *   <ScoreBadge source="rt" value={95} showLabel />
 */

export type ScoreBadgeProps = {
  source: 'imdb' | 'rt' | 'mc'
  value: number
  size?: 'sm' | 'md' | 'lg'
  /** Show text label next to value. */
  showLabel?: boolean
  className?: string
}

const SIZE_TEXT = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
} as const

const SIZE_LABEL_PAD = {
  sm: 'px-1 py-0.5',
  md: 'px-1.5 py-0.5',
  lg: 'px-2 py-1',
} as const

const SIZE_VALUE_PAD = {
  sm: 'px-1.5 py-0.5',
  md: 'px-2 py-0.5',
  lg: 'px-2.5 py-1',
} as const

function formatValue(source: ScoreBadgeProps['source'], value: number): string {
  if (source === 'imdb') return value.toFixed(1)
  return String(Math.round(value))
}

function sourceLabel(source: ScoreBadgeProps['source']): string {
  if (source === 'imdb') return 'IMDb'
  if (source === 'rt') return 'RT'
  return 'MC'
}

function brandBg(source: ScoreBadgeProps['source']): string {
  if (source === 'imdb') return 'bg-[#f5c518] text-black'
  if (source === 'rt') return 'bg-[#fa320a] text-white'
  return 'bg-[#66cc33] text-black'
}

export function ScoreBadge({
  source,
  value,
  size = 'md',
  showLabel = true,
  className = '',
}: ScoreBadgeProps) {
  const label = sourceLabel(source)
  const text = formatValue(source, value)

  return (
    <span
      className={`inline-flex items-stretch overflow-hidden rounded-sm font-black ${SIZE_TEXT[size]} ${className}`}
    >
      {showLabel ? (
        <span
          className={`inline-flex items-center ${SIZE_LABEL_PAD[size]} ${brandBg(source)}`}
        >
          {label}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center ${SIZE_VALUE_PAD[size]} bg-zinc-900/80 text-white tabular-nums`}
      >
        {text}
      </span>
    </span>
  )
}
