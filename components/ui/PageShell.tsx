/**
 * PageShell — top-level page wrapper with TopNav + container.
 *
 * Server component by default. Use `fullBleed` for pages that need edge-to-edge
 * layouts (e.g. /reel, /cinereels, /mapa). Otherwise content is centered inside
 * a responsive container.
 *
 * @example
 *   <PageShell maxWidth="7xl">
 *     <PageHeader title="Posters" />
 *     ...
 *   </PageShell>
 */

import Nav from '@/components/Nav'

export type PageShellProps = {
  children: React.ReactNode
  /** If true, skip the container and render children edge-to-edge. */
  fullBleed?: boolean
  /** Max width of the inner container. Default `7xl`. */
  maxWidth?: 'lg' | 'xl' | '2xl' | '4xl' | '7xl'
  className?: string
}

const MAX_WIDTH_CLASSES: Record<NonNullable<PageShellProps['maxWidth']>, string> = {
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '7xl': 'max-w-7xl',
}

export function PageShell({
  children,
  fullBleed = false,
  maxWidth = '7xl',
  className = '',
}: PageShellProps) {
  return (
    <>
      <Nav active="inicio" />
      <main className={`min-h-screen bg-zinc-950 ${className}`}>
        {fullBleed ? (
          children
        ) : (
          <div
            className={`mx-auto ${MAX_WIDTH_CLASSES[maxWidth]} px-4 sm:px-6 lg:px-8 pt-6 pb-24`}
          >
            {children}
          </div>
        )}
      </main>
    </>
  )
}
