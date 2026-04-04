'use client'

import CatalogoInteractivo, { type Pelicula } from './CatalogoInteractivo'
import FeatureWidgetsNuevo from './FeatureWidgetsNuevo'
import EmbeddedTinder from './EmbeddedTinder'
import TopNav from '@/components/TopNav'

const TYPEWRITER_PLACEHOLDERS = [
  '¿Cómo te ayudo?',
  'Una película parecida a Matrix...',
  'Quiero ver ciencia-ficción...',
  'Algo estilo Nolan...',
]

export default function CatalogoClient({
  peliculas, series, trendingIds, trendingSeriesIds,
}: {
  peliculas: Pelicula[]
  series: Pelicula[]
  trendingIds: number[]
  trendingSeriesIds: number[]
}) {
  return (
    <main className="min-h-screen bg-zinc-950">
      <TopNav />
      <CatalogoInteractivo
        peliculas={peliculas}
        series={series}
        trendingIds={trendingIds}
        trendingSeriesIds={trendingSeriesIds}
        widgetSlot={<FeatureWidgetsNuevo />}
        tinderSlot={(filters) => (
          <EmbeddedTinder categorias={filters.categorias} plataformas={filters.plataformas} trendingIds={filters.trendingIds} />
        )}
        hideHeroTitle
        hidePlatformTitle
        searchPlaceholders={TYPEWRITER_PLACEHOLDERS}
      />
    </main>
  )
}
