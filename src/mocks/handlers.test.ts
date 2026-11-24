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
  type operations,
  type paths,
  type Schema,
} from '@/api'
import { slotToUtc } from '@/lib/time'
import { demoOrders, seedDemo } from './demo-orders'
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

type OrdersQuery = operations['calendar']['parameters']['query']

/** One page of the Owner's orders, as the API returns it. */
const listOrders = (query: NonNullable<OrdersQuery>) =>
  unwrap(api.GET('/api/orders', { params: { query } })).then(readPage)

/** The references of the orders a search finds. */
const searchRefs = async (q: string) => (await listOrders({ q })).items.map((o) => o.reference)

describe('owner orders list', () => {
  beforeEach(async () => {
    demoOrders(NOW).forEach((order) => mockStore.seed(order))
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('sorts by pickup or placed time, either way', async () => {
    const byPickup = await listOrders({ sort: ['pickupAt,desc'], size: 3 })
    expect(byPickup.items.map((o) => o.reference)).toEqual(['SC-D003', 'SC-D006', 'SC-D008'])
    expect(byPickup.totalElements).toBe(26)
    const byPlaced = await listOrders({ sort: ['createdAt,asc'], status: ['PENDING'] })
    expect(byPlaced.items.map((o) => o.reference)).toEqual(['SC-D001', 'SC-D002', 'SC-D003'])
  })

  test('searches the reference and the guest’s name, email and phone, in any case', async () => {
    expect(await searchRefs('sc-d004')).toEqual(['SC-D004'])
    expect(await searchRefs('MEI.CHEN@')).toHaveLength(4)
    expect(await searchRefs('555 0123')).toHaveLength(4)
  })

  test('refuses what the server refuses', async () => {
    expect(
      await failure(listOrders({ from: '2026-11-21T00:00:00Z', to: '2026-11-20T00:00:00Z' })),
    ).toMatchObject({ status: 400, message: 'from must be before to' })
    expect(await failure(listOrders({ q: 'x'.repeat(101) }))).toMatchObject({ status: 400 })
    expect(await failure(listOrders({ sort: ['total,asc'] }))).toMatchObject({ status: 400 })
  })
})

/** A demo order's id, and its path params: SC-D001 is "001". */
const id = (n: string) => `d0000000-0000-4000-8000-000000000${n}`
const path = (n: string) => ({ params: { path: { id: id(n) } } })
const putNotes = (n: string, notes: string) =>
  unwrap(api.PUT('/api/orders/{id}/notes', { ...path(n), body: { notes } }))

/** A demo order's invoice, and its path params. */
const invoiceOf = (n: string) => mockStore.invoiceForOrder(id(n))!
const invoicePath = (n: string) => ({ params: { path: { id: invoiceOf(n).id } } })
const listInvoices = (query: NonNullable<paths['/api/invoices']['get']['parameters']['query']>) =>
  unwrap(api.GET('/api/invoices', { params: { query } })).then(readPage)
const discount = (n: string, amount: number) =>
  unwrap(api.PATCH('/api/invoices/{id}/discount', { ...invoicePath(n), body: { amount } }))
const pay = (body: Schema<'PaymentRequest'>) =>
  unwrap(api.PATCH('/api/invoices/{id}/pay', { ...invoicePath('004'), body }))
const refund = (n: string) => unwrap(api.PATCH('/api/invoices/{id}/refund', invoicePath(n)))

describe('invoices', () => {
  beforeEach(async () => {
    seedDemo(mockStore)
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('lists newest first; filters by status, issue range and number or order reference', async () => {
    const all = await listInvoices({})
    expect(all.totalElements).toBe(21)
    expect(all.items[0]!.orderReference).toBe('SC-D006')
    expect(
      (await listInvoices({ status: ['REFUNDED'] })).items.map((i) => i.orderReference),
    ).toEqual(['SC-D013'])
    expect((await listInvoices({ q: 'sc-d01' })).totalElements).toBe(10)
    expect((await listInvoices({ q: 'INV-2026-0001' })).items).toHaveLength(1)
    const byNumber = await listInvoices({ sort: ['number,asc'], size: 2 })
    expect(byNumber.items.map((i) => i.number)).toEqual(['INV-2026-0001', 'INV-2026-0002'])
    expect(
      await failure(listInvoices({ from: '2026-11-20T00:00:00Z', to: '2026-11-19T00:00:00Z' })),
    ).toMatchObject({ status: 400, message: 'from must be before to' })
    expect(await failure(listInvoices({ q: 'x'.repeat(51) }))).toMatchObject({ status: 400 })
    expect(await failure(listInvoices({ sort: ['total,asc'] }))).toMatchObject({ status: 400 })
  })

  test('a discount: only while unpaid, never more than the subtotal, cents at most', async () => {
    expect(await discount('004', 0.1)).toMatchObject({ discountAmount: 0.1, total: 18.15 })
    expect(await discount('004', 0)).toMatchObject({ discountAmount: 0, total: 18.25 })
    expect(await failure(discount('004', 18.26))).toMatchObject({
      status: 400,
      message: 'discount cannot exceed subtotal',
    })
    expect(await failure(discount('004', 1.005))).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'amount' }],
    })
    expect(await failure(discount('009', 1))).toMatchObject({
      status: 400,
      message: 'cannot change discount on an invoice in status PAID',
    })
  })

  test('a payment: a transfer needs its reference, never in the future; then a refund', async () => {
    expect(await failure(pay({ method: 'BANK_TRANSFER', reference: ' ' }))).toMatchObject({
      status: 400,
      message: 'a bank transfer needs its reference',
    })
    expect(
      await failure(
        pay({ method: 'CASH', paidAt: new Date(NOW.getTime() + 60_000).toISOString() }),
      ),
    ).toMatchObject({ status: 400, fieldErrors: [{ field: 'paidAt' }] })
    expect(await pay({ method: 'CASH', reference: ' till 2 ' })).toMatchObject({
      status: 'PAID',
      paymentReference: 'till 2',
      paidAt: NOW.toISOString(),
    })
    expect(await failure(pay({ method: 'CASH' }))).toMatchObject({ status: 400 })

    expect(await refund('004')).toMatchObject({ status: 'REFUNDED', refundedAt: NOW.toISOString() })
    expect(await failure(refund('005'))).toMatchObject({
      status: 400,
      message: 'only a paid invoice can be refunded (current status: PENDING)',
    })
  })
})

