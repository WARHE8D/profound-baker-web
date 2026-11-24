import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { formatMoney } from '@/lib/money'
import { seedDemo } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await import('@/features/dashboard/DashboardPage')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
})

afterEach(() => vi.useRealTimers())

async function openDashboard() {
  await signInAsOwner()
  const result = renderRoute('/owner')
  await screen.findByText(/It’s Friday, November 20\./)
  return result
}

const tile = (name: RegExp) => screen.getByRole('link', { name })

/** What the demo history paid in a month: paid now (not refunded), by when it was paid. */
const paidIn = (month: string) =>
  mockStore.invoices
    .filter((i) => i.status === 'PAID' && i.paidAt?.startsWith(month))
    .reduce((sum, i) => sum + i.total, 0)

test('greets the Owner with what today holds', async () => {
  seedDemo(mockStore)
  await openDashboard()

  expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.getByText(/^Hello, Sam\./)).toBeInTheDocument()

  // SC-D004 (15:00, confirmed) and SC-D005 (11:30, in progress): neither collected yet.
  const pickups = tile(/Today’s pickups/)
  expect(pickups).toHaveTextContent(/Today’s pickups\s*2\s*2 still to collect/)
  expect(pickups).toHaveAttribute('href', '/owner/orders?from=2026-11-20&to=2026-11-20&dir=asc')

  const pending = tile(/Waiting for you to confirm/)
  expect(pending).toHaveTextContent(/3/)
  expect(
    await within(pending).findByText('The oldest is cancelled automatically in 15 min'),
  ).toHaveClass('text-warning')
  expect(pending).toHaveAttribute('href', '/owner/orders?status=PENDING&dir=asc&sort=placed')

  const revenue = tile(/Paid in November 2026/)
  expect(revenue).toHaveTextContent(formatMoney(Math.round(paidIn('2026-11') * 100) / 100))
  expect(revenue).toHaveTextContent(/on October \(CA\$/)
  expect(revenue).toHaveAttribute('href', '/owner/invoices?status=PAID')
})

test('lists today’s pickups in time order, flagging ones not collected on time', async () => {
  seedDemo(mockStore)
  await openDashboard()

  const list = within(screen.getByRole('region', { name: 'Today’s pickups' }))
  const items = await list.findAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual([
    expect.stringMatching(/^11:30\sAMPriya NairSC-D005 · 1 itemNot collected$/),
    expect.stringMatching(/^3:00\sPMLucas MoreauSC-D004 · 5 itemsConfirmed$/),
  ])
  expect(list.getByRole('link', { name: /Priya Nair/ })).toHaveAttribute(
    'href',
    '/owner/orders/d0000000-0000-4000-8000-000000000005',
  )
})

test('charts paid revenue by month, with the numbers on hover and in a table', async () => {
  seedDemo(mockStore)
  await openDashboard()

  const chart = screen.getByRole('list', { name: 'Paid revenue by month' })
  const bars = within(chart).getAllByRole('button')
  expect(bars).toHaveLength(12)
  expect(bars[0]).toHaveAccessibleName(/^December 2025: CA\$0\.00 from 0 paid invoices$/)
  const october = formatMoney(Math.round(paidIn('2026-10') * 100) / 100)
  expect(bars[10]).toHaveAccessibleName(new RegExp(`^October 2026: ${october.replace('$', '\\$')}`))

  await userEvent.hover(bars[11]!)
  expect(screen.getByRole('status')).toHaveTextContent(/November 2026 \(so far\)/)

  await userEvent.click(screen.getByText('Show as a table'))
  const table = screen.getByRole('table', { name: 'Paid revenue by month' })
  expect(within(table).getByRole('row', { name: /^October 2026/ })).toHaveTextContent(october)
})

test('a quiet day, before any orders', async () => {
  await openDashboard()

  expect(tile(/Today’s pickups/)).toHaveTextContent('Nothing to hand over today')
  expect(tile(/Waiting for you to confirm/)).toHaveTextContent('All caught up')
  expect(tile(/Paid in November 2026/)).toHaveTextContent('CA$0.00')
  expect(screen.getByText('No payments recorded in these months yet.')).toBeInTheDocument()
  expect(await screen.findByText('No orders are due today.')).toBeInTheDocument()
})

test('confirming an order elsewhere in the app updates the counts', async () => {
  seedDemo(mockStore)
  const { router } = await openDashboard()
  expect(tile(/Waiting for you to confirm/)).toHaveTextContent(/3/)

  await router.navigate('/owner/orders/d0000000-0000-4000-8000-000000000001')
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm order' }))
  await screen.findByText('Order confirmed')
  await router.navigate('/owner')

  // SC-D002 is now the oldest: placed 21 h ago.
  expect(
    await screen.findByText(/The oldest is cancelled automatically in 2 h 59 min|in 3 h/),
  ).toBeInTheDocument()
  expect(tile(/Waiting for you to confirm/)).toHaveTextContent(/^Waiting for you to confirm2/)
})
