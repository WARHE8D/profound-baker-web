import type { RouteObject } from 'react-router'
import { CartPage } from '@/features/cart/CartPage'
import { CataloguePage } from '@/features/catalogue/CataloguePage'
import { ItemPage } from '@/features/catalogue/ItemPage'
import { OwnerLayout } from './layouts/OwnerLayout'
import { ownerNav } from './layouts/owner-nav'
import { PublicLayout } from './layouts/PublicLayout'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorBoundary } from './pages/RouteErrorBoundary'

// Only in `npm run dev`: lazy-loaded, so production builds never include the gallery.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/ui',
        lazy: async () => ({ Component: (await import('./pages/UiPreviewPage')).UiPreviewPage }),
      },
    ]
  : []

/**
 * Two trees, each with its own layout:
 *   /        storefront (public)
 *   /owner/* owner dashboard (sign-in guard added in S4.1)
 * Each layout has an outer error boundary (the layout itself failed) and an inner pathless one, so
 * a crashing page renders its error inside the layout and the navigation keeps working.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: PublicLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        ErrorBoundary: RouteErrorBoundary,
        children: [
          { index: true, Component: CataloguePage },
          { path: 'items/:itemId', Component: ItemPage },
          { path: 'cart', Component: CartPage },
          // Checkout and the pickup slot picker arrive in Sprint 3 (#11, #12).
          {
            path: 'checkout',
            element: (
              <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
                <ComingSoonPage title="Checkout" sprint={3} />
              </div>
            ),
          },
          ...devRoutes,
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
  {
    path: '/owner',
    Component: OwnerLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        ErrorBoundary: RouteErrorBoundary,
        children: [
          ...ownerNav.map(({ path, label, sprint }): RouteObject => {
            const element = <ComingSoonPage title={label} sprint={sprint} />
            return path === '' ? { index: true, element } : { path, element }
          }),
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
]
