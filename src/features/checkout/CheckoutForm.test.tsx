import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { cartStore } from '@/features/cart/cart-store'
import { FIXTURE_TIME_ZONE, ids, items, toPublicItem } from '@/mocks/fixtures'
import { slotToUtc } from '@/lib/time'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

// /checkout is lazy-loaded; load it once up front so no test waits on compiling it.
beforeAll(async () => {
  await Promise.all([
    import('@/features/checkout/CheckoutPage'),
    import('@/features/checkout/ConfirmationPage'),
  ])
})

// Friday 20 November 2026, 12:00 at the bakery (New York).
const NOW = new Date('2026-11-20T17:00:00Z')
const ORDERS_URL = 'http://localhost:8080/api/public/orders'
const croissant = toPublicItem(items.find((i) => i.id === ids.items.croissant)!)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  cartStore.add(croissant, 2)
})

afterEach(() => {
  vi.useRealTimers()
})

const ONE_PM = /^1:00\sPM – 1:30\sPM/
const placeOrderButton = () => screen.getByRole('button', { name: /^Place order/ })

async function openCheckout() {
  const result = renderRoute('/checkout')
  await screen.findByRole('group', { name: /Pickup times on/ })
  return result
}

async function fillDetails({
  name = 'Jane Baker',
  email = 'jane@example.com',
  phone = '+1 555 0101',
  notes = '',
} = {}) {
  await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), name)
  await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), email)
  await userEvent.type(screen.getByRole('textbox', { name: /^Phone/ }), phone)
  if (notes) await userEvent.type(screen.getByRole('textbox', { name: /^Notes/ }), notes)
}

function fillSlot(time: string) {
  for (let i = 0; i < 2; i += 1) {
    mockStore.placeOrder({
      pickupAt: slotToUtc('2026-11-20', time, FIXTURE_TIME_ZONE),
      guestContact: { name: 'Other guest', email: 'other@example.com', phone: '+1 555 0102' },
      lines: [{ itemId: croissant.id, quantity: 1 }],
    })
  }
}

test('places the order and shows the confirmation with the order link', async () => {
  const { router } = await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails({ notes: 'No nuts please' })

  expect(placeOrderButton()).toHaveTextContent('Place order · CA$7.50')
  await userEvent.click(placeOrderButton())

  expect(
    await screen.findByRole('heading', { name: 'Thank you, your order is placed' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/checkout/confirmation')

  const [order] = mockStore.orders
  expect(order).toMatchObject({
    pickupAt: slotToUtc('2026-11-20', '13:00', FIXTURE_TIME_ZONE),
    guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
    notes: 'No nuts please',
    lines: [expect.objectContaining({ itemId: croissant.id, quantity: 2 })],
  })
  expect(screen.getByText(order!.reference)).toBeInTheDocument()
  expect(screen.getByText(/Nov 20, 2026, 1:00\sPM/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /\/orders\// })).toHaveAttribute(
    'href',
    `${window.location.origin}/orders/${order!.accessToken}`,
  )
  // The cart is emptied (in an effect, so maybe a moment after the heading); the header shows it.
  await waitFor(() => expect(cartStore.getLines()).toEqual([]))
  expect(screen.getByRole('button', { name: 'Cart, 0 items' })).toBeInTheDocument()
})

test('checks the details before sending anything', async () => {
  let requests = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST') requests += 1
  })
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'jane@')

  await userEvent.click(placeOrderButton())

  expect(await screen.findByText('Enter your name')).toBeInTheDocument()
  expect(screen.getByText('Enter a valid email address, like name@example.com')).toBeInTheDocument()
  expect(screen.getByText('Enter a phone number the bakery can reach you on')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus()
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveAttribute('aria-invalid', 'true')
  expect(requests).toBe(0)
  // A slot was picked, so there is nothing to say about the pickup time.
  expect(screen.queryByText(/Choose a pickup time before/)).not.toBeInTheDocument()
  server.events.removeAllListeners()
})

test('without a pickup time, the guest is sent back to step 1', async () => {
  await openCheckout()
  await fillDetails()

  await userEvent.click(placeOrderButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose a pickup time before placing your order.',
  )
  expect(screen.getByRole('heading', { name: '1. Pickup time' })).toHaveFocus()
  expect(mockStore.orders).toHaveLength(0)

  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  expect(screen.queryByText(/Choose a pickup time before/)).not.toBeInTheDocument()
})

test('the server’s field errors show on the matching fields', async () => {
  server.use(
    http.post(ORDERS_URL, () =>
      HttpResponse.json(
        {
          status: 400,
          message: 'validation failed',
          fieldErrors: [
            { field: 'guestContact.email', message: 'must be a well-formed email address' },
            { field: 'guestContact.phone', message: 'size must be between 0 and 30' },
          ],
        },
        { status: 400 },
      ),
    ),
  )
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()

  await userEvent.click(placeOrderButton())

  expect(await screen.findByText('Must be a well-formed email address')).toBeInTheDocument()
  expect(screen.getByText('Size must be between 0 and 30')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: /^Email/ })).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByRole('textbox', { name: /^Email/ })).toHaveFocus()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  // Moving on keeps the server's message; editing the field clears it.
  await userEvent.tab()
  expect(screen.getByText('Must be a well-formed email address')).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'm')
  expect(screen.queryByText('Must be a well-formed email address')).not.toBeInTheDocument()
})

