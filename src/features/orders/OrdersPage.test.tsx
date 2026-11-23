import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { demoOrders } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await import('@/features/orders/OrdersPage')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  demoOrders(NOW).forEach((order) => mockStore.seed(order))
})

afterEach(() => vi.useRealTimers())

async function openOrders(search = '') {
  await signInAsOwner()
  const result = renderRoute(`/owner/orders${search}`)
  await screen.findByRole('table', {}, { timeout: 5000 })
  return result
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const references = () => rows().map((row) => within(row).getByRole('link').textContent)
const row = (reference: string) => rows().find((r) => r.textContent?.includes(reference))!
const query = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search)

test('lists orders latest pickup first, a page at a time', async () => {
  const { router } = await openOrders()

  expect(references().slice(0, 4)).toEqual(['SC-D003', 'SC-D006', 'SC-D008', 'SC-D002'])
  expect(within(row('SC-D004')).getByText('Today')).toBeInTheDocument()
  expect(row('SC-D004')).toHaveTextContent(/3:00 PM.*Lucas Moreau/)
  expect(within(row('SC-D004')).getByText('Confirmed')).toBeInTheDocument()
  expect(rows()).toHaveLength(20)
  expect(screen.getByText('26 orders')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(rows()).toHaveLength(6))
  expect(query(router).get('page')).toBe('2')
})

test('flags pending orders close to being cancelled automatically', async () => {
  await openOrders()

  expect(row('SC-D001')).toHaveTextContent('Auto-cancels in 15 min')
  expect(row('SC-D001')).toHaveClass('bg-warning/10')
  expect(row('SC-D002')).toHaveTextContent('Auto-cancels in 3 h')
  expect(row('SC-D003')).toHaveTextContent('Confirm within 22 h')
  expect(row('SC-D003')).not.toHaveClass('bg-warning/10')
})

test('quick views set the filters in the URL', async () => {
  const { router } = await openOrders()

  await userEvent.click(screen.getByRole('link', { name: 'Needs confirming' }))
  // Oldest first: the closest to being cancelled at the top.
  await waitFor(() => expect(references()).toEqual(['SC-D001', 'SC-D002', 'SC-D003']))
  expect(screen.getByRole('link', { name: 'Needs confirming' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByRole('checkbox', { name: 'Pending' })).toBeChecked()

  await userEvent.click(screen.getByRole('link', { name: 'Today' }))
  await waitFor(() => expect(references()).toEqual(['SC-D005', 'SC-D004']))
  expect(query(router).get('from')).toBe('2026-11-20')
})

test('filters by status, search and pickup dates, and clears them', async () => {
  const { router } = await openOrders()

  await userEvent.click(screen.getByRole('checkbox', { name: 'Rejected' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Cancelled' }))
  await waitFor(() => expect(references()).toEqual(['SC-D008', 'SC-D007']))
  expect(query(router).getAll('status')).toEqual(['REJECTED', 'CANCELLED'])

  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  // Search covers the guest's phone and email too.
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search orders' }), '555 0123')
  await waitFor(() => expect(query(router).get('q')).toBe('555 0123'))
  await waitFor(() => expect(references()).toEqual(['SC-D004', 'SC-D010', 'SC-D016', 'SC-D022']))
  expect(rows().every((r) => r.textContent?.includes('Lucas Moreau'))).toBe(true)

  await userEvent.clear(screen.getByRole('searchbox', { name: 'Search orders' }))
  await userEvent.type(screen.getByLabelText('Pickup from'), '2026-11-22')
  await userEvent.type(screen.getByLabelText('Pickup to'), '2026-11-22')
  await waitFor(() => expect(references()).toEqual(['SC-D008', 'SC-D002']))
})

test('sorts by when orders were placed', async () => {
  await openOrders()

  await userEvent.click(screen.getByRole('button', { name: 'Placed' }))
  await waitFor(() => expect(references()[0]).toBe('SC-D003'))
  expect(screen.getByRole('columnheader', { name: 'Placed' })).toHaveAttribute(
    'aria-sort',
    'descending',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Placed' }))
  await waitFor(() => expect(references()[0]).toBe('SC-D026'))
})

test('a shared link opens with its filters', async () => {
  await openOrders('?status=IN_PROGRESS')

  expect(references()).toEqual(['SC-D005'])
  expect(screen.getByRole('checkbox', { name: 'In progress' })).toBeChecked()
})

test('says when nothing matches', async () => {
  await signInAsOwner()
  renderRoute('/owner/orders?q=nobody')

  expect(await screen.findByText('No orders match', {}, { timeout: 5000 })).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
  expect(await screen.findByRole('table')).toBeInTheDocument()
})

test('says when there are no orders yet', async () => {
  mockStore.reset()
  mockStore.setNow(NOW)
  await signInAsOwner()
  renderRoute('/owner/orders')

  expect(await screen.findByText('No orders yet', {}, { timeout: 5000 })).toBeInTheDocument()
})

test('the navigation shows how many orders wait to be confirmed', async () => {
  await openOrders()

  const nav = screen.getByRole('navigation', { name: 'Owner' })
  expect(await within(nav).findByRole('link', { name: 'Orders, 3 pending' })).toBeInTheDocument()
})
