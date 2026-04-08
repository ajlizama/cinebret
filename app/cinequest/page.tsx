'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  PageShell,
  PageHeader,
  Section,
  StatCard,
  AchievementCard,
  LoadingState,
  Pill,
  ProgressBar,
  Button,
} from '@/components/ui'

type Tier = 'bronze' | 'silver' | 'gold' | null

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  unlocked: boolean
  progress: number
  total: number
  tier: Tier
  nextTierName: string | null
  nextTierTotal: number | null
}

type Stats = {
  totalWatched: number
  avgRating: number
  uniqueGenres: number
}

/* ───────────────────────────────────────────
   SVG Icon Component - replaces all emojis
   ─────────────────────────────────────────── */
const DIRECTOR_IMAGES: Record<string, string> = {
  dir_nolan: '/directors/nolan.jpg',
  dir_kubrick: '/directors/kubrick.png',
  dir_spielberg: '/directors/spielberg.jpg',
  dir_tarantino: '/directors/tarantino.png',
  dir_scorsese: '/directors/scorsese.jpg',
  dir_fincher: '/directors/fincher.jpg',
  dir_cameron: '/directors/cameron.jpg',
  dir_wes: '/directors/wes_anderson.jpg',
  dir_coen: '/directors/coen.png',
  dir_coppola: '/directors/coppola.png',
  dir_clint: '/directors/eastwood.jpg',
  dir_miyazaki: '/directors/miyazaki.jpg',
  dir_ridley: '/directors/ridley_scott.jpg',
  dir_villeneuve: '/directors/villeneuve.jpg',
  dir_hitchcock: '/directors/hitchcock.jpg',
  dir_lynch: '/directors/lynch.jpg',
  dir_woody: '/directors/woody_allen.jpg',
  dir_zemeckis: '/directors/zemeckis.png',
  dir_park: '/directors/park_chanwook.png',
  dir_bong: '/directors/bong_joonho.jpg',
}

