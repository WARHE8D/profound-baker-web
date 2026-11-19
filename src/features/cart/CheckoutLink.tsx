import { Button, ButtonLink } from '@/components'
import type { CheckedCart } from './cart-check'

/**
 * "Checkout": a link while the cart can be ordered; a disabled button (with the reason in its
 * title) while items are unavailable or still being checked.
 */
export function CheckoutLink({ cart, onNavigate }: { cart: CheckedCart; onNavigate?: () => void }) {
  const reason =
    cart.blocked.length > 0
      ? 'Remove the unavailable items first'
      : cart.checking
        ? 'Checking your cart…'
        : null

  if (reason) {
    return (
      <Button size="lg" disabled title={reason} className="w-full sm:w-auto">
        Checkout
      </Button>
    )
  }
  return (
    <ButtonLink to="/checkout" size="lg" onClick={onNavigate} className="w-full sm:w-auto">
      Checkout
    </ButtonLink>
  )
}
