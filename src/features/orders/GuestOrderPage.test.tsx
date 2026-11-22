import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { ids } from '@/mocks/fixtures'
import type { StoredOrder } from '@/mocks/store'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

// /orders/:token is lazy-loaded; load it once up front so no test waits on compiling it.
beforeAll(async () => {
  await import('@/features/orders/GuestOrderPage')
})

// Friday 20 November 2026, 12:00 at the bakery (New York).
const NOW = new Date('2026-11-20T17:00:00Z')
// Monday 23 November, 10:00 in New York. Online cancelling closes 24 hours before.
const PICKUP_AT = '2026-11-23T15:00:00Z'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function placeOrder(changes: Partial<StoredOrder> = {}): StoredOrder {
  const order = mockStore.placeOrder({
    pickupAt: PICKUP_AT,
    guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
    notes: 'No nuts please',
    lines: [{ itemId: ids.items.croissant, quantity: 2 }],
  })
  // The stored order is the object the mock serves; changing it moves the order along.
  return Object.assign(order, changes)
}

async function openOrder(order: StoredOrder) {
  const result = renderRoute(`/orders/${order.accessToken}`)
  await screen.findByRole('heading', { name: `Order ${order.reference}` })
  return result
}

const progress = () => screen.getByRole('list', { name: 'Order progress' })
const currentStep = () =>
  within(progress())
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step')

test('shows a pending order with its pickup, lines and progress', async () => {
  const order = placeOrder()
  await openOrder(order)

  expect(screen.getByText('Waiting for confirmation')).toBeInTheDocument()
  expect(screen.getByText(/Nov 23, 2026, 10:00\sAM/)).toBeInTheDocument()
  expect(screen.getByText('12 Flour Street, Brooklyn NY 11201')).toBeInTheDocument()
  expect(screen.getByText(/2 × /)).toBeInTheDocument()
  expect(screen.getByText('No nuts please')).toBeInTheDocument()
  expect(currentStep()).toHaveTextContent(
    'Confirmed by the bakery (current step)Waiting for the bakery',
  )
  expect(within(progress()).getAllByRole('listitem')).toHaveLength(4)
})

test.each([
  ['CONFIRMED', 'Confirmed', 'Not started yet'],
  ['IN_PROGRESS', 'Being prepared', 'Under way'],
] as const)('a %s order is at "Being prepared"', async (status, badge, detail) => {
  await openOrder(placeOrder({ status }))

  expect(screen.getAllByText(badge).length).toBeGreaterThan(0)
  expect(currentStep()).toHaveTextContent(`Being prepared (current step)${detail}`)
})

test('a fulfilled order has every step done and nothing to cancel', async () => {
  await openOrder(placeOrder({ status: 'FULFILLED' }))

  expect(currentStep()).toBeUndefined()
  expect(within(progress()).getAllByText('(done)')).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
})

test('a declined order shows the bakery’s reason', async () => {
  await openOrder(placeOrder({ status: 'REJECTED', rejectionReason: 'Sold out of butter' }))

  expect(screen.getByText('Declined')).toBeInTheDocument()
  expect(currentStep()).toHaveTextContent('Declined by the bakery')
  expect(currentStep()).toHaveTextContent('Sold out of butter')
  expect(within(progress()).getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
})

test('cancels the order with a reason after asking', async () => {
  const order = placeOrder()
  await openOrder(order)

  expect(
    screen.getByText(/You can cancel online until Nov 22, 2026, 10:00\sAM/),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

  const dialog = screen.getByRole('dialog', { name: 'Cancel this order?' })
  // Changing their mind leaves the order alone.
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my order' }))
  expect(dialog).not.toBeVisible()
  expect(mockStore.findByToken(order.accessToken)?.status).toBe('PENDING')

  await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
  await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Plans changed')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))

  expect(await screen.findByText('Your order is cancelled')).toBeInTheDocument()
  expect(mockStore.findByToken(order.accessToken)).toMatchObject({
    status: 'CANCELLED',
    cancellationReason: 'Plans changed',
  })
  expect(currentStep()).toHaveTextContent('Cancelled')
  expect(currentStep()).toHaveTextContent('Plans changed')
  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
})

test('says it is too late to cancel online after the cutoff', async () => {
  mockStore.setNow(new Date('2026-11-22T16:00:00Z'))
  vi.setSystemTime(new Date('2026-11-22T16:00:00Z'))
  await openOrder(placeOrder({ status: 'CONFIRMED' }))

  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  expect(screen.getByText(/too late to cancel online/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '+1 555 0100' })).toHaveAttribute('href', 'tel:+15550100')
})

test('reloads the order when the server refuses the cancel (409)', async () => {
  const order = placeOrder()
  await openOrder(order)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

  // Meanwhile the bakery started on it.
  order.status = 'IN_PROGRESS'
  const dialog = screen.getByRole('dialog', { name: 'Cancel this order?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))

  expect(await screen.findByText("This order can't be cancelled any more")).toBeInTheDocument()
  await waitFor(() => expect(currentStep()).toHaveTextContent('Under way'))
  expect(dialog).not.toBeVisible()
  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
})

test('keeps the dialog open with the request id when the cancel fails', async () => {
  const order = placeOrder()
  server.use(
    http.post('*/api/public/orders/by-token/:token/cancel', () =>
      HttpResponse.json(
        { status: 500, message: 'Something broke', path: '/x', timestamp: NOW.toISOString() },
        { status: 500, headers: { 'X-Request-Id': 'req-123' } },
      ),
    ),
  )
  await openOrder(order)
  await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
  const dialog = screen.getByRole('dialog', { name: 'Cancel this order?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Something broke (reference req-123)',
  )
  expect(dialog).toBeVisible()
  expect(mockStore.findByToken(order.accessToken)?.status).toBe('PENDING')
})

test('an unknown or expired link gets its own page', async () => {
  renderRoute('/orders/not-a-real-token')

  expect(
    await screen.findByRole('heading', { name: 'This order link is expired or invalid' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to the menu' })).toHaveAttribute('href', '/')
})

test('a failed load offers a retry and shows the request id', async () => {
  server.use(
    http.get('*/api/public/orders/by-token/:token', () =>
      HttpResponse.json(
        { status: 503, message: 'Down for maintenance', path: '/x', timestamp: NOW.toISOString() },
        { status: 503, headers: { 'X-Request-Id': 'req-503' } },
      ),
    ),
  )
  renderRoute(`/orders/${placeOrder().accessToken}`)

  expect(
    await screen.findByText("We couldn't load your order", undefined, { timeout: 5000 }),
  ).toBeInTheDocument()
  expect(screen.getByText('req-503')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('keeps the token out of the page and its title', async () => {
  const order = placeOrder()
  const { container } = await openOrder(order)

  expect(document.title).not.toContain(order.accessToken)
  expect(container).not.toHaveTextContent(order.accessToken)
  expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  )
  expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
    'content',
    'no-referrer',
  )
})
