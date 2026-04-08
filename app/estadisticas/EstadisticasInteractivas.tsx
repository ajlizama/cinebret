'use client'

import { useMemo, useState } from 'react'
import {
  PageHeader,
  Card,
  FilterChips,
  PlatformLogo,
  type Platform,
  Icon,
} from '@/components/ui'

export type AnalisisCatalogo = {
  plataformas: Record<string, string>
  comparativo: string
  fecha_catalogo: string
  created_at: string
} | null

export type PeliculaRow = {
  id: string
  titulo: string
  titulo_ingles: string | null
  nota_imdb: number | null
  oscars: string | null
  categoria: string | null
  director: string | null
  director_oscars: number | null
  actores: string | null
  actores_oscars: Record<string, number> | null
  compositor: string | null
  compositor_oscars: number | null
  generos: string[]
  plataformas: string[]
  es_review_autor: boolean
}

type Plataforma = { id: string; nombre: string }

type Props = {
  peliculas: PeliculaRow[]
  plataformas: Plataforma[]
  analisis: AnalisisCatalogo
}

type PlatData = {
  id: string
  nombre: string
  count: number
  avgImdb: number | null
  oscarWinners: number
  generos: Record<string, number>
  categorias: Record<string, number>
}

const CAT_LABELS: Record<string, string> = {
  "Pa'l domingo de bajón": 'Domingo de bajón',
  "Pa' saltar del sillón": 'Saltar del sillón',
  "Pa' quedar con el cerebro como licuadora": 'Cerebro licuadora',
  "Pa' llorar a moco tendido": 'Llorar a moco tendido',
}

// Constrained gold-derived palette for categories — 4 distinct hues that
// still feel like the same family.
const CAT_COLORS: Record<string, string> = {
  "Pa'l domingo de bajón": 'bg-yellow-400',
  "Pa' saltar del sillón": 'bg-yellow-600',
  "Pa' quedar con el cerebro como licuadora": 'bg-yellow-200',
  "Pa' llorar a moco tendido": 'bg-amber-700',
}

// Genre palette: gold-anchored, 8 distinguishable shades. Charts can use
// multi-color when meaning is encoded — see DESIGN_BRIEF risk #3.
const GENRE_COLORS_PALETTE = [
  'bg-yellow-400',
  'bg-yellow-600',
  'bg-yellow-200',
  'bg-amber-700',
  'bg-yellow-300',
  'bg-yellow-700',
  'bg-amber-500',
  'bg-yellow-500',
]

const GENRE_COLOR_MAP: Record<string, string> = {
  Drama: GENRE_COLORS_PALETTE[0],
  Comedia: GENRE_COLORS_PALETTE[1],
  Acción: GENRE_COLORS_PALETTE[2],
  Thriller: GENRE_COLORS_PALETTE[3],
  Aventura: GENRE_COLORS_PALETTE[4],
  Crimen: GENRE_COLORS_PALETTE[5],
  Romance: GENRE_COLORS_PALETTE[6],
  Animación: GENRE_COLORS_PALETTE[7],
  'Ciencia ficción': 'bg-yellow-400/80',
  Familia: 'bg-yellow-600/80',
  Terror: 'bg-amber-700/80',
  Fantasía: 'bg-yellow-300/80',
  Misterio: 'bg-yellow-500/80',
  Guerra: 'bg-amber-500/80',
  Biografía: 'bg-yellow-200/80',
  Historia: 'bg-yellow-700/80',
  Música: 'bg-yellow-400/60',
  Documental: 'bg-yellow-600/60',
  Western: 'bg-amber-700/60',
  Deporte: 'bg-yellow-300/60',
  Musical: 'bg-yellow-500/60',
}

function genreColor(genre: string): string {
  return GENRE_COLOR_MAP[genre] ?? 'bg-zinc-600'
}

const GENRE_NORMALIZE: Record<string, string> = {
  Action: 'Acción', Accion: 'Acción',
  Comedy: 'Comedia',
  Adventure: 'Aventura',
  Animation: 'Animación', Animacion: 'Animación',
  Crime: 'Crimen',
  Horror: 'Terror',
  Biography: 'Biografía', Biografia: 'Biografía', 'Biográfico': 'Biografía',
  'Sci-Fi': 'Ciencia ficción', 'Science Fiction': 'Ciencia ficción',
  'Ciencia Ficción': 'Ciencia ficción', 'Ciencia Ficcion': 'Ciencia ficción',
  Mystery: 'Misterio',
  Family: 'Familia', Familiar: 'Familia',
  Fantasy: 'Fantasía', Fantasia: 'Fantasía',
  History: 'Historia',
  War: 'Guerra',
  Sport: 'Deporte', Deportes: 'Deporte', Sports: 'Deporte',
  Music: 'Música', Musica: 'Música',
  Documentary: 'Documental',
  Unknown: 'Otros', Desconocido: 'Otros',
}
function normalizeGenre(g: string): string {
  return GENRE_NORMALIZE[g] ?? g
}

