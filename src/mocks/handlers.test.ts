// The default MSW handlers, exercised through the real API client, so tests and `npm run dev:mock`
// can rely on them behaving like profound-baker-server.
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  api,
  ApiError,
  postMultipart,
  readPage,
  setAccessTokenProvider,
  unwrap,
  type Schema,
} from '@/api'
import { slotToUtc } from '@/lib/time'
import { imageFile, pngBytes } from '@/test/images'
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

/** As the API is called with any day name, valid or not. */
const setHours = (dayOfWeek: string, body: Partial<Schema<'WorkingHoursRequest'>>) =>
  unwrap(
    api.PUT('/api/availability/working-hours/{dayOfWeek}', {
      params: { path: { dayOfWeek: dayOfWeek as Schema<'WorkingHoursResponse'>['dayOfWeek'] } },
      body: body as Schema<'WorkingHoursRequest'>,
    }),
  )

describe('working hours', () => {
  beforeEach(async () => {
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('lists Monday first, and a day set or removed changes guests’ slots', async () => {
    const week = await unwrap(api.GET('/api/availability/working-hours'))
    expect(week.map((h) => h.dayOfWeek)).toEqual([
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ])

    const sunday = await setHours('SUNDAY', {
      startTime: '10:00:00',
      endTime: '12:00',
      slotDurationMinutes: 60,
      maxConcurrentBookings: 3,
    })
    expect(sunday).toMatchObject({ dayOfWeek: 'SUNDAY', startTime: '10:00', endTime: '12:00' })
    expect(await day('2026-11-22')).toMatchObject({ open: true, slots: [{}, {}] })

    await unwrap(
      api.DELETE('/api/availability/working-hours/{dayOfWeek}', {
        params: { path: { dayOfWeek: 'MONDAY' } },
      }),
    )
    expect(await day(MONDAY)).toMatchObject({ open: false, reason: 'Closed on Mondays' })
  })

  test('rejects hours like the server does', async () => {
    const valid = {
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
      maxConcurrentBookings: 2,
    }
    expect(
      await failure(
        setHours('MONDAY', { ...valid, slotDurationMinutes: 4, maxConcurrentBookings: 0 }),
      ),
    ).toMatchObject({
      status: 400,
      fieldErrors: [
        { field: 'slotDurationMinutes', message: 'must be greater than or equal to 5' },
        { field: 'maxConcurrentBookings', message: 'must be greater than or equal to 1' },
      ],
    })
    expect(await failure(setHours('MONDAY', { ...valid, endTime: '09:00' }))).toMatchObject({
      status: 400,
      message: 'startTime must be before endTime',
    })
    expect(await failure(setHours('FUNDAY', valid))).toMatchObject({ status: 400 })
  })
})

function uploadPhoto(bytes: Uint8Array) {
  const form = new FormData()
  form.append('file', imageFile(bytes, 'photo.png', 'image/png'))
  return postMultipart<Schema<'ItemResponse'>>(
    `/api/catalogue/items/${ids.items.baguette}/images/upload`,
    form,
  )
}

const removePhoto = (url: string) =>
  unwrap(
    api.DELETE('/api/catalogue/items/{id}/images', {
      params: { path: { id: ids.items.baguette }, query: { url } },
    }),
  )

describe('item photos', () => {
  beforeEach(async () => {
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('an upload is appended and served back, like the server stores it', async () => {
    const bytes = pngBytes(800, 600)

    const item = await uploadPhoto(bytes)

    expect(item.imageUrls).toHaveLength(2)
    const [, url] = item.imageUrls
    const [, thumbnail] = item.thumbnailUrls
    expect(url).toMatch(/^\/uploads\/items\/[0-9a-f-]{36}\.png$/)
    expect(thumbnail).toBe(url!.replace('.png', '.thumb.png'))
    const served = await fetch(`http://localhost:8080${thumbnail}`)
    expect(served.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
  })

  test('the bytes decide what an upload is, and how large it may be', async () => {
    expect(await failure(uploadPhoto(new TextEncoder().encode('GIF89a')))).toMatchObject({
      status: 400,
      message: 'not a PNG, JPEG or WebP image',
    })
    expect(await failure(uploadPhoto(pngBytes(10_001, 10)))).toMatchObject({
      status: 400,
      message: 'image is too large (10001 x 10 px); at most 10000 px a side',
    })
    expect(await failure(uploadPhoto(new Uint8Array(10 * 1024 * 1024 + 1)))).toMatchObject({
      status: 413,
    })
    expect(mockStore.findItem(ids.items.baguette)?.imageUrls).toHaveLength(1)
  })

  test('removing a photo detaches it and its thumbnail', async () => {
    const [url] = mockStore.findItem(ids.items.baguette)!.imageUrls
    expect(await removePhoto(url!)).toMatchObject({ imageUrls: [], thumbnailUrls: [] })
    // A URL the item doesn't hold changes nothing.
    expect(await removePhoto('/uploads/items/other.jpg')).toMatchObject({ imageUrls: [] })
  })
})

test('reset clears orders and unfreezes the clock', async () => {
  await unwrap(checkout())
  mockStore.reset()
  expect(mockStore.orders).toEqual([])
  expect(Math.abs(mockStore.now().getTime() - Date.now())).toBeLessThan(5_000)
})
