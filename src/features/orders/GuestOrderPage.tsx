import { useQuery } from '@tanstack/react-query'
import { MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { isApiError, type Schema } from '@/api'
import { Badge, type BadgeTone, Button, ButtonLink, EmptyState, ErrorState } from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { CancelOrderDialog } from './CancelOrderDialog'
import { canCancel, guestOrderQuery, type GuestOrder } from './queries'
import { StatusTimeline } from './StatusTimeline'

type Bakery = Schema<'PublicBakeryResponse'>

/**
 * `/orders/:token`: the guest's view of their order, opened from the magic link. The token is a
 * credential: it is only sent to the API, never shown, logged or put in the page title.
 */
export function GuestOrderPage() {
  const token = useParams().token ?? ''
  const order = useQuery(guestOrderQuery(token))
  const bakery = useQuery(bakeryQuery())

  let content
  if (isApiError(order.error) && order.error.status === 404) {
    content = <LinkInvalid bakery={bakery.data} />
  } else if (order.data && bakery.data) {
    content = (
      <OrderDetails
        token={token}
        order={order.data}
        bakery={bakery.data}
        onReload={() => void order.refetch()}
      />
    )
  } else if (order.isError || bakery.isError) {
    const failed = order.isError ? order : bakery
    content = (
      <ErrorState
        error={failed.error}
        title="We couldn't load your order"
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    )
  } else {
    content = <OrderSkeleton />
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Keep the link out of search engines and out of the Referer sent to other sites. */}
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
      {content}
    </div>
  )
}

const statusSummary: Record<
  GuestOrder['status'],
  { badge: string; tone: BadgeTone; text: string }
> = {
  PENDING: {
    badge: 'Waiting for confirmation',
    tone: 'warning',
    text: "The bakery hasn't confirmed your order yet. If it isn't confirmed within 24 hours, it is cancelled automatically.",
  },
  CONFIRMED: {
    badge: 'Confirmed',
    tone: 'success',
    text: 'The bakery has confirmed your order. See you at pickup!',
  },
  IN_PROGRESS: {
    badge: 'Being prepared',
    tone: 'primary',
    text: 'The bakery is preparing your order.',
  },
  FULFILLED: { badge: 'Picked up', tone: 'success', text: 'Picked up. Enjoy!' },
  REJECTED: {
    badge: 'Declined',
    tone: 'danger',
    text: "Sorry, the bakery couldn't take this order.",
  },
  CANCELLED: { badge: 'Cancelled', tone: 'neutral', text: 'This order was cancelled.' },
}

type OrderDetailsProps = {
  token: string
  order: GuestOrder
  bakery: Bakery
  /** Reloads the order, e.g. after a cancel the server refused because it moved on. */
  onReload: () => void
}

function OrderDetails({ token, order, bakery, onReload }: OrderDetailsProps) {
  const zone = bakery.timeZone
  const summary = statusSummary[order.status]
  const now = useNow(30_000)
  const [cancelOpen, setCancelOpen] = useState(false)
  const cancellable = canCancel(order, now)
  // Still open, but past the online cutoff: the guest has to call.
  const tooLateToCancel =
    !cancellable && (order.status === 'PENDING' || order.status === 'CONFIRMED')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">{bakery.businessName}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Order {order.reference}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={summary.tone}>{summary.badge}</Badge>
        </div>
        <p className="text-muted">{summary.text}</p>
      </div>

      <section
        aria-labelledby="order-progress"
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5"
      >
        <h2 id="order-progress" className="text-lg font-semibold">
          Progress
        </h2>
        <StatusTimeline order={order} zone={zone} />
      </section>

      <section aria-labelledby="order-details" className="flex flex-col gap-3">
        <h2 id="order-details" className="text-lg font-semibold">
          Details
        </h2>
        <dl className="grid gap-3 rounded-card border border-border bg-surface p-5 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-semibold">Pickup</dt>
          <dd>{formatLocal(order.pickupAt, zone, 'datetime')}</dd>
          {bakery.address && (
            <>
              <dt className="font-semibold">Where</dt>
              <dd className="flex gap-1.5">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                {formatAddress(bakery.address)}
              </dd>
            </>
          )}
          <dt className="font-semibold">Items</dt>
          <dd>
            <ul className="flex flex-col gap-1">
              {order.lines.map((line) => (
                <li key={line.lineNo} className="flex justify-between gap-4">
                  <span>
                    {line.quantity} × {line.itemName}
                  </span>
                  <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt className="font-semibold">Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
          <dt className="font-semibold">Name</dt>
          <dd>{order.guestContact.name}</dd>
          {order.notes && (
            <>
              <dt className="font-semibold">Notes</dt>
              <dd className="whitespace-pre-line">{order.notes}</dd>
            </>
          )}
        </dl>
        <p className="text-sm text-muted">No payment is taken online.</p>
      </section>

      {cancellable && order.cancellableUntil && (
        <section
          aria-labelledby="cancel-order"
          className="flex flex-col items-start gap-3 rounded-card border border-border p-5"
        >
          <h2 id="cancel-order" className="text-lg font-semibold">
            Need to cancel?
          </h2>
          <p className="text-sm text-muted">
            You can cancel online until {formatLocal(order.cancellableUntil, zone, 'datetime')}.
          </p>
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        </section>
      )}
      {tooLateToCancel && (
        <p className="text-sm text-muted">
          It's too late to cancel online.
          {bakery.phone && <> To change or cancel this order, call the bakery.</>}
        </p>
      )}

      {bakery.phone && <ContactLine phone={bakery.phone} />}

      <CancelOrderDialog
        token={token}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConflict={onReload}
      />
    </div>
  )
}

function ContactLine({ phone }: { phone: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <Phone aria-hidden="true" className="size-4 text-muted" />
      <span>
        Questions? Call the bakery at{' '}
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-primary underline">
          {phone}
        </a>
        .
      </span>
    </p>
  )
}

function LinkInvalid({ bakery }: { bakery: Bakery | undefined }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <EmptyState
        icon="🔗"
        title="This order link is expired or invalid"
        description="Check that you copied the whole link. If it still doesn't work, contact the bakery with your order reference."
        action={<ButtonLink to="/">Back to the menu</ButtonLink>}
        className="w-full"
      />
      {bakery?.phone && <ContactLine phone={bakery.phone} />}
    </div>
  )
}

function OrderSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your order"
      className="flex animate-pulse flex-col gap-6"
    >
      <div className="h-10 w-2/3 rounded-control bg-surface-muted" />
      <div className="h-40 rounded-card bg-surface-muted" />
      <div className="h-48 rounded-card bg-surface-muted" />
    </div>
  )
}

function formatAddress(address: NonNullable<Bakery['address']>): string {
  const cityLine = [address.city, address.region, address.postalCode].filter(Boolean).join(' ')
  return [address.street, cityLine].filter(Boolean).join(', ')
}
