'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

type EnrData = {
  backdrop_path: string | null
  tagline: string | null
  certification: string | null
  collection_name: string | null
  budget: number | null
  revenue: number | null
  cast_json: any[] | null
  keywords: string[] | null
  similar_ids: number[] | null
}

export default function EnrichedDetails({ peliculaId }: { peliculaId: string }) {
  const [data, setData] = useState<EnrData | null>(null)
  const [similarMovies, setSimilarMovies] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    ;(async () => {
      // Fetch extra data from peliculas + enriquecimiento
      const [{ data: pel }, { data: enr }] = await Promise.all([
        supabase.from('peliculas').select('backdrop_path, tagline, certification, collection_name, budget, revenue').eq('id', peliculaId).maybeSingle(),
        supabase.from('enriquecimiento').select('cast_json, keywords, similar_ids').eq('pelicula_id', peliculaId).maybeSingle(),
      ])

      const enriched: EnrData = {
        backdrop_path: pel?.backdrop_path ?? null,
        tagline: pel?.tagline ?? null,
        certification: pel?.certification ?? null,
        collection_name: pel?.collection_name ?? null,
        budget: pel?.budget ?? null,
        revenue: pel?.revenue ?? null,
        cast_json: enr?.cast_json ?? null,
        keywords: enr?.keywords ?? null,
        similar_ids: enr?.similar_ids ?? null,
      }
      setData(enriched)

      // Fetch similar movies if we have IDs
      if (enr?.similar_ids && enr.similar_ids.length > 0) {
        const { data: sims } = await supabase
          .from('peliculas')
          .select('id, titulo, titulo_ingles, poster_path, nota_imdb, tmdb_id')
          .in('tmdb_id', enr.similar_ids)
          .not('poster_path', 'is', null)
        if (sims) {
          const order = new Map((enr.similar_ids as number[]).map((id: number, i: number) => [id, i]))
          sims.sort((a: any, b: any) => (order.get(a.tmdb_id) ?? 99) - (order.get(b.tmdb_id) ?? 99))
          setSimilarMovies(sims)
        }
      }

      setLoaded(true)
    })()
  }, [peliculaId, loaded])

  if (!data) return null

  return (
    <div className="space-y-3 mt-0 overflow-hidden min-w-0">
      {/* Cast with photos */}
      {data.cast_json && data.cast_json.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Reparto</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {data.cast_json.slice(0, 8).map((actor: any, i: number) => (
              <Link key={i} href={`/actor/${encodeURIComponent(actor.name)}`} className="shrink-0 w-14 text-center group">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-800 mb-1 ring-1 ring-transparent group-hover:ring-yellow-400/50 transition-all">
                  {actor.profile_path ? (
                    <img loading="lazy" src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm font-bold">{actor.name[0]}</div>
                  )}
                </div>
                <p className="text-white text-[8px] font-medium leading-tight line-clamp-2">{actor.name}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Similar movies */}
      {similarMovies.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Si te gustó esta película</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {similarMovies.map((sim: any) => (
              <Link key={sim.id} href={`/pelicula/${sim.id}`} className="shrink-0 w-20">
                <div className="relative w-20 h-28 rounded-lg overflow-hidden bg-zinc-800 mb-1 ring-1 ring-transparent hover:ring-yellow-400/50 transition-all">
                  <Image src={`https://image.tmdb.org/t/p/w185${sim.poster_path}`} alt={sim.titulo_ingles || sim.titulo} fill className="object-cover" sizes="80px" />
                  {sim.nota_imdb && (
                    <div className="absolute top-0.5 left-0.5 bg-zinc-900/90 rounded-full px-1 py-0.5 text-[8px] font-bold text-yellow-400 flex items-center gap-px"><svg className="w-2 h-2 fill-yellow-400" viewBox="0 0 20 20"><path d="M10 1l2.39 6.34H19l-5.3 3.87 2 6.46L10 13.79l-5.7 3.88 2-6.46L1 7.34h6.61z"/></svg>{sim.nota_imdb}</div>
                  )}
                </div>
                <p className="text-white text-[8px] font-medium leading-snug line-clamp-2">{sim.titulo_ingles || sim.titulo}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      {data.keywords && data.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.keywords.slice(0, 8).map((kw: string) => (
            <span key={kw} className="text-[9px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">{kw}</span>
          ))}
        </div>
      )}

      {/* Budget / Revenue compact */}
      {(data.budget && data.budget > 0 || data.revenue && data.revenue > 0) && (
        <div className="flex gap-4 text-[10px] text-zinc-500">
          {data.budget && data.budget > 0 && <span>Presupuesto: ${(data.budget / 1_000_000).toFixed(0)}M</span>}
          {data.revenue && data.revenue > 0 && <span>Recaudación: ${(data.revenue / 1_000_000).toFixed(0)}M</span>}
        </div>
      )}
    </div>
  )
}
