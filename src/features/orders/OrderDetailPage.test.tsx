import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { apiBaseUrl } from '@/api/config'
import { demoOrders } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await Promise.all([
    import('@/features/orders/OrderDetailPage'),
    import('@/features/orders/OrdersPage'),
  ])
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  demoOrders(NOW).forEach((order) => mockStore.seed(order))
})

afterEach(() => vi.useRealTimers())

/** The demo orders' ids by reference: SC-D001 is …001. */
const idOf = (reference: string) => `d0000000-0000-4000-8000-000000000${reference.slice(-3)}`
const stored = (reference: string) => mockStore.findById(idOf(reference))!

async function openOrder(reference: string) {
  await signInAsOwner()
  const result = renderRoute(`/owner/orders/${idOf(reference)}`)
  await screen.findByRole('heading', { name: reference, level: 1 }, { timeout: 5000 })
  return result
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name })
const section = (name: string) =>
  screen.getByRole('heading', { name, level: 2 }).closest('section')!

test('shows the order, the guest and what happens next', async () => {
  await openOrder('SC-D003')

  expect(screen.getByText('Pending')).toBeInTheDocument()
  expect(screen.getByText(/Cancelled automatically in 22 h/)).toBeInTheDocument()
  expect(within(section('Pickup')).getByText('Nov 24, 2026, 2:00 PM')).toBeInTheDocument()
  expect(
    within(section('Items')).getByRole('row', { name: /Country sourdough 1/ }),
  ).toBeInTheDocument()
  expect(within(section('Notes from the guest')).getByText('Sliced, please')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'mei.chen@example.com' })).toHaveAttribute(
    'href',
    'mailto:mei.chen@example.com',
  )
  expect(screen.getByRole('link', { name: '+1 555 0178' })).toHaveAttribute('href', 'tel:+15550178')
  expect(within(section('Progress')).getByText(/Waiting for you/)).toBeInTheDocument()
  expect(
    within(section('Invoice')).getByText('Issued when you confirm the order.'),
  ).toBeInTheDocument()
  // Pending: confirm or reject only.
  expect(button('Confirm order')).toBeInTheDocument()
  expect(button('Reject…')).toBeInTheDocument()
  expect(queryButton('Start preparing')).not.toBeInTheDocument()
  expect(queryButton('Cancel order…')).not.toBeInTheDocument()
})

test('confirming issues the invoice and moves the order on', async () => {
  await openOrder('SC-D001')
  expect(screen.getByText(/Cancelled automatically in 15 min/)).toBeInTheDocument()

  await userEvent.click(button('Confirm order'))

  expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
  expect(stored('SC-D001').status).toBe('CONFIRMED')
  expect(screen.queryByText(/Cancelled automatically/)).not.toBeInTheDocument()
  const invoice = within(section('Invoice'))
  expect(await invoice.findByRole('link', { name: /^INV-2026-\d{4}$/ })).toHaveAttribute(
    'href',
    expect.stringMatching(/^\/owner\/invoices\//),
  )
  expect(invoice.getByText('Unpaid')).toBeInTheDocument()
  // Now it can be prepared, picked up or cancelled, but no longer edited.
  expect(button('Start preparing')).toBeInTheDocument()
  expect(button('Mark picked up')).toBeInTheDocument()
  expect(button('Cancel order…')).toBeInTheDocument()
  expect(queryButton('Edit items')).not.toBeInTheDocument()
  expect(queryButton(/notes/i)).not.toBeInTheDocument()
})

test('rejecting asks for a reason the guest will see', async () => {
  await openOrder('SC-D002')

  await userEvent.click(button('Reject…'))
  const dialog = await screen.findByRole('dialog', { name: 'Reject this order?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reject order' }))
  expect(within(dialog).getByText('Say why, so the guest knows.')).toBeInTheDocument()
  expect(stored('SC-D002').status).toBe('PENDING')

  await userEvent.type(within(dialog).getByLabelText(/Reason/), '  No cinnamon rolls on Wednesday ')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reject order' }))

  expect(await screen.findByText('Order rejected: SC-D002')).toBeInTheDocument()
  expect(stored('SC-D002')).toMatchObject({
    status: 'REJECTED',
    rejectionReason: 'No cinnamon rolls on Wednesday',
  })
  expect(screen.getByText(/Reason given: “No cinnamon rolls on Wednesday”/)).toBeInTheDocument()
  expect(queryButton('Confirm order')).not.toBeInTheDocument()
  expect(queryButton('Reschedule')).not.toBeInTheDocument()
})

