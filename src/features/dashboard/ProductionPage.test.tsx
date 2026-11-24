import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { seedDemo } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await import('@/features/dashboard/ProductionPage')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  seedDemo(mockStore)
})

afterEach(() => vi.useRealTimers())

async function openProduction(search = '') {
  await signInAsOwner()
  const result = renderRoute(`/owner/production${search}`)
  await screen.findByRole('heading', { level: 2, name: /November/ })
  return result
}

const rows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent)

test('adds up today’s confirmed orders, item by item', async () => {
  await openProduction()

  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Today, Friday, November 20')
  // SC-D004 (4 croissants, 1 baguette, confirmed) and SC-D005 (1 cake, in progress).
  expect(await screen.findByText('6 items across 2 orders')).toBeInTheDocument()
  expect(rows()).toEqual(['Baguette11', 'Butter croissant41', 'Chocolate fudge cake11'])
  expect(screen.queryByText(/counted$/)).not.toBeInTheDocument()
})

test('moves between days, kept in the URL; today stays out of it', async () => {
  const { router } = await openProduction()

  await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
  // Tomorrow: SC-D001 is still pending (not counted), SC-D007 was rejected.
  expect(await screen.findByText('Nothing to make')).toBeInTheDocument()
  expect(router.state.location.search).toBe('?date=2026-11-21')
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Tomorrow, Saturday, November 21',
  )
  expect(await screen.findByText('1 pending order isn’t counted')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review it' })).toHaveAttribute(
    'href',
    '/owner/orders?status=PENDING&from=2026-11-21&to=2026-11-21&dir=asc',
  )

  // A date input's value changes all at once, as when a day is picked from its calendar.
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-11-23' } })
  await waitFor(() => expect(rows()).toEqual(['Cinnamon roll121']))

  await userEvent.click(screen.getByRole('button', { name: 'Today' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

test('opens on the day in the URL, and prints it', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  await openProduction('?date=2026-11-23')

  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Monday, November 23')
  expect(await screen.findByText('12 items across 1 order')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Print' }))
  expect(print).toHaveBeenCalledOnce()
})

test('is in the owner navigation, and the dashboard links to it', async () => {
  await signInAsOwner()
  renderRoute('/owner')
  await userEvent.click(await screen.findByRole('link', { name: 'What to make' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Production list' }),
  ).toBeInTheDocument()
  const nav = screen.getByRole('navigation', { name: 'Owner' })
  expect(within(nav).getByRole('link', { name: 'Production' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
