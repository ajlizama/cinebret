'use client'

import CatalogoInteractivo, { type Pelicula } from './CatalogoInteractivo'
import FeatureWidgetsNuevo from './FeatureWidgetsNuevo'
import EmbeddedTinder from './EmbeddedTinder'
import TopNav from '@/components/TopNav'

export default function CatalogoClient({
  peliculas, series, trendingIds, trendingSeriesIds, typewriterPhrases,
}: {
  peliculas: Pelicula[]
  series: Pelicula[]
  trendingIds: number[]
  trendingSeriesIds: number[]
  typewriterPhrases?: string[]
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
        searchPlaceholders={typewriterPhrases}
      />
    </main>
  )
}
