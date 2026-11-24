import { useQuery } from '@tanstack/react-query'
import { AlarmClock, ChevronRight, ShoppingBag, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Schema } from '@/api'
import { Badge, ErrorState, Spinner } from '@/components'
import { meQuery } from '@/features/auth/use-session'
import { bakeryQuery } from '@/features/checkout/queries'
import {
  formatRemaining,
  itemCount,
  pendingDeadline,
  STATUS_LABELS,
  STATUS_TONES,
  type OrderListParams,
} from '@/features/orders/orders-list'
import { ownerOrdersQuery } from '@/features/orders/owner-queries'
import { cn } from '@/lib/cn'
import { formatPlainDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { dashboardSummaryQuery } from './queries'
import { formatMonth, monthOverMonth } from './revenue'
import { RevenueChart } from './RevenueChart'

type Summary = Schema<'DashboardSummaryResponse'>

/** `/owner`: where the Owner lands after signing in. What needs doing today, and how it's going. */
export function DashboardPage() {
  const summary = useQuery(dashboardSummaryQuery())
  const bakery = useQuery(bakeryQuery())
  const me = useQuery(meQuery())
  const firstName = me.data?.ownerName.split(' ')[0]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        {summary.data && (
          <p className="text-muted">
            {firstName && `Hello, ${firstName}. `}
            It’s {formatPlainDate(summary.data.today, 'weekday-date')}.
          </p>
        )}
      </div>
      {summary.data && bakery.data ? (
        <Dashboard summary={summary.data} zone={bakery.data.timeZone} />
      ) : summary.isError || bakery.isError ? (
        <ErrorState
          error={summary.error ?? bakery.error}
          title="We couldn't load your dashboard"
          onRetry={() => void Promise.all([summary.refetch(), bakery.refetch()])}
          retrying={summary.isFetching || bakery.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading your dashboard" />
        </div>
      )}
    </div>
  )
}

/** The same params as the orders list's quick views, so they share its cache. */
const pendingOldestFirst: OrderListParams = {
  search: '',
  statuses: ['PENDING'],
  from: null,
  to: null,
  sort: 'createdAt',
  direction: 'asc',
  page: 0,
}
const pickupsOn = (date: string): OrderListParams => ({
  search: '',
  statuses: [],
  from: date,
  to: date,
  sort: 'pickupAt',
  direction: 'asc',
  page: 0,
})

function Dashboard({ summary, zone }: { summary: Summary; zone: string }) {
  const now = useNow(30_000)
  const pending = useQuery({
    ...ownerOrdersQuery(pendingOldestFirst, zone),
    enabled: summary.pendingOrders > 0,
  })
  const oldest = pending.data?.items[0]
  const deadline = oldest ? pendingDeadline(oldest, now) : null

  const months = summary.revenueByMonth
  const thisMonth = months.at(-1)
  const lastMonth = months.at(-2)
  const change =
    thisMonth && lastMonth ? monthOverMonth(thisMonth.revenue, lastMonth.revenue) : null
  const { total, toCollect } = summary.todaysPickups

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatTile
          to={`/owner/orders?from=${summary.today}&to=${summary.today}&dir=asc`}
          icon={<ShoppingBag aria-hidden="true" className="size-5" />}
          label="Today’s pickups"
          value={total}
          detail={
            total === 0
              ? 'Nothing to hand over today'
              : toCollect === 0
                ? 'All collected'
                : `${toCollect} still to collect`
          }
        />
        <StatTile
          to="/owner/orders?status=PENDING&dir=asc&sort=placed"
          icon={<AlarmClock aria-hidden="true" className="size-5" />}
          label="Waiting for you to confirm"
          value={summary.pendingOrders}
          urgent={deadline?.urgent}
          detail={
            summary.pendingOrders === 0
              ? 'All caught up'
              : deadline
                ? deadline.remaining === 0
                  ? 'The oldest is being cancelled automatically'
                  : `The oldest is cancelled automatically in ${formatRemaining(deadline.remaining)}`
                : 'Confirm or reject within 24 hours'
          }
        />
        <StatTile
          to="/owner/invoices?status=PAID"
          icon={<Wallet aria-hidden="true" className="size-5" />}
          label={
            thisMonth
              ? `Paid in ${formatMonth(thisMonth.month, { long: true })}`
              : 'Paid this month'
          }
          value={formatMoney(thisMonth?.revenue ?? 0)}
          detail={
            thisMonth && lastMonth
              ? change
                ? `${change === 'same as' ? 'The same as' : `${change} on`} ${formatMonth(lastMonth.month, { long: true }).split(' ')[0]} (${formatMoney(lastMonth.revenue)})`
                : `${thisMonth.paidInvoices} paid ${thisMonth.paidInvoices === 1 ? 'invoice' : 'invoices'}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="revenue-heading"
          className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
        >
          <div className="flex flex-col gap-0.5">
            <h2 id="revenue-heading" className="text-lg font-semibold">
              Paid revenue by month
            </h2>
            <p className="text-sm text-muted">
              Invoices by the month they were paid. Refunded ones aren't counted.
            </p>
          </div>
          <RevenueChart months={months} />
        </section>
        <TodaysPickups today={summary.today} zone={zone} now={now} />
      </div>
    </>
  )
}

type StatTileProps = {
  to: string
  icon: ReactNode
  label: string
  value: ReactNode
  detail?: string
  /** Something needs doing soon: the detail is a warning. */
  urgent?: boolean
}

/** A headline number that opens the list behind it. */
function StatTile({ to, icon, label, value, detail, urgent = false }: StatTileProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-2 rounded-card border bg-surface p-5 transition-colors hover:border-primary/60',
        urgent ? 'border-warning/60' : 'border-border',
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-muted">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
      <span className="font-display text-4xl font-semibold text-text tabular-nums">{value}</span>
      {detail && (
        <span className={cn('text-sm', urgent ? 'font-medium text-warning' : 'text-muted')}>
          {detail}
        </span>
      )}
    </Link>
  )
}

/** The most pickups listed here; the rest are a click away. */
const PICKUPS_SHOWN = 8

function TodaysPickups({ today, zone, now }: { today: string; zone: string; now: number }) {
  const orders = useQuery(ownerOrdersQuery(pickupsOn(today), zone))
  const all = orders.data?.items ?? []
  const shown = all.slice(0, PICKUPS_SHOWN)
  const more = (orders.data?.totalElements ?? 0) - shown.length

  return (
    <section
      aria-labelledby="pickups-heading"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pickups-heading" className="text-lg font-semibold">
          Today’s pickups
        </h2>
        <Link
          to="/owner/production"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          What to make
        </Link>
      </div>
      {orders.isError ? (
        <p className="text-sm text-danger">We couldn't load today's orders.</p>
      ) : !orders.data ? (
        <Spinner label="Loading today's orders" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">No orders are due today.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {shown.map((order) => {
            const done = order.status === 'FULFILLED'
            const off = order.status === 'CANCELLED' || order.status === 'REJECTED'
            const overdue =
              (order.status === 'CONFIRMED' || order.status === 'IN_PROGRESS') &&
              Date.parse(order.pickupAt) < now
            return (
              <li key={order.id}>
                <Link
                  to={`/owner/orders/${order.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-control px-2 py-2 text-sm hover:bg-surface-muted',
                    (done || off) && 'text-muted',
                  )}
                >
                  <span className="w-16 shrink-0 tabular-nums">
                    {formatLocal(order.pickupAt, zone, 'time')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', off && 'line-through')}>
                      {order.guestContact.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {order.reference} · {itemCount(order)}
                    </span>
                  </span>
                  <Badge tone={overdue ? 'warning' : STATUS_TONES[order.status]}>
                    {overdue ? 'Not collected' : STATUS_LABELS[order.status]}
                  </Badge>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to={`/owner/orders?from=${today}&to=${today}&dir=asc`}
        className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {more > 0 ? `See all ${orders.data?.totalElements} of today’s orders` : 'Open in Orders'}
      </Link>
    </section>
  )
}
