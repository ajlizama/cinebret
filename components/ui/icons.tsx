/**
 * CineBret Icon Set
 *
 * Stroke-based SVG icons in the Heroicons / Lucide style.
 * 24x24 viewBox, currentColor stroke, configurable strokeWidth.
 *
 * Usage:
 *   <Icon.ChevronLeft className="w-4 h-4 text-yellow-400" />
 *   <Icon.Heart filled className="w-5 h-5 text-pink-400" />
 *
 * Rule: NEVER use emoji as icons in CineBret. Always use these SVGs.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  filled?: boolean
}

const baseProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 2,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/* ──────────────────────────────────────────────────────────
 * Navigation
 * ────────────────────────────────────────────────────────── */

export const ChevronLeft = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)

export const ChevronRight = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const ChevronDown = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const ChevronUp = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m18 15-6-6-6 6" />
  </svg>
)

export const ArrowLeft = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
)

export const ArrowRight = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
)

export const Close = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export const Menu = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

export const Home = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z" />
  </svg>
)

/* ──────────────────────────────────────────────────────────
 * Actions
 * ────────────────────────────────────────────────────────── */

export const Search = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <circle cx={11} cy={11} r={8} />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const Heart = ({ filled, ...p }: IconProps) => (
  <svg {...baseProps} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
)

export const Star = ({ filled, ...p }: IconProps) => (
  <svg {...baseProps} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
  </svg>
)

export const Eye = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx={12} cy={12} r={3} />
  </svg>
)

export const EyeOff = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m15 18-.722-3.25" />
    <path d="M2 8a10.645 10.645 0 0 0 20 0" />
    <path d="m20 15-1.726-2.05" />
    <path d="m4 15 1.726-2.05" />
    <path d="m9 18 .722-3.25" />
  </svg>
)

export const Bookmark = ({ filled, ...p }: IconProps) => (
  <svg {...baseProps} fill={filled ? 'currentColor' : 'none'} {...p}>
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
)

export const Check = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const Plus = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const Minus = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M5 12h14" />
  </svg>
)

export const Share = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" x2="12" y1="2" y2="15" />
  </svg>
)

export const Download = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
)

export const Refresh = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
)

export const Edit = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const Trash = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

/* ──────────────────────────────────────────────────────────
 * Status / feedback
 * ────────────────────────────────────────────────────────── */

export const Info = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <circle cx={12} cy={12} r={10} />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
)

export const Warning = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const Error = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <circle cx={12} cy={12} r={10} />
    <path d="M15 9l-6 6M9 9l6 6" />
  </svg>
)

export const Success = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <circle cx={12} cy={12} r={10} />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const Loader = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

/* ──────────────────────────────────────────────────────────
 * Content
 * ────────────────────────────────────────────────────────── */

export const Film = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <rect width={18} height={18} x={3} y={3} rx={2} />
    <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
  </svg>
)

export const Tv = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <rect width={20} height={15} x={2} y={7} rx={2} ry={2} />
    <polyline points="17 2 12 7 7 2" />
  </svg>
)

export const Play = ({ filled, ...p }: IconProps) => (
  <svg {...baseProps} fill={filled ? 'currentColor' : 'none'} {...p}>
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
)

export const Pause = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <rect x={6} y={4} width={4} height={16} rx={1} />
    <rect x={14} y={4} width={4} height={16} rx={1} />
  </svg>
)

export const VolumeOn = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
)

export const VolumeOff = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </svg>
)

export const Calendar = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <rect width={18} height={18} x={3} y={4} rx={2} ry={2} />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
)

export const Clock = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <circle cx={12} cy={12} r={10} />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

export const Music = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx={6} cy={18} r={3} />
    <circle cx={18} cy={16} r={3} />
  </svg>
)

export const Trophy = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
)

export const Sparkles = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M9.93 13.5L8.5 17l-1.43-3.5L3.5 12l3.57-1.5L8.5 7l1.43 3.5L13.5 12l-3.57 1.5z" />
    <path d="M19 4l.5 1.5L21 6l-1.5.5L19 8l-.5-1.5L17 6l1.5-.5z" />
    <path d="M19 16l.5 1.5L21 18l-1.5.5L19 20l-.5-1.5L17 18l1.5-.5z" />
  </svg>
)

export const Map = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" x2="9" y1="3" y2="18" />
    <line x1="15" x2="15" y1="6" y2="21" />
  </svg>
)

export const Users = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx={9} cy={7} r={4} />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

export const User = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx={12} cy={7} r={4} />
  </svg>
)

export const Filter = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

export const Settings = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx={12} cy={12} r={3} />
  </svg>
)

export const Lock = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export const Trending = (p: IconProps) => (
  <svg {...baseProps} {...p}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)
