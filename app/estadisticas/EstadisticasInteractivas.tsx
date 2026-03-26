'use client'

import { useMemo, useState } from 'react'

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

type Plataforma = { id: string; nombre: string; color: string; logo: string }

type Props = {
  peliculas: PeliculaRow[]
  plataformas: Plataforma[]
  analisis: AnalisisCatalogo
}

type PlatData = {
  id: string
  nombre: string
  color: string
  logo: string
  count: number
  avgImdb: number | null
  avgRt: number | null
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

const CAT_COLORS: Record<string, string> = {
  "Pa'l domingo de bajón": 'bg-amber-500',
  "Pa' saltar del sillón": 'bg-violet-500',
  "Pa' quedar con el cerebro como licuadora": 'bg-rose-500',
  "Pa' llorar a moco tendido": 'bg-cyan-500',
}

// Fixed color per genre — consistent across all platforms
const GENRE_COLOR_MAP: Record<string, string> = {
  'Drama': 'bg-blue-500',
  'Comedia': 'bg-emerald-500',
  'Acción': 'bg-amber-500',
  'Thriller': 'bg-rose-500',
  'Aventura': 'bg-violet-500',
  'Crimen': 'bg-cyan-500',
  'Romance': 'bg-pink-500',
  'Animación': 'bg-lime-500',
  'Ciencia ficción': 'bg-orange-500',
  'Familia': 'bg-indigo-500',
  'Terror': 'bg-red-700',
  'Fantasía': 'bg-purple-500',
  'Misterio': 'bg-teal-500',
  'Guerra': 'bg-stone-500',
  'Biografía': 'bg-sky-500',
  'Historia': 'bg-yellow-600',
  'Música': 'bg-fuchsia-500',
  'Documental': 'bg-slate-500',
  'Western': 'bg-amber-700',
  'Deporte': 'bg-green-600',
  'Musical': 'bg-pink-400',
  'Action': 'bg-amber-500',
  'Comedy': 'bg-emerald-500',
  'Animation': 'bg-lime-500',
  'Sci-Fi': 'bg-orange-500',
}
function genreColor(genre: string): string {
  return GENRE_COLOR_MAP[genre] ?? 'bg-zinc-500'
}

function StackedBar({ segments, total, showTopN = 6 }: { segments: { label: string; value: number; color: string }[]; total: number; showTopN?: number }) {
  return (
    <div className="w-full h-7 bg-zinc-800 rounded-full overflow-hidden flex">
      {segments.map((s, i) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0
        if (pct < 2) return null
        const showNumber = i < showTopN || pct > 8
        return (
          <div key={i} className={`${s.color} h-full relative group`} style={{ width: `${pct}%`, minWidth: showNumber ? '28px' : undefined }} title={`${s.label}: ${Math.round(pct)}%`}>
            {showNumber && <span className="absolute inset-0 flex items-center justify-center text-white text-[9px] font-bold drop-shadow-sm">{Math.round(pct)}%</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function EstadisticasInteractivas({ peliculas, plataformas, analisis }: Props) {
  const [selectedPlat, setSelectedPlat] = useState<string | null>(null)

  const platData = useMemo((): PlatData[] => {
    return plataformas.map(plat => {
      const movies = peliculas.filter(p => p.plataformas.includes(plat.id))
      const conImdb = movies.filter(p => p.nota_imdb != null)
      const avgImdb = conImdb.length > 0
        ? Math.round((conImdb.reduce((s, p) => s + p.nota_imdb!, 0) / conImdb.length) * 10) / 10
        : null
      const conRt = movies.filter(p => (p as any).rt_score != null)
      const avgRt = conRt.length > 0
        ? Math.round((conRt.reduce((s, p) => s + ((p as any).rt_score ?? 0), 0) / conRt.length) * 10) / 10
        : null

      const generos: Record<string, number> = {}
      const categorias: Record<string, number> = {}
      let oscarWinners = 0

      movies.forEach(p => {
        p.generos.forEach(g => { generos[g] = (generos[g] ?? 0) + 1 })
        if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
        const osc = (p.oscars ?? '').toLowerCase()
        if (osc.startsWith('ganó')) oscarWinners++
      })

      return { ...plat, count: movies.length, avgImdb, avgRt, oscarWinners, generos, categorias }
    })
  }, [peliculas, plataformas])

  const sortedByCount = [...platData].sort((a, b) => b.count - a.count)

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Estadísticas</h1>
        <p className="text-zinc-500 text-sm">Comparativa de plataformas de streaming en Chile</p>
      </div>

      {/* ── Análisis IA ── */}
      {analisis && (
        <div className="mb-10">
          <p className="text-xs text-zinc-600 uppercase tracking-wide font-medium mb-3">Análisis IA · {new Date(analisis.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plataformas.map(plat => {
              const frase = analisis.plataformas?.[plat.id]
              if (!frase) return null
              return (
                <div key={plat.id} className="flex items-start gap-3 bg-zinc-900 rounded-xl p-4">
                  <div className="bg-white rounded-lg px-2 py-1 shrink-0">
                    <img src={plat.logo} alt={plat.nombre} className="h-5 w-auto object-contain" />
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{frase}</p>
                </div>
              )
            })}
          </div>
          {analisis.comparativo && (
            <p className="text-zinc-500 text-sm italic mt-4 leading-relaxed">{analisis.comparativo}</p>
          )}
        </div>
      )}

      {/* ── Platform selector (mobile swipe cards) ── */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Comparar plataformas</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
          <button
            onClick={() => setSelectedPlat(null)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${!selectedPlat ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}
          >Todas</button>
          {sortedByCount.map(pd => (
            <button key={pd.id}
              onClick={() => setSelectedPlat(pd.id === selectedPlat ? null : pd.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedPlat === pd.id ? 'bg-white text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}
            >
              <div className={`rounded px-1 py-0.5 ${selectedPlat === pd.id ? '' : 'bg-white'}`}>
                <img src={pd.logo} alt={pd.nombre} className="h-3.5 w-auto object-contain" />
              </div>
              {pd.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick stats row ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-8">
        {(selectedPlat ? platData.filter(p => p.id === selectedPlat) : sortedByCount).map(pd => (
          <div key={pd.id} className="bg-zinc-900 rounded-xl p-3 text-center">
            <div className="bg-white rounded-lg px-2 py-1 mx-auto w-fit mb-2">
              <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
            </div>
            <p className="text-xl font-bold text-white">{pd.count}</p>
            <p className="text-[10px] text-zinc-500">películas</p>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              {pd.avgImdb && <span className="text-xs font-bold text-yellow-400">⭐{pd.avgImdb}</span>}
              {pd.oscarWinners > 0 && <span className="text-xs text-amber-400">🏆{pd.oscarWinners}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── IMDB comparison ── */}
      <div className="bg-zinc-900 rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-4">Nota IMDB promedio</h2>
        <div className="space-y-3">
          {[...platData].sort((a, b) => (b.avgImdb ?? 0) - (a.avgImdb ?? 0)).map(pd => {
            const highlighted = !selectedPlat || selectedPlat === pd.id
            return (
              <div key={pd.id} className={`flex items-center gap-3 transition-opacity ${highlighted ? 'opacity-100' : 'opacity-30'}`}>
                <div className="bg-white rounded px-1.5 py-0.5 shrink-0 w-14 flex items-center justify-center">
                  <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
                </div>
                <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full transition-all"
                    style={{ width: pd.avgImdb ? `${((pd.avgImdb - 5) / 5) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-bold text-yellow-400 w-8 text-right">{pd.avgImdb ?? '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Composición por géneros (per platform) ── */}
      <div className="bg-zinc-900 rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-1">¿De qué está hecha cada plataforma?</h2>
        <p className="text-xs text-zinc-500 mb-5">Composición por géneros — top géneros de cada plataforma</p>
        <div className="space-y-5">
          {(selectedPlat ? platData.filter(p => p.id === selectedPlat) : sortedByCount).map(pd => {
            const sorted = Object.entries(pd.generos).sort(([, a], [, b]) => b - a)
            const top = sorted.slice(0, 6)
            const otherCount = sorted.slice(6).reduce((s, [, v]) => s + v, 0)
            const segments = top.map(([g, v]) => ({ label: g, value: v, color: genreColor(g) }))
            if (otherCount > 0) segments.push({ label: 'Otros', value: otherCount, color: 'bg-zinc-600' })
            const total = sorted.reduce((s, [, v]) => s + v, 0)

            return (
              <div key={pd.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-white rounded px-1.5 py-0.5">
                    <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
                  </div>
                  <span className="text-sm text-zinc-300 font-medium">{pd.nombre}</span>
                </div>
                <StackedBar segments={segments} total={total} />
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-[10px] text-zinc-500">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Composición por categorías CineBret ── */}
      <div className="bg-zinc-900 rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-white mb-1">Personalidad de cada plataforma</h2>
        <p className="text-xs text-zinc-500 mb-4">Composición por categorías CineBret</p>
        {/* Leyenda global — una sola vez */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5">
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-zinc-400">{CAT_LABELS[cat] ?? cat}</span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {(selectedPlat ? platData.filter(p => p.id === selectedPlat) : sortedByCount).map(pd => {
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
                  <div className="bg-white rounded px-1.5 py-0.5">
                    <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
                  </div>
                  <span className="text-sm text-zinc-300 font-medium">{pd.nombre}</span>
                </div>
                <StackedBar segments={segments} total={total} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Dato menor: películas en catálogo ── */}
      <div className="bg-zinc-900/50 rounded-xl p-4 mb-6">
        <p className="text-xs text-zinc-600 uppercase tracking-wide mb-3">Películas en catálogo</p>
        <div className="flex flex-wrap gap-4">
          {sortedByCount.map(pd => (
            <div key={pd.id} className="flex items-center gap-2">
              <div className="bg-white rounded px-1 py-0.5">
                <img src={pd.logo} alt={pd.nombre} className="h-3 w-auto object-contain" />
              </div>
              <span className="text-xs text-zinc-500">{pd.count}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