test('a slot that filled up meanwhile (409) sends the guest back to pick another', async () => {
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()
  fillSlot('13:00') // two other guests take the last places

  await userEvent.click(placeOrderButton())

  const heading = screen.getByRole('heading', { name: '1. Pickup time' })
  await waitFor(() => expect(heading).toHaveFocus())
  const section = heading.closest('section')!
  expect(within(section).getAllByRole('alert')[0]).toHaveTextContent(
    'something changed while you were checking out: that pickup slot is no longer available',
  )
  // The refreshed availability shows the slot as full, and the selection is cleared.
  await waitFor(() => expect(screen.getByRole('radio', { name: ONE_PM })).toBeDisabled())
  expect(screen.getByRole('radio', { name: ONE_PM })).not.toBeChecked()
  expect(mockStore.orders).toHaveLength(2)
  // The details are kept for the next try.
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Jane Baker')
})

test('a rate limit (429) says how long to wait and holds the button until then', async () => {
  server.use(
    http.post(ORDERS_URL, () =>
      HttpResponse.json(
        { status: 429, message: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '30', 'X-Request-Id': 'req-429' } },
      ),
    ),
  )
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()

  await userEvent.click(placeOrderButton())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Too many attempts. Please wait 30 seconds, then try again.')
  expect(alert).toHaveTextContent('req-429')
  expect(screen.getByRole('button', { name: 'Try again in 30 s' })).toBeDisabled()

  vi.setSystemTime(NOW.getTime() + 31_000)
  expect(
    await screen.findByRole('button', { name: /^Place order/ }, { timeout: 3000 }),
  ).toBeEnabled()
})

test('a rule broken without a field (the lead time) shows the server’s message', async () => {
  server.use(
    http.post(ORDERS_URL, () =>
      HttpResponse.json(
        { status: 400, message: 'this order needs at least 48 hours notice' },
        { status: 400, headers: { 'X-Request-Id': 'req-lead' } },
      ),
    ),
  )
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()

  await userEvent.click(placeOrderButton())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('this order needs at least 48 hours notice')
  expect(alert).toHaveTextContent('req-lead')
})

test('a lost connection says the order may or may not have gone through', async () => {
  server.use(http.post(ORDERS_URL, () => HttpResponse.error()))
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()

  await userEvent.click(placeOrderButton())

  expect(await screen.findByRole('alert')).toHaveTextContent('it may or may not have gone through')
})

test('submitting twice while the first is in flight places one order', async () => {
  let posts = 0
  server.use(
    http.post(ORDERS_URL, async () => {
      posts += 1
      await delay(100)
      return undefined // on to the default handler
    }),
  )
  await openCheckout()
  await userEvent.click(screen.getByRole('radio', { name: ONE_PM }))
  await fillDetails()

  const form = placeOrderButton().closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  fireEvent.submit(form)

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Placing your order…' })).toBeDisabled(),
  )
  await screen.findByRole('heading', { name: 'Thank you, your order is placed' })
  expect(posts).toBe(1)
  expect(mockStore.orders).toHaveLength(1)
})

test('typed details survive a trip to the cart and back', async () => {
  const { router } = await openCheckout()
  await userEvent.type(screen.getByRole('textbox', { name: /^Name/ }), 'Jane Baker')
  await userEvent.type(screen.getByRole('textbox', { name: /^Notes/ }), 'Candles')

  await router.navigate('/cart')
  await screen.findByRole('heading', { level: 1, name: 'Your cart' })
  await router.navigate('/checkout')

  expect(await screen.findByRole('textbox', { name: /^Name/ })).toHaveValue('Jane Baker')
  expect(screen.getByRole('textbox', { name: /^Notes/ })).toHaveValue('Candles')
})

test('the confirmation page without an order points back to the menu', async () => {
  renderRoute('/checkout/confirmation')

  expect(await screen.findByRole('heading', { name: 'Nothing to show here' })).toBeInTheDocument()
})

test('with neither a slot nor details, both problems show at once', async () => {
  await openCheckout()

  await userEvent.click(placeOrderButton())

  expect(await screen.findByText('Enter your name')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose a pickup time before placing your order.',
  )
  // The first field to fix gets focus, not the pickup heading.
  expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus()
})
