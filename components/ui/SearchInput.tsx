'use client'

/**
 * SearchInput — styled text input with a magnifier icon and clear button.
 *
 * Uses 16px text to prevent iOS zoom-on-focus.
 *
 * @example
 *   const [q, setQ] = useState('')
 *   <SearchInput value={q} onChange={setQ} placeholder="Buscar películas..." />
 */

import { useRef } from 'react'
import { Search, Close } from './icons'

export type SearchInputProps = {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  onClear?: () => void
  autoFocus?: boolean
  className?: string
  name?: string
  id?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  onClear,
  autoFocus = false,
  className = '',
  name,
  id,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleClear() {
    onChange('')
    onClear?.()
    inputRef.current?.focus()
  }

  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        name={name}
        id={id}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-10 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 transition-colors min-h-[44px]"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer transition-colors"
        >
          <Close className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  )
}
