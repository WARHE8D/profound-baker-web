import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { server } from './server'

test('MSW intercepts fetch with a per-test handler', async () => {
  server.use(
    http.get('http://localhost:8080/api/public/catalogue/categories', () =>
      HttpResponse.json([{ id: 1, name: 'Bread' }]),
    ),
  )

  const response = await fetch('http://localhost:8080/api/public/catalogue/categories')

  expect(response.ok).toBe(true)
  expect(await response.json()).toEqual([{ id: 1, name: 'Bread' }])
})

test('a request with no handler fails instead of reaching the network', async () => {
  // onUnhandledFrame: 'error' (setup.ts) makes MSW refuse to let the request through.
  await expect(fetch('http://localhost:8080/api/unmocked')).rejects.toThrow('fetch failed')
})
