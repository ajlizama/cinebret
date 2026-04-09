'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import {
  PageShell,
  PageHeader,
  Card,
  Button,
  IconButton,
  SearchInput,
  LoadingState,
  ErrorState,
  Modal,
  Pill,
  Tabs,
  EmptyState,
  Icon,
} from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CastMember = {
  name: string
  profile_path: string | null
  character: string
  order: number
}

type RawMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string | null
  anio: number | null
  nota_imdb: number | null
  oscars: string | null
  runtime: number | null
  enriquecimiento: {
    director: string | null
    compositor: string | null
    generos: string[] | null
    cast_json: CastMember[] | null
  } | null
}

type PosterMovie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  poster_path: string
  anio: number | null
  nota_imdb: number | null
  runtime: number | null
  director: string | null
  compositor: string | null
  oscars: string | null
  actors: string[]
  genres: string[]
  platforms: string[]
  shortLabel: string
  groupKey: string
  groupColor: string
}

type Connection = {
  source: number
  target: number
  strength: number
  shared: string[]
}

type ThemeId =
  | 'imdb_top'
  | 'oscar'
  | 'animacion'
  | 'nolan_tarantino'
  | 'decada_90'
  | 'decada_2000'
  | 'documentales'
  | 'scifi'
  | 'terror_clasico'
  | 'spielberg_scorsese'
  | 'reciente'

