'use client'

import { useState } from 'react'

type Episodio = {
  id: string
  numero: number
  nombre: string | null
  sinopsis: string | null
  still_path: string | null
  fecha_estreno: string | null
  runtime: number | null
  nota_tmdb: number | null
}

type Temporada = {
  id: string
  numero: number
  nombre: string | null
  poster_path: string | null
  fecha_estreno: string | null
  num_episodios: number | null
  nota_tmdb: number | null
  episodios: Episodio[]
}

export default function TemporadasBrowser({ temporadas }: { temporadas: Temporada[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openSeason, setOpenSeason] = useState<number | null>(null)

  if (temporadas.length === 0) return null

  const totalEps = temporadas.reduce((sum, t) => sum + (t.num_episodios || 0), 0)

  return (
    <div>
      {/* Main accordion header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 group"
      >
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Temporadas</p>
          <span className="text-xs text-zinc-600">
            {temporadas.length} temporada{temporadas.length > 1 ? 's' : ''} · {totalEps} episodios
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Seasons list */}
      {isOpen && (
        <div className="space-y-2 pb-4">
          {temporadas.map(t => {
            const seasonOpen = openSeason === t.numero
            return (
              <div key={t.id} className="border border-zinc-800 rounded-xl overflow-hidden">
                {/* Season header */}
                <button
                  onClick={() => setOpenSeason(seasonOpen ? null : t.numero)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {t.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${t.poster_path}`}
                        alt={t.nombre || `Temporada ${t.numero}`}
                        className="w-10 h-14 rounded object-cover shrink-0"
                      />
                    )}
                    <div className="text-left">
                      <p className="text-white text-sm font-semibold">
                        {t.nombre || `Temporada ${t.numero}`}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                        {t.num_episodios && <span>{t.num_episodios} episodios</span>}
                        {t.fecha_estreno && <span>{new Date(t.fecha_estreno).getFullYear()}</span>}
                        {t.nota_tmdb && (
                          <span className="text-yellow-400 flex items-center gap-0.5">
                            <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                            {t.nota_tmdb}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-600 transition-transform ${seasonOpen ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Episodes list */}
                {seasonOpen && t.episodios.length > 0 && (
                  <div className="border-t border-zinc-800">
                    {t.episodios.map(ep => (
                      <div
                        key={ep.id}
                        className="flex gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors"
                      >
                        {ep.still_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${ep.still_path}`}
                            alt={ep.nombre || `Episodio ${ep.numero}`}
                            className="w-24 h-14 rounded object-cover shrink-0 bg-zinc-800"
                          />
                        ) : (
                          <div className="w-24 h-14 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                            <span className="text-zinc-600 text-lg font-bold">{ep.numero}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 text-xs font-mono">{ep.numero}.</span>
                            <p className="text-white text-sm font-medium line-clamp-1">
                              {ep.nombre || `Episodio ${ep.numero}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {ep.nota_tmdb && ep.nota_tmdb > 0 && (
                              <span className="text-yellow-400 text-[10px] flex items-center gap-0.5">
                                <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>
                                {ep.nota_tmdb}
                              </span>
                            )}
                            {ep.runtime && (
                              <span className="text-zinc-500 text-[10px]">{ep.runtime} min</span>
                            )}
                            {ep.fecha_estreno && (
                              <span className="text-zinc-600 text-[10px]">{ep.fecha_estreno}</span>
                            )}
                          </div>
                          {ep.sinopsis && (
                            <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{ep.sinopsis}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
