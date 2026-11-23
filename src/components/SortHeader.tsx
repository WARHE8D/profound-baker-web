import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export type SortDirection = 'asc' | 'desc'

type SortHeaderProps<F extends string> = {
  field: F
  label: string
  /** The column the table is sorted by now, and which way. */
  sort: F
  direction: SortDirection
  onSort: (field: F) => void
  className?: string
}

/** A column header that sorts the table by its column; aria-sort says how it's sorted. */
export function SortHeader<F extends string>({
  field,
  label,
  sort,
  direction,
  onSort,
  className,
}: SortHeaderProps<F>) {
  const active = sort === field
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('px-4 py-2 font-semibold', className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 rounded-control hover:text-text',
          active && 'text-text',
        )}
      >
        {label}
        <Icon aria-hidden="true" className={cn('size-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  )
}
