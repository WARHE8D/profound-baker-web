import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink, EmptyState, Spinner } from '@/components'
import { useCheckedCart, type CheckedCart } from '@/features/cart/cart-check'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { CheckoutForm } from './CheckoutForm'
import { longestLeadTime } from './slots'
import { SlotPicker, type PickupSelection } from './SlotPicker'

/**
 * `/checkout`: step 1 picks the pickup time, step 2 takes the guest's details and places the
 * order.
 */
export function CheckoutPage() {
  const cart = useCheckedCart()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold sm:text-4xl">Checkout</h1>
      <CheckoutBody cart={cart} />
    </div>
  )
}

function CheckoutBody({ cart }: { cart: CheckedCart }) {
  const [pickup, setPickup] = useState<PickupSelection | null>(null)
  const [pickupProblem, setPickupProblem] = useState<string | null>(null)
  const pickupHeading = useRef<HTMLHeadingElement>(null)

  function choosePickup(selection: PickupSelection | null) {
    setPickup(selection)
    if (selection) setPickupProblem(null)
  }

  /** Back to step 1 with a reason: no slot picked, it was taken, or it is too soon. */
  function showPickupProblem(message: string, { focus = true }: { focus?: boolean } = {}) {
    setPickupProblem(message)
    if (!focus) return
    // Focusing also scrolls it into view (scroll-mt keeps a little room above).
    pickupHeading.current?.focus()
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon="🧺"
        title="Your cart is empty"
        description="Add something from the menu to check out."
        action={<ButtonLink to="/">Browse the menu</ButtonLink>}
      />
    )
  }
  if (cart.blocked.length > 0) {
    return (
      <EmptyState
        icon="⚠️"
        title="Some items can't be ordered right now"
        description="Remove the unavailable items from your cart, then come back to check out."
        action={<ButtonLink to="/cart">Review your cart</ButtonLink>}
      />
    )
  }
  if (cart.checking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner label={null} />
        <output>Checking your cart…</output>
      </div>
    )
  }

  // Lines that couldn't be checked have no known lead time; the server checks it at checkout.
  const leadTimeHours = longestLeadTime(
    cart.lines.flatMap((line) => ('item' in line.check ? [line.check.item.leadTimeHours] : [])),
  )

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
      <div className="flex flex-col gap-8">
        <section aria-labelledby="pickup-heading" className="flex flex-col gap-4">
          <h2
            id="pickup-heading"
            ref={pickupHeading}
            tabIndex={-1}
            className="scroll-mt-6 text-xl font-semibold outline-none"
          >
            1. Pickup time
          </h2>
          {pickupProblem && (
            <p role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm">
              {pickupProblem}
            </p>
          )}
          <SlotPicker leadTimeHours={leadTimeHours} value={pickup} onChange={choosePickup} />
        </section>

        <CheckoutForm cart={cart} pickup={pickup} onPickupProblem={showPickupProblem} />
      </div>

      <OrderSummary cart={cart} pickup={pickup} />
    </div>
  )
}

function OrderSummary({ cart, pickup }: { cart: CheckedCart; pickup: PickupSelection | null }) {
  return (
    <aside
      aria-labelledby="summary-heading"
      className="flex h-fit flex-col gap-4 rounded-card border border-border bg-surface p-5 lg:sticky lg:top-6"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="summary-heading" className="text-lg font-semibold">
          Your order
        </h2>
        <Link to="/cart" className="text-sm text-primary underline-offset-4 hover:underline">
          Edit cart
        </Link>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {cart.lines.map((line) => (
          <li key={line.itemId} className="flex justify-between gap-3">
            <span>
              {line.quantity} × {'item' in line.check ? line.check.item.name : line.name}
            </span>
            <span className="tabular-nums">{formatMoney(line.total)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-border pt-3 font-semibold">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatMoney(cart.subtotal)}</span>
      </p>
      <div className="border-t border-border pt-3 text-sm">
        <p className="font-semibold">Pickup</p>
        <p aria-live="polite" className={pickup ? '' : 'text-muted'}>
          {pickup
            ? formatLocal(pickup.slot.startsAt, pickup.zone, 'datetime')
            : 'Choose a pickup time'}
        </p>
      </div>
    </aside>
  )
}
