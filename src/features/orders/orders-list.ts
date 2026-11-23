import type { Schema } from '@/api'
import type { BadgeTone, SortDirection } from '@/components'

export type OwnerOrder = Schema<'OrderResponse'>
export type OrderStatus = OwnerOrder['status']

/** In the order an order moves through them. */
export const STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'FULFILLED',
  'REJECTED',
  'CANCELLED',
]

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  FULFILLED: 'Fulfilled',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

export const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'primary',
  IN_PROGRESS: 'primary',
  FULFILLED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

export const PAGE_SIZE = 20
/** OrderService.MAX_SEARCH_LENGTH on the server. */
export const SEARCH_MAX = 100

export type OrderSortField = 'pickupAt' | 'createdAt'

export type OrderListParams = {
  search: string
  /** Empty: every status. */
  statuses: OrderStatus[]
  /** Pickup dates, "YYYY-MM-DD" in the bakery's time zone, both included. */
  from: string | null
  to: string | null
  sort: OrderSortField
  direction: SortDirection
  /** Zero-based. */
  page: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const date = (value: string | null) => (value && DATE.test(value) ? value : null)

/**
 * The list's filters, sort and page, as kept in the URL:
 * `?q=&status=PENDING&status=CONFIRMED&from=2026-11-20&to=2026-11-27&sort=placed&dir=asc&page=2`.
 * Without a sort, the latest pickups come first.
 */
export function readOrderParams(search: URLSearchParams): OrderListParams {
  const statuses = search
    .getAll('status')
    .filter((s): s is OrderStatus => STATUSES.includes(s as OrderStatus))
  let from = date(search.get('from'))
  let to = date(search.get('to'))
  // The server refuses a range that ends before it starts; the dates were meant the other way.
  if (from && to && from > to) [from, to] = [to, from]
  return {
    search: (search.get('q') ?? '').slice(0, SEARCH_MAX),
    statuses: STATUSES.filter((s) => statuses.includes(s)),
    from,
    to,
    sort: search.get('sort') === 'placed' ? 'createdAt' : 'pickupAt',
    direction: search.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(0, (Number(search.get('page')) || 1) - 1),
  }
}

export const isFiltered = (p: OrderListParams) =>
  p.search !== '' || p.statuses.length > 0 || p.from !== null || p.to !== null

/** PENDING orders not confirmed this long after they were placed are cancelled by the server. */
export const PENDING_HOLD_HOURS = 24
/** From this close to the auto-cancel, a pending order is flagged. */
export const URGENT_HOURS = 4
const HOUR = 3_600_000

export type PendingDeadline = {
  /** When the server cancels it, unless the Owner confirms or rejects it first. */
  at: number
  /** Milliseconds left (0 once it's due: the server's job runs every 15 minutes). */
  remaining: number
  urgent: boolean
}

/** For a pending order: when it will be auto-cancelled, and whether that's close. */
export function pendingDeadline(order: OwnerOrder, now: number): PendingDeadline | null {
  if (order.status !== 'PENDING') return null
  const at = Date.parse(order.createdAt) + PENDING_HOLD_HOURS * HOUR
  const remaining = Math.max(0, at - now)
  return { at, remaining, urgent: remaining <= URGENT_HOURS * HOUR }
}

/** "2 h 15 min", "45 min", "under a minute". */
export function formatRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h > 0 && `${h} h`, m > 0 && `${m} min`].filter(Boolean).join(' ')
}

/** "3 items" from the lines' quantities. */
export function itemCount(order: OwnerOrder): string {
  const count = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  return count === 1 ? '1 item' : `${count} items`
}
