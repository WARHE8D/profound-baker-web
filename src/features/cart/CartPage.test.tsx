import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { ids, items, toPublicItem } from '@/mocks/fixtures'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'
import { cartStore } from './cart-store'

// /checkout is lazy-loaded; load it once up front so no test waits on compiling it.
beforeAll(async () => {
  await Promise.all([
    import('@/features/checkout/CheckoutPage'),
    import('@/features/checkout/ConfirmationPage'),
  ])
})

const ITEM_URL = 'http://localhost:8080/api/public/catalogue/items/:id'
const fixture = (id: string) => toPublicItem(items.find((i) => i.id === id)!)
const sourdough = fixture(ids.items.sourdough)
const baguette = fixture(ids.items.baguette)
const cinnamonRoll = fixture(ids.items.cinnamonRoll) // sold out
const weddingCake = fixture(ids.items.weddingCake) // hidden by the Owner: 404

/** The cart line (list item) that shows this item. */
function line(name: string) {
  return screen.getByRole('link', { name }).closest('li') as HTMLElement
}

const subtotal = () => screen.getByText('Subtotal').nextElementSibling

test('an empty cart links back to the menu', async () => {
  renderRoute('/cart')

  expect(await screen.findByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/')
})

test('lists each line with unit price and total, and the subtotal', async () => {
  cartStore.add(sourdough, 2)
  cartStore.add(baguette, 1)
  renderRoute('/cart')

  expect(await screen.findByRole('link', { name: 'Country sourdough' })).toHaveAttribute(
    'href',
    `/items/${sourdough.id}`,
  )
  const sourdoughLine = line('Country sourdough')
  expect(within(sourdoughLine).getByText('CA$8.50 each')).toBeInTheDocument()
  expect(within(sourdoughLine).getByText('CA$17.00')).toBeInTheDocument()
  expect(
    within(sourdoughLine).getByRole('spinbutton', { name: 'Quantity of Country sourdough' }),
  ).toHaveValue(2)
  expect(subtotal()).toHaveTextContent('CA$20.25')
  // Enabled once every line has been re-checked.
  expect(await screen.findByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout')
})

test('changing a quantity updates the line, subtotal and header', async () => {
  cartStore.add(sourdough, 2)
  renderRoute('/cart')
  await screen.findByRole('link', { name: 'Country sourdough' })

  await userEvent.click(
    screen.getByRole('button', { name: 'Increase quantity of Country sourdough' }),
  )

  expect(within(line('Country sourdough')).getByText('CA$25.50')).toBeInTheDocument()
  expect(subtotal()).toHaveTextContent('CA$25.50')
  expect(screen.getByRole('button', { name: 'Cart 3 items' })).toBeInTheDocument()
  expect(cartStore.getLines()[0]?.quantity).toBe(3)
})

test('removing the last line empties the cart', async () => {
  cartStore.add(baguette, 1)
  renderRoute('/cart')

  await userEvent.click(await screen.findByRole('button', { name: 'Remove Baguette' }))

  expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument()
  expect(cartStore.getLines()).toEqual([])
})

test('flags a price change, totals at the new price, and OK accepts it', async () => {
  cartStore.add(sourdough, 2)
  server.use(http.get(ITEM_URL, () => HttpResponse.json({ ...sourdough, price: 9 })))
  renderRoute('/cart')

  expect(await screen.findByText('The price changed from CA$8.50 to CA$9.00.')).toBeInTheDocument()
  expect(subtotal()).toHaveTextContent('CA$18.00')

  await userEvent.click(
    screen.getByRole('button', { name: 'OK, keep Country sourdough at the new price' }),
  )

  expect(screen.queryByText(/The price changed/)).not.toBeInTheDocument()
  expect(cartStore.getLines()[0]?.price).toBe(9)
})

test('sold-out and removed items are flagged, left out of the subtotal, and block checkout', async () => {
  cartStore.add(baguette, 2)
  cartStore.add(cinnamonRoll, 1)
  cartStore.add(weddingCake, 1)
  renderRoute('/cart')

  expect(await screen.findByText('Sold out right now.')).toBeInTheDocument()
  expect(await screen.findByText('No longer on the menu.')).toBeInTheDocument()
  // A removed item can't be opened, so its name is plain text.
  expect(screen.getByText('Wedding cake (seasonal)')).not.toHaveAttribute('href')
  expect(subtotal()).toHaveTextContent('CA$6.50')
  expect(screen.getByRole('alert')).toHaveTextContent("2 items can't be ordered right now.")
  expect(screen.getByRole('button', { name: 'Checkout' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Remove unavailable items' }))

  expect(cartStore.getLines().map((l) => l.itemId)).toEqual([baguette.id])
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout')
})

test('an item that could not be checked keeps its remembered price', async () => {
  cartStore.add(sourdough, 1)
  server.use(http.get(ITEM_URL, () => HttpResponse.error()))
  renderRoute('/cart')

  // Network errors are retried twice by the query client before the note shows.
  expect(
    await screen.findByText(/couldn't check the latest price/, {}, { timeout: 10_000 }),
  ).toBeInTheDocument()
  expect(subtotal()).toHaveTextContent('CA$8.50')
  expect(screen.getByRole('link', { name: 'Checkout' })).toBeInTheDocument()
}, 15_000)

test('the header button opens the cart drawer, which links to the cart page', async () => {
  cartStore.add(sourdough, 2)
  renderRoute('/')

  await userEvent.click(await screen.findByRole('button', { name: 'Cart 2 items' }))

  const drawer = await screen.findByRole('dialog', { name: 'Your cart' })
  expect(within(drawer).getByText('2 items')).toBeInTheDocument()
  expect(await within(drawer).findByRole('link', { name: 'Country sourdough' })).toBeInTheDocument()

  await userEvent.click(within(drawer).getByRole('link', { name: 'View cart' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Your cart' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('checkout from the drawer goes to the checkout page', async () => {
  cartStore.add(baguette, 1)
  const { router } = renderRoute('/')

  await userEvent.click(await screen.findByRole('button', { name: 'Cart 1 item' }))
  const drawer = await screen.findByRole('dialog', { name: 'Your cart' })
  await userEvent.click(await within(drawer).findByRole('link', { name: 'Checkout' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/checkout'))
  expect(await screen.findByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument()
})
