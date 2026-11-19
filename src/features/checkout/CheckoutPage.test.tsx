import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cartStore } from '@/features/cart/cart-store'
import { FIXTURE_TIME_ZONE, ids, items, toPublicItem } from '@/mocks/fixtures'
import { slotToUtc } from '@/lib/time'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

// Friday 20 November 2026, 12:00 at the bakery (New York).
const NOW = new Date('2026-11-20T17:00:00Z')
const item = (id: string) => toPublicItem(items.find((i) => i.id === id)!)
const croissant = item(ids.items.croissant) // no lead time
const cake = item(ids.items.chocolateCake) // 48 hours

beforeEach(() => {
  // Only Date is faked: timers stay real so queries and user events run normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const day = (name: RegExp) => screen.getByRole('button', { name })
const slot = (name: RegExp) => screen.getByRole('radio', { name })
const summary = () => screen.getByRole('complementary', { name: 'Your order' })

function fillSlot(date: string, time: string) {
  for (let i = 0; i < 2; i += 1) {
    mockStore.placeOrder({
      pickupAt: slotToUtc(date, time, FIXTURE_TIME_ZONE),
      guestContact: { name: 'Other guest', email: 'other@example.com', phone: '+1 555 0102' },
      lines: [{ itemId: croissant.id, quantity: 1 }],
    })
  }
}

test('an empty cart has nothing to check out', async () => {
  renderRoute('/checkout')

  expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
})

test('offers today’s remaining slots first, and the picked slot shows in the summary', async () => {
  cartStore.add(croissant, 2)
  renderRoute('/checkout')

  expect(
    await screen.findByRole('group', { name: 'Pickup times on Friday, November 20' }),
  ).toBeInTheDocument()
  expect(day(/^Friday, November 20, 7 pickup times available$/)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // 12:00 starts right now and earlier slots have passed, so the list starts at 12:30.
  const times = screen.getAllByRole('radio').map((r) => r.closest('li')?.textContent)
  expect(times[0]).toMatch(/^12:30\sPM – 1:00\sPM2 places left$/)
  expect(times).toHaveLength(7)
  expect(within(summary()).getByText('Choose a pickup time')).toBeInTheDocument()

  await userEvent.click(slot(/^1:00\sPM – 1:30\sPM/))

  expect(slot(/^1:00\sPM – 1:30\sPM/)).toBeChecked()
  expect(within(summary()).getByText(/Nov 20, 2026, 1:00\sPM/)).toBeInTheDocument()
})

test('the cart’s longest lead time hides days that are too soon', async () => {
  cartStore.add(croissant, 1)
  cartStore.add(cake, 1)
  renderRoute('/checkout')

  // 48 hours from Friday noon is Sunday noon; Sunday is closed, so Monday comes first.
  expect(
    await screen.findByRole('group', { name: 'Pickup times on Monday, November 23' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/baked to order/)).toHaveTextContent(
    'Some items are baked to order (order 2 days ahead), so the first pickup times are on Monday, November 23.',
  )
  expect(screen.queryByRole('button', { name: /Friday, November 20/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Saturday, November 21/ })).not.toBeInTheDocument()
  expect(day(/^Sunday, November 22, closed: Closed on Sundays$/)).toBeDisabled()
  expect(screen.getAllByRole('radio')).toHaveLength(16) // 08:00–16:00 in 30-minute slots
})

test('full slots and fully booked days cannot be picked', async () => {
  cartStore.add(croissant, 1)
  for (const time of ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']) {
    fillSlot('2026-11-21', time)
  }
  fillSlot('2026-11-23', '10:00')
  renderRoute('/checkout')
  await screen.findByRole('group', { name: /Pickup times on/ })

  expect(day(/^Saturday, November 21, fully booked$/)).toBeDisabled()

  await userEvent.click(day(/^Monday, November 23/))

  expect(slot(/^10:00\sAM – 10:30\sAM/)).toBeDisabled()
  expect(slot(/^10:00\sAM – 10:30\sAM/).closest('li')).toHaveTextContent('Full')
  expect(slot(/^10:30\sAM – 11:00\sAM/)).toBeEnabled()
})

test('months can be browsed within the 62-day window; closures are marked', async () => {
  cartStore.add(croissant, 1)
  renderRoute('/checkout')
  await screen.findByRole('heading', { name: 'November 2026' })
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument()
  expect(day(/^Friday, December 25, closed: Christmas$/)).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument()
  expect(day(/^Wednesday, January 20, 16 pickup times available$/)).toBeEnabled()
  // The window ends on 20 January (62 days): later days are not offered.
  expect(screen.queryByRole('button', { name: /January 21/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
})

test('if the picked slot fills up, the guest is told and asked to choose again', async () => {
  cartStore.add(croissant, 1)
  const { queryClient } = renderRoute('/checkout')
  await screen.findByRole('group', { name: /Pickup times on/ })
  await userEvent.click(slot(/^1:00\sPM – 1:30\sPM/))

  fillSlot('2026-11-20', '13:00')
  await queryClient.invalidateQueries({ queryKey: ['availability'] })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The time you picked (Nov 20, 2026, 1:00 PM) is no longer available.',
  )
  await waitFor(() => expect(within(summary()).getByText('Choose a pickup time')).toBeVisible())
  expect(slot(/^1:00\sPM – 1:30\sPM/)).toBeDisabled()
  expect(slot(/^1:00\sPM – 1:30\sPM/)).not.toBeChecked()
})

test('a cart with unavailable items is sent back to the cart', async () => {
  cartStore.add(item(ids.items.cinnamonRoll), 1)
  renderRoute('/checkout')

  expect(
    await screen.findByRole('heading', { name: "Some items can't be ordered right now" }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review your cart' })).toHaveAttribute('href', '/cart')
})

test('a failed availability load can be retried', async () => {
  cartStore.add(croissant, 1)
  let fail = true
  server.use(
    http.get('http://localhost:8080/api/public/availability', () =>
      fail
        ? HttpResponse.json(
            { status: 400, message: 'range cannot exceed 62 days' },
            { status: 400, headers: { 'X-Request-Id': 'req-slots' } },
          )
        : undefined,
    ),
  )
  renderRoute('/checkout')

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent("We couldn't load the pickup times")
  expect(alert).toHaveTextContent('req-slots')

  fail = false
  await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
  expect(
    await screen.findByRole('group', { name: /Pickup times on Friday, November 20/ }),
  ).toBeInTheDocument()
})
