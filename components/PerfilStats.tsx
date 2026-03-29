'use client'

// Shared stats components used in /perfil and /perfil/[username]

export type PeliculaConStats = {
  pelicula_id: string
  rating: number | null
  pelicula: {
    titulo: string
    titulo_ingles: string | null
    nota_imdb: number | null
    poster_path: string | null
    oscars: string | null
    categoria: string | null
    enriquecimiento: {
      director: string | null
      actores: string | null
      compositor: string | null
    } | null
  }
}

export type Stats = {
  oscarWinners: number
  avgRating: number | null
  avgImdb: number | null
  topDirectores: [string, number][]
  topActores: [string, number][]
  topCompositores: [string, number][]
  categorias: Record<string, number>
}

// Ejes del vibe map (igual que la imagen de referencia):
// X: Pa'l domingo de bajón (izq, -1) ↔ Pa' quedar con el cerebro como licuadora (der, +1)
// Y: Pa' llorar a moco tendido (abajo, -1) ↔ Pa' saltar del sillón (arriba, +1)
export const VIBE_KEYS = {
  sillon:    "Pa' saltar del sillón",
  moco:      "Pa' llorar a moco tendido",
  bajon:     "Pa'l domingo de bajón",
  licuadora: "Pa' quedar con el cerebro como licuadora",
}

export function computeVibePos(categorias: Record<string, number>): { x: number; y: number } | null {
  const bajon     = categorias[VIBE_KEYS.bajon]     ?? 0
  const licuadora = categorias[VIBE_KEYS.licuadora] ?? 0
  const sillon    = categorias[VIBE_KEYS.sillon]    ?? 0
  const moco      = categorias[VIBE_KEYS.moco]      ?? 0
  const total = bajon + licuadora + sillon + moco
  if (total === 0) return null
  return {
    x: (-bajon + licuadora) / total,
    y: (sillon - moco) / total,
  }
}

