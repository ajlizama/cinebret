'use client'

import { useState } from 'react'

type RankingEntry = { nombre: string; avg: number; count: number }
type StatEntry = { nombre: string; avg: number; count: number }
type OscarEntry = { nombre: string; count: number }

type PlatStats = {
  generos: StatEntry[]
  categorias: StatEntry[]
  directores: RankingEntry[]
  actores: RankingEntry[]
  totalMovies: number
}

type Plataforma = { id: string; nombre: string; color: string }

type Props = {
  mejoresEvaluados: {
    directores: RankingEntry[]
    actores: RankingEntry[]
    compositores: RankingEntry[]
  }
  porPlataforma: Record<string, PlatStats>
  plataformas: Plataforma[]
  statsPlataformas: Record<string, number>
  oscarsPersonas: {
    directores: OscarEntry[]
    actores: OscarEntry[]
    compositores: OscarEntry[]
  }
}

type TipoEvaluado = 'directores' | 'actores' | 'compositores'

function BaraAvg({ avg, max }: { avg: number; max: number }) {
  const pct = max > 0 ? Math.round((avg / max) * 100) : 0
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Estatuillas({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 items-center flex-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <img key={i} src="/oscar.png" alt="Oscar" className="h-5 w-auto" />
      ))}
    </div>
  )
}

