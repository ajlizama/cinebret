/**
 * ProgressBar — animated progress indicator.
 *
 * @example
 *   <ProgressBar value={42} max={100} color="gold" label="Vistas" showValue />
 */

type Color = 'gold' | 'green' | 'red' | 'blue'
type Size = 'sm' | 'md' | 'lg'

export type ProgressBarProps = {
  value: number
  max?: number
  color?: Color
  size?: Size
  label?: string
  showValue?: boolean
  className?: string
}

const COLOR_CLASSES: Record<Color, string> = {
  gold: 'bg-yellow-400',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export function ProgressBar({
  value,
  max = 100,
  color = 'gold',
  size = 'md',
  label,
  showValue = false,
  className = '',
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label ? (
            <span className="text-xs font-semibold text-zinc-400">{label}</span>
          ) : (
            <span />
          )}
          {showValue ? (
            <span className="text-xs font-bold tabular-nums text-zinc-500">
              {value}
              <span className="text-zinc-600">/{max}</span>
            </span>
          ) : null}
        </div>
      )}
      <div
        className={`w-full bg-zinc-800 rounded-full overflow-hidden ${SIZE_CLASSES[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${COLOR_CLASSES[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