describe('owner order changes', () => {
  beforeEach(async () => {
    demoOrders(NOW).forEach((order) => mockStore.seed(order))
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('moves an order only from the statuses the server allows, with a 400 otherwise', async () => {
    const confirmed = await unwrap(api.PATCH('/api/orders/{id}/confirm', path('001')))
    expect(confirmed.status).toBe('CONFIRMED')
    expect(confirmed.updatedAt).toBe(NOW.toISOString())
    const invoice = await unwrap(
      api.GET('/api/orders/{orderId}/invoice', { params: { path: { orderId: id('001') } } }),
    )
    expect(invoice).toMatchObject({
      number: expect.stringMatching(/^INV-2026-\d{4}$/),
      status: 'PENDING',
    })

    expect(await failure(unwrap(api.PATCH('/api/orders/{id}/confirm', path('001'))))).toMatchObject(
      {
        status: 400,
        message: 'cannot confirm an order in status CONFIRMED',
      },
    )
    expect(
      await failure(unwrap(api.PATCH('/api/orders/{id}/cancel', { ...path('002'), body: {} }))),
    ).toMatchObject({ status: 400, message: 'a pending order is rejected, not cancelled' })
    expect(
      await failure(unwrap(api.PATCH('/api/orders/{id}/start-preparation', path('005')))),
    ).toMatchObject({
      status: 400,
      message: 'cannot start preparation on an order in status IN_PROGRESS',
    })
    // Fulfilling straight from confirmed is allowed.
    expect((await unwrap(api.PATCH('/api/orders/{id}/fulfill', path('004')))).status).toBe(
      'FULFILLED',
    )
  })

  test('a rejection needs a reason; a cancellation voids the unpaid invoice', async () => {
    expect(
      await failure(
        unwrap(api.PATCH('/api/orders/{id}/reject', { ...path('002'), body: { reason: '  ' } })),
      ),
    ).toMatchObject({ status: 400, message: 'a rejection needs a reason' })
    expect(
      await failure(
        unwrap(
          api.PATCH('/api/orders/{id}/reject', {
            ...path('002'),
            body: { reason: 'x'.repeat(301) },
          }),
        ),
      ),
    ).toMatchObject({ status: 400, fieldErrors: [{ field: 'reason' }] })

    const cancelled = await unwrap(
      api.PATCH('/api/orders/{id}/cancel', { ...path('006'), body: {} }),
    )
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: null })
    const invoice = await unwrap(
      api.GET('/api/orders/{orderId}/invoice', { params: { path: { orderId: id('006') } } }),
    )
    expect(invoice.status).toBe('VOID')
    expect(
      await failure(
        unwrap(
          api.GET('/api/orders/{orderId}/invoice', { params: { path: { orderId: id('002') } } }),
        ),
      ),
    ).toMatchObject({ status: 404 })
  })

  test('reschedules to a free future slot, not counting the order itself', async () => {
    const pickupAt = slotToUtc(MONDAY, '10:00', FIXTURE_TIME_ZONE)
    const moved = await unwrap(
      api.PUT('/api/orders/{id}/schedule', { ...path('003'), body: { pickupAt } }),
    )
    expect(moved.pickupAt).toBe(pickupAt)
    // Its own place doesn't fill the slot it's already in.
    expect(
      (await unwrap(api.PUT('/api/orders/{id}/schedule', { ...path('003'), body: { pickupAt } })))
        .pickupAt,
    ).toBe(pickupAt)

    const sunday = slotToUtc('2026-11-22', '10:00', FIXTURE_TIME_ZONE)
    expect(
      await failure(
        unwrap(
          api.PUT('/api/orders/{id}/schedule', { ...path('003'), body: { pickupAt: sunday } }),
        ),
      ),
    ).toMatchObject({
      status: 409,
      message: expect.stringMatching(/^not open for orders on 2026-11-22/),
    })
    const past = slotToUtc('2026-11-20', '09:00', FIXTURE_TIME_ZONE)
    expect(
      await failure(
        unwrap(api.PUT('/api/orders/{id}/schedule', { ...path('003'), body: { pickupAt: past } })),
      ),
    ).toMatchObject({ status: 400, fieldErrors: [{ field: 'pickupAt' }] })
    expect(
      await failure(
        unwrap(api.PUT('/api/orders/{id}/schedule', { ...path('009'), body: { pickupAt } })),
      ),
    ).toMatchObject({ status: 400, message: 'cannot reschedule an order in status FULFILLED' })
  })

  test('edits a pending order’s lines: kept lines keep their price, new ones are numbered after', async () => {
    const order = mockStore.findById(id('002'))!
    mockStore.updateOrder(order, {
      lines: order.lines.map((l) => (l.lineNo === 1 ? { ...l, unitPrice: 40, lineTotal: 40 } : l)),
    })
    const edited = await unwrap(
      api.PUT('/api/orders/{id}/lines', {
        ...path('002'),
        body: {
          lines: [
            { itemId: ids.items.chocolateCake, quantity: 2 },
            { itemId: ids.items.croissant, quantity: 3 },
          ],
        },
      }),
    )
    expect(edited.lines.map((l) => [l.lineNo, l.itemName, l.unitPrice, l.lineTotal])).toEqual([
      [1, 'Chocolate fudge cake', 40, 80],
      [3, 'Butter croissant', 3.75, 11.25],
    ])
    expect(edited.subtotal).toBe(91.25)

    const edit = (lines: Schema<'OrderLineRequest'>[], n = '002') =>
      failure(unwrap(api.PUT('/api/orders/{id}/lines', { ...path(n), body: { lines } })))
    expect(await edit([{ itemId: ids.items.cinnamonRoll, quantity: 1 }])).toMatchObject({
      status: 409,
    })
    expect(await edit([{ itemId: ids.items.croissant, quantity: 101 }])).toMatchObject({
      status: 400,
    })
    expect(await edit([{ itemId: ids.items.sourdough, quantity: 11 }])).toMatchObject({
      status: 400,
      message: "not enough stock for 'Country sourdough'",
    })
    expect(await edit([{ itemId: ids.items.croissant, quantity: 1 }], '004')).toMatchObject({
      status: 400,
      message: 'cannot edit the lines of an order in status CONFIRMED',
    })
  })

  test('notes: trimmed, blank clears them, only while pending', async () => {
    expect((await putNotes('003', '  Extra crusty ')).notes).toBe('Extra crusty')
    expect((await putNotes('003', '   ')).notes).toBeNull()
    expect(await failure(putNotes('004', 'Too late'))).toMatchObject({ status: 400 })
  })
})

