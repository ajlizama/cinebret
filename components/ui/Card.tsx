'use client'

/**
 * Card — base surface used across the app.
 *
 * Renders `bg-zinc-900 rounded-2xl` with configurable padding. When
 * `interactive` is true, adds a hover-lift animation (framer-motion) and
 * cursor-pointer. Use `as` to swap the underlying element.
 *
 * @example
 *   <Card padding="lg">
 *     <h3>Contenido</h3>
 *   </Card>
 *   <Card interactive onClick={() => ...}>Click me</Card>
 *   <Card as="a" href="/pelicula/123" interactive>...</Card>
 */

import Link from 'next/link'
import { motion } from 'framer-motion'
import { cardHover } from '@/lib/design/motion'

export type CardProps = {
  children: React.ReactNode
  /** Inner padding. Default `md`. */
  padding?: 'sm' | 'md' | 'lg' | 'none'
  /** Adds hover lift and cursor-pointer. */
  interactive?: boolean
  className?: string
  onClick?: () => void
  /** Underlying element. `a` uses next/link when `href` is provided. */
  as?: 'div' | 'button' | 'a'
  href?: string
}

const PADDING_CLASSES = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
} as const

export function Card({
  children,
  padding = 'md',
  interactive = false,
  className = '',
  onClick,
  as = 'div',
  href,
}: CardProps) {
  const base = `bg-zinc-900 rounded-2xl ${PADDING_CLASSES[padding]} ${
    interactive ? 'cursor-pointer' : ''
  } ${className}`

  const motionProps = interactive
    ? {
        variants: cardHover,
        initial: 'rest',
        whileHover: 'hover',
        animate: 'rest',
      }
    : {}

  if (as === 'a' && href) {
    return (
      <motion.div {...motionProps} className="contents">
        <Link href={href} className={base} onClick={onClick}>
          {children}
        </Link>
      </motion.div>
    )
  }

  if (as === 'button') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={base}
        {...motionProps}
      >
        {children}
      </motion.button>
    )
  }

  return (
    <motion.div onClick={onClick} className={base} {...motionProps}>
      {children}
    </motion.div>
  )
}