test('a confirmed order is prepared, then picked up', async () => {
  await openOrder('SC-D004')

  await userEvent.click(button('Start preparing'))
  expect(await screen.findByText('Preparation started')).toBeInTheDocument()
  expect(stored('SC-D004').status).toBe('IN_PROGRESS')
  expect(queryButton('Start preparing')).not.toBeInTheDocument()

  await userEvent.click(button('Mark picked up'))
  expect(await screen.findByText('Marked as picked up')).toBeInTheDocument()
  expect(stored('SC-D004').status).toBe('FULFILLED')
  expect(screen.getByText('Picked up. Nothing more to do.')).toBeInTheDocument()
  expect(queryButton('Cancel order…')).not.toBeInTheDocument()
})

test('cancelling a confirmed order voids its unpaid invoice', async () => {
  await openOrder('SC-D006')
  expect(await within(section('Invoice')).findByText('Unpaid')).toBeInTheDocument()

  await userEvent.click(button('Cancel order…'))
  const dialog = await screen.findByRole('dialog', { name: 'Cancel this order?' })
  await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Oven broke down')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel order' }))

  expect(await screen.findByText('Order cancelled: SC-D006')).toBeInTheDocument()
  expect(stored('SC-D006')).toMatchObject({
    status: 'CANCELLED',
    cancellationReason: 'Oven broke down',
  })
  expect(await within(section('Invoice')).findByText('Void')).toBeInTheDocument()
})

test('an order changed elsewhere is reloaded, and the Owner is told', async () => {
  await openOrder('SC-D001')
  // Confirmed in another tab after this one loaded it.
  mockStore.updateOrder(stored('SC-D001'), { status: 'CONFIRMED' })

  await userEvent.click(button('Reject…'))
  const dialog = await screen.findByRole('dialog', { name: 'Reject this order?' })
  await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Too busy')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reject order' }))

  expect(await screen.findByText('Someone else changed this order')).toBeInTheDocument()
  expect(screen.getByText(/It's now confirmed/)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button('Start preparing')).toBeInTheDocument()
  expect(stored('SC-D001').status).toBe('CONFIRMED')
})

