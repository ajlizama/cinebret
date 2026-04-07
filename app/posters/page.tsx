'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

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
  enriquecimiento: {
    director: string | null
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
  director: string | null
  actors: string[]
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
  id, titulo, titulo_ingles, poster_path, anio, nota_imdb, oscars,
  enriquecimiento (director, generos, cast_json)
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
    director,
    actors,
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
    { count: 6, r: 200 },
    { count: 13, r: 400 },
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
    subtitle: 'Top 20 según puntuación',
    caption: 'Las películas mejor valoradas en IMDB',
    groupBy: 'decade',
    build: async () => {
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .not('nota_imdb', 'is', null)
        .order('nota_imdb', { ascending: false })
        .limit(20)
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
      const { data, error } = await supabase
        .from('peliculas')
        .select(SELECT_FIELDS)
        .not('poster_path', 'is', null)
        .ilike('oscars', 'Ganó Mejor Película%')
        .order('anio', { ascending: false })
        .limit(60)
      if (error) throw error
      // Filter out Animada and Internacional/Extranjera
      const filtered = (data || []).filter((m: any) => {
        const o = (m.oscars || '').toLowerCase()
        return !o.includes('animad') && !o.includes('internacional') && !o.includes('extranjera') && !o.includes('habla no inglesa')
      })
      return filtered.slice(0, 20) as unknown as RawMovie[]
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
        .limit(20)
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
        return filtered.slice(0, 20)
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
        .limit(20)
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
        .limit(20)
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
      return filtered.slice(0, 20)
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
      return filtered.slice(0, 20)
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
      return filtered.slice(0, 20)
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
        .limit(20)
      if (error) throw error
      return (data || []) as unknown as RawMovie[]
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PostersPage() {
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
      const sliced = posterMovies.slice(0, 20)
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
      const sliced = posterMovies.slice(0, 20)
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
    setMovies([])
    setConnections([])
    setError(null)
  }

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
    <div className="min-h-[100dvh] bg-stone-50 text-stone-900">
      <Nav />

      {/* ───────────── Theme selector ───────────── */}
      {!activeTheme && (
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-24">
          <header className="mb-12 sm:mb-16">
            <div className="flex items-center gap-3 mb-4">
              <span
                aria-hidden
                className="inline-block h-8 w-1.5 rounded-full"
                style={{ background: '#CA8A04' }}
              />
              <span className="text-xs font-semibold tracking-[0.2em] uppercase text-stone-500">
                Infografías visuales
              </span>
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-stone-900 leading-[0.95]">
              CineBret <span style={{ color: '#CA8A04' }}>Posters</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg sm:text-xl text-stone-600 leading-relaxed">
              Genera infografías visuales de cómo se conectan películas según el grafo de similitud de CineBret.
              Listas para compartir en Instagram.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Custom theme card */}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="group relative aspect-[4/5] rounded-2xl overflow-hidden bg-gradient-to-br from-yellow-500 to-amber-700 cursor-pointer hover:scale-[1.02] transition-transform duration-300"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-900 p-6">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <h3 className="text-2xl font-black mb-1">Crear tu poster</h3>
                <p className="text-sm font-semibold text-zinc-800 text-center">Elige tus propias películas</p>
                <p className="text-xs text-zinc-700 mt-3">Hasta 20 películas</p>
              </div>
            </button>

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
        </main>
      )}

      {/* ───────────── Custom builder modal ───────────── */}
      <AnimatePresence>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setCustomOpen(false)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-lg">Crear tu poster</h3>
                  <button onClick={() => setCustomOpen(false)} className="text-zinc-500 hover:text-white text-sm">✕</button>
                </div>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Título del poster (ej: Mis favoritas de los 80s)"
                  maxLength={40}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-[16px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400 mb-3"
                />
                <p className="text-zinc-400 text-xs mb-3">{customSelected.length}/20 películas seleccionadas</p>
                <input
                  type="text"
                  value={customSearch}
                  onChange={(e) => setCustomSearch(e.target.value)}
                  placeholder="Buscar película..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-[16px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Selected pills */}
              {customSelected.length > 0 && (
                <div className="p-4 border-b border-zinc-800 max-h-32 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {customSelected.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setCustomSelected((prev) => prev.filter((x) => x.id !== m.id))}
                        className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 rounded-full px-3 py-1 text-xs hover:bg-yellow-400/20 transition"
                      >
                        {m.titulo_ingles || m.titulo} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search results */}
              <div className="flex-1 overflow-y-auto p-4">
                {customLoading && <p className="text-zinc-500 text-xs text-center">Buscando...</p>}
                {!customLoading && customSearch.length >= 2 && customResults.length === 0 && (
                  <p className="text-zinc-500 text-xs text-center">Sin resultados</p>
                )}
                <div className="space-y-2">
                  {customResults.map((m) => {
                    const isSelected = customSelected.some((x) => x.id === m.id)
                    const isFull = customSelected.length >= 20
                    return (
                      <button
                        key={m.id}
                        disabled={isSelected || (isFull && !isSelected)}
                        onClick={() => {
                          if (!isSelected && customSelected.length < 20) {
                            setCustomSelected((prev) => [...prev, m])
                            setCustomSearch('')
                            setCustomResults([])
                          }
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-left transition"
                      >
                        <div className="w-10 h-14 rounded overflow-hidden bg-zinc-800 shrink-0">
                          {m.poster_path && <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium line-clamp-1">{m.titulo_ingles || m.titulo}</p>
                          <p className="text-zinc-500 text-xs">{m.anio} · ⭐ {m.nota_imdb}</p>
                        </div>
                        {isSelected && <span className="text-yellow-400 text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Action footer */}
              <div className="p-4 border-t border-zinc-800 flex gap-2">
                <button
                  onClick={() => { setCustomSelected([]); setCustomSearch(''); setCustomResults([]) }}
                  className="px-4 py-2.5 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700 transition"
                >
                  Limpiar
                </button>
                <button
                  onClick={buildCustomTheme}
                  disabled={customSelected.length < 2}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold py-2.5 rounded-lg text-sm transition"
                >
                  Generar poster ({customSelected.length})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───────────── Poster view ───────────── */}
      <AnimatePresence>
        {activeTheme && (
          <motion.div
            key="poster-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 overflow-y-auto"
            style={{
              background: 'linear-gradient(180deg, #0c0a09 0%, #1c1917 60%, #0c0a09 100%)',
            }}
          >
            <Nav active="inicio" />
            <div className="min-h-[100dvh] flex flex-col items-center pt-4 pb-16">
              {/* Top bar */}
              <div className="w-full max-w-2xl flex items-center justify-between mb-6 px-4">
                <button
                  type="button"
                  onClick={closePoster}
                  className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-700 hover:border-yellow-400/50 text-white transition-colors duration-200 text-sm font-semibold rounded-lg px-4 py-2 cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 12H5" />
                    <path d="m12 19-7-7 7-7" />
                  </svg>
                  Volver a temas
                </button>
              </div>

              {/* Poster card */}
              <div className="w-full">
                {loading ? (
                  <div
                    className="w-full rounded-2xl flex items-center justify-center bg-stone-900/60 border border-stone-800"
                    style={{ aspectRatio: '4 / 5' }}
                  >
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-stone-700 border-t-yellow-400 animate-spin" />
                      <p className="text-stone-400 text-sm font-semibold tracking-wider uppercase">Construyendo red…</p>
                    </div>
                  </div>
                ) : error ? (
                  <div
                    className="w-full rounded-2xl flex items-center justify-center bg-stone-900/60 border border-red-900/50 p-8"
                    style={{ aspectRatio: '4 / 5' }}
                  >
                    <p className="text-red-300 text-center text-sm">{error}</p>
                  </div>
                ) : (
                  <PosterSVG
                    ref={svgRef}
                    theme={activeTheme}
                    movies={movies}
                    connections={connections}
                    positions={positions}
                  />
                )}
              </div>

              {/* Action buttons */}
              {!loading && !error && movies.length > 0 && (
                <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-2xl px-4">
                  <button
                    type="button"
                    onClick={downloadAsImage}
                    disabled={downloading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-stone-900 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: '#facc15' }}
                  >
                    {downloading ? (
                      <>
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-stone-900/30 border-t-stone-900 animate-spin" />
                        Generando…
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Descargar PNG
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={sharePoster}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold text-white border border-stone-700 hover:bg-stone-800 transition-colors duration-200"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    Compartir
                  </button>
                </div>
              )}

              {/* Hint */}
              {!loading && !error && movies.length > 0 && (
                <p className="mt-6 text-center text-xs text-stone-500 max-w-md px-4">
                  Las líneas conectan películas similares según el grafo de CineBret (mismos keywords, género, director, etc). Mientras más gruesa, más fuerte la conexión.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-2xl text-left bg-stone-900 border border-stone-800 transition-all duration-300 hover:border-yellow-500/50 hover:shadow-2xl hover:shadow-yellow-500/10"
      style={{ aspectRatio: '4 / 5' }}
    >
      {/* Background poster */}
      {previewPoster ? (
        <Image
          src={`https://image.tmdb.org/t/p/w500${previewPoster}`}
          alt=""
          fill
          sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
          className="object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-500"
          style={{ filter: 'blur(8px)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-900" />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(12,10,9,0.4) 0%, rgba(12,10,9,0.95) 100%)' }} />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-8">
        <div>
          <span
            className="inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase text-stone-900 mb-4"
            style={{ background: '#facc15' }}
          >
            Tema {String(index + 1).padStart(2, '0')}
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
            {theme.title}
          </h2>
          <p className="mt-2 text-sm text-stone-300/90 leading-relaxed">{theme.subtitle}</p>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-stone-500">
              ~20 películas
            </p>
            <p className="mt-1 text-sm font-bold text-yellow-400 group-hover:text-yellow-300 transition-colors">
              Ver red →
            </p>
          </div>
          <svg
            width="32"
            height="32"
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
}

const PosterSVG = forwardRef<SVGSVGElement, PosterSVGProps>(function PosterSVG(
  { theme, movies, connections, positions }: PosterSVGProps,
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
            <g key={`node-${m.id}`}>
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
