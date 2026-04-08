/**
 * StatCard — large number + label tile, used in dashboards and profile stats.
 *
 * @example
 *   <StatCard value={248} label="Películas" color="gold" />
 *   <StatCard value="7.9" label="Nota media" sub="IMDb" color="gold" />
 */

export type StatCardProps = {
  value: string | number
  label: string
  sub?: string
  /** Value color. Default `gold`. */
  color?: 'gold' | 'white' | 'green' | 'red' | 'blue'
  icon?: React.ReactNode
  className?: string
}

const COLOR_CLASSES: Record<NonNullable<StatCardProps['color']>, string> = {
  gold: 'text-yellow-400',
  white: 'text-white',
  green: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
}

export function StatCard({
  value,
  label,
  sub,
  color = 'gold',
  icon,
  className = '',
}: StatCardProps) {
  return (
    <div
      className={`relative bg-zinc-900 rounded-2xl p-5 ${className}`}
    >
      {icon ? (
        <span className="absolute top-4 right-4 text-zinc-600">{icon}</span>
      ) : null}
      <div
        className={`text-3xl sm:text-4xl font-black tabular-nums ${COLOR_CLASSES[color]}`}
      >
        {typeof value === 'number' ? value.toLocaleString('es') : value}
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  )
}