type Theme = {
  id: ThemeId
  title: string
  subtitle: string
  caption: string
  // Used to color the rings
  groupBy: 'decade' | 'director' | 'genre'
  build: () => Promise<RawMovie[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POSTER_W = 1080
const POSTER_H = 1350

const GROUP_PALETTE = [
  '#facc15', // gold
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
]

const SELECT_FIELDS = `
  id, titulo, titulo_ingles, poster_path, anio, nota_imdb, oscars, runtime,
  enriquecimiento (director, compositor, generos, cast_json)
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function abbreviate(title: string): string {
  const stripped = title.replace(/^(The|El|La|Los|Las|Le|Les|A|An|Un|Una)\s+/i, '').trim()
  const words = stripped.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '???'
  if (words.length === 1) {
    const w = words[0].replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
    return (w.slice(0, 3) || w).toUpperCase()
  }
  return words
    .map((w) => w[0])
    .join('')
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
    .slice(0, 4)
    .toUpperCase()
}

function decadeOf(anio: number | null): string {
  if (!anio) return 'unknown'
  const d = Math.floor(anio / 10) * 10
  return `${d}s`
}

function topActors(cast: CastMember[] | null | undefined, n = 8): string[] {
  if (!Array.isArray(cast)) return []
  return [...cast]
    .filter((c) => c && typeof c.name === 'string')
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, n)
    .map((c) => c.name)
}

function toPosterMovie(raw: RawMovie, groupBy: Theme['groupBy'], colorMap: Map<string, string>): PosterMovie | null {
  if (!raw.poster_path) return null
  const enr = raw.enriquecimiento
  const director = enr?.director ?? null
  const actors = topActors(enr?.cast_json, 8)
  const groupKey =
    groupBy === 'decade'
      ? decadeOf(raw.anio)
      : groupBy === 'director'
        ? director ?? 'unknown'
        : (enr?.generos ?? [])[0] ?? 'unknown'
  if (!colorMap.has(groupKey)) {
    colorMap.set(groupKey, GROUP_PALETTE[colorMap.size % GROUP_PALETTE.length])
  }
  return {
    id: raw.id,
    titulo: raw.titulo,
    titulo_ingles: raw.titulo_ingles,
    poster_path: raw.poster_path,
    anio: raw.anio,
    nota_imdb: raw.nota_imdb,
    runtime: raw.runtime ?? null,
    director,
    compositor: enr?.compositor ?? null,
    oscars: raw.oscars ?? null,
    actors,
    genres: enr?.generos ?? [],
    platforms: [],
    shortLabel: abbreviate(raw.titulo_ingles || raw.titulo),
    groupKey,
    groupColor: colorMap.get(groupKey)!,
  }
}

type GraphData = {
  nodes: Array<{ id: string }>
  edges: Array<{ source: string; target: string; weight: number }>
}

function buildConnectionsFromGraph(movies: PosterMovie[], graph: GraphData | null, _maxPerNode = 999): Connection[] {
  if (!graph) return []
  // Match /mapa logic exactly: keep ALL edges where BOTH source and target
  // are in the selected movies set. No top-N filter, no bidirectional check.
  const idToIdx = new Map<string, number>()
  movies.forEach((m, i) => idToIdx.set(m.id, i))
  const kept: Connection[] = []
  for (const e of graph.edges) {
    const si = idToIdx.get(e.source)
    const ti = idToIdx.get(e.target)
    if (si === undefined || ti === undefined || si === ti) continue
    kept.push({ source: si, target: ti, strength: e.weight, shared: [] })
  }
  return kept
}

// Force-directed layout: connected movies pull together, all repel each other
function forceLayout(
  movieCount: number,
  connections: Connection[],
  width: number,
  height: number,
  iterations = 500,
): { x: number; y: number }[] {
  const cx = width / 2
  const cy = height / 2 + 60
  const positions: { x: number; y: number; vx: number; vy: number }[] = []

  // Initial: random positions in a circle around center
  for (let i = 0; i < movieCount; i++) {
    const angle = (i / movieCount) * Math.PI * 2
    const r = 250
    positions.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    })
  }

  const REPULSION = 180000
  const ATTRACTION = 0.012
  const CENTER_PULL = 0.006
  const ISOLATED_PULL = 0.025 // stronger pull for nodes without connections
  const DAMPING = 0.88
  const MIN_DIST = 180 // minimum distance between any two nodes

  // Find isolated nodes (no connections)
  const connectedSet = new Set<number>()
  for (const c of connections) {
    connectedSet.add(c.source)
    connectedSet.add(c.target)
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Apply repulsion between all pairs
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]
        const b = positions[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distSq = dx * dx + dy * dy + 1
        const dist = Math.sqrt(distSq)
        const force = REPULSION / distSq
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Apply attraction along connections (proportional to weight)
    for (const c of connections) {
      const a = positions[c.source]
      const b = positions[c.target]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 1
      const force = ATTRACTION * Math.max(0.5, c.strength) * dist
      a.vx += (dx / dist) * force
      a.vy += (dy / dist) * force
      b.vx -= (dx / dist) * force
      b.vy -= (dy / dist) * force
    }

    // Pull all toward center (mild). Isolated nodes get stronger pull.
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      const dx = cx - p.x
      const dy = cy - p.y
      const pull = connectedSet.has(i) ? CENTER_PULL : ISOLATED_PULL
      p.vx += dx * pull
      p.vy += dy * pull
    }

    // Apply velocity with damping
    for (const p of positions) {
      p.vx *= DAMPING
      p.vy *= DAMPING
      p.x += p.vx
      p.y += p.vy
    }

    // Enforce minimum distance after movement
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]
        const b = positions[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MIN_DIST && dist > 0) {
          const push = (MIN_DIST - dist) / 2
          const ux = dx / dist
          const uy = dy / dist
          a.x -= ux * push
          a.y -= uy * push
          b.x += ux * push
          b.y += uy * push
        }
      }
    }
  }

  // Center and scale to fit — use as much space as possible
  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const padding = 100 // edge padding for posters not to be cut
  const availW = width - padding * 2
  const headerSpace = 280
  const footerSpace = 200
  const availH = height - headerSpace - footerSpace
  const scale = Math.min(availW / w, availH / h, 1.5)
  const offsetX = (width - w * scale) / 2 - minX * scale
  const offsetY = headerSpace + (availH - h * scale) / 2 - minY * scale

  return positions.map((p) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  }))
}

function generatePositions(count: number, width: number, height: number) {
  const positions: { x: number; y: number }[] = []
  const cx = width / 2
  const cy = height / 2 + 40 // shift down a bit to balance with header
  // Wider, more spread layout
  // Inner: 1 (center), Middle: 6, Outer: 13
  const layout = [
    { count: 1, r: 0 },
    { count: 5, r: 220 },
    { count: 9, r: 420 },
  ]
  let idx = 0
  for (let ring = 0; ring < layout.length && idx < count; ring++) {
    const ringCount = Math.min(layout[ring].count, count - idx)
    const r = layout[ring].r
    const angleOffset = ring === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ringCount
    for (let i = 0; i < ringCount; i++) {
      if (ring === 0) {
        positions.push({ x: cx, y: cy })
      } else {
        const angle = angleOffset + (i / ringCount) * Math.PI * 2
        const jitter = 18
        const jx = ((i * 73) % jitter) - jitter / 2
        const jy = ((i * 41) % jitter) - jitter / 2
        positions.push({
          x: cx + Math.cos(angle) * r + jx,
          y: cy + Math.sin(angle) * r + jy,
        })
      }
      idx++
    }
  }
  // any remaining nodes: outer ring
  while (idx < count) {
    const i = idx
    const angle = (i / count) * Math.PI * 2
    positions.push({ x: cx + Math.cos(angle) * 440, y: cy + Math.sin(angle) * 440 })
    idx++
  }
  return positions
}

// ─────────────────────────────────────────────────────────────────────────────
// Themes
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Theme[] = [
  {
    id: 'imdb_top',
    title: 'Mejores del IMDB',
    subtitle: 'Top 15 según puntuación',
    caption: 'Las películas mejor valoradas en IMDB',
    groupBy: 'decade',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(15)
      if (error) throw error
      return (data || []) as unknown as RawMovie[]
    },
  },
  {
    id: 'oscar',
    title: 'Ganadoras del Oscar',
    subtitle: 'Mejor Película',
    caption: 'Películas que ganaron el Oscar a Mejor Película',
    groupBy: 'decade',
    build: async () => {
      // The oscars column stores values like "Ganó 4 (Mejor Película,
      // Mejor Director, ...)". We can't use ilike on the prefix, so we
      // pull all "Ganó*" rows that mention "Mejor Película" and filter
      // out the qualified categories (Animada / Extranjera / Internacional /
      // Habla no inglesa) in JS.
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .ilike('oscars', 'Ganó%')
        .ilike('oscars', '%Mejor Película%')
        .order('anio', { ascending: false })
        .limit(200)
      if (error) throw error
      const filtered = (data || []).filter((m: any) => {
        const o = m.oscars || ''
        // Must mention "Mejor Película" without a disqualifying suffix.
        // Match "Mejor Película" only when followed by , ) or end.
        const hasBestPicture = /Mejor Película(?!\s+(Animada|Extranjera|Internacional|de Habla))/i.test(o)
        return hasBestPicture
      })
      return filtered.slice(0, 15) as unknown as RawMovie[]
    },
  },
  {
    id: 'animacion',
    title: 'Animación Top',
    subtitle: 'Lo mejor del cine animado',
    caption: 'Las mejores películas animadas',
    groupBy: 'decade',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS + ', enriquecimiento!inner (director, generos, cast_json)')
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .contains('enriquecimiento.generos', ['Animación'])
        .order('nota_imdb', { ascending: false })
        .limit(15)
      if (error) {
        // Fallback: fetch a wider pool and filter client side
        const { data: pool } = await supabase
          .from('peliculas')
          .select(SELECT_FIELDS)
          .not('poster_path', 'is', null)
          .not('nota_imdb', 'is', null)
          .order('nota_imdb', { ascending: false })
          .limit(500)
        const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) =>
          (p.enriquecimiento?.generos || []).some((g) => /animaci/i.test(g)),
        )
        return filtered.slice(0, 15)
      }
      return (data || []) as unknown as RawMovie[]
    },
  },
  {
    id: 'nolan_tarantino',
    title: 'Nolan + Tarantino',
    subtitle: 'Dos visiones, dos universos',
    caption: 'Toda la filmografía de Nolan y Tarantino',
    groupBy: 'director',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS + ', enriquecimiento!inner (director, generos, cast_json)')
        .not('poster_path', 'is', null)
        .or('director.ilike.%Christopher Nolan%,director.ilike.%Quentin Tarantino%', {
          foreignTable: 'enriquecimiento',
        })
        .order('anio', { ascending: false })
        .limit(40)
      if (error) {
        const { data: pool } = await supabase
          .from('peliculas')
          .select(SELECT_FIELDS)
          .not('poster_path', 'is', null)
          .order('nota_imdb', { ascending: false })
          .limit(2000)
        const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) => {
          const d = p.enriquecimiento?.director || ''
          return /Nolan|Tarantino/i.test(d)
        })
        return filtered.slice(0, 24)
      }
      return (data || []) as unknown as RawMovie[]
    },
  },
  {
    id: 'decada_90',
    title: 'Década: 90s',
    subtitle: 'Lo mejor de los noventa',
    caption: 'Las películas que definieron los 90',
    groupBy: 'genre',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .gte('anio', 1990)
        .lte('anio', 1999)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(15)
      if (error) throw error
      return (data || []) as unknown as RawMovie[]
    },
  },
  {
    id: 'decada_2000',
    title: 'Década: 2000s',
    subtitle: 'Lo mejor del nuevo milenio',
    caption: 'Las películas que marcaron los 2000',
    groupBy: 'genre',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .gte('anio', 2000)
        .lte('anio', 2009)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(15)
      if (error) throw error
      return (data || []) as unknown as RawMovie[]
    },
  },
  {
    id: 'documentales',
    title: 'Documentales Top',
    subtitle: 'Realidad en pantalla',
    caption: 'Los mejores documentales',
    groupBy: 'decade',
    build: async () => {
      const { data: pool } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(800)
      const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) =>
        (p.enriquecimiento?.generos || []).some((g) => /document/i.test(g)),
      )
      return filtered.slice(0, 15)
    },
  },
  {
    id: 'scifi',
    title: 'Sci-Fi Top',
    subtitle: 'Ciencia ficción esencial',
    caption: 'Las mejores películas de ciencia ficción',
    groupBy: 'decade',
    build: async () => {
      const { data: pool } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(800)
      const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) =>
        (p.enriquecimiento?.generos || []).some((g) => /ciencia\s*ficci|sci.?fi|science fiction/i.test(g)),
      )
      return filtered.slice(0, 15)
    },
  },
  {
    id: 'terror_clasico',
    title: 'Terror Clásico',
    subtitle: 'El horror antes de 2010',
    caption: 'Los grandes clásicos del terror',
    groupBy: 'decade',
    build: async () => {
      const { data: pool } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .lt('anio', 2010)
        .order('nota_imdb', { ascending: false })
        .limit(800)
      const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) =>
        (p.enriquecimiento?.generos || []).some((g) => /terror|horror/i.test(g)),
      )
      return filtered.slice(0, 15)
    },
  },
  {
    id: 'spielberg_scorsese',
    title: 'Spielberg + Scorsese',
    subtitle: 'Dos maestros, una generación',
    caption: 'Lo mejor de Spielberg y Scorsese combinado',
    groupBy: 'director',
    build: async () => {
      const { data: pool } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(2000)
      const filtered = ((pool || []) as unknown as RawMovie[]).filter((p) => {
        const d = p.enriquecimiento?.director || ''
        return /Spielberg|Scorsese/i.test(d)
      })
      return filtered.slice(0, 24)
    },
  },
  {
    id: 'reciente',
    title: 'Lo Más Reciente',
    subtitle: 'Lo mejor del último año',
    caption: 'Las películas más recientes mejor valoradas',
    groupBy: 'genre',
    build: async () => {
      const currentYear = new Date().getFullYear()
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .gte('anio', currentYear - 1)
        .order('nota_imdb', { ascending: false })
        .limit(15)
      if (error) throw error
      return (data || []) as unknown as RawMovie[]
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Community / user creations types
// ─────────────────────────────────────────────────────────────────────────────

type LandingTab = 'cinebret' | 'custom' | 'community' | 'mine'

type UserCreation = {
  id: string
  user_id: string
  type: string
  title: string
  movie_ids: string[]
  theme_id: string | null
  is_public: boolean
  created_at: string
}

type CreatorProfile = {
  user_id: string
  username: string | null
  avatar_url: string | null
}

type CreationWithMeta = UserCreation & {
  previewPosters: string[]
  creator?: CreatorProfile
}

const CREATIONS_PAGE_SIZE = 20

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PostersPage() {
  const { user } = useAuth()
  const [landingTab, setLandingTab] = useState<LandingTab>('cinebret')
  const [activeThemeKey, setActiveThemeKey] = useState<string | null>(null)
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null)
  const [movies, setMovies] = useState<PosterMovie[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewPosters, setPreviewPosters] = useState<Record<ThemeId, string | null>>(
    () =>
      Object.fromEntries(THEMES.map((t) => [t.id, null])) as Record<ThemeId, string | null>,
  )
  const [downloading, setDownloading] = useState(false)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customSearch, setCustomSearch] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customResults, setCustomResults] = useState<RawMovie[]>([])
  const [customSelected, setCustomSelected] = useState<RawMovie[]>([])
  const [customLoading, setCustomLoading] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedMovie, setSelectedMovie] = useState<PosterMovie | null>(null)
  const movieSvgRef = useRef<SVGSVGElement>(null)
  const [movieDownloading, setMovieDownloading] = useState(false)

  // Save / publish state
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveIsPublic, setSaveIsPublic] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Community + Mis creaciones state
  const [communityItems, setCommunityItems] = useState<CreationWithMeta[]>([])
  const [communityLoading, setCommunityLoading] = useState(false)
  const [communityPage, setCommunityPage] = useState(0)
  const [communityHasMore, setCommunityHasMore] = useState(true)
  const [myItems, setMyItems] = useState<CreationWithMeta[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [loadingCreation, setLoadingCreation] = useState(false)

  // Fetch platforms for selected movie
  useEffect(() => {
    if (!selectedMovie) return
    if (selectedMovie.platforms && selectedMovie.platforms.length > 0) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('watch_providers')
        .select('platform_key')
        .eq('pelicula_id', selectedMovie.id)
        .eq('provider_type', 'flatrate')
        .not('platform_key', 'is', null)
      if (!cancelled && data) {
        const plats = [...new Set(data.map((d: any) => d.platform_key as string).filter(Boolean))]
        setSelectedMovie((prev) => (prev && prev.id === selectedMovie.id ? { ...prev, platforms: plats } : prev))
      }
    })()
    return () => { cancelled = true }
  }, [selectedMovie?.id])

  // Load movie graph for connections
  useEffect(() => {
    fetch('/movie-graph.json')
      .then((r) => r.json())
      .then((data) => setGraph(data))
      .catch(() => {})
  }, [])

  // Search movies for custom builder
  useEffect(() => {
    if (!customSearch || customSearch.length < 2) {
      setCustomResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setCustomLoading(true)
      try {
        const q = customSearch.trim()
        const { data } = await supabase
          .from('peliculas')
          .select(SELECT_FIELDS)
          .or(`titulo.ilike.%${q}%,titulo_ingles.ilike.%${q}%`)
          .not('poster_path', 'is', null)
          .limit(8)
        if (!cancelled) setCustomResults((data || []) as unknown as RawMovie[])
      } catch {}
      setCustomLoading(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [customSearch])

  async function buildCustomTheme() {
    if (customSelected.length < 2) return
    const title = customTitle.trim() || 'Mi Selección'
    const customTheme: Theme = {
      id: 'imdb_top', // reuse id for storage purposes
      title,
      subtitle: `${customSelected.length} películas`,
      caption: title,
      groupBy: 'decade',
      build: async () => customSelected,
    }
    setCustomOpen(false)
    setActiveTheme(customTheme)
    setActiveThemeKey('custom')
    setMovies([])
    setConnections([])
    setLoading(true)
    let g = graph
    if (!g) {
      try { const r = await fetch('/movie-graph.json'); g = await r.json(); setGraph(g) } catch {}
    }
    try {
      const colorMap = new Map<string, string>()
      const posterMovies: PosterMovie[] = []
      for (const r of customSelected) {
        const pm = toPosterMovie(r, 'decade', colorMap)
        if (pm) posterMovies.push(pm)
      }
      const sliced = posterMovies.slice(0, 15)
      const conns = buildConnectionsFromGraph(sliced, g, 10)
      setMovies(sliced)
      setConnections(conns)
    } catch (e) {
      setError((e as Error).message || 'Error')
    } finally {
      setLoading(false)
    }
  }

  // Fetch a representative poster for each theme card (just one image, lightweight)
  useEffect(() => {
    let cancelled = false
    async function loadPreviews() {
      const updates: Partial<Record<ThemeId, string | null>> = {}
      // Run in parallel but cheap: a single query for top imdb covers most themes' "vibe"
      try {
        const { data } = await supabase
          .from('peliculas')
          .select('poster_path, anio')
          .not('poster_path', 'is', null)
          .not('nota_imdb', 'is', null)
          .order('nota_imdb', { ascending: false })
          .limit(50)
        const rows = (data || []) as Array<{ poster_path: string; anio: number | null }>
        const pickRandom = () => rows[Math.floor(Math.random() * rows.length)]?.poster_path || null
        for (const t of THEMES) {
          if (t.id === 'decada_90') {
            updates[t.id] = rows.find((r) => r.anio && r.anio >= 1990 && r.anio < 2000)?.poster_path || pickRandom()
          } else if (t.id === 'decada_2000') {
            updates[t.id] =
              rows.find((r) => r.anio && r.anio >= 2000 && r.anio < 2010)?.poster_path || pickRandom()
          } else {
            updates[t.id] = pickRandom()
          }
        }
      } catch {
        /* preview is optional */
      }
      if (!cancelled) setPreviewPosters((prev) => ({ ...prev, ...updates }))
    }
    loadPreviews()
    return () => {
      cancelled = true
    }
  }, [])

  async function selectTheme(theme: Theme) {
    setActiveTheme(theme)
    setActiveThemeKey(theme.id)
    setMovies([])
    setConnections([])
    setError(null)
    setLoading(true)
    // Wait for graph if not loaded yet
    let g = graph
    if (!g) {
      try {
        const r = await fetch('/movie-graph.json')
        g = await r.json()
        setGraph(g)
      } catch {}
    }
    try {
      const raw = await theme.build()
      const colorMap = new Map<string, string>()
      const posterMovies: PosterMovie[] = []
      for (const r of raw) {
        const pm = toPosterMovie(r, theme.groupBy, colorMap)
        if (pm) posterMovies.push(pm)
      }
      const sliced = posterMovies.slice(0, 15)
      // Use the movie similarity graph for connections (much better than actor sharing)
      const conns = buildConnectionsFromGraph(sliced, g, 10)
      setMovies(sliced)
      setConnections(conns)
    } catch (e) {
      setError((e as Error).message || 'Error cargando el tema')
    } finally {
      setLoading(false)
    }
  }

  function closePoster() {
    setActiveTheme(null)
    setActiveThemeKey(null)
    setMovies([])
    setConnections([])
    setError(null)
  }

  // Build a poster from a saved creation (list of movie ids)
  async function loadCreation(creation: CreationWithMeta) {
    setLoadingCreation(true)
    setError(null)
    let g = graph
    if (!g) {
      try {
        const r = await fetch('/movie-graph.json')
        g = await r.json()
        setGraph(g)
      } catch {}
    }
    try {
      const ids = creation.movie_ids || []
      if (ids.length === 0) {
        setError('Esta creación no tiene películas.')
        setLoadingCreation(false)
        return
      }
      const { data, error: qErr } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .in('id', ids)
      if (qErr) throw qErr
      const rawById = new Map<string, RawMovie>()
      for (const row of (data || []) as unknown as RawMovie[]) rawById.set(row.id, row)
      // Preserve original order
      const ordered: RawMovie[] = []
      for (const id of ids) {
        const r = rawById.get(id)
        if (r) ordered.push(r)
      }
      const theme: Theme = {
        id: 'imdb_top',
        title: creation.title,
        subtitle: `${ordered.length} películas`,
        caption: creation.title,
        groupBy: 'decade',
        build: async () => ordered,
      }
      const colorMap = new Map<string, string>()
      const posterMovies: PosterMovie[] = []
      for (const r of ordered) {
        const pm = toPosterMovie(r, 'decade', colorMap)
        if (pm) posterMovies.push(pm)
      }
      const sliced = posterMovies.slice(0, 15)
      const conns = buildConnectionsFromGraph(sliced, g, 10)
      setActiveTheme(theme)
      setActiveThemeKey(creation.theme_id || 'custom')
      setMovies(sliced)
      setConnections(conns)
    } catch (e) {
      setError((e as Error).message || 'Error cargando la creación')
    } finally {
      setLoadingCreation(false)
    }
  }

  // Save poster to user_creations
  async function savePoster(isPublic: boolean) {
    if (!user) {
      setSaveMessage('Inicia sesión para guardar tu poster.')
      return
    }
    if (!activeTheme || movies.length === 0) return
    setSaveIsPublic(isPublic)
    const defaultTitle = activeTheme.title || 'Mi poster'
    setSaveTitle(defaultTitle)
    setSaveMessage(null)
    setSaveModalOpen(true)
  }

  async function confirmSavePoster() {
    if (!user) {
      setSaveMessage('Inicia sesión para guardar tu poster.')
      return
    }
    if (!activeTheme || movies.length === 0) return
    const title = saveTitle.trim() || activeTheme.title || 'Mi poster'
    setSaveBusy(true)
    setSaveMessage(null)
    try {
      const { error: insErr } = await supabase.from('user_creations').insert({
        user_id: user.id,
        type: 'poster',
        title,
        movie_ids: movies.map((m) => m.id),
        theme_id: activeThemeKey || 'custom',
        is_public: saveIsPublic,
      })
      if (insErr) throw insErr
      setSaveMessage(saveIsPublic ? 'Publicado en la Comunidad.' : 'Guardado en tus creaciones.')
      // Invalidate caches so the new item appears next time the tab opens
      setMyItems([])
      setCommunityItems([])
      setCommunityPage(0)
      setCommunityHasMore(true)
      setTimeout(() => {
        setSaveModalOpen(false)
        setSaveMessage(null)
      }, 900)
    } catch (e) {
      setSaveMessage((e as Error).message || 'No pudimos guardar el poster.')
    } finally {
      setSaveBusy(false)
    }
  }

  // Fetch community creations (paginated)
  async function fetchCommunityPage(page: number) {
    setCommunityLoading(true)
    try {
      const from = page * CREATIONS_PAGE_SIZE
      const to = from + CREATIONS_PAGE_SIZE - 1
      const { data, error: qErr } = await supabase
        .from('user_creations')
        .select('id, user_id, type, title, movie_ids, theme_id, is_public, created_at')
        .eq('type', 'poster')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (qErr) throw qErr
      const rows = (data || []) as UserCreation[]
      if (rows.length < CREATIONS_PAGE_SIZE) setCommunityHasMore(false)
      const userIds = [...new Set(rows.map((r) => r.user_id))]
      const allMovieIds = [...new Set(rows.flatMap((r) => (r.movie_ids || []).slice(0, 6)))]
      const [profilesRes, postersRes] = await Promise.all([
        userIds.length > 0
          ? supabase
              .from('profiles')
              .select('user_id, username, avatar_url')
              .in('user_id', userIds)
          : Promise.resolve({ data: [] as CreatorProfile[], error: null }),
        allMovieIds.length > 0
          ? supabase
              .from('peliculas')
              .select('id, poster_path')
              .in('id', allMovieIds)
          : Promise.resolve({ data: [] as Array<{ id: string; poster_path: string | null }>, error: null }),
      ])
      const profileById = new Map<string, CreatorProfile>()
      for (const p of ((profilesRes.data || []) as CreatorProfile[])) {
        profileById.set(p.user_id, p)
      }
      const posterById = new Map<string, string | null>()
      for (const p of ((postersRes.data || []) as Array<{ id: string; poster_path: string | null }>)) {
        posterById.set(p.id, p.poster_path)
      }
      const withMeta: CreationWithMeta[] = rows.map((r) => ({
        ...r,
        previewPosters: (r.movie_ids || [])
          .slice(0, 6)
          .map((id) => posterById.get(id) || null)
          .filter((p): p is string => !!p),
        creator: profileById.get(r.user_id),
      }))
      setCommunityItems((prev) => (page === 0 ? withMeta : [...prev, ...withMeta]))
    } catch (e) {
      console.error('community fetch failed', e)
    } finally {
      setCommunityLoading(false)
    }
  }

  // Fetch user's own creations
  async function fetchMyCreations() {
    if (!user) return
    setMyLoading(true)
    try {
      const { data, error: qErr } = await supabase
        .from('user_creations')
        .select('id, user_id, type, title, movie_ids, theme_id, is_public, created_at')
        .eq('type', 'poster')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (qErr) throw qErr
      const rows = (data || []) as UserCreation[]
      const allMovieIds = [...new Set(rows.flatMap((r) => (r.movie_ids || []).slice(0, 6)))]
      const { data: postersData } = allMovieIds.length > 0
        ? await supabase.from('peliculas').select('id, poster_path').in('id', allMovieIds)
        : { data: [] as Array<{ id: string; poster_path: string | null }> }
      const posterById = new Map<string, string | null>()
      for (const p of ((postersData || []) as Array<{ id: string; poster_path: string | null }>)) {
        posterById.set(p.id, p.poster_path)
      }
      const withMeta: CreationWithMeta[] = rows.map((r) => ({
        ...r,
        previewPosters: (r.movie_ids || [])
          .slice(0, 6)
          .map((id) => posterById.get(id) || null)
          .filter((p): p is string => !!p),
      }))
      setMyItems(withMeta)
    } catch (e) {
      console.error('my creations fetch failed', e)
    } finally {
      setMyLoading(false)
    }
  }

  // Lazy-load tab data on switch
  useEffect(() => {
    if (landingTab === 'community' && communityItems.length === 0 && communityHasMore && !communityLoading) {
      fetchCommunityPage(0)
    }
    if (landingTab === 'mine' && user && myItems.length === 0 && !myLoading) {
      fetchMyCreations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingTab, user?.id])

  // Pre-compute positions using force-directed layout based on connections
  const positions = useMemo(
    () => (movies.length > 0 ? forceLayout(movies.length, connections, POSTER_W, POSTER_H) : []),
    [movies.length, connections],
  )

  // Download SVG as PNG using native canvas
  async function downloadAsImage() {
    const svg = svgRef.current
    if (!svg) return
    setDownloading(true)
    try {
      // Pre-fetch every image to a data URL with retries.
      // Use sequential loading + retry to avoid TMDB rate limits / CORS hiccups.
      async function fetchAsDataUrl(url: string, attempts = 3): Promise<string | null> {
        for (let i = 0; i < attempts; i++) {
          try {
            const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const blob = await res.blob()
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
          } catch (err) {
            if (i < attempts - 1) {
              await new Promise((r) => setTimeout(r, 300 * (i + 1)))
            }
          }
        }
        return null
      }

      const imageEls = Array.from(svg.querySelectorAll('image'))
      const failed: string[] = []
      // Process in chunks of 4 to avoid overwhelming TMDB
      const chunkSize = 4
      for (let i = 0; i < imageEls.length; i += chunkSize) {
        const chunk = imageEls.slice(i, i + chunkSize)
        await Promise.all(
          chunk.map(async (el) => {
            const href = el.getAttribute('href') || el.getAttribute('xlink:href')
            if (!href || href.startsWith('data:')) return
            const dataUrl = await fetchAsDataUrl(href)
            if (dataUrl) {
              el.setAttribute('href', dataUrl)
            } else {
              failed.push(href)
              // Replace failed image with a placeholder using fill color
              el.setAttribute('href', '')
              el.setAttribute('opacity', '0')
            }
          }),
        )
      }
      if (failed.length > 0) {
        console.warn(`${failed.length} images failed to load:`, failed)
      }

      const xml = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = (e) => reject(e)
      })
      img.src = svgUrl
      await loaded

      const canvas = document.createElement('canvas')
      canvas.width = POSTER_W
      canvas.height = POSTER_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      ctx.fillStyle = '#0c0a09'
      ctx.fillRect(0, 0, POSTER_W, POSTER_H)
      ctx.drawImage(img, 0, 0, POSTER_W, POSTER_H)
      URL.revokeObjectURL(svgUrl)

      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `cinebret-poster-${activeTheme?.id || 'tema'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('Download failed', e)
      alert('No pudimos descargar la imagen. Toma una captura de pantalla.')
    } finally {
      setDownloading(false)
    }
  }

  // Count how many edges reference the selected movie in current theme
  const selectedMovieConnCount = useMemo(() => {
    if (!selectedMovie) return 0
    return connections.filter((c) => {
      const src = movies[c.source]
      const tgt = movies[c.target]
      return src?.id === selectedMovie.id || tgt?.id === selectedMovie.id
    }).length
  }, [selectedMovie, connections, movies])

  async function downloadMovieAsImage() {
    const svg = movieSvgRef.current
    if (!svg || !selectedMovie) return
    setMovieDownloading(true)
    try {
      async function fetchAsDataUrl(url: string, attempts = 3): Promise<string | null> {
        for (let i = 0; i < attempts; i++) {
          try {
            const res = await fetch(url, { mode: 'cors', cache: 'force-cache' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const blob = await res.blob()
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
          } catch {
            if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)))
          }
        }
        return null
      }

      const imageEls = Array.from(svg.querySelectorAll('image'))
      for (const el of imageEls) {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href')
        if (!href || href.startsWith('data:')) continue
        const dataUrl = await fetchAsDataUrl(href)
        if (dataUrl) el.setAttribute('href', dataUrl)
        else {
          el.setAttribute('href', '')
          el.setAttribute('opacity', '0')
        }
      }

      const xml = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      const svgUrl = URL.createObjectURL(svgBlob)

      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = (e) => reject(e)
      })
      img.src = svgUrl
      await loaded

      const canvas = document.createElement('canvas')
      canvas.width = POSTER_W
      canvas.height = POSTER_H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      ctx.fillStyle = '#0c0a09'
      ctx.fillRect(0, 0, POSTER_W, POSTER_H)
      ctx.drawImage(img, 0, 0, POSTER_W, POSTER_H)
      URL.revokeObjectURL(svgUrl)

      const pngUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `cinebret-pelicula-${selectedMovie.shortLabel}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('Download failed', e)
      alert('No pudimos descargar la imagen. Toma una captura de pantalla.')
    } finally {
      setMovieDownloading(false)
    }
  }

  async function shareMoviePoster() {
    if (!selectedMovie) return
    const title = selectedMovie.titulo_ingles || selectedMovie.titulo
    const shareData = {
      title: `CineBret · ${title}`,
      text: `${title} en CineBret`,
      url: typeof window !== 'undefined' ? window.location.href : 'https://cinebret.cl',
    }
    try {
      if (navigator.share) await navigator.share(shareData)
      else {
        await navigator.clipboard.writeText(`${shareData.title} — ${shareData.url}`)
        alert('Enlace copiado al portapapeles')
      }
    } catch {
      /* user cancelled */
    }
  }

  async function sharePoster() {
    if (!activeTheme) return
    const shareData = {
      title: `CineBret · ${activeTheme.title}`,
      text: activeTheme.caption,
      url: typeof window !== 'undefined' ? window.location.href : 'https://cinebret.cl',
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(`${shareData.title} — ${shareData.url}`)
        alert('Enlace copiado al portapapeles')
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <>
      {/* ───────────── Theme selector ───────────── */}
      {!activeTheme && (
        <PageShell maxWidth="7xl">
          <PageHeader
            title="Posters"
            subtitle="Genera infografías visuales de cómo se conectan películas según el grafo de similitud de CineBret. Listas para compartir en Instagram."
          />

          <div className="mb-6">
            <Tabs
              value={landingTab}
              onChange={(k) => setLandingTab(k as LandingTab)}
              tabs={[
                { key: 'cinebret', label: 'CineBret' },
                { key: 'custom', label: 'Crea el tuyo' },
                { key: 'community', label: 'Comunidad' },
                ...(user ? [{ key: 'mine' as const, label: 'Mis creaciones' }] : []),
              ]}
            />
          </div>

          {landingTab === 'cinebret' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {THEMES.map((theme, idx) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  index={idx}
                  previewPoster={previewPosters[theme.id]}
                  onClick={() => selectTheme(theme)}
                />
              ))}
            </div>
          )}

          {landingTab === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <motion.button
                type="button"
                onClick={() => setCustomOpen(true)}
                whileHover={{ y: -2 }}
                className="group relative h-28 rounded-2xl overflow-hidden bg-gradient-to-br from-yellow-300 to-yellow-600 cursor-pointer transition-transform duration-300"
              >
                <div className="absolute inset-0 flex items-center gap-4 px-5 text-zinc-950">
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-zinc-950/15 flex items-center justify-center">
                    <Icon.Plus className="w-7 h-7" strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-black leading-tight">Crear tu poster</h3>
                    <p className="text-xs font-semibold text-zinc-900/90 mt-0.5">
                      Elige tus propias películas
                    </p>
                    <p className="text-[10px] text-zinc-800/80 mt-0.5">Hasta 20 películas</p>
                  </div>
                </div>
              </motion.button>
              <div className="hidden sm:flex items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-6 text-center">
                <p className="text-xs text-zinc-500 max-w-xs">
                  Elige manualmente las películas que quieres combinar. CineBret
                  calcula sus conexiones automáticamente usando el grafo de similitud.
                </p>
              </div>
            </div>
          )}

          {landingTab === 'community' && (
            <CreationsGrid
              items={communityItems}
              loading={communityLoading}
              emptyTitle="Aún no hay posters en la Comunidad"
              emptyDescription="Sé la primera persona en publicar un poster. Crea uno y pulsa Publicar."
              showCreator
              onOpen={loadCreation}
              onLoadMore={
                communityHasMore && !communityLoading
                  ? () => {
                      const next = communityPage + 1
                      setCommunityPage(next)
                      fetchCommunityPage(next)
                    }
                  : null
              }
            />
          )}

          {landingTab === 'mine' && user && (
            <CreationsGrid
              items={myItems}
              loading={myLoading}
              emptyTitle="Todavía no guardaste ningún poster"
              emptyDescription="Genera un poster desde CineBret o Crea el tuyo y pulsa Guardar o Publicar."
              showVisibility
              onOpen={loadCreation}
              onLoadMore={null}
            />
          )}
        </PageShell>
      )}

      {/* ───────────── Custom builder modal ───────────── */}
      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="Crear tu poster"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Título del poster (ej: Mis favoritas de los 80s)"
              maxLength={40}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 min-h-[44px]"
            />
            <p className="text-zinc-400 text-xs mt-2">
              {customSelected.length}/20 películas seleccionadas
            </p>
          </div>

          <SearchInput
            value={customSearch}
            onChange={setCustomSearch}
            placeholder="Buscar película..."
          />

          {/* Selected pills */}
          {customSelected.length > 0 && (
            <div className="max-h-32 overflow-y-auto border-t border-zinc-800 pt-4">
              <div className="flex flex-wrap gap-2">
                {customSelected.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setCustomSelected((prev) => prev.filter((x) => x.id !== m.id))
                    }
                    className="inline-flex items-center gap-1.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 rounded-full pl-3 pr-2 py-1 text-xs hover:bg-yellow-400/20 transition-colors"
                  >
                    <span>{m.titulo_ingles || m.titulo}</span>
                    <Icon.Close className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          <div className="max-h-72 overflow-y-auto border-t border-zinc-800 pt-4">
            {customLoading && (
              <p className="text-zinc-500 text-xs text-center py-4">Buscando...</p>
            )}
            {!customLoading &&
              customSearch.length >= 2 &&
              customResults.length === 0 && (
                <p className="text-zinc-500 text-xs text-center py-4">
                  No se encontraron resultados
                </p>
              )}
            <div className="space-y-2">
              {customResults.map((m) => {
                const isSelected = customSelected.some((x) => x.id === m.id)
                const isFull = customSelected.length >= 20
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isSelected || (isFull && !isSelected)}
                    onClick={() => {
                      if (!isSelected && customSelected.length < 20) {
                        setCustomSelected((prev) => [...prev, m])
                        setCustomSearch('')
                        setCustomResults([])
                      }
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-left transition-colors min-h-[44px]"
                  >
                    <div className="w-10 h-14 rounded overflow-hidden bg-zinc-800 shrink-0">
                      {m.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium line-clamp-1">
                        {m.titulo_ingles || m.titulo}
                      </p>
                      <p className="text-zinc-500 text-xs flex items-center gap-1.5">
                        <span>{m.anio}</span>
                        <span>·</span>
                        <Icon.Star filled className="w-3 h-3 text-yellow-400" />
                        <span>{m.nota_imdb}</span>
                      </p>
                    </div>
                    {isSelected && (
                      <Icon.Check className="w-4 h-4 text-yellow-400 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Action footer */}
          <div className="flex gap-2 pt-4 border-t border-zinc-800">
            <Button
              variant="ghost"
              onClick={() => {
                setCustomSelected([])
                setCustomSearch('')
                setCustomResults([])
              }}
            >
              Limpiar
            </Button>
            <Button
              onClick={buildCustomTheme}
              disabled={customSelected.length < 2}
              fullWidth
            >
              Generar poster ({customSelected.length})
            </Button>
          </div>
        </div>
      </Modal>

      {/* ───────────── Save / Publish modal ───────────── */}
      <Modal
        open={saveModalOpen}
        onClose={() => {
          if (!saveBusy) {
            setSaveModalOpen(false)
            setSaveMessage(null)
          }
        }}
        title={saveIsPublic ? 'Publicar en la Comunidad' : 'Guardar poster'}
        size="sm"
      >
        <div className="space-y-4">
          {!user ? (
            <p className="text-sm text-zinc-400">
              Necesitas una sesión iniciada para guardar o publicar tus posters.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2">
                  Título del poster
                </label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  maxLength={60}
                  placeholder="Título"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-yellow-400/50 min-h-[44px]"
                />
              </div>
              <p className="text-xs text-zinc-500">
                {saveIsPublic
                  ? 'Será visible en la pestaña Comunidad para toda la gente de CineBret.'
                  : 'Solo lo verás tú en Mis creaciones.'}
              </p>
              {saveMessage && (
                <p className="text-xs text-yellow-400 text-center">{saveMessage}</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setSaveModalOpen(false)}
                  disabled={saveBusy}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmSavePoster}
                  loading={saveBusy}
                  fullWidth
                >
                  {saveIsPublic ? 'Publicar' : 'Guardar'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ───────────── Loading remote creation overlay ───────────── */}
      {loadingCreation && (
        <div className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <LoadingState text="Cargando creación..." size="lg" />
        </div>
      )}

      {/* ───────────── Poster view ───────────── */}
      <AnimatePresence>
        {activeTheme && (
          <motion.div
            key="poster-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 overflow-y-auto bg-zinc-950"
          >
            <PageShell maxWidth="2xl">
              {/* Top bar */}
              <div className="flex items-center justify-between mb-6">
                <Button
                  variant="secondary"
                  onClick={closePoster}
                  iconLeft={<Icon.ArrowLeft className="w-4 h-4" />}
                >
                  Volver a temas
                </Button>
              </div>

              {/* Poster card */}
              <div className="w-full">
                {loading ? (
                  <div
                    className="w-full rounded-2xl flex items-center justify-center bg-zinc-900 border border-zinc-800"
                    style={{ aspectRatio: '4 / 5' }}
                  >
                    <LoadingState text="Construyendo red..." size="lg" />
                  </div>
                ) : error ? (
                  <div
                    className="w-full rounded-2xl flex items-center justify-center bg-zinc-900 border border-zinc-800"
                    style={{ aspectRatio: '4 / 5' }}
                  >
                    <ErrorState
                      description={error}
                      onRetry={() => activeTheme && selectTheme(activeTheme)}
                    />
                  </div>
                ) : (
                  <PosterSVG
                    ref={svgRef}
                    theme={activeTheme}
                    movies={movies}
                    connections={connections}
                    positions={positions}
                    onMovieClick={(m) => setSelectedMovie(m)}
                  />
                )}
              </div>

              {/* Action buttons */}
              {!loading && !error && movies.length > 0 && (
                <div className="mt-8 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={downloadAsImage}
                      loading={downloading}
                      fullWidth
                      size="lg"
                      iconLeft={<Icon.Download className="w-4 h-4" />}
                    >
                      {downloading ? 'Generando...' : 'Descargar PNG'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={sharePoster}
                      fullWidth
                      size="lg"
                      iconLeft={<Icon.Share className="w-4 h-4" />}
                    >
                      Compartir
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => savePoster(false)}
                      fullWidth
                      size="lg"
                      iconLeft={<Icon.Bookmark className="w-4 h-4" />}
                    >
                      Guardar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => savePoster(true)}
                      fullWidth
                      size="lg"
                      iconLeft={<Icon.Users className="w-4 h-4" />}
                    >
                      Publicar
                    </Button>
                  </div>
                </div>
              )}

              {/* Hint */}
              {!loading && !error && movies.length > 0 && (
                <p className="mt-6 text-center text-xs text-zinc-500 max-w-md mx-auto">
                  Las líneas conectan películas similares según el grafo de CineBret
                  (mismos keywords, género, director, etc). Mientras más gruesa, más
                  fuerte la conexión.
                </p>
              )}
            </PageShell>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───────────── Individual movie poster modal ───────────── */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            key="movie-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-sm"
            onClick={() => setSelectedMovie(null)}
          >
            <div
              className="min-h-[100dvh] flex flex-col items-center pt-4 pb-16 px-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="w-full max-w-2xl flex items-center justify-end mb-6">
                <IconButton
                  icon={<Icon.Close className="w-5 h-5" />}
                  label="Cerrar"
                  variant="secondary"
                  onClick={() => setSelectedMovie(null)}
                />
              </div>

              <div className="w-full max-w-2xl">
                <MovieDetailSVG
                  ref={movieSvgRef}
                  movie={selectedMovie}
                  connectionCount={selectedMovieConnCount}
                />
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
                <Button
                  onClick={downloadMovieAsImage}
                  loading={movieDownloading}
                  fullWidth
                  size="lg"
                  iconLeft={<Icon.Download className="w-4 h-4" />}
                >
                  {movieDownloading ? 'Generando...' : 'Descargar PNG'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={shareMoviePoster}
                  fullWidth
                  size="lg"
                  iconLeft={<Icon.Share className="w-4 h-4" />}
                >
                  Compartir
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Creations grid (Comunidad / Mis creaciones)
// ─────────────────────────────────────────────────────────────────────────────

function CreationsGrid({
  items,
  loading,
  emptyTitle,
  emptyDescription,
  showCreator = false,
  showVisibility = false,
  onOpen,
  onLoadMore,
}: {
  items: CreationWithMeta[]
  loading: boolean
  emptyTitle: string
  emptyDescription: string
  showCreator?: boolean
  showVisibility?: boolean
  onOpen: (c: CreationWithMeta) => void
  onLoadMore: (() => void) | null
}) {
  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon={<Icon.Sparkles className="w-12 h-12" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {items.map((c) => (
          <CreationCard
            key={c.id}
            creation={c}
            showCreator={showCreator}
            showVisibility={showVisibility}
            onClick={() => onOpen(c)}
          />
        ))}
      </div>
      {loading && (
        <div className="py-8">
          <LoadingState text="Cargando..." size="md" />
        </div>
      )}
      {onLoadMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={onLoadMore}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  )
}

function CreationCard({
  creation,
  showCreator,
  showVisibility,
  onClick,
}: {
  creation: CreationWithMeta
  showCreator: boolean
  showVisibility: boolean
  onClick: () => void
}) {
  const posters = creation.previewPosters.slice(0, 6)
  const themeLabel =
    creation.theme_id && creation.theme_id !== 'custom'
      ? THEMES.find((t) => t.id === creation.theme_id)?.title || 'CineBret'
      : 'Personalizado'
  return (
    <Card
      as="button"
      padding="none"
      interactive
      onClick={onClick}
      className="overflow-hidden border border-zinc-800 hover:border-yellow-400/40 text-left"
    >
      {/* Poster thumbnail grid */}
      <div className="relative aspect-[4/3] bg-zinc-950 grid grid-cols-3 grid-rows-2 gap-[2px]">
        {posters.length === 0 && (
          <div className="col-span-3 row-span-2 flex items-center justify-center text-zinc-700">
            <Icon.Film className="w-10 h-10" />
          </div>
        )}
        {posters.map((p, i) => (
          <div key={i} className="relative overflow-hidden bg-zinc-900">
            <img
              src={`https://image.tmdb.org/t/p/w154${p}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/10 to-transparent pointer-events-none" />
        {showVisibility && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-zinc-950/80 border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-yellow-400">
            {creation.is_public ? (
              <>
                <Icon.Users className="w-3 h-3" />
                <span>Público</span>
              </>
            ) : (
              <>
                <Icon.Lock className="w-3 h-3" />
                <span>Privado</span>
              </>
            )}
          </div>
        )}
      </div>
      {/* Meta */}
      <div className="p-4 space-y-2">
        <h3 className="text-sm font-bold text-white line-clamp-1">{creation.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400/80 line-clamp-1">
            {themeLabel}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0">
            {(creation.movie_ids || []).length} pelis
          </span>
        </div>
        {showCreator && creation.creator && (
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
            <div className="w-6 h-6 rounded-full bg-zinc-800 overflow-hidden shrink-0">
              {creation.creator.avatar_url ? (
                <img
                  src={creation.creator.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                  <Icon.User className="w-3 h-3" />
                </div>
              )}
            </div>
            <span className="text-xs text-zinc-400 line-clamp-1">
              {creation.creator.username || 'anónimo'}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme card
// ─────────────────────────────────────────────────────────────────────────────

function ThemeCard({
  theme,
  index,
  previewPoster,
  onClick,
}: {
  theme: Theme
  index: number
  previewPoster: string | null
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -2 }}
      className="group relative h-28 overflow-hidden rounded-2xl text-left bg-zinc-900 border border-zinc-800 transition-all duration-300 hover:border-yellow-400/50 hover:shadow-xl hover:shadow-yellow-400/10 cursor-pointer"
    >
      {/* Background poster */}
      {previewPoster ? (
        <Image
          src={`https://image.tmdb.org/t/p/w500${previewPoster}`}
          alt=""
          fill
          sizes="(min-width:640px) 50vw, 100vw"
          className="object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-500"
          style={{ filter: 'blur(8px)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/70 to-zinc-950/30" />

      {/* Content — compact horizontal */}
      <div className="relative z-10 h-full flex items-center gap-4 px-5">
        <div className="shrink-0 w-14 h-14 rounded-xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center">
          <svg
            width="26"
            height="26"
            viewBox="0 0 32 32"
            fill="none"
            className="text-yellow-400 group-hover:rotate-12 transition-transform duration-300"
            aria-hidden
          >
            <circle cx="16" cy="16" r="3" fill="currentColor" />
            <circle cx="6" cy="6" r="2" fill="currentColor" />
            <circle cx="26" cy="6" r="2" fill="currentColor" />
            <circle cx="6" cy="26" r="2" fill="currentColor" />
            <circle cx="26" cy="26" r="2" fill="currentColor" />
            <line x1="16" y1="16" x2="6" y2="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="16" y1="16" x2="26" y2="6" stroke="currentColor" strokeWidth="1.5" />
            <line x1="16" y1="16" x2="6" y2="26" stroke="currentColor" strokeWidth="1.5" />
            <line x1="16" y1="16" x2="26" y2="26" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-black text-white leading-tight line-clamp-1">
            {theme.title}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 line-clamp-1">{theme.subtitle}</p>
          <p className="mt-1 text-[10px] font-semibold tracking-wider uppercase text-yellow-400/80">
            15 películas · Ver red
          </p>
        </div>
        <Icon.ArrowRight className="w-4 h-4 text-yellow-400 shrink-0 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Poster SVG
// ─────────────────────────────────────────────────────────────────────────────

type PosterSVGProps = {
  theme: Theme
  movies: PosterMovie[]
  connections: Connection[]
  positions: { x: number; y: number }[]
  onMovieClick?: (movie: PosterMovie) => void
}

const PosterSVG = forwardRef<SVGSVGElement, PosterSVGProps>(function PosterSVG(
  { theme, movies, connections, positions, onMovieClick }: PosterSVGProps,
  ref: Ref<SVGSVGElement>,
) {
  const radius = 56
  const ringStroke = 5
  const headerH = 220
  const footerH = 130

  return (
      <svg
        ref={ref}
        id="poster-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
        className="w-full h-auto rounded-2xl shadow-2xl shadow-black/60"
        style={{ display: 'block' }}
      >
        {/* Background gradient */}
        <defs>
          <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c0a09" />
            <stop offset="50%" stopColor="#1c1917" />
            <stop offset="100%" stopColor="#0c0a09" />
          </linearGradient>
          <linearGradient id="header-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c0a09" />
            <stop offset="100%" stopColor="#1c1917" />
          </linearGradient>
          {/* clipPaths for each poster */}
          {movies.map((_, i) => {
            const p = positions[i]
            if (!p) return null
            return (
              <clipPath id={`clip-poster-${i}`} key={`clip-${i}`}>
                <circle cx={p.x} cy={p.y} r={radius} />
              </clipPath>
            )
          })}
        </defs>

        {/* Background */}
        <rect width={POSTER_W} height={POSTER_H} fill="url(#bg-grad)" />

        {/* Header band */}
        <rect width={POSTER_W} height={headerH} fill="url(#header-grad)" />
        <line x1="60" y1={headerH} x2={POSTER_W - 60} y2={headerH} stroke="#facc15" strokeWidth="3" />

        {/* CineBret logo top-left */}
        <g>
          <image
            href="/logo-oficial.png"
            x="60"
            y="50"
            width="120"
            height="80"
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            x="200"
            y="92"
            fill="#FAFAF9"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="34"
            fontWeight="900"
            letterSpacing="2"
          >
            CINEBRET
          </text>
          <text
            x="200"
            y="120"
            fill="#a8a29e"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="18"
            fontWeight="600"
            letterSpacing="3"
          >
            POSTERS · INFOGRAFÍA
          </text>
        </g>

        {/* Theme title */}
        <text
          x={POSTER_W / 2}
          y={headerH - 20}
          textAnchor="middle"
          fill="#FAFAF9"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="56"
          fontWeight="900"
          letterSpacing="-1"
        >
          {theme.title.toUpperCase()}
        </text>

        {/* Connections */}
        <g>
          {connections.map((c, i) => {
            const a = positions[c.source]
            const b = positions[c.target]
            if (!a || !b) return null
            const sw = Math.min(7, 2 + c.strength * 1.2)
            return (
              <line
                key={`conn-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#FAFAF9"
                strokeWidth={sw}
                strokeOpacity={0.7 + Math.min(0.3, c.strength * 0.1)}
                strokeLinecap="round"
              />
            )
          })}
        </g>

        {/* Movie nodes */}
        {movies.map((m, i) => {
          const p = positions[i]
          if (!p) return null
          return (
            <g
              key={`node-${m.id}`}
              onClick={onMovieClick ? () => onMovieClick(m) : undefined}
              style={onMovieClick ? { cursor: 'pointer' } : undefined}
            >
              {/* Subtle outer glow */}
              <circle cx={p.x} cy={p.y} r={radius + 14} fill={m.groupColor} opacity="0.12" />
              {/* Poster */}
              <image
                href={`/api/tmdb-image?path=${encodeURIComponent(m.poster_path)}&size=w342`}
                x={p.x - radius}
                y={p.y - radius}
                width={radius * 2}
                height={radius * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#clip-poster-${i})`}
              />
              {/* Ring */}
              <circle
                cx={p.x}
                cy={p.y}
                r={radius + ringStroke / 2}
                fill="none"
                stroke={m.groupColor}
                strokeWidth={ringStroke}
              />
              {/* Label background pill */}
              <g>
                <rect
                  x={p.x - 42}
                  y={p.y + radius + 12}
                  width="84"
                  height="32"
                  rx="16"
                  fill="#0c0a09"
                  stroke={m.groupColor}
                  strokeWidth="2"
                />
                <text
                  x={p.x}
                  y={p.y + radius + 33}
                  textAnchor="middle"
                  fill="#FAFAF9"
                  fontFamily="Inter, system-ui, sans-serif"
                  fontSize="18"
                  fontWeight="900"
                  letterSpacing="1.5"
                >
                  {m.shortLabel}
                </text>
              </g>
            </g>
          )
        })}

        {/* Footer band */}
        <rect x="0" y={POSTER_H - footerH} width={POSTER_W} height={footerH} fill="#0c0a09" />
        <line x1="60" y1={POSTER_H - footerH} x2={POSTER_W - 60} y2={POSTER_H - footerH} stroke="#facc15" strokeWidth="3" />
        <text
          x="60"
          y={POSTER_H - footerH + 56}
          fill="#FAFAF9"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="26"
          fontWeight="800"
          letterSpacing="0.5"
        >
          {theme.caption}
        </text>
        <text
          x="60"
          y={POSTER_H - footerH + 92}
          fill="#a8a29e"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="18"
          fontWeight="600"
          letterSpacing="1"
        >
          Conectadas por similitud en CineBret
        </text>
        <text
          x={POSTER_W - 60}
          y={POSTER_H - 40}
          textAnchor="end"
          fill="#facc15"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="22"
          fontWeight="900"
          letterSpacing="1.5"
        >
          cinebret.cl
        </text>
      </svg>
    )
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Individual movie detail poster SVG
// ─────────────────────────────────────────────────────────────────────────────

type MovieDetailSVGProps = {
  movie: PosterMovie
  connectionCount: number
}

function formatRuntime(mins: number | null): string | null {
  if (!mins || mins <= 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

function parseOscarInfo(oscars: string | null): string | null {
  if (!oscars || oscars === 'N/A') return null
  const o = oscars.toLowerCase()
  const wonMatch = o.match(/gan(?:ó|o)\s+(\d+)/i)
  if (wonMatch) {
    const n = parseInt(wonMatch[1])
    return `${n} OSCAR${n === 1 ? '' : 'S'} GANADOS`
  }
  if (o.startsWith('ganó') || o.startsWith('gano')) {
    return '1 OSCAR GANADO'
  }
  const nomMatch = o.match(/(\d+)\s+nominaci/i)
  if (nomMatch) {
    const n = parseInt(nomMatch[1])
    return `${n} NOMINACIONES`
  }
  if (o.includes('nominad')) {
    return 'NOMINADA AL OSCAR'
  }
  return null
}

const PLATFORM_LOGOS_PNG: Record<string, string> = {
  netflix: '/netflix.png',
  disney_plus: '/disney_plus.svg',
  hbo_max: '/hbo_max.png',
  amazon_prime: '/amazon_prime.png',
  apple_tv: '/apple_tv.png',
  paramount_plus: '/paramount_plus.svg',
  mubi: '/mubi.png',
  crunchyroll: '/crunchyroll.png',
}

const MovieDetailSVG = forwardRef<SVGSVGElement, MovieDetailSVGProps>(function MovieDetailSVG(
  { movie }: MovieDetailSVGProps,
  ref: Ref<SVGSVGElement>,
) {
  const headerH = 220
  const footerH = 130

  // Poster box dims/position
  const posterW = 520
  const posterH = 780
  const posterX = (POSTER_W - posterW) / 2
  const posterY = headerH + 40

  const title = movie.titulo_ingles || movie.titulo
  const titleDisplay = truncate(title, 22).toUpperCase()
  const genrePills = (movie.genres || []).slice(0, 4)
  const castTop = (movie.actors || []).slice(0, 3).join(', ')
  const runtimeStr = formatRuntime(movie.runtime)

  // Meta rows baseline under poster
  const metaStartY = posterY + posterH + 90

  // Genre pills layout (centered)
  const pillHeight = 40
  const pillPaddingX = 22
  const pillGap = 12
  const approxCharW = 11
  const pillWidths = genrePills.map((g) => Math.max(90, g.length * approxCharW + pillPaddingX * 2))
  const pillsTotalW = pillWidths.reduce((a, b) => a + b, 0) + pillGap * Math.max(0, pillWidths.length - 1)
  let pillCursorX = (POSTER_W - pillsTotalW) / 2
  const pillsY = posterY + posterH + 22

  return (
    <svg
      ref={ref}
      id="movie-detail-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
      className="w-full h-auto rounded-2xl shadow-2xl shadow-black/60"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="md-bg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c0a09" />
          <stop offset="50%" stopColor="#1c1917" />
          <stop offset="100%" stopColor="#0c0a09" />
        </linearGradient>
        <linearGradient id="md-header-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c0a09" />
          <stop offset="100%" stopColor="#1c1917" />
        </linearGradient>
        <clipPath id="md-poster-clip">
          <rect x={posterX} y={posterY} width={posterW} height={posterH} rx="24" ry="24" />
        </clipPath>
      </defs>

      {/* Background */}
      <rect width={POSTER_W} height={POSTER_H} fill="url(#md-bg-grad)" />

      {/* Header band */}
      <rect width={POSTER_W} height={headerH} fill="url(#md-header-grad)" />
      <line x1="60" y1={headerH} x2={POSTER_W - 60} y2={headerH} stroke="#facc15" strokeWidth="3" />

      {/* Logo + wordmark */}
      <g>
        <image
          href="/logo-oficial.png"
          x="60"
          y="50"
          width="120"
          height="80"
          preserveAspectRatio="xMidYMid meet"
        />
        <text
          x="200"
          y="92"
          fill="#FAFAF9"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="34"
          fontWeight="900"
          letterSpacing="2"
        >
          CINEBRET
        </text>
        <text
          x="200"
          y="120"
          fill="#a8a29e"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="18"
          fontWeight="600"
          letterSpacing="3"
        >
          POSTERS · PELÍCULA
        </text>
      </g>

      {/* Movie title */}
      <text
        x={POSTER_W / 2}
        y={headerH - 52}
        textAnchor="middle"
        fill="#FAFAF9"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={titleDisplay.length > 16 ? 48 : 58}
        fontWeight="900"
        letterSpacing="-1"
      >
        {titleDisplay}
      </text>

      {/* Rating row: IMDb logo + score · year · oscars */}
      {(() => {
        const oscarText = parseOscarInfo(movie.oscars)
        const ratingY = headerH - 24
        const cx = POSTER_W / 2
        // Estimate widths: IMDb badge ~80, gap, rating, gap, year, gap, oscar
        const ratingStr = movie.nota_imdb ? movie.nota_imdb.toFixed(1) : ''
        const yearStr = movie.anio ? `${movie.anio}` : ''
        const parts: { text: string; w: number }[] = []
        if (ratingStr) parts.push({ text: ratingStr, w: ratingStr.length * 14 + 10 })
        if (yearStr) parts.push({ text: yearStr, w: yearStr.length * 14 })
        if (oscarText) parts.push({ text: oscarText, w: oscarText.length * 12 })
        const sepW = 30
        const imdbW = 64
        const totalW = imdbW + 10 + parts.reduce((s, p, i) => s + p.w + (i > 0 ? sepW : 0), 0)
        let cursorX = cx - totalW / 2
        return (
          <g>
            {/* IMDb badge */}
            <rect x={cursorX} y={ratingY - 22} width={imdbW} height={28} rx="4" ry="4" fill="#f5c518" />
            <text
              x={cursorX + imdbW / 2}
              y={ratingY - 1}
              textAnchor="middle"
              fill="#000000"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="20"
              fontWeight="900"
              letterSpacing="0.5"
            >
              IMDb
            </text>
            {(() => {
              cursorX += imdbW + 10
              return parts.map((p, i) => {
                const elements = []
                if (i > 0) {
                  elements.push(
                    <text
                      key={`sep-${i}`}
                      x={cursorX + sepW / 2}
                      y={ratingY}
                      textAnchor="middle"
                      fill="#facc15"
                      fontFamily="Inter, system-ui, sans-serif"
                      fontSize="22"
                      fontWeight="700"
                    >
                      ·
                    </text>,
                  )
                  cursorX += sepW
                }
                elements.push(
                  <text
                    key={`part-${i}`}
                    x={cursorX}
                    y={ratingY}
                    fill="#facc15"
                    fontFamily="Inter, system-ui, sans-serif"
                    fontSize="22"
                    fontWeight="700"
                    letterSpacing="1"
                  >
                    {p.text}
                  </text>,
                )
                cursorX += p.w
                return <g key={`group-${i}`}>{elements}</g>
              })
            })()}
          </g>
        )
      })()}

      {/* Colored glow behind poster */}
      <rect
        x={posterX - 18}
        y={posterY - 18}
        width={posterW + 36}
        height={posterH + 36}
        rx="32"
        ry="32"
        fill={movie.groupColor}
        opacity="0.14"
      />

      {/* Poster image (clipped to rounded rect) */}
      <image
        href={`/api/tmdb-image?path=${encodeURIComponent(movie.poster_path)}&size=w500`}
        x={posterX}
        y={posterY}
        width={posterW}
        height={posterH}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#md-poster-clip)"
      />

      {/* Ring border around poster */}
      <rect
        x={posterX}
        y={posterY}
        width={posterW}
        height={posterH}
        rx="24"
        ry="24"
        fill="none"
        stroke={movie.groupColor}
        strokeWidth="6"
      />

      {/* Genre pills below poster */}
      {genrePills.map((g, i) => {
        const w = pillWidths[i]
        const x = pillCursorX
        pillCursorX += w + pillGap
        return (
          <g key={`pill-${i}`}>
            <rect
              x={x}
              y={pillsY}
              width={w}
              height={pillHeight}
              rx={pillHeight / 2}
              ry={pillHeight / 2}
              fill="#0c0a09"
              stroke={movie.groupColor}
              strokeWidth="2"
            />
            <text
              x={x + w / 2}
              y={pillsY + pillHeight / 2 + 7}
              textAnchor="middle"
              fill="#FAFAF9"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="18"
              fontWeight="700"
              letterSpacing="0.5"
            >
              {g}
            </text>
          </g>
        )
      })}

      {/* Meta info (DIR, CAST, runtime/decade) */}
      {movie.director && (
        <g>
          <text
            x={60}
            y={metaStartY}
            fill="#a8a29e"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="16"
            fontWeight="700"
            letterSpacing="2.5"
          >
            DIR.
          </text>
          <text
            x={130}
            y={metaStartY}
            fill="#FAFAF9"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="20"
            fontWeight="700"
          >
            {truncate(movie.director, 42)}
          </text>
        </g>
      )}

      {castTop && (
        <g>
          <text
            x={60}
            y={metaStartY + 34}
            fill="#a8a29e"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="16"
            fontWeight="700"
            letterSpacing="2.5"
          >
            CAST.
          </text>
          <text
            x={130}
            y={metaStartY + 34}
            fill="#FAFAF9"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="20"
            fontWeight="700"
          >
            {truncate(castTop, 42)}
          </text>
        </g>
      )}

      {/* Compositor row */}
      {movie.compositor && (
        <g>
          <text
            x={60}
            y={metaStartY + 68}
            fill="#a8a29e"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="16"
            fontWeight="700"
            letterSpacing="2.5"
          >
            MÚSICA
          </text>
          <text
            x={170}
            y={metaStartY + 68}
            fill="#FAFAF9"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="20"
            fontWeight="700"
          >
            {truncate(movie.compositor, 38)}
          </text>
        </g>
      )}
      {runtimeStr && (
        <text
          x={60}
          y={metaStartY + 102}
          fill="#a8a29e"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="18"
          fontWeight="600"
          letterSpacing="1"
        >
          {runtimeStr}
        </text>
      )}

      {/* Footer band */}
      <rect x="0" y={POSTER_H - footerH} width={POSTER_W} height={footerH} fill="#0c0a09" />
      <line x1="60" y1={POSTER_H - footerH} x2={POSTER_W - 60} y2={POSTER_H - footerH} stroke="#facc15" strokeWidth="3" />

      {/* Platforms — only render if there are any */}
      {(() => {
        const plats = (movie.platforms || []).filter((p) => PLATFORM_LOGOS_PNG[p]).slice(0, 6)
        if (plats.length === 0) return null
        const logoSize = 56
        const gap = 16
        const startX = 60
        const labelY = POSTER_H - footerH + 50
        const logoY = POSTER_H - footerH + 60
        return (
          <g>
            <text
              x={startX}
              y={labelY}
              fill="#a8a29e"
              fontFamily="Inter, system-ui, sans-serif"
              fontSize="14"
              fontWeight="700"
              letterSpacing="2.5"
            >
              DISPONIBLE EN
            </text>
            {plats.map((p, i) => (
              <g key={p}>
                <rect
                  x={startX + i * (logoSize + gap)}
                  y={logoY}
                  width={logoSize}
                  height={logoSize}
                  rx="10"
                  ry="10"
                  fill="#FAFAF9"
                />
                <image
                  href={PLATFORM_LOGOS_PNG[p]}
                  x={startX + i * (logoSize + gap) + 6}
                  y={logoY + 6}
                  width={logoSize - 12}
                  height={logoSize - 12}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            ))}
          </g>
        )
      })()}

      <text
        x={POSTER_W - 60}
        y={POSTER_H - 40}
        textAnchor="end"
        fill="#facc15"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="22"
        fontWeight="900"
        letterSpacing="1.5"
      >
        cinebret.cl
      </text>
    </svg>
  )
})
