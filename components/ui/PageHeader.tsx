/**
 * PageHeader — large hero-style header for page tops.
 *
 * Renders a gold vertical accent bar, optional icon, big title, subtitle, and
 * an actions slot aligned to the right on desktop (wraps below on mobile).
 *
 * @example
 *   <PageHeader
 *     title="Posters"
 *     subtitle="La selección visual de CineBret."
 *     count={248}
 *     actions={<Button variant="secondary">Filtrar</Button>}
 *   />
 */

export type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Shown next to the title in muted color. */
  count?: number
  /** Small icon rendered before the title. */
  icon?: React.ReactNode
  /** Right-side slot for filters / buttons. */
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  count,
  icon,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`mb-8 sm:mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6 ${className}`}
    >
      <div className="flex gap-4 min-w-0">
        <div
          aria-hidden="true"
          className="shrink-0 h-8 w-1 rounded-full bg-yellow-400 mt-3"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {icon ? <span className="text-yellow-400">{icon}</span> : null}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              {title}
              {typeof count === 'number' ? (
                <span className="ml-3 text-zinc-500 font-bold tabular-nums">
                  {count.toLocaleString('es')}
                </span>
              ) : null}
            </h1>
          </div>
          {subtitle ? (
            <p className="mt-3 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
