import { expect, test } from 'vitest'
import { items } from '@/mocks/fixtures'
import {
  editedKeys,
  itemFormSchema,
  mergeEdits,
  parsePrice,
  stateOfItem,
  toItemForm,
  toItemRequest,
  type ItemFormValues,
} from './item-form'

test.each([
  ['4.5', 4.5],
  ['4.50', 4.5],
  ['4,50', 4.5],
  ['$ 1,234.50', 1234.5],
  ['CA$12', 12],
  ['99999999.99', 99_999_999.99],
  ['4.505', null],
  ['123456789', null],
  ['abc', null],
  ['', null],
])('parsePrice(%j) is %j', (text, expected) => {
  expect(parsePrice(text)).toBe(expected)
})

const sourdough = items[0]!
const loaded = stateOfItem(sourdough)
const form = (changes: Partial<ItemFormValues> = {}): ItemFormValues => ({
  ...toItemForm(sourdough),
  ...changes,
})

test('the form round-trips an item unchanged', () => {
  expect(editedKeys(loaded, form())).toEqual([])
  expect(itemFormSchema.safeParse(form()).success).toBe(true)
})

test('only edited fields are applied on top of the latest item', () => {
  // Meanwhile guests bought 3 loaves and the name was fixed in another tab.
  const fresh = { ...loaded, stockQuantity: 7, name: 'Country sourdough loaf' }

  const merge = mergeEdits(loaded, fresh, form({ price: '9.00' }))

  expect(merge.state).toEqual({ ...fresh, price: 9 })
  expect(merge.updatedElsewhere.toSorted()).toEqual(['name', 'stockQuantity'])
  expect(merge.overwritten).toEqual([])
})

test('a field both sides changed takes the Owner’s value and is reported', () => {
  const fresh = { ...loaded, stockQuantity: 7 }

  const merge = mergeEdits(loaded, fresh, form({ stockQuantity: '20' }))

  expect(merge.state.stockQuantity).toBe(20)
  expect(merge.overwritten).toEqual(['stockQuantity'])
})

test('switching stock tracking off makes it unlimited', () => {
  const merge = mergeEdits(loaded, loaded, form({ trackStock: false }))
  expect(merge.state.stockQuantity).toBeNull()
  expect(toItemRequest(merge.state).stockQuantity).toBeUndefined()
})

const errors = (values: ItemFormValues) =>
  itemFormSchema.safeParse(values).error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`)

test('validation follows the server’s rules', () => {
  expect(errors(form({ name: ' ', price: '0', leadTimeHours: '1.5' }))).toEqual([
    'name: Enter a name',
    'price: The price must be more than zero',
    'leadTimeHours: Enter whole hours, e.g. 0, 12 or 48',
  ])
  expect(errors(form({ trackStock: true, stockQuantity: '' }))).toEqual([
    'stockQuantity: Enter how many are in stock (0 or more)',
  ])
  expect(errors(form({ price: '3.999' }))).toEqual([
    'price: Enter a price like 4.50 (at most 2 decimals)',
  ])
})
