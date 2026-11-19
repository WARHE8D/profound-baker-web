// Proves the generated types work with openapi-fetch end to end: paths, params and bodies are
// checked by `npm run typecheck`, and the responses below come back through MSW.
import { http, HttpResponse } from 'msw'
import createClient from 'openapi-fetch'
import { expect, expectTypeOf, test } from 'vitest'
import { server } from '@/test/msw/server'
import type { paths, Schema } from './types'

const baseUrl = 'http://localhost:8080'

// openapi-fetch keeps a reference to `fetch` when the client is created. MSW patches `fetch` in
// beforeAll, after this module loads, so each test creates its client (S1.2's client must look
// fetch up lazily for the same reason).
const newClient = () => createClient<paths>({ baseUrl })

test('GET a public endpoint returns the typed response body', async () => {
  const category: Schema<'CategoryResponse'> = {
    id: '0b6f1c1e-6f43-4c1e-9a43-0c2a3c8f9d10',
    name: 'Bread',
  }
  server.use(
    http.get(`${baseUrl}/api/public/catalogue/categories`, () => HttpResponse.json([category])),
  )

  const { data, error } = await newClient().GET('/api/public/catalogue/categories')

  expect(error).toBeUndefined()
  expect(data).toEqual([category])
  expectTypeOf(data).toEqualTypeOf<Schema<'CategoryResponse'>[] | undefined>()
})

test('path parameters are typed and substituted', async () => {
  let requestedPath = ''
  server.use(
    http.get(`${baseUrl}/api/public/orders/by-token/:token`, ({ request }) => {
      requestedPath = new URL(request.url).pathname
      return HttpResponse.json({})
    }),
  )

  await newClient().GET('/api/public/orders/by-token/{token}', {
    params: { path: { token: 'abc123' } },
  })

  expect(requestedPath).toBe('/api/public/orders/by-token/abc123')
})

test('request bodies are typed against the schema', async () => {
  let body: unknown
  server.use(
    http.post(`${baseUrl}/api/public/orders`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({})
    }),
  )
  const checkout: Schema<'CheckoutRequest'> = {
    pickupAt: '2026-11-21T10:00:00Z',
    guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0100' },
    lines: [{ itemId: '5d2f4a8e-1b7c-4e2a-9f3d-6a8b0c1d2e3f', quantity: 2 }],
  }

  await newClient().POST('/api/public/orders', { body: checkout })

  expect(body).toEqual(checkout)
})

test('error responses are typed as ApiError, with typed field errors', async () => {
  const apiError: Schema<'ApiError'> = {
    timestamp: '2026-11-19T10:00:00Z',
    status: 400,
    error: 'Bad Request',
    message: 'validation failed',
    path: '/api/public/orders',
    fieldErrors: [{ field: 'guestContact.email', message: 'must be a well-formed email address' }],
  }
  server.use(
    http.post(`${baseUrl}/api/public/orders`, () => HttpResponse.json(apiError, { status: 400 })),
  )

  const { data, error } = await newClient().POST('/api/public/orders', {
    body: {
      pickupAt: '2026-11-21T10:00:00Z',
      guestContact: { name: 'Jane', email: 'jane@', phone: '1' },
      lines: [],
    },
  })

  expect(data).toBeUndefined()
  expect(error).toEqual(apiError)
  expectTypeOf(error).toEqualTypeOf<Schema<'ApiError'> | undefined>()
})

test('response fields are required, and nullable ones say so', () => {
  type Item = Schema<'ItemResponse'>
  expectTypeOf<Item['id']>().toEqualTypeOf<string>()
  expectTypeOf<Item['available']>().toEqualTypeOf<boolean>()
  expectTypeOf<Item['stockQuantity']>().toEqualTypeOf<number | null>()
  expectTypeOf<Schema<'ApiError'>['fieldErrors']>().toEqualTypeOf<Schema<'FieldError'>[] | null>()
})
