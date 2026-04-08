'use client'

/**
 * PersonCard — avatar + name row used for directors, actors, users, etc.
 *
 * Renders a circular avatar (image or initials), a name + subtitle stack,
 * and an optional right slot. Supports a rank prefix and an expandable
 * chevron when `expandable` is true.
 *
 * @example
 *   <PersonCard
 *     person={{ name: 'Céline Sciamma' }}
 *     subtitle="Directora · 7 películas"
 *     rank={3}
 *   />
 */

import Image from 'next/image'
import { ChevronDown, ChevronUp } from './icons'

type Person = {
  name: string
  avatar?: string | null
  initials?: string
}

export type PersonCardProps = {
  person: Person
  subtitle?: string
  rightSlot?: React.ReactNode
  rank?: number
  expandable?: boolean
  expanded?: boolean
  onClick?: () => void
  className?: string
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function PersonCard({
  person,
  subtitle,
  rightSlot,
  rank,
  expandable = false,
  expanded = false,
  onClick,
  className = '',
}: PersonCardProps) {
  const initials = person.initials ?? initialsFromName(person.name)
  const interactive = Boolean(onClick || expandable)

  const content = (
    <>
      {typeof rank === 'number' ? (
        <span className="shrink-0 w-6 text-center text-xs font-black text-zinc-500 tabular-nums">
          {rank}
        </span>
      ) : null}

      <div className="relative w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-zinc-400 font-bold shrink-0">
        {person.avatar ? (
          <Image
            src={person.avatar}
            alt={person.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{person.name}</p>
        {subtitle ? (
          <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>
        ) : null}
      </div>

      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}

      {expandable ? (
        <span className="shrink-0 text-zinc-500">
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </span>
      ) : null}
    </>
  )

  const baseClasses = `flex items-center gap-3 w-full p-3 rounded-xl bg-zinc-900 transition-colors ${
    interactive ? 'hover:bg-zinc-800 cursor-pointer' : ''
  } ${className}`

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={baseClasses}>
        {content}
      </button>
    )
  }

  return <div className={baseClasses}>{content}</div>
}
