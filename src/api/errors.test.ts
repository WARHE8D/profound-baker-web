import { expect, test } from 'vitest'
import { ApiError, isApiError, parseRetryAfter, type ApiErrorBody } from './errors'

const body: ApiErrorBody = {
  timestamp: '2026-11-19T10:00:00Z',
  status: 400,
  error: 'Bad Request',
  message: 'validation failed',
  path: '/api/public/orders',
  fieldErrors: [{ field: 'guestContact.email', message: 'must be a well-formed email address' }],
}

const responseWith = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers })

test('fromResponse reads the ApiError body and the request id', () => {
  const error = ApiError.fromResponse(responseWith(400, { 'X-Request-Id': 'req-123' }), body)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe('ApiError')
  expect(error.status).toBe(400)
  expect(error.message).toBe('validation failed')
  expect(error.requestId).toBe('req-123')
  expect(error.path).toBe('/api/public/orders')
  expect(error.fieldError('guestContact.email')).toBe('must be a well-formed email address')
  expect(error.fieldError('guestContact.phone')).toBeUndefined()
  expect(error.isNetworkError).toBe(false)
})

test('a null fieldErrors becomes an empty list', () => {
  const error = ApiError.fromResponse(responseWith(404), {
    ...body,
    status: 404,
    fieldErrors: null,
  })

  expect(error.fieldErrors).toEqual([])
})

test.each([
  [401, 'Please sign in again.'],
  [404, "We couldn't find that."],
  [409, 'Someone else changed this first. Reload and try again.'],
  [502, 'The server had a problem. Please try again in a moment.'],
  [418, 'The request failed (HTTP 418).'],
])('a %i without an ApiError body gets a readable message', (status, message) => {
  const error = ApiError.fromResponse(responseWith(status), '<html>Bad Gateway</html>')

  expect(error.status).toBe(status)
  expect(error.message).toBe(message)
  expect(error.requestId).toBeNull()
})

test('a 429 carries the wait from Retry-After', () => {
  const error = ApiError.fromResponse(responseWith(429, { 'Retry-After': '42' }), undefined)

  expect(error.retryAfterSeconds).toBe(42)
  expect(error.message).toBe('Too many requests. Please try again in 42 seconds.')
})

test('retryAfterSeconds is only read for a 429', () => {
  expect(
    ApiError.fromResponse(responseWith(503, { 'Retry-After': '5' }), body).retryAfterSeconds,
  ).toBeNull()
})

test('network errors have status 0 and keep the cause', () => {
  const cause = new TypeError('Failed to fetch')
  const error = ApiError.network(cause)

  expect(error.status).toBe(0)
  expect(error.isNetworkError).toBe(true)
  expect(error.cause).toBe(cause)
  expect(error.message).toMatch(/can't reach/i)
})

test('isApiError tells ApiErrors from other errors', () => {
  expect(isApiError(ApiError.network(null))).toBe(true)
  expect(isApiError(new Error('x'))).toBe(false)
  expect(isApiError({ status: 400, message: 'x' })).toBe(false)
})

test.each([
  [null, null],
  ['30', 30],
  [' 0 ', 0],
  ['soon', null],
  ['-5', null],
])('parseRetryAfter(%j) → %j', (value, expected) => {
  expect(parseRetryAfter(value)).toBe(expected)
})

test('parseRetryAfter accepts an HTTP date, rounding up and never negative', () => {
  const now = Date.parse('2026-11-19T10:00:00Z')

  expect(parseRetryAfter('Thu, 19 Nov 2026 10:00:30 GMT', now)).toBe(30)
  expect(parseRetryAfter('Thu, 19 Nov 2026 09:59:00 GMT', now)).toBe(0)
})
