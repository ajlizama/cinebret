'use client'

/**
 * FilterChips — horizontal scrollable row of togglable filter chips.
 *
 * Supports single-select (default) and multi-select modes. Uses the
 * `filter` variant of Pill under the hood so the styling stays consistent.
 *
 * @example
 *   const [genre, setGenre] = useState<string>('all')
 *   <FilterChips
 *     chips={[{ key: 'all', label: 'Todos' }, { key: 'drama', label: 'Drama' }]}
 *     value={genre}
 *     onChange={(v) => setGenre(v as string)}
 *   />
 */

export type Chip = {
  key: string
  label: string
  count?: number
  icon?: React.ReactNode
}

export type FilterChipsProps = {
  chips: Chip[]
  value: string | string[]
  onChange: (val: string | string[]) => void
  /** Enable multi-select mode (toggles an array of keys). */
  multi?: boolean
  className?: string
}

export function FilterChips({
  chips,
  value,
  onChange,
  multi = false,
  className = '',
}: FilterChipsProps) {
  function isActive(key: string): boolean {
    return Array.isArray(value) ? value.includes(key) : value === key
  }

  function handleToggle(key: string) {
    if (multi) {
      const arr = Array.isArray(value) ? value : value ? [value] : []
      const next = arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]
      onChange(next)
    } else {
      onChange(key)
    }
  }

  return (
    <div
      className={`flex items-center gap-2 overflow-x-auto no-scrollbar py-1 ${className}`}
      role="group"
    >
      {chips.map((chip) => {
        const active = isActive(chip.key)
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => handleToggle(chip.key)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 min-h-[44px] text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              active
                ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/40'
                : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 border border-transparent'
            }`}
          >
            {chip.icon ? <span className="shrink-0">{chip.icon}</span> : null}
            <span>{chip.label}</span>
            {typeof chip.count === 'number' ? (
              <span
                className={`ml-1 inline-flex items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  active ? 'bg-yellow-400/20' : 'bg-zinc-900'
                }`}
              >
                {chip.count.toLocaleString('es')}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