export function computeStats(peliculas: PeliculaConStats[]): Stats {
  const directors: Record<string, number> = {}
  const actors: Record<string, number> = {}
  const composers: Record<string, number> = {}
  const categorias: Record<string, number> = {}
  let oscarWinners = 0
  let totalRating = 0, countRating = 0, totalImdb = 0, countImdb = 0

  for (const e of peliculas) {
    const p = e.pelicula
    const osc = (p.oscars ?? '').toLowerCase()
    if (osc.startsWith('ganó') && osc.includes('mejor película') &&
      !osc.includes('animad') && !osc.includes('internacional') &&
      !osc.includes('extranjera') && !osc.includes('habla no inglesa')) oscarWinners++

    if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
    if (e.rating) { totalRating += e.rating; countRating++ }
    if (p.nota_imdb) { totalImdb += p.nota_imdb; countImdb++ }

    const enr = p.enriquecimiento
    if (enr?.director?.trim()) directors[enr.director.trim()] = (directors[enr.director.trim()] ?? 0) + 1
    if (enr?.actores) {
      enr.actores.split(',').map((a: string) => a.trim()).filter(Boolean).forEach((a: string) => {
        actors[a] = (actors[a] ?? 0) + 1
      })
    }
    if (enr?.compositor?.trim()) composers[enr.compositor.trim()] = (composers[enr.compositor.trim()] ?? 0) + 1
  }

  return {
    oscarWinners,
    avgRating: countRating > 0 ? Math.round((totalRating / countRating) * 10) / 10 : null,
    avgImdb: countImdb > 0 ? Math.round((totalImdb / countImdb) * 10) / 10 : null,
    topDirectores: Object.entries(directors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topActores: Object.entries(actors).sort((a, b) => b[1] - a[1]).slice(0, 3),
    topCompositores: Object.entries(composers).sort((a, b) => b[1] - a[1]).slice(0, 3),
    categorias,
  }
}

export function StatsCards({ stats, total }: { stats: Stats; total: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { val: total,                 label: 'Películas vistas',    color: 'text-emerald-400' },
        { val: stats.avgRating ?? '—', label: 'Rating promedio',    color: 'text-yellow-400' },
        { val: stats.avgImdb ?? '—',  label: 'IMDB promedio visto', color: 'text-blue-400' },
        { val: stats.oscarWinners,    label: 'Oscars Mejor Peli',   color: 'text-amber-300' },
      ].map(c => (
        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className={`text-2xl font-bold ${c.color}`}>{c.val}</p>
          <p className="text-xs text-zinc-500 mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

export function TopList({ title, items }: { title: string; items: [string, number][] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map(([name, count], i) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-zinc-600 text-xs w-3">{i + 1}.</span>
            <span className="text-zinc-200 text-sm flex-1 truncate">{name}</span>
            <span className="text-zinc-500 text-xs shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

type VibeChip = {
  label: string
  avatar: string | null
  pos: { x: number; y: number }
  muted: boolean
}

export function VibeMapa({
  categorias,
  username,
  avatarUrl,
  misCategorias = null,
  miUsername = null,
  miAvatarUrl = null,
}: {
  categorias: Record<string, number>
  username: string
  avatarUrl: string | null
  misCategorias?: Record<string, number> | null
  miUsername?: string | null
  miAvatarUrl?: string | null
}) {
  const elPos = computeVibePos(categorias)
  const miPos = misCategorias ? computeVibePos(misCategorias) : null

  const chips: VibeChip[] = []
  if (elPos) chips.push({ label: username, avatar: avatarUrl, pos: elPos, muted: false })
  if (miPos && miUsername && miUsername !== username)
    chips.push({ label: miUsername, avatar: miAvatarUrl, pos: miPos, muted: true })

  const toCssX = (x: number) => 50 + x * 38
  const toCssY = (y: number) => 50 - y * 38

  const hasData = Object.values(categorias).some(v => v > 0)

  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Vibe map</p>

      {!hasData ? (
        <p className="text-zinc-600 text-sm">Sin datos de categorías aún</p>
      ) : (
        <div
          className="relative w-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden"
          style={{ paddingBottom: '75%' }}
        >
          {/* Crosshair */}
          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-800" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-zinc-800" />
          </div>

          {/* Labels */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="text-zinc-500 text-xs whitespace-nowrap">Pa' saltar del sillón</span>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="text-zinc-500 text-xs whitespace-nowrap">Pa' llorar a moco tendido</span>
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ maxWidth: 64 }}>
            <span className="text-zinc-500 text-xs leading-tight block">Pa'l domingo de bajón</span>
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ maxWidth: 64 }}>
            <span className="text-zinc-500 text-xs leading-tight block text-right">Pa' quedar con el cerebro como licuadora</span>
          </div>

          {/* Chips */}
          {chips.map(chip => (
            <div
              key={chip.label}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-full px-2 py-1 border"
              style={{
                left: `${toCssX(chip.pos.x)}%`,
                top: `${toCssY(chip.pos.y)}%`,
                opacity: chip.muted ? 0.4 : 1,
                background: chip.muted ? 'rgba(39,39,42,0.8)' : 'rgba(250,204,21,0.15)',
                borderColor: chip.muted ? 'rgb(63,63,70)' : 'rgba(250,204,21,0.6)',
                zIndex: chip.muted ? 1 : 2,
              }}
            >
              <div className="w-5 h-5 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                {chip.avatar
                  ? <img loading="lazy" src={chip.avatar} alt={chip.label} className="w-full h-full object-cover" />
                  : <span className="text-zinc-300 text-xs font-bold">{chip.label[0]?.toUpperCase()}</span>
                }
              </div>
              <span className="text-xs font-medium whitespace-nowrap" style={{ color: chip.muted ? 'rgb(161,161,170)' : 'rgb(250,204,21)' }}>
                @{chip.label}
              </span>
            </div>
          ))}

          {!elPos && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-600 text-xs">Sin suficientes categorías</p>
            </div>
          )}
        </div>
      )}

      {chips.length > 1 && (
        <div className="flex gap-4 mt-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border border-yellow-400/60 inline-block bg-yellow-400/15" />
            @{username}
          </span>
          {miUsername && miUsername !== username && (
            <span className="flex items-center gap-1 opacity-50">
              <span className="w-3 h-3 rounded-full border border-zinc-600 inline-block bg-zinc-700/80" />
              tú (@{miUsername})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function TopsPanel({ stats }: { stats: Stats }) {
  const sinDatos = !stats.topDirectores.length && !stats.topActores.length && !stats.topCompositores.length
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
      <TopList title="Top directores" items={stats.topDirectores} />
      <TopList title="Top actores" items={stats.topActores} />
      <TopList title="Top compositores" items={stats.topCompositores} />
      {sinDatos && <p className="text-zinc-600 text-sm">Sin datos de equipo aún</p>}
    </div>
  )
}
