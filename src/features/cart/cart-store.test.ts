import { beforeEach, expect, test } from 'vitest'
import { items, toPublicItem } from '@/mocks/fixtures'
import { CART_STORAGE_KEY, createCartStore, MAX_QUANTITY_PER_ITEM } from './cart-store'

const sourdough = toPublicItem(items[0]!)
const baguette = toPublicItem(items[1]!)

beforeEach(() => localStorage.clear())

test('adds items, merging repeat adds into one line, and saves to localStorage', () => {
  const store = createCartStore()

  expect(store.add(sourdough, 2)).toBe(2)
  expect(store.add(baguette, 1)).toBe(1)
  expect(store.add(sourdough, 3)).toBe(3)

  expect(store.getLines()).toEqual([
    {
      itemId: sourdough.id,
      name: 'Country sourdough',
      price: 8.5,
      thumbnailUrl: sourdough.thumbnailUrls[0],
      quantity: 5,
    },
    expect.objectContaining({ itemId: baguette.id, quantity: 1 }),
  ])
  expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual(store.getLines())
})

test('a new store reads the saved cart', () => {
  createCartStore().add(sourdough, 2)

  expect(createCartStore().getLines()).toEqual([
    expect.objectContaining({ itemId: sourdough.id, quantity: 2 }),
  ])
})

test('quantities are capped per item; add reports how many fit', () => {
  const store = createCartStore()

  expect(store.add(sourdough, MAX_QUANTITY_PER_ITEM - 1)).toBe(MAX_QUANTITY_PER_ITEM - 1)
  expect(store.add(sourdough, 5)).toBe(1)
  expect(store.add(sourdough, 1)).toBe(0)
  expect(store.getLines()[0]?.quantity).toBe(MAX_QUANTITY_PER_ITEM)
})

test('ignores a corrupt or foreign saved cart', () => {
  localStorage.setItem(CART_STORAGE_KEY, '{not json')
  expect(createCartStore().getLines()).toEqual([])

  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([
      { itemId: 'x', name: 'Ok', price: 1, thumbnailUrl: null, quantity: 999 },
      { itemId: 'y', name: 'No price', quantity: 1 },
      'junk',
    ]),
  )
  expect(createCartStore().getLines()).toEqual([
    { itemId: 'x', name: 'Ok', price: 1, thumbnailUrl: null, quantity: MAX_QUANTITY_PER_ITEM },
  ])
})

test('picks up changes another tab made', () => {
  const store = createCartStore()
  let notified = 0
  const unsubscribe = store.subscribe(() => (notified += 1))

  createCartStore().add(baguette, 4) // "another tab"
  window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }))

  expect(notified).toBe(1)
  expect(store.getLines()).toEqual([expect.objectContaining({ itemId: baguette.id, quantity: 4 })])
  unsubscribe()
})

test('keeps working when storage throws', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  } as unknown as Storage
  const store = createCartStore(() => broken)

  expect(store.getLines()).toEqual([])
  store.add(sourdough, 1)
  expect(store.getLines()).toHaveLength(1)
})

test('setQuantity clamps, remove drops a line, and both ignore unknown items', () => {
  const store = createCartStore()
  store.add(sourdough, 2)
  store.add(baguette, 1)

  store.setQuantity(sourdough.id, 7)
  store.setQuantity(baguette.id, 0)
  expect(store.getLines().map((l) => l.quantity)).toEqual([7, 1])
  store.setQuantity(sourdough.id, 1000)
  expect(store.getLines()[0]?.quantity).toBe(MAX_QUANTITY_PER_ITEM)

  store.remove(sourdough.id)
  expect(store.getLines().map((l) => l.itemId)).toEqual([baguette.id])

  const before = store.getLines()
  store.setQuantity('nope', 3)
  store.remove('nope')
  expect(store.getLines()).toBe(before) // no write, no re-render
})

test('refresh takes the current name, price and thumbnail and keeps the quantity', () => {
  const store = createCartStore()
  store.add(sourdough, 3)

  store.refresh({ ...sourdough, name: 'Sourdough', price: 9, thumbnailUrls: [] })

  expect(store.getLines()).toEqual([
    { itemId: sourdough.id, name: 'Sourdough', price: 9, thumbnailUrl: null, quantity: 3 },
  ])
  const before = store.getLines()
  store.refresh({ ...sourdough, name: 'Sourdough', price: 9, thumbnailUrls: [] })
  expect(store.getLines()).toBe(before)
})
