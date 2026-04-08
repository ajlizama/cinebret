/**
 * EmptyState — icon + title + description with optional CTA slot.
 *
 * @example
 *   <EmptyState
 *     icon={<Icon.Search className="w-16 h-16" />}
 *     title="No hay resultados"
 *     description="Prueba a cambiar los filtros."
 *     action={<Button>Limpiar filtros</Button>}
 *   />
 */

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 py-16 px-4 ${className}`}
    >
      {icon ? (
        <div className="w-16 h-16 text-zinc-700 inline-flex items-center justify-center">
          {icon}
        </div>
      ) : null}
      <h3 className="text-white font-bold text-lg">{title}</h3>
      {description ? (
        <p className="max-w-sm text-zinc-500 text-sm leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
