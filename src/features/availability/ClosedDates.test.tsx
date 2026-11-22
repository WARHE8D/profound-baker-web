import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { api, unwrap } from '@/api'
import { slotToUtc } from '@/lib/time'
import { FIXTURE_TIME_ZONE, ids } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await import('@/features/availability/AvailabilityPage')
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
})

afterEach(() => vi.useRealTimers())

async function openPage() {
  await signInAsOwner()
  const result = renderRoute('/owner/availability')
  // Three queries (hours, bakery, closures) after sign-in: slower than 1 s when the suite is busy.
  await screen.findByRole('list', { name: 'Upcoming closed dates' }, { timeout: 5000 })
  return result
}

/** Intl puts thin spaces around range dashes. */
const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ')
const upcoming = () =>
  within(screen.getByRole('list', { name: 'Upcoming closed dates' }))
    .getAllByRole('listitem')
    .map((li) => plain(li.textContent))

async function openAddDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Add closed dates' }))
  return screen.findByRole('dialog', { name: 'Add closed dates' })
}

async function typeDate(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(new RegExp(`^${label}`))
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

test('lists upcoming closures soonest first, yearly ones with their next dates', async () => {
  await openPage()

  expect(upcoming()).toEqual([
    expect.stringMatching(
      /^December 25 – 26Every year2 days · Christmas · next Fri, Dec 25 – Sat, Dec 26, 2026/,
    ),
    expect.stringMatching(/^Mon, Jan 11 – Fri, Jan 15, 20275 days · Bakery holiday/),
  ])
})

test('adds a single closed day, which guests then can’t choose', async () => {
  await openPage()
  const dialog = await openAddDialog()

  await typeDate(dialog, 'First day', '2026-12-24')
  expect(within(dialog).getByLabelText(/^Last day/)).toHaveValue('2026-12-24')
  await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Christmas Eve')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close these days' }))

  expect(plain((await screen.findByText(/^Closed Thu, Dec 24, 2026/)).textContent)).toBe(
    'Closed Thu, Dec 24, 2026',
  )
  expect(upcoming()[0]).toMatch(/^Thu, Dec 24, 20261 day · Christmas Eve/)
  expect(mockStore.dayAvailability('2026-12-24')).toMatchObject({
    open: false,
    reason: 'Christmas Eve',
  })
})

test('checks the dates before saving', async () => {
  await openPage()
  const dialog = await openAddDialog()
  const close = () => within(dialog).getByRole('button', { name: 'Close these days' })

  await userEvent.click(close())
  expect(await within(dialog).findByText('Choose the first closed day')).toBeVisible()

  await typeDate(dialog, 'First day', '2026-11-02')
  await userEvent.click(close())
  expect(await within(dialog).findByText('These days have already passed')).toBeVisible()

  await typeDate(dialog, 'First day', '2026-12-31')
  await typeDate(dialog, 'Last day', '2027-01-02')
  await userEvent.click(within(dialog).getByRole('checkbox', { name: /Every year/ }))
  await userEvent.click(close())
  expect(await within(dialog).findByText(/A yearly closure must end by December 31/)).toBeVisible()
  expect(mockStore.blockedDates).toHaveLength(2)
})

test('warns about orders already due on the chosen days, and about overlaps', async () => {
  await unwrap(
    api.POST('/api/public/orders', {
      body: {
        pickupAt: slotToUtc('2026-11-23', '10:00', FIXTURE_TIME_ZONE),
        guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
        lines: [{ itemId: ids.items.croissant, quantity: 2 }],
      },
    }),
  )
  await openPage()
  const dialog = await openAddDialog()

  await typeDate(dialog, 'First day', '2026-11-23')
  expect(plain((await within(dialog).findByRole('status')).textContent)).toMatch(
    /^1 order is due for pickup on Mon, Nov 23, 2026\. Closing these days doesn't cancel it/,
  )

  await typeDate(dialog, 'First day', '2026-12-26')
  await typeDate(dialog, 'Last day', '2026-12-27')
  expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
  expect(plain(within(dialog).getByText(/Already closed on some of these days/).textContent)).toBe(
    'Already closed on some of these days: December 25 – 26 (Christmas).',
  )
})

test('edits a closure', async () => {
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: /^Edit Mon, Jan 11/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Edit closed dates' })
  const reason = within(dialog).getByRole('textbox', { name: /Reason/ })
  await userEvent.clear(reason)
  await userEvent.type(reason, 'Winter break')
  await typeDate(dialog, 'Last day', '2027-01-17')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

  expect(await screen.findByText(/^Saved Mon, Jan 11/)).toBeInTheDocument()
  expect(upcoming()[1]).toMatch(/^Mon, Jan 11 – Sun, Jan 17, 20277 days · Winter break/)
  expect(mockStore.blockedDates.find((b) => b.reason === 'Winter break')).toMatchObject({
    startDate: '2027-01-11',
    endDate: '2027-01-17',
  })
})

test('removes a closure after asking', async () => {
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: /^Remove December 25/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Remove these closed dates?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

  expect(await screen.findByText(/^Reopened December 25/)).toBeInTheDocument()
  expect(upcoming()).toHaveLength(1)
  expect(mockStore.dayAvailability('2026-12-25').open).toBe(true)
})

test('past closures are kept apart and can only be removed', async () => {
  mockStore.setBlockedDates([
    ...mockStore.blockedDates,
    {
      id: '40000000-0000-4000-8000-000000000009',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      reason: 'Summer',
      recurringAnnually: false,
    },
  ])
  await openPage()

  expect(upcoming()).toHaveLength(2)
  await userEvent.click(screen.getByText('Past closed dates (1)'))
  const past = screen.getByRole('list', { name: 'Past closed dates' })
  expect(within(past).getByRole('button', { name: /^Remove Sat, Aug 1/ })).toBeVisible()
  expect(within(past).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
})
