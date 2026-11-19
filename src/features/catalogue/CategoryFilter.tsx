import { Link, type To } from 'react-router'
import type { Schema } from '@/api'
import { cn } from '@/lib/cn'

type CategoryFilterProps = {
  categories: Schema<'CategoryResponse'>[]
  /** The selected category's id; null for "All". */
  selectedId: string | null
}

/**
 * Category pills. Each one is a link to `?category=<id>`, so the filter lives in the URL: it can be
 * shared and bookmarked, and the Back button undoes it.
 */
export function CategoryFilter({ categories, selectedId }: CategoryFilterProps) {
  return (
    <nav aria-label="Categories">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Pill to={{ search: '' }} current={selectedId === null}>
            All
          </Pill>
        </li>
        {categories.map((category) => (
          <li key={category.id}>
            <Pill
              to={{ search: `?${new URLSearchParams({ category: category.id })}` }}
              current={selectedId === category.id}
            >
              {category.name}
            </Pill>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Pill({ to, current, children }: { to: To; current: boolean; children: string }) {
  return (
    <Link
      to={to}
      preventScrollReset
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors',
        current
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface text-text hover:bg-surface-muted',
      )}
    >
      {children}
    </Link>
  )
}
