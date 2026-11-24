import { Button } from './Button'

type PaginationProps = {
  /** Zero-based. */
  page: number
  totalPages: number
  total: number
  /** How to count what's listed: [one, many], e.g. ['item', 'items']. */
  noun: readonly [string, string]
  onPage: (page: number) => void
}

/** "26 orders · Page 1 of 2", with Previous and Next. */
export function Pagination({ page, totalPages, total, noun, onPage }: PaginationProps) {
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted">{total === 1 ? `1 ${noun[0]}` : `${total} ${noun[1]}`}</p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={page + 1 >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </nav>
  )
}