export default function EstadisticasInteractivas({
  mejoresEvaluados,
  porPlataforma,
  plataformas,
  statsPlataformas,
  oscarsPersonas,
}: Props) {
  const [tabEvaluado, setTabEvaluado] = useState<TipoEvaluado>('directores')
  const [tabOscars, setTabOscars] = useState<TipoEvaluado>('directores')
  const [platSeleccionada, setPlatSeleccionada] = useState(plataformas[0]?.id ?? '')

  const ranking = mejoresEvaluados[tabEvaluado]
  const maxRankingAvg = ranking[0]?.avg ?? 10

  const platStats = porPlataforma[platSeleccionada]
  const maxPlatAvg = Math.max(
    ...(platStats?.generos.map(g => g.avg) ?? []),
    ...(platStats?.categorias.map(c => c.avg) ?? []),
    1,
  )

  const oscarsLista = oscarsPersonas[tabOscars]

  return (
    <>
      {/* === Oscars por persona === */}
      <section className="mb-12">
        <h2 className="text-lg font-bold text-white mb-1">Hall of Fame — Oscars</h2>
        <p className="text-xs text-zinc-500 mb-4">Cantidad de Academy Awards ganados a lo largo de su carrera</p>

        <div className="flex gap-2 mb-6">
          {(['directores', 'actores', 'compositores'] as TipoEvaluado[]).map(tab => (
            <button
              key={tab}
              onClick={() => setTabOscars(tab)}
              className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                tabOscars === tab
                  ? 'border-yellow-400 bg-yellow-400 text-zinc-950 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {oscarsLista.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin datos aún — se completarán con el próximo enriquecimiento</p>
        ) : (
          <div className="space-y-2">
            {oscarsLista.map((entry, i) => (
              <div key={entry.nombre} className="flex items-center gap-4 py-3 border-b border-zinc-800">
                <span className="text-xs text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-white flex-1 font-medium truncate">{entry.nombre}</span>
                <Estatuillas count={entry.count} />
                <span className="text-xs text-zinc-500 shrink-0 w-16 text-right">
                  {entry.count} Oscar{entry.count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === Mejores evaluados === */}
      <section className="mb-12">
        <h2 className="text-lg font-bold text-white mb-1">Mejores evaluados por IMDB</h2>
        <p className="text-xs text-zinc-500 mb-4">Mínimo 2 películas en el catálogo</p>

        <div className="flex gap-2 mb-6">
          {(['directores', 'actores', 'compositores'] as TipoEvaluado[]).map(tab => (
            <button
              key={tab}
              onClick={() => setTabEvaluado(tab)}
              className={`border rounded-lg px-4 py-2 text-sm transition-colors ${
                tabEvaluado === tab
                  ? 'border-zinc-200 bg-zinc-200 text-zinc-950 font-medium'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {ranking.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay datos suficientes</p>
        ) : (
          <div className="space-y-2">
            {ranking.map((entry, i) => (
              <div key={entry.nombre} className="flex items-center gap-4 py-2 border-b border-zinc-800">
                <span className="text-xs text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-sm text-white flex-1 font-medium truncate">{entry.nombre}</span>
                <div className="w-28 shrink-0">
                  <BaraAvg avg={entry.avg} max={maxRankingAvg} />
                </div>
                <span className="text-xs text-yellow-400 font-bold w-10 text-right shrink-0">
                  {entry.avg}
                </span>
                <span className="text-xs text-zinc-500 w-16 text-right shrink-0">
                  {entry.count} {entry.count === 1 ? 'película' : 'películas'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* === Por plataforma === */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Análisis por plataforma</h2>

        <div className="flex flex-wrap gap-2 mb-6">
          {plataformas.map(plat => (
            <button
              key={plat.id}
              onClick={() => setPlatSeleccionada(plat.id)}
              className={`border rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                platSeleccionada === plat.id
                  ? `${plat.color} border-transparent text-white`
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              <div className="bg-white rounded px-1 py-0.5 shrink-0">
                <img src={`/${plat.id === 'amazon_prime' ? 'amazon_prime' : plat.id === 'disney_plus' ? 'disney_plus' : plat.id === 'hbo_max' ? 'hbo_max' : plat.id === 'apple_tv' ? 'apple_tv' : plat.id === 'paramount_plus' ? 'paramount_plus' : 'netflix'}.${['disney_plus', 'paramount_plus'].includes(plat.id) ? 'svg' : 'png'}`} alt={plat.nombre} className="h-3 w-auto object-contain" />
              </div>
              <span className={platSeleccionada === plat.id ? 'text-white/80' : 'text-zinc-500'}>
                {statsPlataformas[plat.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {!platStats || platStats.totalMovies === 0 ? (
          <p className="text-sm text-zinc-500">No hay películas en esta plataforma hoy</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-10">
            {/* Géneros */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Géneros</h3>
              <p className="text-xs text-zinc-500 mb-4">% de películas en la plataforma</p>
              <div className="space-y-2.5">
                {[...platStats.generos].sort((a, b) => b.count - a.count).map(entry => {
                  const pct = Math.round((entry.count / platStats.totalMovies) * 100)
                  return (
                    <div key={entry.nombre}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate pr-2 text-zinc-300">{entry.nombre}</span>
                        <div className="flex gap-2.5 shrink-0 text-xs">
                          <span className="text-zinc-500">{entry.count} pelis</span>
                          <span className="text-yellow-400 font-bold">⭐ {entry.avg}</span>
                          <span className="text-zinc-400 w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Categorías */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Categorías</h3>
              <p className="text-xs text-zinc-500 mb-4">IMDB promedio ponderado por categoría CineBret</p>
              <div className="space-y-2.5">
                {platStats.categorias.map(entry => (
                  <div key={entry.nombre}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate pr-2 text-zinc-300">{entry.nombre}</span>
                      <div className="flex gap-2.5 shrink-0 text-xs">
                        <span className="text-zinc-500">{entry.count} pelis</span>
                        <span className="text-yellow-400 font-bold">⭐ {entry.avg}</span>
                      </div>
                    </div>
                    <BaraAvg avg={entry.avg} max={maxPlatAvg} />
                  </div>
                ))}
              </div>
            </div>

            {/* Directores en plataforma */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Directores</h3>
              <p className="text-xs text-zinc-500 mb-4">IMDB promedio · mínimo 2 películas en la plataforma</p>
              {platStats.directores.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin datos suficientes</p>
              ) : (
                <div className="space-y-1.5">
                  {platStats.directores.map((entry, i) => (
                    <div key={entry.nombre} className="flex items-center gap-3 py-2 border-b border-zinc-800">
                      <span className="text-xs text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                      <span className="text-sm text-zinc-200 flex-1 truncate">{entry.nombre}</span>
                      <span className="text-xs text-yellow-400 font-bold shrink-0">⭐ {entry.avg}</span>
                      <span className="text-xs text-zinc-500 shrink-0">{entry.count}p</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actores en plataforma */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">Actores</h3>
              <p className="text-xs text-zinc-500 mb-4">IMDB promedio · mínimo 2 películas en la plataforma</p>
              {platStats.actores.length === 0 ? (
                <p className="text-xs text-zinc-500">Sin datos suficientes</p>
              ) : (
                <div className="space-y-1.5">
                  {platStats.actores.map((entry, i) => (
                    <div key={entry.nombre} className="flex items-center gap-3 py-2 border-b border-zinc-800">
                      <span className="text-xs text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                      <span className="text-sm text-zinc-200 flex-1 truncate">{entry.nombre}</span>
                      <span className="text-xs text-yellow-400 font-bold shrink-0">⭐ {entry.avg}</span>
                      <span className="text-xs text-zinc-500 shrink-0">{entry.count}p</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
