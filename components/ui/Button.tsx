'use client'

/**
 * Button — primary interactive control with variant / size / loading states.
 *
 * Variants: `primary` (gold), `secondary` (outlined gold), `ghost`
 * (transparent) and `danger` (red tinted).
 *
 * @example
 *   <Button onClick={save}>Guardar</Button>
 *   <Button variant="secondary" iconLeft={<Icon.Plus className="w-4 h-4" />}>Añadir</Button>
 *   <Button loading>Enviando...</Button>
 */

import { forwardRef } from 'react'
import { Loader } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  children: React.ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-yellow-400 hover:bg-yellow-300 text-zinc-950 font-bold disabled:bg-zinc-700 disabled:text-zinc-500',
  secondary:
    'bg-transparent border-2 border-yellow-400/50 hover:border-yellow-400 hover:bg-yellow-400/5 text-yellow-400 font-bold disabled:border-zinc-700 disabled:text-zinc-500',
  ghost:
    'text-zinc-400 hover:text-white hover:bg-zinc-800/60 font-medium disabled:text-zinc-600',
  danger:
    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold disabled:opacity-50',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm min-h-[44px]',
  lg: 'px-6 py-3 text-base min-h-[44px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className = '',
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl cursor-pointer transition-colors disabled:cursor-not-allowed ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader className="w-4 h-4 animate-spin" />
      ) : iconLeft ? (
        <span className="shrink-0 inline-flex items-center">{iconLeft}</span>
      ) : null}
      <span>{children}</span>
      {!loading && iconRight ? (
        <span className="shrink-0 inline-flex items-center">{iconRight}</span>
      ) : null}
    </button>
  )
})
