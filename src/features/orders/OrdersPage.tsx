import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Search } from 'lucide-react'
import { useId } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  SearchInput,
  SortHeader,
  Spinner,
} from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import { cn } from '@/lib/cn'
import { addDays, formatPlainDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { formatLocal, todayIn } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import {
  formatRemaining,
  isFiltered,
  itemCount,
  pendingDeadline,
  readOrderParams,
  SEARCH_MAX,
  STATUS_LABELS,
  STATUS_TONES,
  STATUSES,
  type OrderListParams,
  type OrderSortField,
  type OrderStatus,
  type OwnerOrder,
} from './orders-list'
import type { OrderLinkState } from './OrderDetailPage'
import { ownerOrdersQuery } from './owner-queries'

/** `/owner/orders`: every order, newest pickups first, with filters kept in the URL. */
export function OrdersPage() {
  const bakery = useQuery(bakeryQuery())
  const zone = bakery.data?.timeZone

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Orders</h1>
        <p className="text-muted">
          Confirm new orders within 24 hours of being placed, or they're cancelled automatically.
        </p>
      </div>
      {zone ? (
        <OrdersList zone={zone} />
      ) : bakery.isError ? (
        <ErrorState
          error={bakery.error}
          title="We couldn't load your orders"
          onRetry={() => void bakery.refetch()}
          retrying={bakery.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading orders" />
        </div>
      )}
    </div>
  )
}

const ACTIVE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS']

/** Shortcuts to the views the Owner needs most, as URL searches. */
function quickViews(today: string) {
  return [
    { label: 'Needs confirming', search: 'status=PENDING&dir=asc&sort=placed' },
    { label: 'Today', search: `from=${today}&to=${today}&dir=asc` },
    {
      label: 'Upcoming',
      search: `${ACTIVE.map((s) => `status=${s}`).join('&')}&from=${today}&dir=asc`,
    },
    { label: 'All orders', search: '' },
  ]
}

const entries = (search: URLSearchParams) =>
  [...search.entries()].map(([k, v]) => `${k}=${v}`).toSorted()
/** Whether two URL searches hold the same params, in any order. */
const sameSearch = (a: URLSearchParams, b: string) =>
  JSON.stringify(entries(a)) === JSON.stringify(entries(new URLSearchParams(b)))

function OrdersList({ zone }: { zone: string }) {
  const id = useId()
  const [search, setSearch] = useSearchParams()
  const params = readOrderParams(search)
  const orders = useQuery(ownerOrdersQuery(params, zone))
  const now = useNow(30_000)
  const today = todayIn(zone, new Date(now))

  /** Updates some URL params; any filter or sort change goes back to page 1. */
  function update(changes: Record<string, string | string[] | null>, { keepPage = false } = {}) {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          next.delete(key)
          for (const v of Array.isArray(value) ? value : [value]) {
            if (v !== null && v !== '') next.append(key, v)
          }
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  function sortBy(field: OrderSortField) {
    const direction = params.sort === field && params.direction === 'desc' ? 'asc' : 'desc'
    update({
      sort: field === 'createdAt' ? 'placed' : null,
      dir: direction === 'desc' ? null : 'asc',
    })
  }

  function toggleStatus(status: OrderStatus) {
    const next = params.statuses.includes(status)
      ? params.statuses.filter((s) => s !== status)
      : [...params.statuses, status]
    update({ status: next })
  }

  const page = orders.data
  const clear = () => update({ q: null, status: null, from: null, to: null })

  return (
    <>
      <nav aria-label="Quick views" className="flex flex-wrap gap-2">
        {quickViews(today).map((view) => {
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

      <search className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <SearchInput
            label="Search orders"
            placeholder="Reference, name, email or phone"
            maxLength={SEARCH_MAX}
            value={params.search}
            onChange={(q) => update({ q })}
          />
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">Pickup dates</legend>
            <label htmlFor={`${id}-from`} className="text-sm text-muted">
              Pickup from
            </label>
            <Input
              id={`${id}-from`}
              type="date"
              className="w-auto"
              value={params.from ?? ''}
              max={params.to ?? undefined}
              onChange={(event) => update({ from: event.target.value })}
            />
            <label htmlFor={`${id}-to`} className="text-sm text-muted">
              to
            </label>
            <Input
              id={`${id}-to`}
              aria-label="Pickup to"
              type="date"
              className="w-auto"
              value={params.to ?? ''}
              min={params.from ?? undefined}
              onChange={(event) => update({ to: event.target.value })}
            />
          </fieldset>
        </div>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Status</legend>
          <span aria-hidden="true" className="text-sm text-muted">
            Status:
          </span>
          {STATUSES.map((status) => (
            <label
              key={status}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                params.statuses.includes(status)
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={params.statuses.includes(status)}
                onChange={() => toggleStatus(status)}
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
          {isFiltered(params) && (
            <Button variant="ghost" size="sm" onClick={clear} className="ml-auto">
              Clear filters
            </Button>
          )}
        </fieldset>
      </search>

      {page ? (
        page.items.length === 0 ? (
          isFiltered(params) ? (
            <EmptyState
              icon={<Search className="size-8 text-muted" />}
              title="No orders match"
              description="Try another search or dates, or clear the filters."
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ClipboardList className="size-8 text-muted" />}
              title="No orders yet"
              description="Orders appear here as soon as guests check out."
            />
          )
        ) : (
          <>
            <OrdersTable
              orders={page.items}
              params={params}
              onSort={sortBy}
              busy={orders.isPlaceholderData}
              zone={zone}
              today={today}
              now={now}
            />
            <Pagination
              page={page.number}
              totalPages={page.totalPages}
              total={page.totalElements}
              noun={['order', 'orders']}
              onPage={(n) => update({ page: n === 0 ? null : String(n + 1) }, { keepPage: true })}
            />
          </>
        )
      ) : orders.isError ? (
        <ErrorState
          error={orders.error}
          title="We couldn't load your orders"
          onRetry={() => void orders.refetch()}
          retrying={orders.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading orders" />
        </div>
      )}
    </>
  )
}

type OrdersTableProps = {
  orders: OwnerOrder[]
  params: OrderListParams
  onSort: (field: OrderSortField) => void
  busy: boolean
  zone: string
  today: string
  now: number
}

function OrdersTable({ orders, params, onSort, busy, zone, today, now }: OrdersTableProps) {
  const header = (field: OrderSortField, label: string, className?: string) => (
    <SortHeader
      field={field}
      label={label}
      sort={params.sort}
      direction={params.direction}
      onSort={onSort}
      className={className}
    />
  )
  const sortName = params.sort === 'pickupAt' ? 'pickup time' : 'time placed'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface transition-opacity',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Orders, sorted by {sortName}, {params.direction === 'asc' ? 'earliest' : 'latest'} first
        </caption>
        <thead className="border-b border-border bg-surface-muted/60 text-left text-xs text-muted">
          <tr>
            {header('pickupAt', 'Pickup')}
            <th scope="col" className="px-4 py-2 font-semibold">
              Order
            </th>
            <th scope="col" className="hidden px-4 py-2 font-semibold lg:table-cell">
              Items
            </th>
            <th scope="col" className="hidden px-4 py-2 text-right font-semibold sm:table-cell">
              Total
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              Status
            </th>
            {header('createdAt', 'Placed', 'hidden md:table-cell')}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} zone={zone} today={today} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Today", "Tomorrow", "Yesterday", or the date ("Mon, Nov 23, 2026"). */
function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  if (date === addDays(today, -1)) return 'Yesterday'
  return formatPlainDate(date, 'medium-date')
}

/** "5 min ago", "3 h ago", then the date and time. */
function placedLabel(createdAt: string, zone: string, now: number) {
  const minutes = Math.floor((now - Date.parse(createdAt)) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`
  return formatLocal(createdAt, zone, 'datetime')
}

function OrderRow({
  order,
  zone,
  today,
  now,
}: {
  order: OwnerOrder
  zone: string
  today: string
  now: number
}) {
  // The detail's "All orders" link comes back to these filters.
  const listSearch = useLocation().search.slice(1)
  const pickupDate = todayIn(zone, new Date(order.pickupAt))
  const deadline = pendingDeadline(order, now)
  return (
    <tr
      className={cn(
        deadline?.urgent && 'bg-warning/10',
        (order.status === 'CANCELLED' || order.status === 'REJECTED') && 'text-muted',
      )}
    >
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <span className="block font-medium">{dayLabel(pickupDate, today)}</span>
        <span className="text-muted">{formatLocal(order.pickupAt, zone, 'time')}</span>
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          to={`/owner/orders/${order.id}`}
          state={{ listSearch } satisfies OrderLinkState}
          className="font-mono font-medium text-text underline-offset-4 hover:underline"
        >
          {order.reference}
        </Link>
        <span className="block lg:whitespace-nowrap">{order.guestContact.name}</span>
        <span className="block text-xs text-muted sm:hidden">
          {itemCount(order)} · {formatMoney(order.subtotal)}
        </span>
      </td>
      <td className="hidden px-4 py-3 align-top lg:table-cell">
        <span className="block">{itemCount(order)}</span>
        <span className="block max-w-56 truncate text-xs text-muted">
          {order.lines.map((l) => `${l.quantity} × ${l.itemName}`).join(', ')}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-right align-top tabular-nums sm:table-cell">
        {formatMoney(order.subtotal)}
      </td>
      <td className="px-4 py-3 align-top">
        <Badge tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</Badge>
        {deadline && (
          <span
            className={cn(
              'mt-1 block text-xs lg:whitespace-nowrap',
              deadline.urgent ? 'font-medium text-warning' : 'text-muted',
            )}
          >
            {deadline.remaining === 0
              ? 'Being cancelled: not confirmed in time'
              : deadline.urgent
                ? `Auto-cancels in ${formatRemaining(deadline.remaining)}`
                : // Hours are enough while there's time.
                  `Confirm within ${Math.floor(deadline.remaining / 3_600_000)} h`}
          </span>
        )}
      </td>
      <td className="hidden px-4 py-3 align-top text-muted md:table-cell">
        {placedLabel(order.createdAt, zone, now)}
      </td>
    </tr>
  )
}
