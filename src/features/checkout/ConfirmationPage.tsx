import { CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { ButtonLink, EmptyState } from '@/components'
import { cartStore } from '@/features/cart/cart-store'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import type { CheckoutConfirmationState } from './CheckoutForm'

/**
 * `/checkout/confirmation`: shown once, right after checkout, from the order handed over in the
 * navigation state. A first version for S3.2; S3.3 (#13) adds copy and bookmark buttons and the
 * warning that the link can't be shown again.
 */
export function ConfirmationPage() {
  const state = useLocation().state as Partial<CheckoutConfirmationState> | null
  const order = state?.order
  const zone = state?.zone

  // The order is placed: the cart has done its job.
  useEffect(() => {
    if (order) cartStore.clear()
  }, [order])

  if (!order || !zone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon="🧁"
          title="Nothing to show here"
          description="This page only appears right after you place an order."
          action={<ButtonLink to="/">Back to the menu</ButtonLink>}
        />
      </div>
    )
  }

  const orderUrl = new URL(`/orders/${order.accessToken}`, window.location.origin).href

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-2">
        <CheckCircle2 aria-hidden="true" className="size-10 text-success" />
        <h1 className="text-3xl font-semibold sm:text-4xl">Thank you, your order is placed</h1>
        <p className="text-muted">
          The bakery will confirm it soon. Your reference is{' '}
          <strong className="font-semibold text-text">{order.reference}</strong>.
        </p>
      </div>

      <dl className="grid gap-3 rounded-card border border-border bg-surface p-5 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold">Pickup</dt>
        <dd>{formatLocal(order.pickupAt, zone, 'datetime')}</dd>
        <dt className="font-semibold">Items</dt>
        <dd>
          <ul>
            {order.lines.map((line) => (
              <li key={line.lineNo}>
                {line.quantity} × {line.itemName}
              </li>
            ))}
          </ul>
        </dd>
        <dt className="font-semibold">Subtotal</dt>
        <dd>{formatMoney(order.subtotal)}</dd>
      </dl>

      <div className="flex flex-col gap-2 rounded-card border border-primary/40 bg-primary/5 p-5">
        <h2 className="text-lg font-semibold">Your order link</h2>
        <p className="text-sm text-muted">
          Keep this link to check or cancel your order. It is the only way back to it.
        </p>
        <a href={orderUrl} className="font-mono text-sm break-all text-primary underline">
          {orderUrl}
        </a>
      </div>
    </div>
  )
}