function StackedBar({
  segments,
  total,
  showTopN = 6,
}: {
  segments: { label: string; value: number; color: string }[]
  total: number
  showTopN?: number
}) {
  return (
    <div className="w-full h-7 bg-zinc-800 rounded-full overflow-hidden flex">
      {segments.map((s, i) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0
        if (pct < 2) return null
        const showNumber = i < showTopN || pct > 8
        return (
          <div
            key={i}
            className={`${s.color} h-full relative group`}
            style={{ width: `${pct}%`, minWidth: showNumber ? '28px' : undefined }}
            title={`${s.label}: ${Math.round(pct)}%`}
          >
            {showNumber && (
              <span className="absolute inset-0 flex items-center justify-center text-zinc-950 text-[9px] font-bold drop-shadow-sm">
                {Math.round(pct)}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function EstadisticasInteractivas({ peliculas, plataformas, analisis }: Props) {
  const [selectedPlat, setSelectedPlat] = useState<string>('todas')

  const platData = useMemo((): PlatData[] => {
    return plataformas.map((plat) => {
      const movies = peliculas.filter((p) => p.plataformas.includes(plat.id))
      const conImdb = movies.filter((p) => p.nota_imdb != null)
      const avgImdb =
        conImdb.length > 0
          ? Math.round((conImdb.reduce((s, p) => s + p.nota_imdb!, 0) / conImdb.length) * 10) / 10
          : null

      const generos: Record<string, number> = {}
      const categorias: Record<string, number> = {}
      let oscarWinners = 0

      movies.forEach((p) => {
        p.generos.forEach((g) => {
          const ng = normalizeGenre(g)
          generos[ng] = (generos[ng] ?? 0) + 1
        })
        if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
        const osc = (p.oscars ?? '').toLowerCase()
        if (osc.startsWith('ganó')) oscarWinners++
      })

      return { id: plat.id, nombre: plat.nombre, count: movies.length, avgImdb, oscarWinners, generos, categorias }
    })
  }, [peliculas, plataformas])

  const sortedByCount = useMemo(() => [...platData].sort((a, b) => b.count - a.count), [platData])
  const filteredByPlat = useMemo(
    () => (selectedPlat === 'todas' ? sortedByCount : platData.filter((p) => p.id === selectedPlat)),
    [selectedPlat, sortedByCount, platData],
  )

  const platChips = useMemo(
    () => [
      { key: 'todas', label: 'Todas' },
      ...sortedByCount.map((p) => ({ key: p.id, label: p.nombre })),
    ],
    [sortedByCount],
  )

  return (
    <>
      <PageHeader
        title="Estadísticas"
        subtitle="Comparativa de las plataformas de streaming en Chile."
        icon={<Icon.Trending className="w-7 h-7" />}
      />

      {/* AI analysis */}
      {analisis && (
        <div className="mb-10">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">
            Análisis IA · {new Date(analisis.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plataformas.map((plat) => {
              const frase = analisis.plataformas?.[plat.id]
              if (!frase) return null
              return (
                <Card key={plat.id} padding="md" className="flex items-start gap-3">
                  <PlatformLogo platform={plat.id as Platform} size="md" />
                  <p className="text-sm text-zinc-300 leading-relaxed">{frase}</p>
                </Card>
              )
            })}
          </div>
          {analisis.comparativo && (
            <p className="text-zinc-500 text-sm italic mt-4 leading-relaxed">{analisis.comparativo}</p>
          )}
        </div>
      )}

      {/* Platform selector */}
      <div className="mb-8">
        <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">
          Comparar plataformas
        </h2>
        <FilterChips
          chips={platChips}
          value={selectedPlat}
          onChange={(v) => setSelectedPlat(v as string)}
        />
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10">
        {filteredByPlat.map((pd) => (
          <Card key={pd.id} padding="md" className="text-center">
            <div className="flex justify-center mb-2">
              <PlatformLogo platform={pd.id as Platform} size="md" />
            </div>
            <p className="text-2xl font-black text-white tabular-nums">{pd.count.toLocaleString('es')}</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Películas</p>
            <div className="flex items-center justify-center gap-3 mt-2">
              {pd.avgImdb && (
                <span className="text-xs font-bold text-yellow-400 inline-flex items-center gap-1 tabular-nums">
                  <Icon.Star className="w-3 h-3" filled />
                  {pd.avgImdb}
                </span>
              )}
              {pd.oscarWinners > 0 && (
                <span className="text-xs text-yellow-400 inline-flex items-center gap-1 tabular-nums">
                  <img loading="lazy" src="/oscar.png" alt="Óscar" className="h-3.5 w-auto" />
                  {pd.oscarWinners}
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* IMDB comparison */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-base font-bold text-white mb-4">Nota IMDb promedio</h2>
        <div className="space-y-3">
          {[...platData]
            .sort((a, b) => (b.avgImdb ?? 0) - (a.avgImdb ?? 0))
            .map((pd) => {
              const highlighted = selectedPlat === 'todas' || selectedPlat === pd.id
              return (
                <div
                  key={pd.id}
                  className={`flex items-center gap-3 transition-opacity ${highlighted ? 'opacity-100' : 'opacity-30'}`}
                >
                  <PlatformLogo platform={pd.id as Platform} size="sm" />
                  <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all"
                      style={{ width: pd.avgImdb ? `${((pd.avgImdb - 5) / 5) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-bold text-yellow-400 w-10 text-right tabular-nums">
                    {pd.avgImdb ?? '—'}
                  </span>
                </div>
              )
            })}
        </div>
      </Card>

      {/* Composition by genre */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-base font-bold text-white mb-1">¿De qué está hecha cada plataforma?</h2>
        <p className="text-xs text-zinc-500 mb-5">Composición por géneros — top 6 de cada plataforma</p>
        <div className="space-y-5">
          {filteredByPlat.map((pd) => {
            const sorted = Object.entries(pd.generos).sort(([, a], [, b]) => b - a)
            const top = sorted.slice(0, 6)
            const otherCount = sorted.slice(6).reduce((s, [, v]) => s + v, 0)
            const segments = top.map(([g, v]) => ({ label: g, value: v, color: genreColor(g) }))
            if (otherCount > 0) segments.push({ label: 'Otros', value: otherCount, color: 'bg-zinc-700' })
            const total = sorted.reduce((s, [, v]) => s + v, 0)

            return (
              <div key={pd.id}>
                <div className="flex items-center gap-2 mb-2">
                  <PlatformLogo platform={pd.id as Platform} size="sm" />
                  <span className="text-sm text-white font-semibold">{pd.nombre}</span>
                </div>
                <StackedBar segments={segments} total={total} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-[10px] text-zinc-500">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Composition by CineBret category */}
      <Card padding="lg" className="mb-6">
        <h2 className="text-base font-bold text-white mb-1">Personalidad de cada plataforma</h2>
        <p className="text-xs text-zinc-500 mb-4">Composición por categorías CineBret</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5">
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-zinc-400">{CAT_LABELS[cat] ?? cat}</span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {filteredByPlat.map((pd) => {
            const sorted = Object.entries(pd.categorias).sort(([, a], [, b]) => b - a)
            const segments = sorted.map(([cat, v]) => ({
              label: CAT_LABELS[cat] ?? cat,
              value: v,
              color: CAT_COLORS[cat] ?? 'bg-zinc-600',
            }))
            const total = sorted.reduce((s, [, v]) => s + v, 0)

            return (
              <div key={pd.id}>
                <div className="flex items-center gap-2 mb-2">
                  <PlatformLogo platform={pd.id as Platform} size="sm" />
                  <span className="text-sm text-white font-semibold">{pd.nombre}</span>
                </div>
                <StackedBar segments={segments} total={total} />
              </div>
            )
          })}
        </div>
      </Card>

      {/* Catalog totals */}
      <Card padding="md" className="mb-6">
        <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-3">
          Películas en catálogo
        </p>
        <div className="flex flex-wrap gap-4">
          {sortedByCount.map((pd) => (
            <div key={pd.id} className="flex items-center gap-2">
              <PlatformLogo platform={pd.id as Platform} size="sm" />
              <span className="text-xs text-zinc-400 tabular-nums">{pd.count.toLocaleString('es')}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
