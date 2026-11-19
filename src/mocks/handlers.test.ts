// The default MSW handlers, exercised through the real API client, so tests and `npm run dev:mock`
// can rely on them behaving like profound-baker-server.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { api, ApiError, readPage, setAccessTokenProvider, unwrap, type Schema } from '@/api'
import { slotToUtc } from '@/lib/time'
import { mockStore } from '@/test/msw/handlers'
import { FIXTURE_OWNER_CREDENTIALS, FIXTURE_TIME_ZONE, ids } from './fixtures'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')
const MONDAY = '2026-11-23'

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the call to fail')
    },
    (error: unknown) => error as ApiError,
  )

function checkout(overrides: Partial<Schema<'CheckoutRequest'>> = {}) {
  return api.POST('/api/public/orders', {
    body: {
      pickupAt: slotToUtc(MONDAY, '10:00', FIXTURE_TIME_ZONE),
      guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
      lines: [{ itemId: ids.items.croissant, quantity: 2 }],
      ...overrides,
    },
  })
}

const day = (date: string) =>
  unwrap(api.GET('/api/public/availability', { params: { query: { date } } })).then((d) => d[0]!)

const login = (password: string) =>
  unwrap(
    api.POST('/api/auth/login', { body: { email: FIXTURE_OWNER_CREDENTIALS.email, password } }),
  )

beforeEach(() => {
  mockStore.setNow(NOW)
})

afterEach(() => {
  setAccessTokenProvider(null)
})

test('the public bakery endpoint gives guests the time zone and contact details', async () => {
  const bakery = await unwrap(api.GET('/api/public/bakery'))
  expect(bakery).toMatchObject({ businessName: 'SugarCrumbs', timeZone: FIXTURE_TIME_ZONE })
  expect(bakery.address?.city).toBe('Brooklyn')
})

describe('catalogue', () => {
  test('lists categories', async () => {
    const categories = await unwrap(api.GET('/api/public/catalogue/categories'))
    expect(categories.map((c) => c.name)).toEqual(['Bread', 'Cakes', 'Pastries'])
  })

  test('lists available items only, sorted by name, as a Spring page', async () => {
    const page = readPage(await unwrap(api.GET('/api/public/catalogue/items')))
    expect(page.items.map((i) => i.name)).toEqual([
      'Baguette',
      'Butter croissant',
      'Chocolate fudge cake',
      'Cinnamon roll',
      'Country sourdough',
    ])
    expect(page).toMatchObject({ number: 0, totalElements: 5, hasNext: false })
    expect(page.items.find((i) => i.name === 'Cinnamon roll')?.orderable).toBe(false)
  })

  test('pages with flat page and size parameters', async () => {
    const second = readPage(
      await unwrap(
        api.GET('/api/public/catalogue/items', { params: { query: { page: 1, size: 2 } } }),
      ),
    )
    expect(second.items.map((i) => i.name)).toEqual(['Chocolate fudge cake', 'Cinnamon roll'])
    expect(second).toMatchObject({
      number: 1,
      size: 2,
      totalPages: 3,
      hasPrevious: true,
      hasNext: true,
    })
  })

  test('filters by category and search', async () => {
    const byCategory = await unwrap(
      api.GET('/api/public/catalogue/items', {
        params: { query: { categoryId: ids.categories.cakes } },
      }),
    )
    expect(readPage(byCategory).items.map((i) => i.name)).toEqual(['Chocolate fudge cake'])

    const bySearch = await unwrap(
      api.GET('/api/public/catalogue/items', { params: { query: { search: 'BREAD' } } }),
    )
    expect(readPage(bySearch).items).toEqual([])
  })

  test('an unavailable item is a 404 ApiError with a request id', async () => {
    const error = await failure(
      unwrap(
        api.GET('/api/public/catalogue/items/{id}', {
          params: { path: { id: ids.items.weddingCake } },
        }),
      ),
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'item not found' })
    expect(error.requestId).toMatch(/^mock-/)
  })
})

