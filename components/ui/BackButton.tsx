'use client'

/**
 * BackButton — standard "Volver" link shown above page titles.
 *
 * If `href` is provided, renders a Next.js Link; otherwise calls `router.back()`.
 *
 * @example
 *   <BackButton />
 *   <BackButton href="/posters" label="Volver a posters" />
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from './icons'

export type BackButtonProps = {
  /** If provided, renders a Link; otherwise falls back to router.back(). */
  href?: string
  /** Button label. Defaults to "Volver". */
  label?: string
  className?: string
}

export function BackButton({ href, label = 'Volver', className = '' }: BackButtonProps) {
  const router = useRouter()
  const baseClasses =
    'inline-flex items-center gap-2 text-zinc-400 hover:text-yellow-400 transition-colors text-sm font-semibold cursor-pointer mb-6'

  if (href) {
    return (
      <Link href={href} className={`${baseClasses} ${className}`}>
        <ArrowLeft className="w-4 h-4" />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`${baseClasses} ${className}`}
    >
      <ArrowLeft className="w-4 h-4" />
      <span>{label}</span>
    </button>
  )
}