function QuestIcon({ name, className = '' }: { name: string; className?: string }) {
  // Director portrait images
  const dirImg = DIRECTOR_IMAGES[name]
  if (dirImg) {
    return (
      <img
        src={dirImg}
        alt=""
        className={`inline-block rounded-lg object-cover ${className}`}
        style={{ mixBlendMode: 'lighten' }}
        loading="lazy"
      />
    )
  }

  const cls = `inline-block ${className}`
  const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  switch (name) {
    case 'film':
      return (
        <svg className={cls} {...svgProps}>
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <path d="M7 2v20M17 2v20M2 7h5M17 7h5M2 12h20M2 17h5M17 17h5" />
        </svg>
      )
    case 'mask':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M3 8c0-1.1.9-2 2-2h14a2 2 0 012 2v3c0 5.5-4.5 10-10 10S3 16.5 3 11V8z" />
          <circle cx="9" cy="11" r="1.5" fill="currentColor" />
          <circle cx="15" cy="11" r="1.5" fill="currentColor" />
          <path d="M9 15c1.5 1.5 4.5 1.5 6 0" />
        </svg>
      )
    case 'compass':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity="0.3" />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
        </svg>
      )
    case 'clock':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
      )
    case 'calendar':
      return (
        <svg className={cls} {...svgProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="12" cy="15" r="1" fill="currentColor" />
        </svg>
      )
    case 'palette':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.9-10-9.9z" />
        </svg>
      )
    case 'skull':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2C7 2 4 6 4 10c0 3 1.5 5 3 6v2c0 1 1 2 2 2h6c1 0 2-1 2-2v-2c1.5-1 3-3 3-6 0-4-3-8-8-8z" />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15" cy="10" r="1.5" fill="currentColor" />
          <path d="M10 16v2M14 16v2" />
        </svg>
      )
    case 'laugh':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
        </svg>
      )
    case 'heart':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
        </svg>
      )
    case 'lightning':
      return (
        <svg className={cls} {...svgProps}>
          <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" fill="currentColor" opacity="0.15" />
          <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
        </svg>
      )
    case 'brain':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M9.5 2a3.5 3.5 0 00-3.18 5A3.5 3.5 0 004 10.5 3.5 3.5 0 006 14a3.5 3.5 0 001.32 6.48A3.5 3.5 0 0012 22" />
          <path d="M14.5 2a3.5 3.5 0 013.18 5A3.5 3.5 0 0120 10.5 3.5 3.5 0 0118 14a3.5 3.5 0 01-1.32 6.48A3.5 3.5 0 0112 22" />
          <path d="M12 2v20" />
        </svg>
      )
    case 'eye':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'trophy':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M6 9H3a1 1 0 01-1-1V5a1 1 0 011-1h3M18 9h3a1 1 0 001-1V5a1 1 0 00-1-1h-3" />
          <path d="M6 4h12v6a6 6 0 01-12 0V4z" />
          <path d="M9 20h6M12 16v4" />
          <rect x="8" y="20" width="8" height="2" rx="1" />
        </svg>
      )
    case 'clapperboard':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M4 4l3 3M11 4l3 3M18 4l2 2" />
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M2 7l20 0" />
          <path d="M2 4h20v3H2z" />
        </svg>
      )
    // ── Director-specific icons ──
    case 'dir_nolan': // Trompo de Inception
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 3L8 19h8L12 3z" fill="currentColor" opacity="0.15" />
          <path d="M12 3L8 19h8L12 3z" />
          <ellipse cx="12" cy="19" rx="4" ry="1.5" />
          <line x1="12" y1="3" x2="12" y2="1" />
        </svg>
      )
    case 'dir_kubrick': // Ojo de 2001/Clockwork Orange
      return (
        <svg className={cls} {...svgProps}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <path d="M12 4v-2M12 22v-2" strokeWidth="2" />
        </svg>
      )
    case 'dir_spielberg': // ET / alien hand reaching
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="16" cy="6" r="4" />
          <path d="M4 20c0-4 3-7 7-8" />
          <path d="M11 12l5-3" />
          <circle cx="15" cy="5" r="0.5" fill="currentColor" />
          <circle cx="17" cy="5" r="0.5" fill="currentColor" />
          <path d="M6 22l2-6M10 22l-1-4" />
        </svg>
      )
    case 'dir_tarantino': // Katana (Kill Bill)
      return (
        <svg className={cls} {...svgProps}>
          <path d="M5 19L18 4" strokeWidth="2" />
          <path d="M18 4l2 1-1 2" />
          <path d="M5 19l-1 2 2 1" fill="currentColor" opacity="0.3" />
          <line x1="7" y1="15" x2="4" y2="18" strokeWidth="3" />
        </svg>
      )
    case 'dir_scorsese': // Fedora hat (mafia)
      return (
        <svg className={cls} {...svgProps}>
          <ellipse cx="12" cy="16" rx="10" ry="3" />
          <path d="M6 16c0-5 2-10 6-12 4 2 6 7 6 12" fill="currentColor" opacity="0.15" />
          <path d="M6 16c0-5 2-10 6-12 4 2 6 7 6 12" />
          <line x1="2" y1="16" x2="22" y2="16" />
        </svg>
      )
    case 'dir_fincher': // Crosshair/target (Zodiac, Se7en)
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <line x1="12" y1="1" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="1" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="23" y2="12" />
        </svg>
      )
    case 'dir_villeneuve': // Sandworm/dune (Dune)
      return (
        <svg className={cls} {...svgProps}>
          <path d="M2 18c4-8 6-12 10-12s6 4 10 12" />
          <path d="M6 18c2-4 3-6 6-6s4 2 6 6" fill="currentColor" opacity="0.1" />
          <circle cx="12" cy="8" r="2" />
          <path d="M10 8c0-3 4-3 4 0" />
        </svg>
      )
    case 'dir_coppola': // Puppet strings (The Godfather)
      return (
        <svg className={cls} {...svgProps}>
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="12" y1="2" x2="12" y2="8" />
          <line x1="18" y1="2" x2="18" y2="10" />
          <circle cx="12" cy="15" r="5" fill="currentColor" opacity="0.1" />
          <circle cx="12" cy="15" r="5" />
          <line x1="6" y1="10" x2="9" y2="12" />
          <line x1="18" y1="10" x2="15" y2="12" />
          <line x1="12" y1="8" x2="12" y2="10" />
        </svg>
      )
    case 'dir_hitchcock': // Knife (Psycho)
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2v14" strokeWidth="2" />
          <path d="M9 16h6l-3 6-3-6z" fill="currentColor" opacity="0.3" />
          <path d="M9 16h6l-3 6-3-6z" />
          <path d="M10 2c0-0 4 0 4 0" strokeWidth="3" />
          <path d="M8 4h8" />
        </svg>
      )
    case 'dir_wes': // Suitcase (symmetrical, Grand Budapest)
      return (
        <svg className={cls} {...svgProps}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M8 8V6a4 4 0 018 0v2" />
          <line x1="12" y1="8" x2="12" y2="20" />
          <line x1="4" y1="14" x2="20" y2="14" />
          <circle cx="12" cy="14" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'dir_ridley': // Alien head silhouette
      return (
        <svg className={cls} {...svgProps}>
          <path d="M8 22c0-2 1-4 1-6s-2-4-2-7c0-4 2-7 5-7s5 3 5 7c0 3-2 5-2 7s1 4 1 6" fill="currentColor" opacity="0.1" />
          <path d="M8 22c0-2 1-4 1-6s-2-4-2-7c0-4 2-7 5-7s5 3 5 7c0 3-2 5-2 7s1 4 1 6" />
          <circle cx="10" cy="9" r="1" fill="currentColor" />
          <circle cx="14" cy="9" r="1" fill="currentColor" />
        </svg>
      )
    case 'dir_coen': // Bowling pin (Big Lebowski)
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2c-1.5 0-2 1-2 2s1 2 1 4c0 1.5-2 3-2 6 0 4 1.5 8 3 8s3-4 3-8c0-3-2-4.5-2-6 0-2 1-2 1-4s-.5-2-2-2z" fill="currentColor" opacity="0.1" />
          <path d="M12 2c-1.5 0-2 1-2 2s1 2 1 4c0 1.5-2 3-2 6 0 4 1.5 8 3 8s3-4 3-8c0-3-2-4.5-2-6 0-2 1-2 1-4s-.5-2-2-2z" />
        </svg>
      )
    case 'dir_park': // Hammer (Oldboy)
      return (
        <svg className={cls} {...svgProps}>
          <rect x="10" y="2" width="4" height="8" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="10" y="2" width="4" height="8" rx="1" />
          <line x1="12" y1="10" x2="12" y2="22" strokeWidth="2" />
        </svg>
      )
    case 'dir_miyazaki': // Totoro-like spirit / wind
      return (
        <svg className={cls} {...svgProps}>
          <path d="M6 20c0-6 2-10 6-14 4 4 6 8 6 14" fill="currentColor" opacity="0.1" />
          <path d="M6 20c0-6 2-10 6-14 4 4 6 8 6 14" />
          <circle cx="10" cy="14" r="1.5" fill="currentColor" />
          <circle cx="14" cy="14" r="1.5" fill="currentColor" />
          <path d="M10 18c1 1 3 1 4 0" />
          <path d="M7 8l-3-4M17 8l3-4" />
        </svg>
      )
    case 'dir_bong': // Umbrella/rain (Parasite stairs scene)
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2v20" />
          <path d="M4 12c0-5 3.6-8 8-8s8 3 8 8" fill="currentColor" opacity="0.1" />
          <path d="M4 12c0-5 3.6-8 8-8s8 3 8 8" />
          <path d="M10 22c0-1 1-2 2-2s2 1 2 2" />
          <line x1="2" y1="18" x2="4" y2="16" />
          <line x1="20" y1="18" x2="22" y2="16" />
        </svg>
      )
    case 'dir_zemeckis': // Clock/DeLorean (Back to the Future)
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,4 12,12 17,7" strokeWidth="2" />
          <path d="M7 20l-3 3M17 20l3 3" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      )
    case 'dir_cameron': // Ship bow (Titanic) + waves
      return (
        <svg className={cls} {...svgProps}>
          <path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M12 4v10" strokeWidth="2" />
          <path d="M8 8l4-4 4 4" />
          <path d="M6 14l6-2 6 2" fill="currentColor" opacity="0.1" />
        </svg>
      )
    case 'dir_lynch': // TV static / eye spiral (Twin Peaks)
      return (
        <svg className={cls} {...svgProps}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M3 18h18" />
          <path d="M10 21h4" />
          <path d="M12 8a4 4 0 011 3 4 4 0 01-1 3 4 4 0 01-1-3 4 4 0 011-3z" fill="currentColor" opacity="0.3" />
          <path d="M8 11h8M12 7v8" strokeDasharray="1 1" />
        </svg>
      )
    case 'dir_woody': // Glasses (iconic Woody Allen look)
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="8" cy="12" r="4" />
          <circle cx="16" cy="12" r="4" />
          <line x1="12" y1="12" x2="12" y2="12" />
          <path d="M4 12H2M22 12h-2" />
          <path d="M12 11c0-1 0-1 0 0" />
        </svg>
      )
    case 'dir_clint': // Revolver (westerns)
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="7" cy="14" r="4" />
          <circle cx="7" cy="14" r="1.5" fill="currentColor" />
          <path d="M11 13h10" strokeWidth="2" />
          <path d="M11 13l-1 5h3l-1-5" fill="currentColor" opacity="0.2" />
          <path d="M15 11v-2h4v4h-4" />
        </svg>
      )
    case 'bolt':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" opacity="0.15" />
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )
    case 'globe':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      )
    case 'collection':
      return (
        <svg className={cls} {...svgProps}>
          <rect x="2" y="6" width="16" height="14" rx="2" />
          <rect x="4" y="4" width="16" height="14" rx="2" />
          <rect x="6" y="2" width="16" height="14" rx="2" />
        </svg>
      )
    case 'star':
      return (
        <svg className={cls} {...svgProps}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor" opacity="0.15" />
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      )
    case 'bookmark':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      )
    case 'badge':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3L12 14.3l-4.8 2.3.9-5.3L4.3 7.6l5.3-.8z" />
          <path d="M8 17l-1.5 5L12 19.5 17.5 22 16 17" />
        </svg>
      )
    case 'rebel':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2" />
        </svg>
      )
    case 'monocle':
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="10" r="6" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" fill="currentColor" opacity="0.2" />
          <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z" />
          <path d="M18 16l.75 2.25L21 19l-2.25.75L18 22l-.75-2.25L15 19l2.25-.75z" />
          <path d="M5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5z" />
        </svg>
      )
    case 'rocket':
      return (
        <svg className={cls} {...svgProps}>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
          <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      )
    default:
      return (
        <svg className={cls} {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      )
  }
}