describe('availability', () => {
  test('a weekday has 30-minute slots from 08:00 to 16:00, two places each', async () => {
    const monday = await day(MONDAY)
    expect(monday.open).toBe(true)
    expect(monday.slots).toHaveLength(16)
    expect(monday.slots[0]).toEqual({
      startTime: '08:00',
      endTime: '08:30',
      startsAt: '2026-11-23T13:00:00Z',
      endsAt: '2026-11-23T13:30:00Z',
      capacity: 2,
      remainingCapacity: 2,
      bookable: true,
    })
    expect(monday.slots.at(-1)?.startTime).toBe('15:30')
  })

  test('closed on Sundays and on blocked dates, recurring ones every year', async () => {
    expect(await day('2026-11-22')).toMatchObject({ open: false, reason: 'Closed on Sundays' })
    expect(await day('2026-12-25')).toMatchObject({ open: false, reason: 'Christmas' })
    expect(await day('2027-12-24')).toMatchObject({ open: true })
    expect(await day('2027-12-25')).toMatchObject({ open: false, reason: 'Christmas' })
    expect(await day('2027-01-13')).toMatchObject({ open: false, reason: 'Bakery holiday' })
  })

  test('like the backend, bookable reflects capacity only, even for slots already past', async () => {
    const today = await day('2026-11-20')
    expect(today.slots.find((s) => s.startTime === '11:30')?.bookable).toBe(true)
    expect(today.slots.find((s) => s.startTime === '12:30')?.bookable).toBe(true)
  })

  test('a from/to range returns each day; more than 62 days is a 400', async () => {
    const week = await unwrap(
      api.GET('/api/public/availability', {
        params: { query: { from: MONDAY, to: '2026-11-29' } },
      }),
    )
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ])
    const error = await failure(
      unwrap(
        api.GET('/api/public/availability', {
          params: { query: { from: '2026-11-01', to: '2027-03-01' } },
        }),
      ),
    )
    expect(error.status).toBe(400)
  })
})

