import { expect, test } from 'vitest'
import { createQueryClient, shouldRetry } from './query-client'

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

test.each([400, 401, 403, 404, 409, 422, 429])('never retries a %i', (status) => {
  expect(shouldRetry(0, httpError(status))).toBe(false)
})

test.each([500, 502, 503])('retries a %i up to twice', (status) => {
  expect(shouldRetry(0, httpError(status))).toBe(true)
  expect(shouldRetry(1, httpError(status))).toBe(true)
  expect(shouldRetry(2, httpError(status))).toBe(false)
})

test('retries network failures (no status) up to twice', () => {
  const offline = new TypeError('Failed to fetch')
  expect(shouldRetry(0, offline)).toBe(true)
  expect(shouldRetry(2, offline)).toBe(false)
})

test('the client uses these rules for queries and never retries mutations', () => {
  const { queries, mutations } = createQueryClient().getDefaultOptions()
  expect(queries?.retry).toBe(shouldRetry)
  expect(mutations?.retry).toBe(false)
})
