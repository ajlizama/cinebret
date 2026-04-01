'use client'

// This is a thin wrapper that adds FeatureWidgets to the existing CatalogoInteractivo
// It re-exports the same component but with widgets injected
import CatalogoInteractivo, { type Pelicula } from '../catalogo/CatalogoInteractivo'
import FeatureWidgets from '@/components/FeatureWidgets'

export default function CatalogoInteractivoPrueba({ peliculas, trendingIds = [] }: { peliculas: Pelicula[]; trendingIds?: number[] }) {
  return (
    <div>
      {/* Widgets preview between trending and the rest */}
      <div className="max-w-7xl mx-auto px-3 mt-2">
        <FeatureWidgets />
      </div>
      {/* Original catalog */}
      <CatalogoInteractivo peliculas={peliculas} trendingIds={trendingIds} />
    </div>
  )
}