describe('checkout and the magic link', () => {
  test('places an order, returns the token once, and the magic link shows it', async () => {
    const order = await unwrap(checkout())
    expect(order).toMatchObject({ status: 'PENDING', subtotal: 7.5 })
    expect(order.accessToken).toMatch(/^mock-token-/)

    const guest = await unwrap(
      api.GET('/api/public/orders/by-token/{token}', {
        params: { path: { token: order.accessToken } },
      }),
    )
    expect(guest).toMatchObject({
      reference: order.reference,
      status: 'PENDING',
      pickupAt: '2026-11-23T15:00:00Z',
      cancellableUntil: '2026-11-22T15:00:00.000Z',
    })
  })

  test('the storefront sends a slot’s startsAt as pickupAt, with no zone conversion', async () => {
    const [monday] = await unwrap(
      api.GET('/api/public/availability', { params: { query: { date: MONDAY } } }),
    )
    const slot = monday!.slots.find((s) => s.startTime === '14:30')!

    const order = await unwrap(checkout({ pickupAt: slot.startsAt }))

    expect(order.pickupAt).toBe('2026-11-23T19:30:00Z')
    expect(slot.startsAt).toBe(slotToUtc(MONDAY, '14:30', FIXTURE_TIME_ZONE))
  })

  test('each order uses one place in its slot; a full slot is a 409', async () => {
    await unwrap(checkout())
    await unwrap(checkout())

    const [monday] = await unwrap(
      api.GET('/api/public/availability', { params: { query: { date: MONDAY } } }),
    )
    expect(monday?.slots.find((s) => s.startTime === '10:00')).toMatchObject({
      remainingCapacity: 0,
      bookable: false,
    })
    expect(await failure(unwrap(checkout()))).toMatchObject({ status: 409 })
  })

  test('invalid contact details come back as field errors', async () => {
    const error = await failure(
      unwrap(checkout({ guestContact: { name: ' ', email: 'jane@', phone: '1' } })),
    )
    expect(error.status).toBe(400)
    expect(error.fieldError('guestContact.name')).toBe('must not be blank')
    expect(error.fieldError('guestContact.email')).toBe('must be a well-formed email address')
  })

  test('lead time, sold-out items and times that are not a slot are refused', async () => {
    // The cake needs 48 hours; Saturday 09:00 is only 21 hours away.
    const tooSoon = await failure(
      unwrap(
        checkout({
          pickupAt: slotToUtc('2026-11-21', '09:00', FIXTURE_TIME_ZONE),
          lines: [{ itemId: ids.items.chocolateCake, quantity: 1 }],
        }),
      ),
    )
    expect(tooSoon.status).toBe(400)
    expect(tooSoon.fieldError('pickupAt')).toMatch(/48 hours/)

    const soldOut = await failure(
      unwrap(checkout({ lines: [{ itemId: ids.items.cinnamonRoll, quantity: 1 }] })),
    )
    expect(soldOut).toMatchObject({ status: 409, message: 'Cinnamon roll is sold out' })

    const offSlot = await failure(
      unwrap(checkout({ pickupAt: slotToUtc(MONDAY, '10:10', FIXTURE_TIME_ZONE) })),
    )
    expect(offSlot.fieldError('pickupAt')).toBe('is not an open pickup slot')

    // Still listed as bookable (capacity is free), but it started at 11:30 today, before NOW.
    const past = await failure(
      unwrap(checkout({ pickupAt: slotToUtc('2026-11-20', '11:30', FIXTURE_TIME_ZONE) })),
    )
    expect(past.fieldError('pickupAt')).toBe('must be in the future')
  })

  test('guests can cancel until 24 hours before pickup', async () => {
    const order = await unwrap(checkout())
    const token = { params: { path: { token: order.accessToken } } }

    mockStore.setNow(new Date('2026-11-22T16:00:00Z')) // 23 hours before pickup
    expect(
      await failure(
        unwrap(api.POST('/api/public/orders/by-token/{token}/cancel', { ...token, body: {} })),
      ),
    ).toMatchObject({ status: 409 })

    mockStore.setNow(NOW)
    const cancelled = await unwrap(
      api.POST('/api/public/orders/by-token/{token}/cancel', {
        ...token,
        body: { reason: 'Plans changed' },
      }),
    )
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Plans changed',
      cancellableUntil: null,
    })
  })

  test('an unknown token is a 404', async () => {
    const error = await failure(
      unwrap(
        api.GET('/api/public/orders/by-token/{token}', { params: { path: { token: 'nope' } } }),
      ),
    )
    expect(error.status).toBe(404)
  })
})

describe('owner auth and owner endpoints', () => {
  test('wrong credentials are a 401', async () => {
    expect(await failure(login('wrong'))).toMatchObject({ status: 401 })
  })

  test('owner endpoints need the bearer token from login', async () => {
    await unwrap(checkout())
    expect(await failure(unwrap(api.GET('/api/auth/me')))).toMatchObject({ status: 401 })

    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)

    expect(await unwrap(api.GET('/api/auth/me'))).toMatchObject({ businessName: 'SugarCrumbs' })
    expect(await unwrap(api.GET('/api/owner/profile'))).toMatchObject({
      timeZone: FIXTURE_TIME_ZONE,
    })
    const orders = readPage(await unwrap(api.GET('/api/orders')))
    expect(orders.items).toHaveLength(1)
    expect(orders.items[0]).not.toHaveProperty('accessToken')
  })

  test('a refresh token works once', async () => {
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    const refresh = () =>
      unwrap(api.POST('/api/auth/refresh', { body: { refreshToken: tokens.refreshToken } }))

    const renewed = await refresh()
    expect(renewed.refreshToken).not.toBe(tokens.refreshToken)
    expect(await failure(refresh())).toMatchObject({ status: 401 })
  })
})

test('uploaded image URLs return a placeholder image', async () => {
  const response = await fetch(
    `http://localhost:8080/uploads/items/${ids.items.croissant}-thumb.svg`,
  )
  expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
  expect(await response.text()).toContain('>B</text>')
})

test('reset clears orders and unfreezes the clock', async () => {
  await unwrap(checkout())
  mockStore.reset()
  expect(mockStore.orders).toEqual([])
  expect(Math.abs(mockStore.now().getTime() - Date.now())).toBeLessThan(5_000)
})
