import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RouteObject } from 'react-router'
import { expect, test, vi } from 'vitest'
import { ApiError } from '@/api'
import { renderRoute } from '@/test/render'
import { PublicLayout } from './layouts/PublicLayout'
import { RouteErrorBoundary } from './pages/RouteErrorBoundary'

test('/ shows the storefront: header, cart button, page and footer', async () => {
  renderRoute('/')

  expect(
    await screen.findByRole('heading', { level: 1, name: /fresh from the oven/i }),
  ).toBeInTheDocument()
  const banner = screen.getByRole('banner')
  expect(within(banner).getByRole('link', { name: 'SugarCrumbs' })).toHaveAttribute('href', '/')
  expect(within(banner).getByRole('button', { name: 'Cart, 0 items' })).toBeEnabled()
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(
    within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Owner sign in' }),
  ).toHaveAttribute('href', '/owner')
})

test('every page starts with a skip link to the main content', async () => {
  renderRoute('/')

  await userEvent.tab()
  expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
})

test('an unknown public URL shows the 404 page inside the storefront layout', async () => {
  renderRoute('/no-such-page')

  expect(
    await screen.findByRole('heading', { name: "We couldn't find that page" }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to the shop' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('banner')).toBeInTheDocument()
})

test('/owner shows the owner layout with Dashboard as the current page', async () => {
  renderRoute('/owner')

  const nav = await screen.findByRole('navigation', { name: 'Owner' })
  expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
})

test('the owner sidebar navigates between sections', async () => {
  renderRoute('/owner')
  const nav = await screen.findByRole('navigation', { name: 'Owner' })

  await userEvent.click(within(nav).getByRole('link', { name: 'Orders' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Orders' })).toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: 'Orders' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
})

test('an unknown owner URL shows the 404 page inside the owner layout', async () => {
  renderRoute('/owner/no-such-page')

  expect(
    await screen.findByRole('heading', { name: "We couldn't find that page" }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/owner')
  expect(screen.getByRole('navigation', { name: 'Owner' })).toBeInTheDocument()
})

test('/dev/ui shows the component gallery in development', async () => {
  renderRoute('/dev/ui')

  expect(await screen.findByRole('heading', { name: 'UI primitives' })).toBeInTheDocument()
})

function Boom(): never {
  throw new Error('Kaboom')
}

test('a page that crashes shows the error inside the layout, keeping the navigation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const routes: RouteObject[] = [
    {
      path: '/',
      Component: PublicLayout,
      ErrorBoundary: RouteErrorBoundary,
      children: [
        { ErrorBoundary: RouteErrorBoundary, children: [{ index: true, Component: Boom }] },
      ],
    },
  ]

  renderRoute('/', { routes })

  const alert = await screen.findByRole('alert')
  expect(within(alert).getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  expect(within(alert).getByText('Kaboom')).toBeInTheDocument()
  expect(within(alert).getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
})

function FailingApiCall(): never {
  throw new ApiError({ status: 500, message: 'The server had a problem.', requestId: 'req-500' })
}

function MissingApiResource(): never {
  throw new ApiError({ status: 404, message: 'item not found' })
}

test('an API error shows its message and request id', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const routes: RouteObject[] = [
    {
      path: '/',
      Component: PublicLayout,
      ErrorBoundary: RouteErrorBoundary,
      children: [
        {
          ErrorBoundary: RouteErrorBoundary,
          children: [{ index: true, Component: FailingApiCall }],
        },
      ],
    },
  ]

  renderRoute('/', { routes })

  const alert = await screen.findByRole('alert')
  expect(within(alert).getByText('The server had a problem.')).toBeInTheDocument()
  expect(within(alert).getByText('req-500')).toBeInTheDocument()
})

test('an API 404 shows the not-found page', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const routes: RouteObject[] = [
    {
      path: '/',
      Component: PublicLayout,
      ErrorBoundary: RouteErrorBoundary,
      children: [
        {
          ErrorBoundary: RouteErrorBoundary,
          children: [{ index: true, Component: MissingApiResource }],
        },
      ],
    },
  ]

  renderRoute('/', { routes })

  expect(
    await screen.findByRole('heading', { name: "We couldn't find that page" }),
  ).toBeInTheDocument()
})
