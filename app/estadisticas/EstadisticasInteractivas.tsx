'use client'

import { useMemo } from 'react'

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
}

type PlatData = {
  id: string
  nombre: string
  color: string
  logo: string
  count: number
  avgImdb: number | null
  oscarWinners: number
  oscarNom: number
  generos: Record<string, number>
  categorias: Record<string, number>
  reviews: number
}

const CATEGORIAS_SHORT: Record<string, string> = {
  "Pa'l domingo de bajón": '🥲 Bajón',
  "Pa' saltar del sillón": '🪑 Sillón',
  "Pa' quedar con el cerebro como licuadora": '🧠 Licuadora',
  "Pa' llorar a moco tendido": '😭 Moco',
}

export default function EstadisticasInteractivas({ peliculas, plataformas }: Props) {
  const platData = useMemo((): PlatData[] => {
    return plataformas.map(plat => {
      const movies = peliculas.filter(p => p.plataformas.includes(plat.id))
      const conImdb = movies.filter(p => p.nota_imdb != null)
      const avgImdb = conImdb.length > 0
        ? Math.round((conImdb.reduce((s, p) => s + p.nota_imdb!, 0) / conImdb.length) * 10) / 10
        : null

      const generos: Record<string, number> = {}
      const categorias: Record<string, number> = {}
      let oscarWinners = 0, oscarNom = 0, reviews = 0

      movies.forEach(p => {
        p.generos.forEach(g => { generos[g] = (generos[g] ?? 0) + 1 })
        if (p.categoria) categorias[p.categoria] = (categorias[p.categoria] ?? 0) + 1
        const osc = (p.oscars ?? '').toLowerCase()
        if (osc.startsWith('ganó')) oscarWinners++
        else if (osc.includes('nominad')) oscarNom++
        if (p.es_review_autor) reviews++
      })

      return { ...plat, count: movies.length, avgImdb, oscarWinners, oscarNom, generos, categorias, reviews }
    })
  }, [peliculas, plataformas])

  const topGeneros = useMemo(() => {
    const counts: Record<string, number> = {}
    peliculas.forEach(p => p.generos.forEach(g => { counts[g] = (counts[g] ?? 0) + 1 }))
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10).map(([g]) => g)
  }, [peliculas])

  const allCategorias = useMemo(() => {
    const cats = new Set<string>()
    peliculas.forEach(p => { if (p.categoria) cats.add(p.categoria) })
    return Array.from(cats)
  }, [peliculas])

  const maxCount = Math.max(...platData.map(p => p.count), 1)
  const maxImdb = Math.max(...platData.map(p => p.avgImdb ?? 0), 1)
  const maxOscars = Math.max(...platData.map(p => p.oscarWinners + p.oscarNom), 1)

  return (
    <>
      {/* === Mapa de vibe === */}
      <div className="mb-12">
        <h2 className="text-lg font-bold text-white mb-1">Mapa de vibe por plataforma</h2>
        <p className="text-xs text-zinc-500 mb-4">Posición según distribución de categorías CineBret · peso = suma notas IMDB</p>

        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-xs text-zinc-400 border-collapse">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-1.5 pr-3 text-zinc-500 font-normal">Plataforma</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-normal">🥲 Bajón</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-normal">🧠 Licuadora</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-normal">🪑 Sillón</th>
                <th className="text-right py-1.5 px-2 text-zinc-500 font-normal">😭 Moco</th>
                <th className="text-right py-1.5 pl-2 text-zinc-500 font-normal">X axis</th>
              </tr>
            </thead>
            <tbody>
              {plataformas.map(plat => {
                const movies = peliculas.filter(p => p.plataformas.includes(plat.id))
                let bajon = 0, licuadora = 0, sillon = 0, moco = 0
                for (const p of movies) {
                  const w = p.nota_imdb ?? 0
                  const cat = p.categoria ?? ''
                  if (cat.includes('bajón')) bajon += w
                  else if (cat.includes('licuadora')) licuadora += w
                  else if (cat.includes('sillón')) sillon += w
                  else if (cat.includes('moco')) moco += w
                }
                const total = bajon + licuadora + sillon + moco
                const x = total > 0 ? (licuadora - bajon) / total : 0
                return (
                  <tr key={plat.id} className="border-b border-zinc-800/50">
                    <td className="py-1.5 pr-3 text-zinc-300 font-medium">{plat.nombre}</td>
                    <td className="text-right px-2 tabular-nums">{Math.round(bajon)}</td>
                    <td className="text-right px-2 tabular-nums">{Math.round(licuadora)}</td>
                    <td className="text-right px-2 tabular-nums">{Math.round(sillon)}</td>
                    <td className="text-right px-2 tabular-nums">{Math.round(moco)}</td>
                    <td className={`text-right pl-2 tabular-nums font-bold ${x < 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                      {x.toFixed(3)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-zinc-600 mt-1">X negativo → izquierda (bajón) · X positivo → derecha (licuadora)</p>
        </div>

        <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl mx-auto" style={{ height: 320, maxWidth: 420 }}>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-px bg-zinc-700" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-full w-px bg-zinc-700" />
          </div>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 italic max-w-16 leading-tight">Pa'l domingo de bajón</span>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 italic max-w-16 leading-tight text-right">Pa' quedar con el cerebro como licuadora</span>
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-zinc-500 italic whitespace-nowrap">Pa' saltar del sillón</span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-zinc-500 italic whitespace-nowrap">Pa' llorar a moco tendido</span>
          {(() => {
            const puntos = plataformas.map(plat => {
              const movies = peliculas.filter(p => p.plataformas.includes(plat.id))
              let bajon = 0, licuadora = 0, sillon = 0, moco = 0
              for (const p of movies) {
                const w = p.nota_imdb ?? 0
                const cat = p.categoria ?? ''
                if (cat.includes('bajón')) bajon += w
                else if (cat.includes('licuadora')) licuadora += w
                else if (cat.includes('sillón')) sillon += w
                else if (cat.includes('moco')) moco += w
              }
              const total = bajon + licuadora + sillon + moco
              if (total === 0) return null
              return { plat, x: (licuadora - bajon) / total, y: (sillon - moco) / total }
            }).filter(Boolean) as { plat: Plataforma; x: number; y: number }[]

            const xs = puntos.map(p => p.x)
            const ys = puntos.map(p => p.y)
            const absMaxX = Math.max(...xs.map(Math.abs), 0.01)
            const absMaxY = Math.max(...ys.map(Math.abs), 0.01)
            const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.6)

            return puntos.map(({ plat, x, y }) => {
              const normX = x / absMaxX
              const normY = y / absMaxY
              const left = `${50 + curve(normX) * 35}%`
              const top = `${50 - curve(normY) * 35}%`
              return (
                <div key={plat.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }} title={plat.nombre}>
                  <div className="bg-white rounded px-1.5 py-0.5 shadow-lg opacity-70">
                    <img src={plat.logo} alt={plat.nombre} className="h-5 w-auto object-contain" />
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* === Cards resumen por plataforma === */}
      <div className="mb-12">
        <h2 className="text-lg font-bold text-white mb-4">Resumen por plataforma</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {platData.map(pd => (
            <div key={pd.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="bg-white rounded px-2 py-1 mx-auto w-fit mb-3">
                <img src={pd.logo} alt={pd.nombre} className="h-5 w-auto object-contain" />
              </div>
              <p className="text-2xl font-bold text-white">{pd.count}</p>
              <p className="text-xs text-zinc-500 mb-2">películas</p>
              {pd.avgImdb && <p className="text-sm font-bold text-yellow-400">⭐ {pd.avgImdb}</p>}
              {pd.oscarWinners > 0 && (
                <p className="text-xs text-amber-400 mt-1">🏆 {pd.oscarWinners} ganadoras</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* === Comparativa IMDB promedio === */}
      <div className="mb-12 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">IMDB promedio por plataforma</h2>
        <p className="text-xs text-zinc-500 mb-5">Nota promedio de las películas en catálogo</p>
        <div className="space-y-3">
          {[...platData].sort((a, b) => (b.avgImdb ?? 0) - (a.avgImdb ?? 0)).map(pd => (
            <div key={pd.id} className="flex items-center gap-3">
              <div className="bg-white rounded px-1.5 py-0.5 shrink-0 w-16 flex items-center justify-center">
                <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
              </div>
              <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full ${pd.color} rounded transition-all`}
                  style={{ width: pd.avgImdb ? `${((pd.avgImdb - 5) / (maxImdb - 5)) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-sm font-bold text-yellow-400 w-8 text-right shrink-0">
                {pd.avgImdb ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* === Cantidad de películas === */}
      <div className="mb-12 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">Películas en catálogo</h2>
        <p className="text-xs text-zinc-500 mb-5">Disponibles hoy en cada plataforma</p>
        <div className="space-y-3">
          {[...platData].sort((a, b) => b.count - a.count).map(pd => (
            <div key={pd.id} className="flex items-center gap-3">
              <div className="bg-white rounded px-1.5 py-0.5 shrink-0 w-16 flex items-center justify-center">
                <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
              </div>
              <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                <div
                  className={`h-full ${pd.color} rounded transition-all`}
                  style={{ width: `${(pd.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold text-white w-10 text-right shrink-0">{pd.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* === Oscars === */}
      <div className="mb-12 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">Oscars</h2>
        <p className="text-xs text-zinc-500 mb-5">Ganadoras y nominadas por plataforma</p>
        <div className="space-y-4">
          {[...platData].sort((a, b) => b.oscarWinners - a.oscarWinners).map(pd => (
            <div key={pd.id} className="flex items-start gap-3">
              <div className="bg-white rounded px-1.5 py-0.5 shrink-0 w-16 flex items-center justify-center mt-1">
                <img src={pd.logo} alt={pd.nombre} className="h-4 w-auto object-contain" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded"
                      style={{ width: `${(pd.oscarWinners / Math.max(maxOscars, 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-amber-400 w-20 shrink-0">{pd.oscarWinners} ganadoras</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-zinc-500 rounded"
                      style={{ width: `${(pd.oscarNom / Math.max(maxOscars, 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500 w-20 shrink-0">{pd.oscarNom} nominadas</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === Géneros comparados === */}
      <div className="mb-12 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">Géneros por plataforma</h2>
        <p className="text-xs text-zinc-500 mb-5">% del catálogo de cada plataforma — top 10 géneros</p>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-3 mb-5">
          {platData.map(pd => (
            <div key={pd.id} className="flex items-center gap-1.5">
              <div className="bg-white rounded px-1 py-0.5">
                <img src={pd.logo} alt={pd.nombre} className="h-3 w-auto object-contain" />
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${pd.color} inline-block`} />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {topGeneros.map(genero => (
            <div key={genero}>
              <p className="text-xs text-zinc-400 mb-1.5 font-medium">{genero}</p>
              <div className="flex gap-1 items-end h-8">
                {platData.map(pd => {
                  const count = pd.generos[genero] ?? 0
                  const pct = pd.count > 0 ? Math.round((count / pd.count) * 100) : 0
                  const maxPct = Math.max(...platData.map(p => p.count > 0 ? Math.round(((p.generos[genero] ?? 0) / p.count) * 100) : 0), 1)
                  return (
                    <div key={pd.id} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-zinc-800 rounded-sm flex items-end overflow-hidden" style={{ height: 28 }}>
                        <div
                          className={`w-full ${pd.color} rounded-sm transition-all`}
                          style={{ height: `${(pct / maxPct) * 100}%` }}
                          title={`${pd.nombre}: ${pct}%`}
                        />
                      </div>
                      <span className="text-zinc-600 text-xs tabular-nums">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === Categorías comparadas === */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">Categorías CineBret por plataforma</h2>
        <p className="text-xs text-zinc-500 mb-5">% del catálogo de cada plataforma con esa categoría</p>
        <div className="space-y-4">
          {allCategorias.map(cat => (
            <div key={cat}>
              <p className="text-xs text-zinc-400 mb-1.5 font-medium">{CATEGORIAS_SHORT[cat] ?? cat}</p>
              <div className="space-y-1.5">
                {platData.map(pd => {
                  const count = pd.categorias[cat] ?? 0
                  const pct = pd.count > 0 ? Math.round((count / pd.count) * 100) : 0
                  const maxPct = Math.max(...platData.map(p => p.count > 0 ? Math.round(((p.categorias[cat] ?? 0) / p.count) * 100) : 0), 1)
                  return (
                    <div key={pd.id} className="flex items-center gap-2">
                      <div className="bg-white rounded px-1 py-0.5 shrink-0 w-12 flex items-center justify-center">
                        <img src={pd.logo} alt={pd.nombre} className="h-3 w-auto object-contain" />
                      </div>
                      <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className={`h-full ${pd.color} rounded transition-all`}
                          style={{ width: `${(pct / maxPct) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 w-10 text-right shrink-0">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
