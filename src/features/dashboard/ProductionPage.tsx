import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CookingPot, Printer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { Schema } from '@/api'
import { Button, EmptyState, ErrorState, Input, Spinner } from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import type { OrderListParams } from '@/features/orders/orders-list'
import { ownerOrdersQuery } from '@/features/orders/owner-queries'
import { addDays, formatPlainDate } from '@/lib/date'
import { todayIn } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { productionQuery } from './queries'

type Production = Schema<'ProductionListResponse'>

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `/owner/production?date=`: what to make for one day's pickups, ready to print for the kitchen. */
export function ProductionPage() {
  const bakery = useQuery(bakeryQuery())
  const zone = bakery.data?.timeZone

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 print:hidden">
        <h1 className="text-3xl font-semibold">Production list</h1>
        <p className="text-muted">
          Everything to make for a day’s pickups, added up across its confirmed orders.
        </p>
      </div>
      {zone ? (
        <ProductionDay zone={zone} bakeryName={bakery.data!.businessName} />
      ) : bakery.isError ? (
        <ErrorState
          error={bakery.error}
          title="We couldn't load the production list"
          onRetry={() => void bakery.refetch()}
          retrying={bakery.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading the production list" />
        </div>
      )}
    </div>
  )
}

/** "Today", "Tomorrow", "Yesterday", or nothing. */
function relativeDay(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  if (date === addDays(today, -1)) return 'Yesterday'
  return null
}

function ProductionDay({ zone, bakeryName }: { zone: string; bakeryName: string }) {
  const now = useNow()
  const today = todayIn(zone, new Date(now))
  const [search, setSearch] = useSearchParams()
  const param = search.get('date')
  const date = param && DATE.test(param) ? param : today
  const production = useQuery(productionQuery(date))
  const pendingParams: OrderListParams = {
    search: '',
    statuses: ['PENDING'],
    from: date,
    to: date,
    sort: 'pickupAt',
    direction: 'asc',
    page: 0,
  }
  const pending = useQuery(ownerOrdersQuery(pendingParams, zone))
  const pendingCount = pending.data?.totalElements ?? 0

  // Today is the default: it stays out of the URL, so a bookmark always opens on the current day.
  const go = (next: string) => setSearch(next === today ? {} : { date: next }, { replace: true })
  const relative = relativeDay(date, today)
  const title = formatPlainDate(date, 'weekday-date')

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous day"
            onClick={() => go(addDays(date, -1))}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Day"
            className="w-auto"
            value={date}
            onChange={(event) => DATE.test(event.target.value) && go(event.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next day"
            onClick={() => go(addDays(date, 1))}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          {date !== today && (
            <Button variant="ghost" size="sm" onClick={() => go(today)}>
              Today
            </Button>
          )}
          {date !== addDays(today, 1) && (
            <Button variant="ghost" size="sm" onClick={() => go(addDays(today, 1))}>
              Tomorrow
            </Button>
          )}
        </div>
        <Button variant="secondary" onClick={() => window.print()} disabled={!production.data}>
          <Printer aria-hidden="true" className="size-4" />
          Print
        </Button>
      </div>

      <section
        aria-labelledby="production-day"
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6 print:border-0 print:p-0"
      >
        <header className="flex flex-col gap-0.5">
          <p className="hidden text-sm text-muted print:block">{bakeryName} · Production list</p>
          <h2 id="production-day" className="text-2xl font-semibold">
            {/* A printed sheet outlives the day: only the date goes on paper. */}
            {relative && <span className="print:hidden">{relative}, </span>}
            {title}
          </h2>
          {production.data && <p className="text-sm text-muted">{summaryLine(production.data)}</p>}
        </header>

        {pendingCount > 0 && (
          <p className="rounded-control bg-warning/10 px-4 py-3 text-sm print:border print:border-border">
            <strong className="font-semibold">
              {pendingCount} pending {pendingCount === 1 ? 'order isn’t' : 'orders aren’t'} counted
            </strong>{' '}
            until you confirm {pendingCount === 1 ? 'it' : 'them'}.{' '}
            <Link
              to={`/owner/orders?status=PENDING&from=${date}&to=${date}&dir=asc`}
              className="font-medium text-primary underline-offset-4 hover:underline print:hidden"
            >
              Review {pendingCount === 1 ? 'it' : 'them'}
            </Link>
          </p>
        )}

        {production.data ? (
          production.data.items.length === 0 ? (
            <EmptyState
              icon={<CookingPot className="size-8 text-muted" />}
              title="Nothing to make"
              description="No confirmed orders are due for pickup on this day."
            />
          ) : (
            <ProductionTable production={production.data} title={title} />
          )
        ) : production.isError ? (
          <ErrorState
            error={production.error}
            title="We couldn't load this day"
            onRetry={() => void production.refetch()}
            retrying={production.isFetching}
          />
        ) : (
          <div className="flex justify-center py-8">
            <Spinner label="Loading the day" />
          </div>
        )}
      </section>
    </>
  )
}

/** "38 items across 6 orders". */
function summaryLine({ items, orderCount }: Production) {
  const units = items.reduce((sum, item) => sum + item.quantity, 0)
  return `${units} ${units === 1 ? 'item' : 'items'} across ${orderCount} ${orderCount === 1 ? 'order' : 'orders'}`
}

function ProductionTable({ production, title }: { production: Production; title: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">What to make on {title}</caption>
      <thead className="border-b-2 border-text/80 text-left text-xs text-muted">
        <tr>
          <th scope="col" className="hidden w-10 py-2 print:table-cell">
            <span className="sr-only">Done</span>
          </th>
          <th scope="col" className="py-2 pr-2 font-semibold">
            Item
          </th>
          <th scope="col" className="px-2 py-2 text-right font-semibold">
            Quantity
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-semibold">
            Orders
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {production.items.map((item) => (
          <tr key={item.itemId ?? `name:${item.itemName}`} className="break-inside-avoid">
            <td className="hidden py-3 print:table-cell">
              {/* A box to tick off on the printed sheet. */}
              <span
                aria-hidden="true"
                className="block size-5 rounded-sm border-2 border-text/70"
              />
            </td>
            <th scope="row" className="py-3 pr-2 text-left text-base font-medium">
              {item.itemName}
              {item.itemId === null && (
                <span className="block text-xs font-normal text-muted">
                  No longer in the catalogue
                </span>
              )}
            </th>
            <td className="px-2 py-3 text-right font-display text-2xl font-semibold tabular-nums">
              {item.quantity}
            </td>
            <td className="py-3 pl-2 text-right text-muted tabular-nums">{item.orderCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