test('a 409 reloads the order and says someone else changed it', async () => {
  await openOrder('SC-D004')
  server.use(
    http.patch(`${apiBaseUrl}/api/orders/:id/fulfill`, () => {
      // Another request won the race: it started preparation first.
      mockStore.updateOrder(stored('SC-D004'), { status: 'IN_PROGRESS' })
      return HttpResponse.json(
        {
          timestamp: NOW.toISOString(),
          status: 409,
          error: 'Conflict',
          message: 'the resource was changed by another request; reload and try again',
          path: '/api/orders/x/fulfill',
          fieldErrors: null,
        },
        { status: 409, headers: { 'X-Request-Id': 'req-409' } },
      )
    }),
  )

  await userEvent.click(button('Mark picked up'))

  expect(await screen.findByText('Someone else changed this order')).toBeInTheDocument()
  expect(screen.getByText(/It's now in progress/)).toBeInTheDocument()
  expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
  expect(queryButton('Start preparing')).not.toBeInTheDocument()
})

test('a refusal that changed nothing is shown with its reference', async () => {
  await openOrder('SC-D004')
  server.use(
    http.patch(`${apiBaseUrl}/api/orders/:id/start-preparation`, () =>
      HttpResponse.json(
        {
          timestamp: NOW.toISOString(),
          status: 500,
          error: 'Internal Server Error',
          message: 'an unexpected error occurred',
          path: '/api/orders/x/start-preparation',
          fieldErrors: null,
        },
        { status: 500, headers: { 'X-Request-Id': 'req-500' } },
      ),
    ),
  )

  await userEvent.click(button('Start preparing'))

  expect(await screen.findByText('an unexpected error occurred')).toBeInTheDocument()
  expect(screen.getByText('req-500')).toBeInTheDocument()
  expect(stored('SC-D004').status).toBe('CONFIRMED')
})

test('edits a pending order’s items: quantities, removals and new items at today’s price', async () => {
  await openOrder('SC-D002')

  await userEvent.click(button('Edit items'))
  const items = within(section('Items'))
  // Sold-out and hidden items can't be added; ones already on the order aren't offered again.
  const add = items.getByLabelText('Add an item')
  await waitFor(() => expect(within(add).getAllByRole('option').length).toBeGreaterThan(1))
  const offered = within(add)
    .getAllByRole('option')
    .map((o) => o.textContent)
  expect(offered).toEqual([
    'Choose an item…',
    'Baguette (CA$3.25)',
    'Butter croissant (CA$3.75)',
    'Country sourdough (CA$8.50)',
  ])

  await userEvent.click(items.getByRole('button', { name: 'Remove Cinnamon roll' }))
  const cake = items.getByRole('group', { name: 'Quantity of Chocolate fudge cake' })
  await userEvent.click(within(cake).getByRole('button', { name: 'One more' }))
  await userEvent.selectOptions(add, 'Butter croissant (CA$3.75)')
  expect(items.getByText(/New subtotal/)).toHaveTextContent('New subtotal CA$87.75 (was CA$69.00)')

  await userEvent.click(items.getByRole('button', { name: 'Save items' }))

  expect(await screen.findByText('Items saved')).toBeInTheDocument()
  expect(stored('SC-D002').lines.map((l) => [l.itemName, l.quantity])).toEqual([
    ['Chocolate fudge cake', 2],
    ['Butter croissant', 1],
  ])
  expect(within(section('Items')).getByRole('row', { name: /Subtotal/ })).toHaveTextContent(
    'CA$87.75',
  )
})

test('won’t save items over a change made since the editor opened', async () => {
  await openOrder('SC-D002')
  await userEvent.click(button('Edit items'))
  const items = within(section('Items'))
  await userEvent.click(items.getByRole('button', { name: 'Remove Cinnamon roll' }))
  // The guest's notes were edited meanwhile, in another tab.
  mockStore.updateOrder(stored('SC-D002'), { notes: 'Gift wrap, please' })

  await userEvent.click(items.getByRole('button', { name: 'Save items' }))

  expect(await screen.findByText('Someone else changed this order')).toBeInTheDocument()
  expect(stored('SC-D002').lines).toHaveLength(2)
  expect(await screen.findByText('Gift wrap, please')).toBeInTheDocument()
})

test('edits a pending order’s notes', async () => {
  await openOrder('SC-D003')

  await userEvent.click(button('Edit notes'))
  const notes = within(section('Notes from the guest')).getByLabelText('Notes')
  await userEvent.clear(notes)
  await userEvent.type(notes, 'Sliced, and a paper bag')
  await userEvent.click(button('Save notes'))

  expect(await screen.findByText('Notes saved')).toBeInTheDocument()
  expect(stored('SC-D003').notes).toBe('Sliced, and a paper bag')
  expect(screen.getByText('Sliced, and a paper bag')).toBeInTheDocument()
})

test('reschedules to any free slot, sooner than the usual notice', async () => {
  // SC-D002 has a 48-hour cake on it; the Owner may still move it to today.
  await openOrder('SC-D002')

  await userEvent.click(button('Reschedule'))
  const dialog = await screen.findByRole('dialog', { name: 'Reschedule SC-D002' })
  await userEvent.click(
    await within(dialog).findByRole('radio', { name: /^12:30/ }, { timeout: 5000 }),
  )
  await userEvent.click(
    within(dialog).getByRole('button', { name: /^Move to Nov 20, 2026, 12:30/ }),
  )

  expect(await screen.findByText('Pickup moved')).toBeInTheDocument()
  expect(stored('SC-D002').pickupAt).toBe('2026-11-20T17:30:00Z')
  expect(within(section('Pickup')).getByText('Nov 20, 2026, 12:30 PM')).toBeInTheDocument()
})

test('an unknown order says so', async () => {
  await signInAsOwner()
  renderRoute('/owner/orders/d0000000-0000-4000-8000-000000000999')

  expect(await screen.findByText('Order not found', {}, { timeout: 5000 })).toBeInTheDocument()
})

test('“All orders” goes back to the list as it was filtered', async () => {
  await signInAsOwner()
  const { router } = renderRoute('/owner/orders?status=PENDING&dir=asc&sort=placed')
  const table = await screen.findByRole('table', {}, { timeout: 5000 })
  await userEvent.click(within(table).getByRole('link', { name: 'SC-D002' }))
  await screen.findByRole('heading', { name: 'SC-D002', level: 1 })

  await userEvent.click(screen.getByRole('link', { name: 'All orders' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/orders'))
  expect(router.state.location.search).toBe('?status=PENDING&dir=asc&sort=placed')
})
