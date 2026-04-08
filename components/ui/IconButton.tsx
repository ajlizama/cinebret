'use client'

/**
 * IconButton — square icon-only button with mandatory aria-label.
 *
 * @example
 *   <IconButton icon={<Icon.Close className="w-5 h-5" />} label="Cerrar" />
 *   <IconButton icon={<Icon.Heart className="w-5 h-5" />} label="Favoritos" variant="primary" active />
 */

import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export type IconButtonProps = {
  icon: React.ReactNode
  /** Required for screen readers. */
  label: string
  variant?: Variant
  size?: Size
  /** When true, adds a gold ring. */
  active?: boolean
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'w-9 h-9',
  md: 'w-11 h-11 min-h-[44px] min-w-[44px]',
  lg: 'w-12 h-12 min-h-[44px] min-w-[44px]',
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-yellow-400 hover:bg-yellow-300 text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-500',
  secondary:
    'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 disabled:opacity-50',
  ghost: 'text-zinc-400 hover:text-white hover:bg-zinc-800/60 disabled:opacity-50',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    active = false,
    className = '',
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-xl cursor-pointer transition-colors disabled:cursor-not-allowed ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${
        active ? 'ring-2 ring-yellow-400' : ''
      } ${className}`}
      {...rest}
    >
      {icon}
    </button>
  )
})
