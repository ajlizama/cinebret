/**
 * CineBret Design Tokens
 *
 * Single source of truth for the visual language. These values back the
 * Tailwind classes used across the app — when in doubt, prefer Tailwind
 * utilities (`bg-yellow-400`, `text-zinc-400`, etc) over inline styles.
 *
 * Defined in TypeScript so other modules (chart configs, framer-motion,
 * SVG fills) can reference them programmatically.
 */

export const colors = {
  // Backgrounds
  bg: {
    base: '#0c0a09',      // body background
    surface: '#1c1917',   // zinc-900, primary surface
    surfaceAlt: '#27272a', // zinc-800, raised surface
    overlay: 'rgba(12, 10, 9, 0.85)', // modal backdrop
  },

  // Text
  text: {
    primary: '#FAFAF9',   // white-ish, all body text
    secondary: '#a8a29e', // zinc-400, secondary labels
    muted: '#71717a',     // zinc-500, captions
    disabled: '#52525b',  // zinc-600, disabled
    inverse: '#0c0a09',   // for use ON gold backgrounds
  },

  // Brand accent — gold
  gold: {
    DEFAULT: '#facc15',   // yellow-400, primary accent
    dark: '#CA8A04',      // yellow-600, hover/pressed
    light: '#fde047',     // yellow-300, highlight
    glow: 'rgba(250, 204, 21, 0.5)',
    bg: 'rgba(250, 204, 21, 0.1)',
    border: 'rgba(250, 204, 21, 0.3)',
  },

  // Semantic
  success: '#10b981',     // emerald-500
  warning: '#f59e0b',     // amber-500
  danger: '#ef4444',      // red-500
  info: '#3b82f6',        // blue-500

  // Borders
  border: {
    DEFAULT: '#3f3f46',   // zinc-700
    subtle: 'rgba(63, 63, 70, 0.5)', // zinc-700/50
  },
} as const

export const spacing = {
  // Spacing scale (matches Tailwind)
  xs: '0.5rem',  // 8px
  sm: '0.75rem', // 12px
  md: '1rem',    // 16px
  lg: '1.5rem',  // 24px
  xl: '2rem',    // 32px
  '2xl': '3rem', // 48px
  '3xl': '4rem', // 64px
} as const

export const radius = {
  sm: '0.5rem',  // 8px (rounded-lg)
  md: '0.75rem', // 12px (rounded-xl)
  lg: '1rem',    // 16px (rounded-2xl)
  xl: '1.5rem',  // 24px (rounded-3xl)
  full: '9999px',
} as const

export const shadow = {
  sm: '0 2px 8px rgba(0, 0, 0, 0.4)',
  md: '0 8px 24px rgba(0, 0, 0, 0.5)',
  lg: '0 16px 48px rgba(0, 0, 0, 0.6)',
  goldGlow: '0 0 24px rgba(250, 204, 21, 0.25)',
} as const

export const typography = {
  // Font family — Inter via Tailwind defaults
  heading: 'Inter, system-ui, sans-serif',
  body: 'Inter, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',

  // Type scale (matches Tailwind text-* sizes)
  size: {
    xs: '0.75rem',   // 12px
    sm: '0.875rem',  // 14px
    base: '1rem',    // 16px
    lg: '1.125rem',  // 18px
    xl: '1.25rem',   // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
  },

  // Weights
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },

  // Line heights
  leading: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.625,
  },
} as const

export const transitions = {
  fast: '150ms ease-out',
  base: '200ms ease-out',
  slow: '300ms ease-out',
  slower: '500ms ease-out',
} as const

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 30,
  nav: 40,
  overlay: 50,
  modal: 60,
  toast: 70,
  tooltip: 80,
} as const

// Touch target sizes (mobile)
export const touchTarget = {
  min: '44px', // WCAG minimum
  comfortable: '48px',
} as const

// Breakpoints (matches Tailwind)
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// Platform brand colors (used only when displaying real platform branding)
export const platformColors = {
  netflix: '#E50914',
  disney_plus: '#0F1B4D',
  hbo_max: '#A100FF',
  amazon_prime: '#00A8E1',
  apple_tv: '#000000',
  paramount_plus: '#0064FF',
  mubi: '#1A1A1A',
  crunchyroll: '#F47521',
} as const
