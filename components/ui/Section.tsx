/**
 * Section — sub-section wrapper with an optional uppercase label.
 *
 * Use inside a page to group related content under a small kicker title with
 * an optional count pill and right-side action slot.
 *
 * @example
 *   <Section label="Últimos estrenos" count={24} action={<Button size="sm">Ver todos</Button>}>
 *     ...
 *   </Section>
 */

export type SectionProps = {
  /** Small uppercase kicker label. */
  label?: string
  /** Count rendered as a gold pill next to the label. */
  count?: number
  /** Right-side action (collapse toggle, "see all" link, etc.). */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ label, count, action, children, className = '' }: SectionProps) {
  const hasHeader = Boolean(label || typeof count === 'number' || action)

  return (
    <section className={`mb-6 sm:mb-8 ${className}`}>
      {hasHeader ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {label ? (
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 truncate">
                {label}
              </h2>
            ) : null}
            {typeof count === 'number' ? (
              <span className="inline-flex items-center rounded-full bg-yellow-400/15 border border-yellow-400/30 px-2.5 py-0.5 text-[11px] font-bold text-yellow-400 tabular-nums">
                {count.toLocaleString('es')}
              </span>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
