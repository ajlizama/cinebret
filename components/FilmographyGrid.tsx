'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import EnrichedDetails from './EnrichedDetails'

type Movie = {
  id: string
  titulo: string
  titulo_ingles: string | null
  anio: number | null
  nota_imdb: number | null
  poster_path: string | null
}

export default function FilmographyGrid({ movies }: { movies: Movie[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-4">Filmografía</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {movies.map(m => {
          const isExpanded = expanded === m.id
          return (
            <div key={m.id} className={isExpanded ? 'col-span-3 sm:col-span-4 md:col-span-5 lg:col-span-6' : ''}>
              {!isExpanded ? (
                <div className="cursor-pointer group" onClick={() => setExpanded(m.id)}>
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                    {m.poster_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="150px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <span className="text-zinc-600 text-xs text-center">{m.titulo_ingles || m.titulo}</span>
                      </div>
                    )}
                    {m.nota_imdb && (
                      <div className="absolute top-1.5 left-1.5 bg-zinc-900/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">⭐ {m.nota_imdb}</div>
                    )}
                  </div>
                  <p className="text-white text-xs font-semibold leading-snug line-clamp-2">{m.titulo_ingles || m.titulo}</p>
                  <p className="text-zinc-500 text-[10px]">{m.anio}</p>
                </div>
              ) : (
                <div className="bg-zinc-900 rounded-2xl p-4 my-2">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      {m.poster_path && (
                        <div className="relative w-24 rounded-xl overflow-hidden" style={{ aspectRatio: '2/3' }}>
                          <Image src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.titulo_ingles || m.titulo} fill className="object-cover" sizes="96px" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold text-white">{m.titulo_ingles || m.titulo}</h3>
                          {m.titulo_ingles && m.titulo !== m.titulo_ingles && (
                            <p className="text-zinc-500 text-sm">{m.titulo}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                            {m.anio && <span>{m.anio}</span>}
                            {m.nota_imdb && <span className="text-yellow-400 font-bold">⭐ {m.nota_imdb}</span>}
                          </div>
                        </div>
                        <button onClick={() => setExpanded(null)} className="text-zinc-500 hover:text-white transition-colors text-lg">✕</button>
                      </div>
                      <EnrichedDetails peliculaId={m.id} />
                      <Link href={`/pelicula/${m.id}`} className="inline-block mt-3 text-xs text-yellow-400 hover:text-yellow-300 font-medium">Ver ficha completa →</Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
