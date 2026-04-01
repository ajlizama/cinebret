'use client'

// This is a thin wrapper that adds FeatureWidgets to the existing CatalogoInteractivo
// It re-exports the same component but with widgets injected
import CatalogoInteractivo, { type Pelicula } from '../catalogo/CatalogoInteractivo'
import FeatureWidgets from '@/components/FeatureWidgets'

export default function CatalogoInteractivoPrueba({ peliculas, trendingIds = [] }: { peliculas: Pelicula[]; trendingIds?: number[] }) {
  // We need to inject widgets between Trending and Para Ti
  // CatalogoInteractivo doesn't expose that slot, so we pass widgets as a prop
  return (
    <CatalogoInteractivo peliculas={peliculas} trendingIds={trendingIds} widgetSlot={<FeatureWidgets />} />
  )
}
