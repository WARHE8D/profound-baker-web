import { ShoppingBag } from 'lucide-react'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { useState } from 'react'
import { Button, RouteFocus } from '@/components'
import { CartDrawer } from '@/features/cart/CartDrawer'
import { useCartCount } from '@/features/cart/cart-store'
import { SkipLink } from './SkipLink'

// Computed once per page load; render stays pure.
const YEAR = new Date().getFullYear()

/** Storefront chrome: header with the cart button, page content, footer. */
export function PublicLayout() {
  const cartCount = useCartCount()
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="font-display text-2xl font-semibold text-primary">
            SugarCrumbs
          </Link>
          {/* Named by its text, "Cart 2 items": what it shows is part of what it is called. */}
          <Button variant="ghost" onClick={() => setCartOpen(true)} aria-haspopup="dialog">
            <ShoppingBag aria-hidden="true" className="size-5" />
            <span className="sr-only sm:not-sr-only">Cart</span>
            {/* Spaces outside the spans: a flex container doesn't show them, names keep them. */}{' '}
            {cartCount > 0 ? (
              <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-fg">
                {cartCount}
              </span>
            ) : (
              <span className="sr-only">0</span>
            )}{' '}
            <span className="sr-only">{cartCount === 1 ? 'item' : 'items'}</span>
          </Button>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {YEAR} SugarCrumbs. Baked fresh, picked up warm.</p>
          <Link to="/owner" className="underline-offset-4 hover:text-text hover:underline">
            Owner sign in
          </Link>
        </div>
      </footer>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <RouteFocus />
      <ScrollRestoration />
    </div>
  )
}
