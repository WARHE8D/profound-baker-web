import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { seedDemo } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await Promise.all([
    import('@/features/invoices/InvoicesPage'),
    import('@/features/invoices/InvoicePage'),
  ])
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  seedDemo(mockStore)
})

afterEach(() => vi.useRealTimers())

async function openInvoices(search = '') {
  await signInAsOwner()
  const result = renderRoute(`/owner/invoices${search}`)
  await screen.findByRole('table')
  return result
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const numbers = () => rows().map((row) => within(row).getAllByRole('link')[0]!.textContent)
const row = (text: string) => rows().find((r) => r.textContent?.includes(text))!
const query = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search)

test('lists invoices newest first, with how each was settled', async () => {
  await openInvoices()

  // Confirmed most recently: SC-D006 (placed 26 h ago), then SC-D004, then SC-D005.
  expect(numbers().slice(0, 3)).toEqual(['INV-2026-0003', 'INV-2026-0001', 'INV-2026-0002'])
  expect(rows()).toHaveLength(20)
  expect(screen.getByText('21 invoices')).toBeInTheDocument()
  expect(row('SC-D004')).toHaveTextContent('Unpaid')
  expect(row('SC-D010')).toHaveTextContent(/Paid\s*Bank transfer, /)
  expect(row('SC-D011')).toHaveTextContent('CA$1.00 off')
  expect(row('SC-D013')).toHaveTextContent(/Refunded\s*Refunded /)
  expect(within(row('SC-D004')).getByRole('link', { name: 'SC-D004' })).toHaveAttribute(
    'href',
    '/owner/orders/d0000000-0000-4000-8000-000000000004',
  )
})

test('filters by quick view, status and search, kept in the URL', async () => {
  const { router } = await openInvoices()

  await userEvent.click(screen.getByRole('link', { name: 'Unpaid' }))
  await waitFor(() => expect(rows()).toHaveLength(3))
  expect(query(router).getAll('status')).toEqual(['PENDING'])
  expect(screen.getByRole('checkbox', { name: 'Unpaid' })).toBeChecked()

  await userEvent.click(screen.getByRole('checkbox', { name: 'Refunded' }))
  await waitFor(() => expect(rows()).toHaveLength(4))

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search invoices' }), 'd013')
  await waitFor(() => expect(numbers()).toEqual(['INV-2026-0008']))
  expect(query(router).get('q')).toBe('d013')

  await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
  await waitFor(() => expect(rows()).toHaveLength(20))
})

test('sorts by number and filters by issue date', async () => {
  const { router } = await openInvoices()

  await userEvent.click(screen.getByRole('button', { name: /Invoice/ }))
  await waitFor(() => expect(numbers()[0]).toBe('INV-2026-0021'))
  expect(query(router).get('sort')).toBe('number')
  await userEvent.click(screen.getByRole('button', { name: /Invoice/ }))
  await waitFor(() => expect(numbers()[0]).toBe('INV-2026-0001'))

  // Issued on Nov 19: SC-D004 (placed Nov 19, 11:00) and SC-D006 (Nov 19, 15:00).
  await userEvent.type(screen.getByLabelText('Issued from'), '2026-11-19')
  await userEvent.type(screen.getByLabelText('Issued to'), '2026-11-19')
  await waitFor(() => expect(numbers()).toEqual(['INV-2026-0001', 'INV-2026-0003']))
})

test('says when nothing is invoiced yet', async () => {
  mockStore.reset()
  mockStore.setNow(NOW)
  await signInAsOwner()
  renderRoute('/owner/invoices')

  expect(await screen.findByText('No invoices yet')).toBeInTheDocument()
})
