import { expect, test } from 'vitest'
import { ApiError } from '@/api'
import { items, toPublicItem } from '@/mocks/fixtures'
import { checkLine } from './cart-check'
import type { CartLine } from './cart-store'

const sourdough = toPublicItem(items[0]!)
const line: CartLine = {
  itemId: sourdough.id,
  name: sourdough.name,
  price: 8.5,
  thumbnailUrl: null,
  quantity: 2,
}
const found = (data: typeof sourdough) => ({ data, error: null, isPending: false })

test('ok when the item is orderable at the remembered price', () => {
  expect(checkLine(line, found(sourdough))).toEqual({ status: 'ok', item: sourdough })
})

test('flags a price change with the old price', () => {
  const dearer = { ...sourdough, price: 9.25 }
  expect(checkLine(line, found(dearer))).toEqual({
    status: 'priceChanged',
    item: dearer,
    was: 8.5,
  })
})

test('sold out wins over a price change', () => {
  const soldOut = { ...sourdough, orderable: false, price: 10 }
  expect(checkLine(line, found(soldOut))).toEqual({ status: 'soldOut', item: soldOut })
})

test('a 404 means the item is gone; other errors leave it unchecked', () => {
  const notFound = new ApiError({ status: 404, message: 'item not found' })
  expect(checkLine(line, { error: notFound, isPending: false })).toEqual({ status: 'gone' })

  const offline = ApiError.network(new TypeError('Failed to fetch'))
  expect(checkLine(line, { error: offline, isPending: false })).toEqual({
    status: 'unchecked',
    error: offline,
  })
})

test('checking while the lookup is pending', () => {
  expect(checkLine(line, { error: null, isPending: true })).toEqual({ status: 'checking' })
})
