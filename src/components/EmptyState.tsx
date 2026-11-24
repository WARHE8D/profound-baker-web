import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type EmptyStateProps = {
  title: ReactNode
  description?: ReactNode
  /** Decorative icon or illustration. Hidden from screen readers. */
  icon?: ReactNode
  /** Usually one Button, e.g. "Add your first item". */
  action?: ReactNode
  /** The heading's level: 1 when this is all the page shows (not found, failed to load). */
  level?: 1 | 2 | 3
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  level = 3,
  className,
}: EmptyStateProps) {
  const Heading = `h${level}` as const
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div aria-hidden="true" className="text-4xl text-muted">
          {icon}
        </div>
      )}
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}
