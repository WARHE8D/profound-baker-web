import { expect, expectTypeOf, test } from 'vitest'
import { readPage, type Page } from './page'
import type { Schema } from './types'

test('reads Spring Data’s current Page JSON (counts at the top level)', () => {
  const page = readPage({
    content: ['a', 'b'],
    number: 1,
    size: 2,
    totalElements: 5,
    totalPages: 3,
  })

  expect(page).toEqual({
    items: ['a', 'b'],
    number: 1,
    size: 2,
    totalElements: 5,
    totalPages: 3,
    hasPrevious: true,
    hasNext: true,
  })
})

test('reads the planned shape: content plus a page object', () => {
  const page = readPage({
    content: ['e'],
    page: { number: 2, size: 2, totalElements: 5, totalPages: 3 },
  })

  expect(page).toMatchObject({ items: ['e'], number: 2, hasPrevious: true, hasNext: false })
})

test('fills in sensible defaults when counts are missing', () => {
  expect(readPage({})).toEqual({
    items: [],
    number: 0,
    size: 0,
    totalElements: 0,
    totalPages: 0,
    hasPrevious: false,
    hasNext: false,
  })
  expect(readPage({ content: [1, 2, 3], size: 2, totalElements: 3 }).totalPages).toBe(2)
})

test('accepts the generated page types and keeps the item type', () => {
  const raw: Schema<'PagePublicItemResponse'> = { content: [], number: 0, totalPages: 0 }
  const page = readPage(raw)

  expectTypeOf(page).toEqualTypeOf<Page<Schema<'PublicItemResponse'>>>()
})
