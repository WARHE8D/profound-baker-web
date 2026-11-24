import { useId, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { cn } from '@/lib/cn'
import { Input } from './controls'

export type QuickView = {
  label: string
  /** The URL search it stands for, without "?". */ search: string
}

const entries = (search: URLSearchParams) =>
  [...search.entries()].map(([k, v]) => `${k}=${v}`).toSorted()

/** Whether two URL searches hold the same params, in any order. */
const sameSearch = (a: URLSearchParams, b: string) =>
  JSON.stringify(entries(a)) === JSON.stringify(entries(new URLSearchParams(b)))

/** Shortcuts to a list's most used filters, as links; the one matching the URL is current. */
export function QuickViews({ views }: { views: QuickView[] }) {
  const [search] = useSearchParams()
  return (
    <nav aria-label="Quick views" className="flex flex-wrap gap-2">
      {views.map((view) => {
        const current = sameSearch(search, view.search)
        return (
          <Link
            key={view.label}
            to={{ search: view.search }}
            replace
            aria-current={current ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              current
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-border bg-surface hover:bg-surface-muted',
            )}
          >
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}

type DateRangeFilterProps = {
  /** "Pickup", "Issued": what the dates are of. */
  label: string
  /** "YYYY-MM-DD", both included. */
  from: string | null
  to: string | null
  onChange: (change: { from?: string; to?: string }) => void
}

/** A from–to pair of date inputs, each bounded by the other. */
export function DateRangeFilter({ label, from, to, onChange }: DateRangeFilterProps) {
  const id = useId()
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label} dates</legend>
      <label htmlFor={`${id}-from`} className="text-sm text-muted">
        {label} from
      </label>
      <Input
        id={`${id}-from`}
        type="date"
        className="w-auto"
        value={from ?? ''}
        max={to ?? undefined}
        onChange={(event) => onChange({ from: event.target.value })}
      />
      <label htmlFor={`${id}-to`} className="text-sm text-muted">
        to
      </label>
      <Input
        id={`${id}-to`}
        aria-label={`${label} to`}
        type="date"
        className="w-auto"
        value={to ?? ''}
        min={from ?? undefined}
        onChange={(event) => onChange({ to: event.target.value })}
      />
    </fieldset>
  )
}

type FilterChipsProps<T extends string> = {
  legend: string
  options: readonly T[]
  labels: Record<T, string>
  /** Empty: no filter (every option). */
  selected: readonly T[]
  onToggle: (option: T) => void
  /** Shown at the end of the row, e.g. "Clear filters". */
  children?: ReactNode
}

/** Several-of-many filter as pill checkboxes. */
export function FilterChips<T extends string>({
  legend,
  options,
  labels,
  selected,
  onToggle,
  children,
}: FilterChipsProps<T>) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{legend}</legend>
      <span aria-hidden="true" className="text-sm text-muted">
        {legend}:
      </span>
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            'cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
            selected.includes(option)
              ? 'border-primary bg-primary/10 font-medium text-primary'
              : 'border-border hover:bg-surface-muted',
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
          />
          {labels[option]}
        </label>
      ))}
      {children}
    </fieldset>
  )
}
