import { http, HttpResponse } from 'msw'
import { afterEach, expect, test, vi } from 'vitest'
import { server } from '@/test/msw/server'
import {
  api,
  fetchWithRateLimitRetry,
  MAX_RATE_LIMIT_WAIT_SECONDS,
  setAccessTokenProvider,
  unwrap,
} from './client'
import { ApiError, type ApiErrorBody } from './errors'
import type { Schema } from './types'

const API = 'http://localhost:8080'
const CATEGORIES = `${API}/api/public/catalogue/categories`
const category: Schema<'CategoryResponse'> = {
  id: '0b6f1c1e-6f43-4c1e-9a43-0c2a3c8f9d10',
  name: 'Bread',
}

afterEach(() => {
  setAccessTokenProvider(null)
})

test('unwrap returns the data of a successful call, from VITE_API_BASE_URL', async () => {
  server.use(http.get(CATEGORIES, () => HttpResponse.json([category])))

  await expect(unwrap(api.GET('/api/public/catalogue/categories'))).resolves.toEqual([category])
})

test('an error response becomes a thrown ApiError with field errors and request id', async () => {
  const body: ApiErrorBody = {
    timestamp: '2026-11-19T10:00:00Z',
    status: 400,
    error: 'Bad Request',
    message: 'validation failed',
    path: '/api/public/orders',
    fieldErrors: [{ field: 'lines', message: 'must not be empty' }],
  }
  server.use(
    http.post(`${API}/api/public/orders`, () =>
      HttpResponse.json(body, { status: 400, headers: { 'X-Request-Id': 'req-400' } }),
    ),
  )

  const error = await unwrap(
    api.POST('/api/public/orders', {
      body: {
        pickupAt: '2026-11-21T10:00:00Z',
        guestContact: { name: 'Jane', email: 'jane@example.com', phone: '1' },
        lines: [],
      },
    }),
  ).catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 400, message: 'validation failed', requestId: 'req-400' })
  expect((error as ApiError).fieldError('lines')).toBe('must not be empty')
})

test('a network failure becomes an ApiError with status 0', async () => {
  server.use(http.get(CATEGORIES, () => HttpResponse.error()))

  const error = await unwrap(api.GET('/api/public/catalogue/categories')).catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 0, isNetworkError: true })
})

test('an aborted request rejects with the AbortError, not an ApiError', async () => {
  server.use(http.get(CATEGORIES, () => new Promise(() => {})))
  const controller = new AbortController()

  const call = unwrap(api.GET('/api/public/catalogue/categories', { signal: controller.signal }))
  controller.abort()

  await expect(call).rejects.toMatchObject({ name: 'AbortError' })
  await expect(call).rejects.not.toBeInstanceOf(ApiError)
})

test('sends the owner token from the provider as a bearer header', async () => {
  let authorization: string | null = 'not called'
  server.use(
    http.get(`${API}/api/auth/me`, ({ request }) => {
      authorization = request.headers.get('Authorization')
      return HttpResponse.json({})
    }),
  )

  await api.GET('/api/auth/me')
  expect(authorization).toBeNull()

  setAccessTokenProvider(async () => 'token-abc')
  await api.GET('/api/auth/me')
  expect(authorization).toBe('Bearer token-abc')
})

test('a 429 with a short Retry-After is retried once, body included', async () => {
  const bodies: unknown[] = []
  server.use(
    http.post(`${API}/api/auth/login`, async ({ request }) => {
      bodies.push(await request.json())
      return bodies.length === 1
        ? new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } })
        : HttpResponse.json({ accessToken: 'a' })
    }),
  )

  const data = await unwrap(
    api.POST('/api/auth/login', { body: { email: 'o@example.com', password: 'pw' } }),
  )

  expect(data).toEqual({ accessToken: 'a' })
  expect(bodies).toEqual([
    { email: 'o@example.com', password: 'pw' },
    { email: 'o@example.com', password: 'pw' },
  ])
})

test('a 429 that persists after the retry surfaces with the wait time', async () => {
  let calls = 0
  server.use(
    http.get(CATEGORIES, () => {
      calls++
      return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } })
    }),
  )

  const error = await unwrap(api.GET('/api/public/catalogue/categories')).catch((e: unknown) => e)

  expect(calls).toBe(2)
  expect(error).toMatchObject({ status: 429, retryAfterSeconds: 0 })
})

test('a 429 with a long Retry-After is not retried', async () => {
  let calls = 0
  server.use(
    http.get(CATEGORIES, () => {
      calls++
      return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '60' } })
    }),
  )

  const error = await unwrap(api.GET('/api/public/catalogue/categories')).catch((e: unknown) => e)

  expect(calls).toBe(1)
  expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 })
})

test('fetchWithRateLimitRetry waits exactly Retry-After seconds, up to the limit', async () => {
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
  const responses = [
    new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(MAX_RATE_LIMIT_WAIT_SECONDS) },
    }),
    new Response('ok'),
  ]
  const fetch = vi.fn<(r: Request) => Promise<Response>>(async () => responses.shift()!)

  const response = await fetchWithRateLimitRetry(new Request(CATEGORIES), { fetch, sleep })

  expect(await response.text()).toBe('ok')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(sleep).toHaveBeenCalledWith(MAX_RATE_LIMIT_WAIT_SECONDS * 1000, expect.any(AbortSignal))
})

test('fetchWithRateLimitRetry leaves a 429 without Retry-After alone', async () => {
  const fetch = vi.fn<(r: Request) => Promise<Response>>(
    async () => new Response(null, { status: 429 }),
  )

  const response = await fetchWithRateLimitRetry(new Request(CATEGORIES), { fetch })

  expect(response.status).toBe(429)
  expect(fetch).toHaveBeenCalledTimes(1)
})
