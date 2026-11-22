import { render } from '@testing-library/react'
import { createMemoryRouter, type InitialEntry, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '@/app/AppProviders'
import { createQueryClient } from '@/app/query-client'
import { routes as appRoutes } from '@/app/routes'

/**
 * Renders the app at `path` with an in-memory router and a fresh query cache, wrapped in the same
 * providers as the real app. `path` can be a location object to pass navigation `state`. Pass
 * `routes` to test a custom route tree.
 */
export function renderRoute(
  path: InitialEntry,
  { routes = appRoutes }: { routes?: RouteObject[] } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient()
  const result = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...result, router, queryClient }
}