/* ───────────────────────────────────────────
   Level Icon
   ─────────────────────────────────────────── */
function LevelIcon({ level }: { level: string }) {
  const base = 'w-8 h-8'
  switch (level) {
    case 'Dios del celuloide':
      return <QuestIcon name="sparkle" className={`${base} text-yellow-400`} />
    case 'Leyenda del cine':
      return <QuestIcon name="trophy" className={`${base} text-yellow-400`} />
    case 'Cinefilo veterano':
      return <QuestIcon name="star" className={`${base} text-zinc-300`} />
    case 'Cinefilo en formacion':
      return <QuestIcon name="film" className={`${base} text-amber-500`} />
    default:
      return <QuestIcon name="eye" className={`${base} text-zinc-500`} />
  }
}

/* ───────────────────────────────────────────
   Main Page
   ─────────────────────────────────────────── */
export default function CineQuestPage() {
  const { user, loading } = useAuth()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [tierCount, setTierCount] = useState(0)
  const [overallLevel, setOverallLevel] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!loading && !user) return
    if (!user) return

    fetch(`/api/cinequest?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        setAchievements(data.achievements ?? [])
        setStats(data.stats ?? null)
        setTierCount(data.tierCount ?? 0)
        setOverallLevel(data.overallLevel ?? 'Espectador casual')
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [user, loading])

  if (loading) {
    return (
      <PageShell maxWidth="7xl">
        <LoadingState text="Cargando logros..." size="lg" />
      </PageShell>
    )
  }

  if (!user) {
    return (
      <PageShell maxWidth="2xl">
        <div className="flex flex-col items-center justify-center text-center py-20">
          <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-900 flex items-center justify-center text-yellow-400">
            <QuestIcon name="trophy" className="w-8 h-8" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-3">
            CineQuest
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-md mb-6 leading-relaxed">
            Inicia sesión para desbloquear logros y desafíos cinematográficos.
          </p>
          <a href="/catalogo">
            <Button variant="primary">Ir al catálogo</Button>
          </a>
        </div>
      </PageShell>
    )
  }

  if (cargando) {
    return (
      <PageShell maxWidth="7xl">
        <LoadingState text="Cargando logros..." size="lg" />
      </PageShell>
    )
  }

  const unlockedCount = achievements.filter(a => a.unlocked).length
  const totalCount = achievements.length
  const overallPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0

  const sortedAchievements = [...achievements].sort((a, b) => {
    // Gold first, then silver, then bronze, then locked; within same tier by progress %
    const tierOrder = (t: Tier) => t === 'gold' ? 3 : t === 'silver' ? 2 : t === 'bronze' ? 1 : 0
    const ta = tierOrder(a.tier)
    const tb = tierOrder(b.tier)
    if (ta !== tb) return tb - ta
    return (b.progress / (b.total || 1)) - (a.progress / (a.total || 1))
  })

  return (
    <PageShell maxWidth="7xl">
      <PageHeader
        title="CineQuest"
        subtitle="Desafíos y logros cinematográficos para medir tu recorrido por el cine."
      />

      {/* Nivel general */}
      <Section label="Tu nivel">
        <div className="bg-zinc-900 rounded-2xl p-5 sm:p-6 flex items-center gap-4 sm:gap-5">
          <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <LevelIcon level={overallLevel} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl sm:text-2xl font-black text-white truncate">
              {overallLevel}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">
              {tierCount} niveles desbloqueados
            </p>
          </div>
          <Pill variant="gold" size="md">
            {unlockedCount}/{totalCount}
          </Pill>
        </div>

        <div className="mt-4 bg-zinc-900 rounded-2xl p-5 sm:p-6">
          <ProgressBar
            value={unlockedCount}
            max={Math.max(totalCount, 1)}
            color="gold"
            size="md"
            label={`Progreso total · ${overallPct}%`}
            showValue
          />
        </div>
      </Section>

      {/* Estadísticas */}
      <Section label="Estadísticas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            value={unlockedCount}
            label="Logros"
            sub={`de ${totalCount}`}
            color="gold"
          />
          {stats ? (
            <>
              <StatCard
                value={stats.totalWatched}
                label="Películas vistas"
                color="white"
              />
              <StatCard
                value={stats.avgRating ? stats.avgRating : '—'}
                label="Nota promedio"
                color="white"
              />
              <StatCard
                value={stats.uniqueGenres}
                label="Géneros explorados"
                color="white"
              />
            </>
          ) : null}
        </div>
      </Section>

      {/* Logros */}
      <Section label="Logros" count={totalCount}>
        {achievements.length === 0 ? (
          <div className="bg-zinc-900 rounded-2xl p-10 flex flex-col items-center text-center">
            <div className="w-12 h-12 mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500">
              <QuestIcon name="film" className="w-6 h-6" />
            </div>
            <p className="text-zinc-500 text-sm">
              Marca películas como vistas para desbloquear logros.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {sortedAchievements.map(a => (
              <AchievementCard
                key={a.id}
                achievement={{
                  id: a.id,
                  name: a.name,
                  description: a.nextTierName
                    ? `${a.description} · Siguiente: ${a.nextTierName} (${a.progress}/${a.nextTierTotal})`
                    : a.description,
                  icon: <QuestIcon name={a.icon} className="w-7 h-7" />,
                }}
                unlocked={a.unlocked}
                tier={a.tier ?? undefined}
                progress={{ current: a.progress, total: a.total }}
              />
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  )
}
