/**
 * CineBret Motion Variants
 *
 * Shared framer-motion variants used across the v1 component library.
 * Keeping animations consistent makes the product feel cohesive.
 *
 * Rule: prefer transform + opacity (GPU-accelerated). Avoid animating
 * top/left/width/height. Respect prefers-reduced-motion via the
 * `useReducedMotion` hook in components.
 */

import type { Variants, Transition } from 'framer-motion'

/* ──────────────────────────────────────────────────────────
 * Springs and easings — the building blocks
 * ────────────────────────────────────────────────────────── */

export const springs = {
  // Soft, bouncy spring (cards, modals)
  soft: { type: 'spring', stiffness: 280, damping: 28 } as Transition,
  // Snappy spring (buttons, hovers)
  snappy: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
  // Gentle spring (page transitions)
  gentle: { type: 'spring', stiffness: 200, damping: 32 } as Transition,
} as const

export const easings = {
  // Standard ease-out for entrances
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  // Sharp for state changes
  sharp: [0.4, 0, 0.2, 1] as [number, number, number, number],
  // Soft for backgrounds
  soft: [0.4, 0, 0.6, 1] as [number, number, number, number],
} as const

/* ──────────────────────────────────────────────────────────
 * Reusable variants
 * ────────────────────────────────────────────────────────── */

// Page enter — subtle slide-up + fade
export const pageEnter: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easings.out } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: easings.sharp } },
}

// Section fade-in (slightly delayed after page)
export const sectionEnter: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easings.out, delay: 0.1 + i * 0.05 },
  }),
}

// List stagger — children animate in sequence
export const listStagger: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.1,
    },
  },
}

export const listItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easings.out } },
}

// Card hover (subtle lift)
export const cardHover = {
  rest: { y: 0, scale: 1 },
  hover: { y: -2, scale: 1.01, transition: springs.snappy },
}

// Button press (scale down)
export const buttonPress = {
  whileTap: { scale: 0.97 },
  whileHover: { scale: 1.02 },
  transition: springs.snappy,
}

// Modal entrance — backdrop fade + content scale
export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: springs.soft },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } },
}

// Bottom sheet (mobile)
export const sheetSlide: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: springs.gentle },
  exit: { y: '100%', transition: { duration: 0.25, ease: easings.sharp } },
}

// Pill / badge appear
export const pillAppear: Variants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: springs.snappy },
}

// Spinner / loading indicator
export const spinnerRotate: Variants = {
  animate: {
    rotate: 360,
    transition: { duration: 1, ease: 'linear', repeat: Infinity },
  },
}

// Pulse (for loading skeletons)
export const skeletonPulse: Variants = {
  animate: {
    opacity: [0.5, 0.8, 0.5],
    transition: { duration: 1.5, ease: easings.soft, repeat: Infinity },
  },
}
