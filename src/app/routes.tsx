import type { RouteObject } from 'react-router'
import { CartPage } from '@/features/cart/CartPage'
import { RequireOwner } from '@/features/auth/RequireOwner'
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

/** Owner pages that exist, by their path under /owner; the rest of the nav shows "coming soon". */
const ownerPages: Record<string, RouteObject['lazy']> = {
  '': async () => ({
    Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage,
  }),
  orders: async () => ({ Component: (await import('@/features/orders/OrdersPage')).OrdersPage }),
  items: async () => ({ Component: (await import('@/features/items/ItemsPage')).ItemsPage }),
  production: async () => ({
    Component: (await import('@/features/dashboard/ProductionPage')).ProductionPage,
  }),
  invoices: async () => ({
    Component: (await import('@/features/invoices/InvoicesPage')).InvoicesPage,
  }),
  categories: async () => ({
    Component: (await import('@/features/categories/CategoriesPage')).CategoriesPage,
  }),
  availability: async () => ({
    Component: (await import('@/features/availability/AvailabilityPage')).AvailabilityPage,
  }),
  profile: async () => ({
    Component: (await import('@/features/profile/ProfilePage')).ProfilePage,
  }),
}

/**
 * Two trees, each with its own layout:
 *   /        storefront (public)
 *   /owner/* owner dashboard, behind RequireOwner (sign-in at /owner/login, outside both)
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
          // Checkout is split into its own chunk: the form libraries (Zod, React Hook Form) only
          // load once a guest gets there.
          {
            path: 'checkout',
            lazy: async () => ({
              Component: (await import('@/features/checkout/CheckoutPage')).CheckoutPage,
            }),
          },
          {
            path: 'checkout/confirmation',
            lazy: async () => ({
              Component: (await import('@/features/checkout/ConfirmationPage')).ConfirmationPage,
            }),
          },
          // The guest's order, from the magic link in the confirmation page.
          {
            path: 'orders/:token',
            lazy: async () => ({
              Component: (await import('@/features/orders/GuestOrderPage')).GuestOrderPage,
            }),
          },
          ...devRoutes,
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
  // Its own bare page: no storefront header, and outside the guard so it can't redirect to itself.
  {
    path: '/owner/login',
    ErrorBoundary: RouteErrorBoundary,
    lazy: async () => ({ Component: (await import('@/features/auth/LoginPage')).LoginPage }),
  },
  {
    path: '/owner',
    element: (
      <RequireOwner>
        <OwnerLayout />
      </RequireOwner>
    ),
    ErrorBoundary: RouteErrorBoundary,
    children: [
      {
        ErrorBoundary: RouteErrorBoundary,
        children: [
          {
            path: 'items/new',
            lazy: async () => ({
              Component: (await import('@/features/items/ItemEditorPage')).ItemEditorPage,
            }),
          },
          {
            path: 'items/:itemId',
            lazy: async () => ({
              Component: (await import('@/features/items/ItemEditorPage')).ItemEditorPage,
            }),
          },
          {
            path: 'orders/:orderId',
            lazy: async () => ({
              Component: (await import('@/features/orders/OrderDetailPage')).OrderDetailPage,
            }),
          },
          {
            path: 'invoices/:invoiceId',
            lazy: async () => ({
              Component: (await import('@/features/invoices/InvoicePage')).InvoicePage,
            }),
          },
          ...ownerNav.map(({ path, label, sprint }): RouteObject => {
            const built = ownerPages[path]
            if (built) return path === '' ? { index: true, lazy: built } : { path, lazy: built }
            const element = <ComingSoonPage title={label} sprint={sprint} />
            return path === '' ? { index: true, element } : { path, element }
          }),
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
]
