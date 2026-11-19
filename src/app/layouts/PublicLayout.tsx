import { ShoppingBag } from 'lucide-react'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { Button } from '@/components'
import { useCartCount } from '@/features/cart/cart-store'
import { SkipLink } from './SkipLink'

// Computed once per page load; render stays pure.
const YEAR = new Date().getFullYear()

/** Storefront chrome: header with the cart button, page content, footer. */
export function PublicLayout() {
  const cartCount = useCartCount()

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="font-display text-2xl font-semibold text-primary">
            SugarCrumbs
          </Link>
          {/* The cart drawer arrives in S2.3 (#10); until then the button only shows the count. */}
          <Button
            variant="ghost"
            disabled
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            title="Cart (coming soon)"
          >
            <ShoppingBag aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span
                aria-hidden="true"
                className="min-w-5 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-fg"
              >
                {cartCount}
              </span>
            )}
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
      <ScrollRestoration />
    </div>
  )
}