/** How many orders are due for pickup from `from` (included) to `to` (excluded). */
const ordersBetween = (from: string, to: string) =>
  unwrap(api.GET('/api/orders', { params: { query: { from, to } } })).then(
    (page) => readPage(page).totalElements,
  )

describe('closed dates', () => {
  beforeEach(async () => {
    const tokens = await login(FIXTURE_OWNER_CREDENTIALS.password)
    setAccessTokenProvider(() => tokens.accessToken)
  })

  test('added, edited and removed closures change guests’ days', async () => {
    const created = await unwrap(
      api.POST('/api/availability/blocked-dates', {
        body: { startDate: MONDAY, endDate: MONDAY, recurringAnnually: false },
      }),
    )
    expect(created).toMatchObject({ reason: null, recurringAnnually: false })
    // Like the server: no reason reads "Unavailable".
    expect(await day(MONDAY)).toMatchObject({ open: false, reason: 'Unavailable' })

    await unwrap(
      api.PUT('/api/availability/blocked-dates/{id}', {
        params: { path: { id: created.id } },
        body: { startDate: MONDAY, endDate: MONDAY, reason: 'Inventory' },
      }),
    )
    expect(await day(MONDAY)).toMatchObject({ open: false, reason: 'Inventory' })

    await unwrap(
      api.DELETE('/api/availability/blocked-dates/{id}', { params: { path: { id: created.id } } }),
    )
    expect(await day(MONDAY)).toMatchObject({ open: true })
    const list = await unwrap(api.GET('/api/availability/blocked-dates'))
    expect(list.map((b) => b.startDate)).toEqual(['2026-12-25', '2027-01-11'])
  })

  test('rejects closures like the server does', async () => {
    const create = (body: Partial<Schema<'BlockedDateRequest'>>) =>
      failure(
        unwrap(
          api.POST('/api/availability/blocked-dates', {
            body: body as Schema<'BlockedDateRequest'>,
          }),
        ),
      )
    expect(await create({ startDate: MONDAY })).toMatchObject({
      status: 400,
      fieldErrors: [{ field: 'endDate', message: 'must not be null' }],
    })
    expect(await create({ startDate: MONDAY, endDate: '2026-11-22' })).toMatchObject({
      status: 400,
      message: 'endDate cannot be before startDate',
    })
    expect(
      await failure(
        unwrap(
          api.DELETE('/api/availability/blocked-dates/{id}', {
            params: { path: { id: '40000000-0000-4000-8000-0000000000ff' } },
          }),
        ),
      ),
    ).toMatchObject({ status: 404 })
  })

  test('orders can be listed by pickup range', async () => {
    await unwrap(checkout())
    const pickup = slotToUtc(MONDAY, '10:00', FIXTURE_TIME_ZONE)
    expect(await ordersBetween(pickup, slotToUtc(MONDAY, '10:30', FIXTURE_TIME_ZONE))).toBe(1)
    // "to" is exclusive.
    expect(await ordersBetween(slotToUtc(MONDAY, '09:00', FIXTURE_TIME_ZONE), pickup)).toBe(0)
  })
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
