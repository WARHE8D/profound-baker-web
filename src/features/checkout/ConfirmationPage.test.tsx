import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import type { Schema } from '@/api/types'
import { cartStore } from '@/features/cart/cart-store'
import { FIXTURE_TIME_ZONE, ids, items, toPublicItem } from '@/mocks/fixtures'
import { renderRoute } from '@/test/render'
import type { CheckoutConfirmationState } from './CheckoutForm'
import { COPIED_RESET_MS } from './ConfirmationPage'

beforeAll(async () => {
  await import('@/features/checkout/ConfirmationPage')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // Drop any clipboard stub so the next test starts like a browser without one.
  delete (navigator as { clipboard?: Clipboard }).clipboard
})

const TOKEN = 'tok_3f9c2a7e1b'
const ORDER_URL = `${window.location.origin}/orders/${TOKEN}`

const order: Schema<'CheckoutResponse'> = {
  id: '50000000-0000-4000-8000-000000000001',
  reference: 'SC-1001K',
  // 1 PM in New York.
  pickupAt: '2026-11-20T18:00:00Z',
  status: 'PENDING',
  lines: [
    {
      lineNo: 1,
      itemId: ids.items.croissant,
      itemName: 'Butter croissant',
      unitPrice: 3.75,
      quantity: 2,
      lineTotal: 7.5,
    },
    {
      lineNo: 2,
      itemId: null,
      itemName: 'Sourdough loaf',
      unitPrice: 9,
      quantity: 1,
      lineTotal: 9,
    },
  ],
  subtotal: 16.5,
  guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
  notes: null,
  cancellationReason: null,
  rejectionReason: null,
  createdAt: '2026-11-20T17:00:00Z',
  updatedAt: '2026-11-20T17:00:00Z',
  accessToken: TOKEN,
}

function renderConfirmation() {
  const state: CheckoutConfirmationState = { order, zone: FIXTURE_TIME_ZONE }
  return renderRoute({ pathname: '/checkout/confirmation', state })
}

const copyButton = () => screen.getByRole('button', { name: /^(Copy link|Copied)$/ })

test('shows the reference, pickup time, lines and the order link', async () => {
  renderConfirmation()

  expect(
    await screen.findByRole('heading', { name: 'Thank you, your order is placed' }),
  ).toBeInTheDocument()
  expect(screen.getByText('SC-1001K')).toBeInTheDocument()
  expect(screen.getByText(/Nov 20, 2026, 1:00\sPM/)).toBeInTheDocument()
  expect(screen.getByText('2 × Butter croissant')).toBeInTheDocument()
  expect(screen.getByText('1 × Sourdough loaf')).toBeInTheDocument()
  expect(screen.getByText('CA$16.50')).toBeInTheDocument()

  expect(screen.getByRole('link', { name: ORDER_URL })).toHaveAttribute('href', ORDER_URL)
  expect(screen.getByRole('note')).toHaveTextContent(/This link is shown only once/)
})

test('copies the order link and says so for a moment', async () => {
  // A plain clipboard stub and fireEvent: user-event's own stub and pauses stall on fake timers.
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  renderConfirmation()
  await screen.findByRole('heading', { name: 'Save your order link' })

  // Fake the "Copied" reset timer only now: findBy* above polls with real timers.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await act(async () => {
    fireEvent.click(copyButton())
  })

  expect(writeText).toHaveBeenCalledWith(ORDER_URL)
  expect(copyButton()).toHaveTextContent('Copied')
  expect(screen.getByRole('status')).toHaveTextContent('Order link copied')

  act(() => vi.advanceTimersByTime(COPIED_RESET_MS))
  expect(copyButton()).toHaveTextContent('Copy link')
})

test('selects the link for copying by hand when the clipboard is blocked', async () => {
  const user = userEvent.setup()
  renderConfirmation()
  await screen.findByRole('heading', { name: 'Save your order link' })
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'))

  await user.click(copyButton())

  expect(await screen.findByText("Couldn't copy the link")).toBeInTheDocument()
  expect(window.getSelection()?.toString()).toBe(ORDER_URL)
  expect(copyButton()).toHaveTextContent('Copy link')
})

test('opens the order page in a new tab to bookmark it', async () => {
  renderConfirmation()

  const open = await screen.findByRole('link', { name: 'Open to bookmark' })
  expect(open).toHaveAttribute('href', `/orders/${TOKEN}`)
  expect(open).toHaveAttribute('target', '_blank')
})

test('empties the cart', async () => {
  cartStore.add(toPublicItem(items.find((i) => i.id === ids.items.croissant)!), 2)
  renderConfirmation()

  await screen.findByRole('heading', { name: 'Thank you, your order is placed' })
  expect(cartStore.getLines()).toEqual([])
})

test('explains itself when opened without an order', async () => {
  renderRoute('/checkout/confirmation')

  expect(await screen.findByText('Nothing to show here')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
})
