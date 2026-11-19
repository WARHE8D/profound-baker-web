import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { cartStore, MAX_QUANTITY_PER_ITEM } from '@/features/cart/cart-store'
import { ids, items, toPublicItem } from '@/mocks/fixtures'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

const ITEM_URL = 'http://localhost:8080/api/public/catalogue/items/:id'
const sourdough = toPublicItem(items[0]!)

async function openItem(id: string) {
  const result = renderRoute(`/items/${id}`)
  return result
}

test('shows the item: photo, name, price, lead time, description and category link', async () => {
  await openItem(ids.items.sourdough)

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Country sourdough' }),
  ).toBeInTheDocument()
  expect(screen.getByText('CA$8.50')).toBeInTheDocument()
  expect(screen.getByText(/Order 12 hours ahead/)).toBeInTheDocument()
  expect(screen.getByText('Long-fermented loaf with a crackling crust.')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Country sourdough' })).toHaveAttribute(
    'src',
    `http://localhost:8080/uploads/items/${ids.items.sourdough}.svg`,
  )
  const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
  expect(within(breadcrumb).getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/')
  expect(within(breadcrumb).getByRole('link', { name: 'Bread' })).toHaveAttribute(
    'href',
    `/?category=${ids.categories.bread}`,
  )
})

test('a catalogue card opens the item page', async () => {
  renderRoute('/')

  await userEvent.click(await screen.findByRole('link', { name: 'Chocolate fudge cake' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Chocolate fudge cake' }),
  ).toBeInTheDocument()
})

test('the thumbnail strip switches the large photo', async () => {
  server.use(
    http.get(ITEM_URL, () =>
      HttpResponse.json({
        ...sourdough,
        imageUrls: ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg'],
        thumbnailUrls: ['/uploads/a-t.jpg', '/uploads/b-t.jpg', '/uploads/c-t.jpg'],
      }),
    ),
  )
  await openItem(sourdough.id)

  const photo = await screen.findByRole('img', { name: 'Country sourdough, photo 1 of 3' })
  expect(photo).toHaveAttribute('src', 'http://localhost:8080/uploads/a.jpg')
  const strip = screen.getByRole('list', { name: 'Photos' })
  expect(strip.querySelectorAll('img')[2]).toHaveAttribute(
    'src',
    'http://localhost:8080/uploads/c-t.jpg',
  )
  expect(within(strip).getByRole('button', { name: 'Show photo 1 of 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await userEvent.click(within(strip).getByRole('button', { name: 'Show photo 3 of 3' }))

  expect(screen.getByRole('img', { name: 'Country sourdough, photo 3 of 3' })).toHaveAttribute(
    'src',
    'http://localhost:8080/uploads/c.jpg',
  )
  expect(within(strip).getByRole('button', { name: 'Show photo 3 of 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('an item without photos shows a placeholder and no strip', async () => {
  server.use(
    http.get(ITEM_URL, () => HttpResponse.json({ ...sourdough, imageUrls: [], thumbnailUrls: [] })),
  )
  await openItem(sourdough.id)

  await screen.findByRole('heading', { level: 1, name: 'Country sourdough' })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Photos' })).not.toBeInTheDocument()
})

test('adds the chosen quantity to the cart and updates the header', async () => {
  await openItem(ids.items.sourdough)
  await screen.findByRole('heading', { level: 1, name: 'Country sourdough' })

  await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
  await userEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
  expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(3)
  await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

  expect(await screen.findByText('Added 3 × Country sourdough to your cart')).toBeInTheDocument()
  expect(cartStore.getLines()).toEqual([
    expect.objectContaining({ itemId: ids.items.sourdough, quantity: 3, price: 8.5 }),
  ])
  expect(screen.getByRole('button', { name: 'Cart, 3 items' })).toBeInTheDocument()
  expect(screen.getByText('3 already in your cart.')).toBeInTheDocument()
  // Ready for the next add.
  expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(1)
})

test('a typed quantity is kept within 1 and the limit', async () => {
  await openItem(ids.items.sourdough)
  const input = await screen.findByRole('spinbutton', { name: 'Quantity' })

  await userEvent.clear(input)
  await userEvent.type(input, '500')
  await userEvent.tab()
  expect(input).toHaveValue(MAX_QUANTITY_PER_ITEM)
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()

  await userEvent.clear(input)
  await userEvent.type(input, '0{Enter}')
  expect(input).toHaveValue(1)
  expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled()
})

test('stops at the per-item limit and says so', async () => {
  cartStore.add(sourdough, MAX_QUANTITY_PER_ITEM - 2)
  await openItem(ids.items.sourdough)
  const input = await screen.findByRole('spinbutton', { name: 'Quantity' })

  // Only 2 more fit, so the stepper stops there.
  await userEvent.clear(input)
  await userEvent.type(input, '9{Enter}')
  expect(input).toHaveValue(2)
  await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }))

  expect(
    await screen.findByText(
      `${MAX_QUANTITY_PER_ITEM} in your cart, the most you can order online.`,
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  expect(cartStore.getLines()[0]?.quantity).toBe(MAX_QUANTITY_PER_ITEM)
})

test('a sold-out item cannot be added', async () => {
  await openItem(ids.items.cinnamonRoll)

  expect(
    await screen.findByRole('heading', { level: 1, name: 'Cinnamon roll' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Sold out')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument()
  expect(screen.getByText(/sold out for now/)).toBeInTheDocument()
})

test.each([
  ['a hidden item', ids.items.weddingCake],
  ['an unknown item', '20000000-0000-4000-8000-000000000099'],
  ['a malformed id', 'not-a-uuid'],
])('%s shows "not found"', async (_, id) => {
  await openItem(id)

  expect(
    await screen.findByRole('heading', { name: "We couldn't find that item" }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to the menu' })).toHaveAttribute('href', '/')
})

test('a failed load shows the error with its request id, and retrying recovers', async () => {
  let fail = true
  server.use(
    http.get(ITEM_URL, () => {
      if (!fail) return undefined
      return HttpResponse.json(
        { timestamp: '', status: 503, error: 'Service Unavailable', message: 'Oven warming up' },
        { status: 503, headers: { 'X-Request-Id': 'req-item-1' } },
      )
    }),
  )
  await openItem(ids.items.sourdough)

  const alert = await screen.findByRole('alert', {}, { timeout: 10_000 })
  expect(within(alert).getByText("We couldn't load this item")).toBeInTheDocument()
  expect(within(alert).getByText('req-item-1')).toBeInTheDocument()

  fail = false
  await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { level: 1, name: 'Country sourdough' }),
    ).toBeInTheDocument(),
  )
}, 15_000)

test('shows a skeleton while loading', async () => {
  await openItem(ids.items.sourdough)

  expect(screen.getByRole('status')).toHaveTextContent('Loading the item…')
  await screen.findByRole('heading', { level: 1, name: 'Country sourdough' })
})
