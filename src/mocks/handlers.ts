// MSW handlers that mirror profound-baker-server closely enough to build and test the SPA without
// it: same paths, same JSON shapes (typed from the spec), same ApiError bodies and status codes.
import { delay, http, HttpResponse, type HttpHandler } from 'msw'
import type { FieldError, Schema } from '@/api'
import { apiBaseUrl } from '@/api/config'
import { addDays, addMonths } from '@/lib/date'
import { readImageHeader } from '@/lib/image-header'
import { todayIn } from '@/lib/time'
import { FIXTURE_TIME_ZONE, toPublicItem } from './fixtures'
import type { MockStore, StoredOrder } from './store'

const MAX_AVAILABILITY_DAYS = 62
/** spring.servlet.multipart.max-request-size, and the server's ImageProcessor limits. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_SIDE = 10_000
const MAX_IMAGE_PIXELS = 50_000_000
const ACCESS_TOKEN_SECONDS = 15 * 60

const api = (path: string) => `${apiBaseUrl}${path}`

/** Owner endpoints accept the access tokens the mocked login hands out. */
const isOwner = (request: Request) =>
  (request.headers.get('Authorization') ?? '').startsWith('Bearer mock-access-')

/** The owner's view of an order: everything except the guest's magic-link token. */
/** OrderProperties' defaults: distinct items per order, and units of one item. */
const MAX_ORDER_LINES = 20
const MAX_LINE_QUANTITY = 100
/** The bakery's "YYYY-MM" for an instant. */
const monthIn = (instant: string) => todayIn(FIXTURE_TIME_ZONE, new Date(instant)).slice(0, 7)
/** DashboardService.MAX_REVENUE_MONTHS: how far back the revenue chart may reach. */
const MAX_REVENUE_MONTHS = 24
/** InvoiceService.MAX_SEARCH_LENGTH. */
const INVOICE_SEARCH_MAX = 50
/** Statuses an order can still be rescheduled in. */
const OPEN_STATUSES: StoredOrder['status'][] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS']

const ownerView = ({ accessToken: _token, ...order }: StoredOrder): Schema<'OrderResponse'> => order

export function createHandlers(store: MockStore): HttpHandler[] {
  let requestCount = 0
  let tokenCount = 0
  const usedRefreshTokens = new Set<string>()
  const issuedRefreshTokens = new Set<string>()
  const rememberRefreshToken = (token: string) => {
    issuedRefreshTokens.add(token)
    return token
  }

  /** BlockedDateRequest's bean validation and BlockedDate's own rule; null when it's fine. */
  function checkBlockedDate(request: Request, body: Partial<Schema<'BlockedDateRequest'>>) {
    const errors: FieldError[] = []
    if (!body.startDate) errors.push({ field: 'startDate', message: 'must not be null' })
    if (!body.endDate) errors.push({ field: 'endDate', message: 'must not be null' })
    if ((body.reason ?? '').length > 200) {
      errors.push({ field: 'reason', message: 'size must be between 0 and 200' })
    }
    if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
    if (!ISO_DATE.test(body.startDate!) || !ISO_DATE.test(body.endDate!)) {
      return apiError(request, 400, 'malformed request body')
    }
    if (body.endDate! < body.startDate!) {
      return apiError(request, 400, 'endDate cannot be before startDate')
    }
    return null
  }

  /** An error exactly like the backend's: ApiError body plus an X-Request-Id header. */
  function apiError(
    request: Request,
    status: number,
    message: string,
    fieldErrors: FieldError[] | null = null,
  ) {
    requestCount += 1
    const body: Schema<'ApiError'> = {
      timestamp: store.now().toISOString(),
      status,
      error: REASONS[status] ?? 'Error',
      message,
      path: new URL(request.url).pathname,
      fieldErrors,
    }
    return HttpResponse.json(body, {
      status,
      headers: { 'X-Request-Id': `mock-${String(requestCount).padStart(6, '0')}` },
    })
  }

  /** Runs `handle` on the order in the path, after the Owner and 404 checks every route makes. */
  function withOrder(
    request: Request,
    params: Record<string, unknown>,
    handle: (order: StoredOrder) => Response,
  ) {
    if (!isOwner(request)) return apiError(request, 401, 'authentication required')
    const order = store.findById(String(params.id))
    if (!order) return apiError(request, 404, `Order not found: ${String(params.id)}`)
    return handle(order)
  }

  /** Runs `handle` on the invoice in the path, after the Owner and 404 checks. */
  function withInvoice(
    request: Request,
    params: Record<string, unknown>,
    handle: (invoice: Schema<'InvoiceResponse'>) => Response,
  ) {
    if (!isOwner(request)) return apiError(request, 401, 'authentication required')
    const invoice = store.findInvoice(String(params.id))
    if (!invoice) return apiError(request, 404, `Invoice not found: ${String(params.id)}`)
    return handle(invoice)
  }

  /** Order's guard: "cannot confirm an order in status CANCELLED". */
  const wrongStatus = (request: Request, action: string, order: StoredOrder) =>
    apiError(request, 400, `cannot ${action} an order in status ${order.status}`)

  /** RejectRequest and CancelRequest's bean validation: at most 300 characters; rejects need one. */
  function checkReason(request: Request, reason: string | undefined, required: boolean) {
    if (required && reason == null) {
      return apiError(request, 400, 'validation failed', [
        { field: 'reason', message: 'must not be null' },
      ])
    }
    if ((reason ?? '').length > 300) {
      return apiError(request, 400, 'validation failed', [
        { field: 'reason', message: 'size must be between 0 and 300' },
      ])
    }
    return null
  }

  function issueTokens(): Schema<'TokenResponse'> {
    tokenCount += 1
    return {
      accessToken: `mock-access-${tokenCount}-${crypto.randomUUID()}`,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken: rememberRefreshToken(`mock-refresh-${tokenCount}-${crypto.randomUUID()}`),
      refreshTokenExpiresAt: new Date(store.now().getTime() + 14 * 86_400_000).toISOString(),
    }
  }

  function guestView(order: StoredOrder): Schema<'GuestOrderResponse'> {
    return {
      reference: order.reference,
      status: order.status,
      pickupAt: order.pickupAt,
      lines: order.lines,
      subtotal: order.subtotal,
      guestContact: order.guestContact,
      notes: order.notes,
      rejectionReason: order.rejectionReason,
      cancellationReason: order.cancellationReason,
      placedAt: order.createdAt,
      cancellableUntil: store.cancellableUntil(order),
    }
  }

  return [
    // ---- The bakery (public): name, time zone and contact for the storefront ----
    http.get(api('/api/public/bakery'), () => {
      const bakery: Schema<'PublicBakeryResponse'> = {
        businessName: store.profile.businessName,
        timeZone: store.profile.timeZone,
        logoUrl: store.profile.logoUrl,
        phone: store.profile.phone,
        address: store.profile.address,
      }
      return HttpResponse.json(bakery)
    }),

    // ---- Catalogue (public) ----
    http.get(api('/api/public/catalogue/categories'), () => HttpResponse.json(store.categories)),

    http.get(api('/api/public/catalogue/items'), ({ request }) => {
      const params = new URL(request.url).searchParams
      const categoryId = params.get('categoryId')
      const search = params.get('search')?.trim().toLowerCase()
      const visible = store.items
        .filter((i) => i.available)
        .filter((i) => !categoryId || i.category.id === categoryId)
        .filter((i) => !search || i.name.toLowerCase().includes(search))
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((i) => toPublicItem({ ...i, category: store.categoryOf(i) }))
      const page: Schema<'PagePublicItemResponse'> = springPage(visible, params)
      return HttpResponse.json(page)
    }),

    http.get(api('/api/public/catalogue/items/:id'), ({ request, params }) => {
      const item = store.items.find((i) => i.id === params.id && i.available)
      if (!item) return apiError(request, 404, 'item not found')
      return HttpResponse.json(toPublicItem({ ...item, category: store.categoryOf(item) }))
    }),

    // ---- Catalogue (owner): categories ----
    http.get(api('/api/catalogue/categories'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      return HttpResponse.json(store.categories)
    }),

    http.post(api('/api/catalogue/categories'), async ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const { name } = (await request.json()) as Schema<'CategoryRequest'>
      const invalid = validateCategoryName(name)
      if (invalid) return apiError(request, 400, 'validation failed', [invalid])
      if (store.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return apiError(request, 409, `a category named '${name}' already exists`)
      }
      const created = { id: crypto.randomUUID(), name }
      store.setCategories([...store.categories, created])
      return HttpResponse.json(created, { status: 201 })
    }),

    http.put(api('/api/catalogue/categories/:id'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const category = store.categories.find((c) => c.id === params.id)
      if (!category) return apiError(request, 404, `Category ${String(params.id)} not found`)
      const { name } = (await request.json()) as Schema<'CategoryRequest'>
      const invalid = validateCategoryName(name)
      if (invalid) return apiError(request, 400, 'validation failed', [invalid])
      const taken = store.categories.some(
        (c) => c.id !== category.id && c.name.toLowerCase() === name.toLowerCase(),
      )
      if (taken) return apiError(request, 409, `a category named '${name}' already exists`)
      const renamed = { ...category, name }
      store.setCategories(store.categories.map((c) => (c.id === category.id ? renamed : c)))
      return HttpResponse.json(renamed)
    }),

    http.delete(api('/api/catalogue/categories/:id'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const category = store.categories.find((c) => c.id === params.id)
      if (!category) return apiError(request, 404, `Category ${String(params.id)} not found`)
      // Like the backend: any item, available or not, keeps its category from being deleted.
      if (store.items.some((i) => i.category.id === category.id)) {
        return apiError(
          request,
          409,
          `cannot delete category '${category.name}': it still has items assigned to it`,
        )
      }
      store.setCategories(store.categories.filter((c) => c.id !== category.id))
      return new HttpResponse(null, { status: 204 })
    }),

    // ---- Catalogue (owner): items ----
    http.get(api('/api/catalogue/items'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const params = new URL(request.url).searchParams
      const categoryId = params.get('categoryId')
      const available = params.get('available')
      const search = params.get('search')?.trim().toLowerCase()
      const [sortField = 'name', sortDir = 'asc'] = (params.get('sort') ?? 'name,asc').split(',')
      const sortable: Record<string, (i: Schema<'ItemResponse'>) => string | number> = {
        name: (i) => i.name.toLowerCase(),
        price: (i) => i.price,
        leadTimeHours: (i) => i.leadTimeHours,
        // Unlimited (null) sorts after any number, like nulls in Postgres ascending.
        stockQuantity: (i) => i.stockQuantity ?? Number.MAX_SAFE_INTEGER,
        updatedAt: (i) => i.updatedAt,
        'category.name': (i) => store.categoryOf(i).name.toLowerCase(),
      }
      const key = sortable[sortField]
      if (!key) return apiError(request, 400, `No property '${sortField}' found for type 'Item'`)
      const direction = sortDir.toLowerCase() === 'desc' ? -1 : 1
      const list = store.items
        .filter((i) => !categoryId || i.category.id === categoryId)
        .filter((i) => available === null || String(i.available) === available)
        .filter((i) => !search || i.name.toLowerCase().includes(search))
        .map((i) => ({ ...i, category: store.categoryOf(i) }))
        .toSorted((a, b) => {
          const [x, y] = [key(a), key(b)]
          return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * direction
        })
      const page: Schema<'PageItemResponse'> = springPage(list, params)
      return HttpResponse.json(page)
    }),

    http.get(api('/api/catalogue/items/:id'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      return HttpResponse.json({ ...item, category: store.categoryOf(item) })
    }),

    http.post(api('/api/catalogue/items'), async ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const body = (await request.json()) as Schema<'ItemRequest'>
      const errors = validateItem(body)
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      const category = store.categories.find((c) => c.id === body.categoryId)
      if (!category) return apiError(request, 404, `Category ${body.categoryId} not found`)
      const timestamp = store.now().toISOString()
      const created = store.saveItem({
        id: crypto.randomUUID(),
        name: body.name,
        description: body.description ?? null,
        price: Math.round(body.price * 100) / 100,
        category,
        available: true,
        leadTimeHours: body.leadTimeHours ?? 0,
        stockQuantity: body.stockQuantity ?? null,
        orderable: true,
        imageUrls: [],
        thumbnailUrls: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      return HttpResponse.json(created, { status: 201 })
    }),

    http.put(api('/api/catalogue/items/:id'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      const body = (await request.json()) as Schema<'ItemRequest'>
      const errors = validateItem(body)
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      const category = store.categories.find((c) => c.id === body.categoryId)
      if (!category) return apiError(request, 404, `Category ${body.categoryId} not found`)
      const saved = store.saveItem({
        ...item,
        name: body.name,
        description: body.description ?? null,
        price: Math.round(body.price * 100) / 100,
        category,
        leadTimeHours: body.leadTimeHours ?? 0,
        stockQuantity: body.stockQuantity ?? null,
      })
      return HttpResponse.json(saved)
    }),

    http.patch(api('/api/catalogue/items/:id/availability'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      const { available } = (await request.json()) as Schema<'AvailabilityRequest'>
      return HttpResponse.json(
        store.saveItem({ ...item, category: store.categoryOf(item), available }),
      )
    }),

    http.delete(api('/api/catalogue/items/:id'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      if (store.hasOrderHistory(item.id)) {
        return apiError(
          request,
          409,
          `cannot delete item '${item.name}': it has order history. Mark it unavailable instead.`,
        )
      }
      store.setItems(store.items.filter((i) => i.id !== item.id))
      return new HttpResponse(null, { status: 204 })
    }),

    http.post(api('/api/catalogue/items/:id/images/upload'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      const body = new Uint8Array(await request.arrayBuffer())
      if (body.length > MAX_UPLOAD_BYTES) {
        return apiError(request, 413, 'Maximum upload size exceeded')
      }
      const file = multipartFile(body, request.headers.get('Content-Type'), 'file')
      if (!file) return apiError(request, 400, "Required part 'file' is not present.")
      if (file.length === 0) return apiError(request, 400, 'file is required')
      const header = readImageHeader(file)
      if (!header) return apiError(request, 400, 'not a PNG, JPEG or WebP image')
      if (!header.size) return apiError(request, 400, 'the image could not be read')
      const { width, height } = header.size
      if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
        return apiError(
          request,
          400,
          `image is too large (${width} x ${height} px); at most ${MAX_IMAGE_SIDE} px a side`,
        )
      }
      // The server decodes, scales and re-encodes: not instant.
      await delay()
      const stored = store.storeUpload(file, header.format)
      const current = store.findItem(item.id) ?? item
      return HttpResponse.json(
        store.saveItem({
          ...current,
          category: store.categoryOf(current),
          imageUrls: [...current.imageUrls, stored.url],
          thumbnailUrls: [...current.thumbnailUrls, stored.thumbnailUrl],
        }),
      )
    }),

    http.delete(api('/api/catalogue/items/:id/images'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const item = store.findItem(String(params.id))
      if (!item) return apiError(request, 404, `Item ${String(params.id)} not found`)
      const url = new URL(request.url).searchParams.get('url')
      if (url === null) return apiError(request, 400, "Required parameter 'url' is not present.")
      const index = item.imageUrls.indexOf(url)
      // Like the server: a URL the item doesn't hold changes nothing.
      if (index === -1) return HttpResponse.json({ ...item, category: store.categoryOf(item) })
      store.deleteUpload(url)
      return HttpResponse.json(
        store.saveItem({
          ...item,
          category: store.categoryOf(item),
          imageUrls: item.imageUrls.filter((_, i) => i !== index),
          thumbnailUrls: item.thumbnailUrls.filter((_, i) => i !== index),
        }),
      )
    }),

    // ---- Blocked dates (owner) ----
    http.get(api('/api/availability/blocked-dates'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      return HttpResponse.json(
        store.blockedDates.toSorted((a, b) => a.startDate.localeCompare(b.startDate)),
      )
    }),

    http.post(api('/api/availability/blocked-dates'), async ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const body = (await request.json()) as Partial<Schema<'BlockedDateRequest'>>
      const invalid = checkBlockedDate(request, body)
      if (invalid) return invalid
      const created = toBlockedDate(crypto.randomUUID(), body)
      store.setBlockedDates([...store.blockedDates, created])
      return HttpResponse.json(created, { status: 201 })
    }),

    http.put(api('/api/availability/blocked-dates/:id'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const id = String(params.id)
      if (!store.blockedDates.some((b) => b.id === id)) {
        return apiError(request, 404, `BlockedDate ${id} not found`)
      }
      const body = (await request.json()) as Partial<Schema<'BlockedDateRequest'>>
      const invalid = checkBlockedDate(request, body)
      if (invalid) return invalid
      const updated = toBlockedDate(id, body)
      store.setBlockedDates(store.blockedDates.map((b) => (b.id === id ? updated : b)))
      return HttpResponse.json(updated)
    }),

    http.delete(api('/api/availability/blocked-dates/:id'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const id = String(params.id)
      if (!store.blockedDates.some((b) => b.id === id)) {
        return apiError(request, 404, `BlockedDate ${id} not found`)
      }
      store.setBlockedDates(store.blockedDates.filter((b) => b.id !== id))
      return new HttpResponse(null, { status: 204 })
    }),

    // ---- Working hours (owner) ----
    http.get(api('/api/availability/working-hours'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      return HttpResponse.json(
        store.workingHours.toSorted(
          (a, b) => WEEK.indexOf(a.dayOfWeek) - WEEK.indexOf(b.dayOfWeek),
        ),
      )
    }),

    http.put(api('/api/availability/working-hours/:day'), async ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const day = String(params.day) as DayOfWeek
      if (!WEEK.includes(day)) {
        return apiError(request, 400, `Failed to convert 'dayOfWeek' with value: '${day}'`)
      }
      const body = (await request.json()) as Partial<Schema<'WorkingHoursRequest'>>
      const errors = validateWorkingHours(body)
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      const startTime = localTime(body.startTime!)
      const endTime = localTime(body.endTime!)
      if (startTime === null || endTime === null) {
        return apiError(request, 400, 'malformed request body')
      }
      if (startTime >= endTime) return apiError(request, 400, 'startTime must be before endTime')
      const existing = store.workingHours.find((h) => h.dayOfWeek === day)
      const saved: Schema<'WorkingHoursResponse'> = {
        id: existing?.id ?? crypto.randomUUID(),
        dayOfWeek: day,
        startTime,
        endTime,
        slotDurationMinutes: body.slotDurationMinutes!,
        maxConcurrentBookings: body.maxConcurrentBookings!,
      }
      store.setWorkingHours([...store.workingHours.filter((h) => h.dayOfWeek !== day), saved])
      return HttpResponse.json(saved)
    }),

    http.delete(api('/api/availability/working-hours/:day'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      store.setWorkingHours(store.workingHours.filter((h) => h.dayOfWeek !== String(params.day)))
      return new HttpResponse(null, { status: 204 })
    }),

    // ---- Availability (public) ----
    http.get(api('/api/public/availability'), ({ request }) => {
      const params = new URL(request.url).searchParams
      const date = params.get('date')
      const from = params.get('from') ?? date
      const to = params.get('to') ?? date
      if (!from || !to) return apiError(request, 400, 'pass either date or from and to')
      const days: Schema<'DayAvailabilityResponse'>[] = []
      for (let day = from; day <= to; day = addDays(day, 1)) {
        if (days.length === MAX_AVAILABILITY_DAYS) {
          return apiError(request, 400, `the range can be at most ${MAX_AVAILABILITY_DAYS} days`)
        }
        days.push(store.dayAvailability(day))
      }
      return HttpResponse.json(days)
    }),

    // ---- Checkout and the magic link (public) ----
    http.post(api('/api/public/orders'), async ({ request }) => {
      const body = (await request.json()) as Schema<'CheckoutRequest'>
      const fieldErrors = validateCheckout(body)
      if (fieldErrors.length > 0) {
        return apiError(request, 400, 'validation failed', fieldErrors)
      }

      for (const line of body.lines) {
        const item = store.findItem(line.itemId)
        if (!item?.available) return apiError(request, 404, 'item not found')
        if (!item.orderable) return apiError(request, 409, `${item.name} is sold out`)
      }

      const slot = store.findSlot(body.pickupAt)
      if (!slot) {
        return apiError(request, 400, 'pickupAt must be the start of an open pickup slot', [
          { field: 'pickupAt', message: 'is not an open pickup slot' },
        ])
      }
      const leadHours = Math.max(
        ...body.lines.map((l) => store.findItem(l.itemId)?.leadTimeHours ?? 0),
      )
      if (Date.parse(body.pickupAt) <= store.now().getTime()) {
        return apiError(request, 400, 'pickupAt must be in the future', [
          { field: 'pickupAt', message: 'must be in the future' },
        ])
      }
      if (Date.parse(body.pickupAt) < store.now().getTime() + leadHours * 3_600_000) {
        return apiError(request, 400, `this order needs ${leadHours} hours' notice`, [
          { field: 'pickupAt', message: `must be at least ${leadHours} hours from now` },
        ])
      }
      if (!slot.bookable) {
        return apiError(request, 409, 'that pickup slot is no longer available')
      }

      const order = store.placeOrder(body)
      const response: Schema<'CheckoutResponse'> = {
        ...ownerView(order),
        accessToken: order.accessToken,
      }
      return HttpResponse.json(response, { status: 201 })
    }),

    http.get(api('/api/public/orders/by-token/:token'), ({ request, params }) => {
      const order = store.findByToken(String(params.token))
      if (!order) return apiError(request, 404, 'order not found')
      return HttpResponse.json(guestView(order))
    }),

    http.post(api('/api/public/orders/by-token/:token/cancel'), async ({ request, params }) => {
      const order = store.findByToken(String(params.token))
      if (!order) return apiError(request, 404, 'order not found')
      const until = store.cancellableUntil(order)
      if (!until || store.now().getTime() > Date.parse(until)) {
        return apiError(request, 409, 'this order can no longer be cancelled online')
      }
      const body = (await request.json().catch(() => ({}))) as Schema<'GuestCancelRequest'>
      return HttpResponse.json(guestView(store.cancel(order, body.reason ?? null)))
    }),

    // ---- Owner auth ----
    http.post(api('/api/auth/login'), async ({ request }) => {
      const body = (await request.json()) as Schema<'LoginRequest'>
      if (body.email?.toLowerCase() !== store.profile.email || body.password !== store.password) {
        return apiError(request, 401, 'invalid email or password')
      }
      return HttpResponse.json(issueTokens())
    }),

    http.post(api('/api/auth/refresh'), async ({ request }) => {
      const { refreshToken } = (await request.json()) as Schema<'RefreshRequest'>
      // Each refresh token works once, like the backend (which also revokes the whole chain).
      if (!refreshToken.startsWith('mock-refresh-') || usedRefreshTokens.has(refreshToken)) {
        return apiError(request, 401, 'refresh token is invalid or was already used')
      }
      usedRefreshTokens.add(refreshToken)
      return HttpResponse.json(issueTokens())
    }),

    http.post(api('/api/auth/logout'), () => new HttpResponse(null, { status: 204 })),

    http.get(api('/api/auth/me'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const me: Schema<'OwnerResponse'> = {
        id: store.profile.id,
        email: store.profile.email,
        ownerName: store.profile.ownerName,
        businessName: store.profile.businessName,
      }
      return HttpResponse.json(me)
    }),

    http.get(api('/api/owner/profile'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      return HttpResponse.json(store.profile)
    }),

    http.put(api('/api/owner/profile'), async ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const body = (await request.json()) as Schema<'OwnerProfileRequest'>
      const errors = validateProfile(body)
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      if (!isIanaZone(body.timeZone)) {
        return apiError(
          request,
          400,
          "timeZone must be an IANA time zone id such as 'Europe/London'",
        )
      }
      store.setProfile({
        ...store.profile,
        businessName: body.businessName,
        ownerName: body.ownerName,
        phone: body.phone ?? null,
        logoUrl: body.logoUrl ?? null,
        address: body.address ?? null,
        timeZone: body.timeZone,
      })
      return HttpResponse.json(store.profile)
    }),

    http.post(api('/api/owner/password'), async ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const body = (await request.json()) as Schema<'ChangePasswordRequest'>
      const errors: FieldError[] = []
      if ((body.newPassword ?? '').length < 12 || body.newPassword.length > 128) {
        errors.push({ field: 'newPassword', message: 'size must be between 12 and 128' })
      }
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      if (body.currentPassword !== store.password) {
        return apiError(request, 400, 'the current password is incorrect')
      }
      if (body.newPassword === store.password) {
        return apiError(request, 400, 'the new password must differ from the current one')
      }
      store.setPassword(body.newPassword)
      // Like the backend: every refresh token is revoked, this session's included.
      issuedRefreshTokens.forEach((token) => usedRefreshTokens.add(token))
      return new HttpResponse(null, { status: 204 })
    }),

    // ---- Owner orders ----
    http.get(api('/api/orders'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const params = new URL(request.url).searchParams
      const statuses = params.getAll('status')
      const query = params.get('q')?.trim().toLowerCase() ?? ''
      // A pickup range: from inclusive, to exclusive, either end open (instants).
      const from = params.get('from')
      const to = params.get('to')
      if (from && to && Date.parse(from) >= Date.parse(to)) {
        return apiError(request, 400, 'from must be before to')
      }
      if (query.length > 100) {
        return apiError(request, 400, 'search may be at most 100 characters')
      }
      // Like the server: pickupAt ascending unless asked otherwise.
      const [field = 'pickupAt', dir = 'asc'] = (params.get('sort') ?? 'pickupAt,asc').split(',')
      if (field !== 'pickupAt' && field !== 'createdAt') {
        return apiError(request, 400, `No property '${field}' found for type 'Order'`)
      }
      const direction = dir === 'desc' ? -1 : 1
      const list = store.orders
        .filter((o) => statuses.length === 0 || statuses.includes(o.status))
        .filter(
          (o) =>
            (!from || Date.parse(o.pickupAt) >= Date.parse(from)) &&
            (!to || Date.parse(o.pickupAt) < Date.parse(to)),
        )
        .filter(
          (o) =>
            !query ||
            [o.reference, o.guestContact.name, o.guestContact.email, o.guestContact.phone].some(
              (text) => text.toLowerCase().includes(query),
            ),
        )
        .toSorted((x, y) => x[field].localeCompare(y[field]) * direction)
        .map(ownerView)
      const page: Schema<'PageOrderResponse'> = springPage(list, params)
      return HttpResponse.json(page)
    }),

    http.get(api('/api/orders/:id'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const order = store.findById(String(params.id))
      if (!order) return apiError(request, 404, 'order not found')
      return HttpResponse.json(ownerView(order))
    }),

    // Transitions, guarded like Order's state machine: a wrong status is a 400, as the server's
    // IllegalStateException; a concurrent write would be a 409, which tests stage themselves.
    http.patch(api('/api/orders/:id/confirm'), ({ request, params }) =>
      withOrder(request, params, (order) => {
        if (order.status !== 'PENDING') return wrongStatus(request, 'confirm', order)
        const confirmed = store.updateOrder(order, { status: 'CONFIRMED' })
        store.issueInvoice(confirmed)
        return HttpResponse.json(ownerView(confirmed))
      }),
    ),

    http.patch(api('/api/orders/:id/reject'), async ({ request, params }) => {
      const body = (await request.json().catch(() => ({}))) as Partial<Schema<'RejectRequest'>>
      const invalid = checkReason(request, body.reason, true)
      if (invalid) return invalid
      return withOrder(request, params, (order) => {
        if (order.status !== 'PENDING') return wrongStatus(request, 'reject', order)
        if (!body.reason?.trim()) return apiError(request, 400, 'a rejection needs a reason')
        const rejected = store.updateOrder(order, {
          status: 'REJECTED',
          rejectionReason: body.reason.trim(),
        })
        return HttpResponse.json(ownerView(rejected))
      })
    }),

    http.patch(api('/api/orders/:id/start-preparation'), ({ request, params }) =>
      withOrder(request, params, (order) => {
        if (order.status !== 'CONFIRMED') return wrongStatus(request, 'start preparation on', order)
        return HttpResponse.json(ownerView(store.updateOrder(order, { status: 'IN_PROGRESS' })))
      }),
    ),

    http.patch(api('/api/orders/:id/fulfill'), ({ request, params }) =>
      withOrder(request, params, (order) => {
        if (order.status !== 'CONFIRMED' && order.status !== 'IN_PROGRESS') {
          return wrongStatus(request, 'fulfill', order)
        }
        return HttpResponse.json(ownerView(store.updateOrder(order, { status: 'FULFILLED' })))
      }),
    ),

    http.patch(api('/api/orders/:id/cancel'), async ({ request, params }) => {
      const body = (await request.json().catch(() => ({}))) as Schema<'CancelRequest'>
      const invalid = checkReason(request, body.reason, false)
      if (invalid) return invalid
      return withOrder(request, params, (order) => {
        if (order.status === 'PENDING') {
          return apiError(request, 400, 'a pending order is rejected, not cancelled')
        }
        if (order.status !== 'CONFIRMED' && order.status !== 'IN_PROGRESS') {
          return wrongStatus(request, 'cancel', order)
        }
        const cancelled = store.updateOrder(order, {
          status: 'CANCELLED',
          cancellationReason: body.reason ?? null,
        })
        store.voidInvoice(order.id)
        return HttpResponse.json(ownerView(cancelled))
      })
    }),

    http.put(api('/api/orders/:id/schedule'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Schema<'RescheduleRequest'>>
      const pickupAt = body.pickupAt ?? ''
      if (Number.isNaN(Date.parse(pickupAt))) {
        return apiError(request, 400, 'validation failed', [
          { field: 'pickupAt', message: 'must not be null' },
        ])
      }
      if (Date.parse(pickupAt) <= store.now().getTime()) {
        return apiError(request, 400, 'validation failed', [
          { field: 'pickupAt', message: 'must be a future date' },
        ])
      }
      return withOrder(request, params, (order) => {
        // Like OrderService: the slot is checked before the status. The Owner may waive lead time.
        const date = todayIn(FIXTURE_TIME_ZONE, new Date(pickupAt))
        const day = store.dayAvailability(date, order.id)
        if (!day.open) {
          const suffix = day.reason ? ` (${day.reason})` : ''
          return apiError(request, 409, `not open for orders on ${date}${suffix}`)
        }
        const minute = Math.floor(Date.parse(pickupAt) / 60_000) * 60_000
        const slot = day.slots.find((s) => Date.parse(s.startsAt) === minute && s.bookable)
        if (!slot) {
          return apiError(
            request,
            409,
            'the requested time is not an available pickup slot \u2014 check GET /api/public/availability first',
          )
        }
        if (!OPEN_STATUSES.includes(order.status)) {
          return wrongStatus(request, 'reschedule', order)
        }
        return HttpResponse.json(ownerView(store.updateOrder(order, { pickupAt: slot.startsAt })))
      })
    }),

    http.put(api('/api/orders/:id/lines'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Schema<'EditLinesRequest'>>
      const lines = body.lines ?? []
      const errors: FieldError[] = []
      if (lines.length === 0) errors.push({ field: 'lines', message: 'must not be empty' })
      lines.forEach((line, index) => {
        if (!line.itemId) {
          errors.push({ field: `lines[${index}].itemId`, message: 'must not be null' })
        }
        if ((line.quantity ?? 0) < 1) {
          errors.push({
            field: `lines[${index}].quantity`,
            message: 'must be greater than or equal to 1',
          })
        }
      })
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      if (lines.length > MAX_ORDER_LINES) {
        return apiError(
          request,
          400,
          `an order may contain at most ${MAX_ORDER_LINES} different items`,
        )
      }
      const tooMany = lines.findIndex((l) => (l.quantity ?? 0) > MAX_LINE_QUANTITY)
      if (tooMany !== -1) {
        return apiError(
          request,
          400,
          `line ${tooMany + 1}: at most ${MAX_LINE_QUANTITY} of one item per order`,
        )
      }
      return withOrder(request, params, (order) => {
        if (order.status !== 'PENDING') return wrongStatus(request, 'edit the lines of', order)
        if (new Set(lines.map((l) => l.itemId)).size !== lines.length) {
          return apiError(request, 400, 'each item may appear only once in an order')
        }
        let nextLineNo = Math.max(0, ...order.lines.map((l) => l.lineNo)) + 1
        const edited: Schema<'OrderLineResponse'>[] = []
        for (const line of lines) {
          const quantity = line.quantity!
          const existing = order.lines.find((l) => l.itemId === line.itemId)
          const item = store.findItem(line.itemId)
          if (!existing && !item) return apiError(request, 404, `Item not found: ${line.itemId}`)
          if (!existing && !item!.orderable) {
            return apiError(request, 409, `item '${item!.name}' is not currently available`)
          }
          // Stock moves by the difference only.
          const extra = quantity - (existing?.quantity ?? 0)
          if (item && item.stockQuantity !== null && extra > item.stockQuantity) {
            return apiError(request, 400, `not enough stock for '${item.name}'`)
          }
          // An item already on the order keeps the name and price the guest saw.
          const unitPrice = existing ? existing.unitPrice : item!.price
          edited.push({
            lineNo: existing ? existing.lineNo : nextLineNo++,
            itemId: line.itemId,
            itemName: existing ? existing.itemName : item!.name,
            unitPrice,
            quantity,
            lineTotal: Math.round(unitPrice * 100 * quantity) / 100,
          })
        }
        edited.sort((a, b) => a.lineNo - b.lineNo)
        return HttpResponse.json(ownerView(store.updateOrder(order, { lines: edited })))
      })
    }),

    http.put(api('/api/orders/:id/notes'), async ({ request, params }) => {
      const body = (await request.json()) as Schema<'NotesRequest'>
      if ((body.notes ?? '').length > 1000) {
        return apiError(request, 400, 'validation failed', [
          { field: 'notes', message: 'size must be between 0 and 1000' },
        ])
      }
      return withOrder(request, params, (order) => {
        if (order.status !== 'PENDING') return wrongStatus(request, 'edit the notes of', order)
        const notes = body.notes?.trim() ? body.notes.trim() : null
        return HttpResponse.json(ownerView(store.updateOrder(order, { notes })))
      })
    }),

    http.get(api('/api/orders/:orderId/invoice'), ({ request, params }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const invoice = store.invoiceForOrder(String(params.orderId))
      if (!invoice) {
        return apiError(request, 404, `Invoice not found for order: ${String(params.orderId)}`)
      }
      return HttpResponse.json(invoice)
    }),

    // ---- Invoices ----
    http.get(api('/api/invoices'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const params = new URL(request.url).searchParams
      const statuses = params.getAll('status')
      const query = params.get('q')?.trim().toLowerCase() ?? ''
      // An issue range: from inclusive, to exclusive, either end open (instants).
      const from = params.get('from')
      const to = params.get('to')
      if (from && to && Date.parse(from) >= Date.parse(to)) {
        return apiError(request, 400, 'from must be before to')
      }
      if (query.length > INVOICE_SEARCH_MAX) {
        return apiError(request, 400, `search may be at most ${INVOICE_SEARCH_MAX} characters`)
      }
      // Like the server: newest first unless asked otherwise. issuedAt is the entity's createdAt.
      const [field = 'createdAt', dir = 'desc'] = (params.get('sort') ?? 'createdAt,desc').split(
        ',',
      )
      const sortKey = { createdAt: 'issuedAt', number: 'number' }[field] as
        'issuedAt' | 'number' | undefined
      if (!sortKey) return apiError(request, 400, `cannot sort by '${field}'`)
      const direction = dir.toLowerCase() === 'asc' ? 1 : -1
      const list = store.invoices
        .filter((i) => statuses.length === 0 || statuses.includes(i.status))
        .filter(
          (i) =>
            (!from || Date.parse(i.issuedAt) >= Date.parse(from)) &&
            (!to || Date.parse(i.issuedAt) < Date.parse(to)),
        )
        .filter(
          (i) =>
            !query ||
            i.number.toLowerCase().includes(query) ||
            i.orderReference.toLowerCase().includes(query),
        )
        .toSorted((x, y) => x[sortKey].localeCompare(y[sortKey]) * direction)
      const page: Schema<'PageInvoiceResponse'> = springPage(list, params)
      return HttpResponse.json(page)
    }),

    http.get(api('/api/invoices/:id'), ({ request, params }) =>
      withInvoice(request, params, (invoice) => HttpResponse.json(invoice)),
    ),

    http.patch(api('/api/invoices/:id/discount'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Schema<'DiscountRequest'>>
      const amount = body.amount
      // DiscountRequest: @NotNull @DecimalMin("0.00") @Digits(integer = 8, fraction = 2).
      if (typeof amount !== 'number') {
        return apiError(request, 400, 'validation failed', [
          { field: 'amount', message: 'must not be null' },
        ])
      }
      if (amount < 0) {
        return apiError(request, 400, 'validation failed', [
          { field: 'amount', message: 'must be greater than or equal to 0.00' },
        ])
      }
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6 || amount >= 1e8) {
        return apiError(request, 400, 'validation failed', [
          {
            field: 'amount',
            message: 'numeric value out of bounds (<8 digits>.<2 digits> expected)',
          },
        ])
      }
      return withInvoice(request, params, (invoice) => {
        if (invoice.status !== 'PENDING') {
          return apiError(
            request,
            400,
            `cannot change discount on an invoice in status ${invoice.status}`,
          )
        }
        if (amount > invoice.subtotal) {
          return apiError(request, 400, 'discount cannot exceed subtotal')
        }
        return HttpResponse.json(store.updateInvoice(invoice, { discountAmount: amount }))
      })
    }),

    http.patch(api('/api/invoices/:id/pay'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Schema<'PaymentRequest'>>
      const errors: FieldError[] = []
      if (body.method !== 'CASH' && body.method !== 'BANK_TRANSFER') {
        errors.push({ field: 'method', message: 'must not be null' })
      }
      if ((body.reference ?? '').length > 200) {
        errors.push({ field: 'reference', message: 'size must be between 0 and 200' })
      }
      if (body.paidAt && Date.parse(body.paidAt) > store.now().getTime()) {
        errors.push({ field: 'paidAt', message: 'must be a date in the past or in the present' })
      }
      if (errors.length > 0) return apiError(request, 400, 'validation failed', errors)
      return withInvoice(request, params, (invoice) => {
        if (invoice.status !== 'PENDING') {
          return apiError(request, 400, `cannot mark paid an invoice in status ${invoice.status}`)
        }
        const reference = body.reference?.trim() ? body.reference.trim() : null
        if (body.method === 'BANK_TRANSFER' && !reference) {
          return apiError(request, 400, 'a bank transfer needs its reference')
        }
        const paid = store.updateInvoice(invoice, {
          status: 'PAID',
          paymentMethod: body.method!,
          paymentReference: reference,
          paidAt: body.paidAt ?? store.now().toISOString(),
        })
        return HttpResponse.json(paid)
      })
    }),

    http.patch(api('/api/invoices/:id/refund'), ({ request, params }) =>
      withInvoice(request, params, (invoice) => {
        if (invoice.status !== 'PAID') {
          return apiError(
            request,
            400,
            `only a paid invoice can be refunded (current status: ${invoice.status})`,
          )
        }
        const refunded = store.updateInvoice(invoice, {
          status: 'REFUNDED',
          refundedAt: store.now().toISOString(),
        })
        return HttpResponse.json(refunded)
      }),
    ),

    // ---- Dashboard ----
    http.get(api('/api/dashboard/summary'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const months = Number(new URL(request.url).searchParams.get('months') ?? 12)
      if (!Number.isInteger(months) || months < 1 || months > MAX_REVENUE_MONTHS) {
        return apiError(request, 400, `months must be between 1 and ${MAX_REVENUE_MONTHS}`)
      }
      // Everything in the bakery's time zone, like DashboardService.
      const today = store.today()
      const isToday = (instant: string) => todayIn(FIXTURE_TIME_ZONE, new Date(instant)) === today
      const pickups = store.orders.filter((o) => isToday(o.pickupAt))
      const count = (statuses: StoredOrder['status'][]) =>
        pickups.filter((o) => statuses.includes(o.status)).length

      // Revenue: invoices paid now, in the month they were paid; a refund takes it back out.
      const revenueByMonth: Schema<'MonthlyRevenue'>[] = []
      for (let back = months - 1; back >= 0; back -= 1) {
        const month = addMonths(today.slice(0, 7), -back)
        const paid = store.invoices.filter(
          (i) => i.status === 'PAID' && i.paidAt && monthIn(i.paidAt) === month,
        )
        revenueByMonth.push({
          month,
          revenue: Math.round(paid.reduce((sum, i) => sum + i.total * 100, 0)) / 100,
          paidInvoices: paid.length,
        })
      }

      const summary: Schema<'DashboardSummaryResponse'> = {
        today,
        todaysPickups: {
          total: count(['CONFIRMED', 'IN_PROGRESS', 'FULFILLED']),
          toCollect: count(['CONFIRMED', 'IN_PROGRESS']),
        },
        pendingOrders: store.orders.filter((o) => o.status === 'PENDING').length,
        revenueByMonth,
      }
      return HttpResponse.json(summary)
    }),

    http.get(api('/api/dashboard/production'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const param = new URL(request.url).searchParams.get('date')
      if (param !== null && (!ISO_DATE.test(param) || Number.isNaN(Date.parse(param)))) {
        return apiError(request, 400, `invalid value for parameter 'date': ${param}`)
      }
      // A day in the bakery's time zone, today there if left out; like DashboardService.
      const date = param ?? store.today()
      const due = store.orders.filter(
        (o) =>
          (o.status === 'CONFIRMED' || o.status === 'IN_PROGRESS') &&
          todayIn(FIXTURE_TIME_ZONE, new Date(o.pickupAt)) === date,
      )
      // Summed per item; a deleted item's lines are told apart by the name they recorded.
      const byItem = new Map<string, Schema<'ProductionItemResponse'>>()
      for (const order of due) {
        for (const line of order.lines) {
          const key = line.itemId ?? `name:${line.itemName}`
          const row = byItem.get(key)
          byItem.set(key, {
            itemId: line.itemId,
            // Shown under the catalogue's current name.
            itemName: (line.itemId && store.findItem(line.itemId)?.name) || line.itemName,
            quantity: (row?.quantity ?? 0) + line.quantity,
            orderCount: (row?.orderCount ?? 0) + 1,
          })
        }
      }
      const production: Schema<'ProductionListResponse'> = {
        date,
        orderCount: due.length,
        items: [...byItem.values()].toSorted((a, b) =>
          a.itemName.localeCompare(b.itemName, 'en', { sensitivity: 'base' }),
        ),
      }
      return HttpResponse.json(production)
    }),

    // ---- Uploaded images: a generated placeholder per item ----
    http.get(`${apiBaseUrl}/uploads/items/:file`, ({ params }) => {
      const upload = store.findUpload(String(params.file))
      if (upload) {
        return new HttpResponse(upload.bytes as BodyInit, {
          headers: { 'Content-Type': upload.type, 'Cache-Control': 'max-age=3600' },
        })
      }
      const id = String(params.file).replace(/(-thumb)?\.\w+$/, '')
      const item = store.findItem(id)
      return new HttpResponse(placeholderSvg(item?.name ?? '?'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' },
      })
    }),
  ]
}

/**
 * The bytes of one file part of a multipart/form-data body. Parsed by hand: in tests (jsdom) the
 * Request's own formData() trips over jsdom's File class.
 */
function multipartFile(body: Uint8Array, contentType: string | null, name: string) {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType ?? '')?.[1]
  if (!boundary) return null
  // latin1 maps every byte to one character, so string offsets are byte offsets.
  const text = new TextDecoder('latin1').decode(body)
  const delimiter = `--${boundary}`
  let start = text.indexOf(delimiter)
  while (start !== -1) {
    const next = text.indexOf(delimiter, start + delimiter.length)
    if (next === -1) break
    const headersEnd = text.indexOf('\r\n\r\n', start)
    if (headersEnd !== -1 && headersEnd < next) {
      const headers = text.slice(start, headersEnd)
      if (new RegExp(`name="${name}"`).test(headers)) {
        // The part ends with the CRLF in front of the next delimiter.
        return body.slice(headersEnd + 4, next - 2)
      }
    }
    start = next
  }
  return null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function toBlockedDate(
  id: string,
  body: Partial<Schema<'BlockedDateRequest'>>,
): Schema<'BlockedDateResponse'> {
  return {
    id,
    startDate: body.startDate!,
    endDate: body.endDate!,
    // The server stores what it's sent: an empty reason stays empty, a missing one is null.
    reason: body.reason ?? null,
    recurringAnnually: body.recurringAnnually ?? false,
  }
}

type DayOfWeek = Schema<'WorkingHoursResponse'>['dayOfWeek']
const WEEK: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

/** A LocalTime as Jackson writes it ("HH:mm", seconds only when set), or null if unreadable. */
function localTime(text: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text)
  if (!match) return null
  return match[3] && match[3] !== '00' ? text : `${match[1]}:${match[2]}`
}

/** WorkingHoursRequest's bean validation: @NotNull times, @Min(5) slot, @Min(1) capacity. */
function validateWorkingHours(body: Partial<Schema<'WorkingHoursRequest'>>): FieldError[] {
  const errors: FieldError[] = []
  if (!body.startTime) errors.push({ field: 'startTime', message: 'must not be null' })
  if (!body.endTime) errors.push({ field: 'endTime', message: 'must not be null' })
  // A missing int binds as 0, which then fails @Min.
  if ((body.slotDurationMinutes ?? 0) < 5) {
    errors.push({ field: 'slotDurationMinutes', message: 'must be greater than or equal to 5' })
  }
  if ((body.maxConcurrentBookings ?? 0) < 1) {
    errors.push({ field: 'maxConcurrentBookings', message: 'must be greater than or equal to 1' })
  }
  return errors
}

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  429: 'Too Many Requests',
}

/** The backend's bean validation for ItemRequest, plus Item's own invariants. */
function validateItem(body: Schema<'ItemRequest'>): FieldError[] {
  const errors: FieldError[] = []
  if (!body.name?.trim()) errors.push({ field: 'name', message: 'must not be blank' })
  else if (body.name.length > 150) {
    errors.push({ field: 'name', message: 'size must be between 0 and 150' })
  }
  if ((body.description ?? '').length > 2000) {
    errors.push({ field: 'description', message: 'size must be between 0 and 2000' })
  }
  if (typeof body.price !== 'number' || body.price < 0.01) {
    errors.push({ field: 'price', message: 'must be greater than or equal to 0.01' })
  } else if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(body.price))) {
    errors.push({
      field: 'price',
      message: 'numeric value out of bounds (<8 digits>.<2 digits> expected)',
    })
  }
  if (!body.categoryId) errors.push({ field: 'categoryId', message: 'must not be null' })
  if ((body.leadTimeHours ?? 0) < 0) {
    errors.push({ field: 'leadTimeHours', message: 'must be greater than or equal to 0' })
  }
  if (body.stockQuantity != null && body.stockQuantity < 0) {
    errors.push({ field: 'stockQuantity', message: 'must be greater than or equal to 0' })
  }
  return errors
}

/** CategoryRequest: @NotBlank @Size(max = 100). */
function validateCategoryName(name: string | undefined): FieldError | null {
  if (!name?.trim()) return { field: 'name', message: 'must not be blank' }
  if (name.length > 100) return { field: 'name', message: 'size must be between 0 and 100' }
  return null
}

/** Region ids (and UTC) only, like the backend: a fixed offset would ignore daylight saving. */
function isIanaZone(zone: string | undefined): boolean {
  if (!zone) return false
  return zone === 'UTC' || Intl.supportedValuesOf('timeZone').includes(zone)
}

/** The backend's bean validation for OwnerProfileRequest and AddressDto. */
function validateProfile(body: Schema<'OwnerProfileRequest'>): FieldError[] {
  const errors: FieldError[] = []
  const check = (
    field: string,
    value: string | null | undefined,
    max: number,
    required = false,
  ) => {
    if (required && !value?.trim()) errors.push({ field, message: 'must not be blank' })
    else if ((value ?? '').length > max) {
      errors.push({ field, message: `size must be between 0 and ${max}` })
    }
  }
  check('businessName', body.businessName, 150, true)
  check('ownerName', body.ownerName, 150, true)
  check('phone', body.phone, 30)
  check('logoUrl', body.logoUrl, 300)
  check('timeZone', body.timeZone, 64, true)
  check('address.street', body.address?.street, 200)
  check('address.city', body.address?.city, 100)
  check('address.region', body.address?.region, 100)
  check('address.postalCode', body.address?.postalCode, 20)
  check('address.country', body.address?.country, 100)
  return errors
}

function validateCheckout(body: Schema<'CheckoutRequest'>): FieldError[] {
  const errors: FieldError[] = []
  // The backend's bean validation: GuestContactRequest and CheckoutRequest.
  const contact = body.guestContact ?? { name: '', email: '', phone: '' }
  const tooLong = (field: string, value: string | null | undefined, max: number) => {
    if ((value ?? '').length > max) {
      errors.push({ field, message: `size must be between 0 and ${max}` })
    }
  }
  if (!contact.name?.trim())
    errors.push({ field: 'guestContact.name', message: 'must not be blank' })
  tooLong('guestContact.name', contact.name, 150)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email ?? '')) {
    errors.push({ field: 'guestContact.email', message: 'must be a well-formed email address' })
  }
  tooLong('guestContact.email', contact.email, 254)
  if (!contact.phone?.trim()) {
    errors.push({ field: 'guestContact.phone', message: 'must not be blank' })
  }
  tooLong('guestContact.phone', contact.phone, 30)
  tooLong('notes', body.notes, 1000)
  if (!body.lines?.length) errors.push({ field: 'lines', message: 'must not be empty' })
  body.lines?.forEach((line, index) => {
    if ((line.quantity ?? 1) < 1) {
      errors.push({ field: `lines[${index}].quantity`, message: 'must be at least 1' })
    }
  })
  if (Number.isNaN(Date.parse(body.pickupAt))) {
    errors.push({ field: 'pickupAt', message: 'must be a date-time' })
  }
  return errors
}

/** Spring Data's default Page JSON, honouring ?page=&size= like the backend (size ≤ 100). */
function springPage<T>(all: T[], params: URLSearchParams) {
  const size = Math.min(100, Math.max(1, Number(params.get('size') ?? 20) || 20))
  const number = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const content = all.slice(number * size, number * size + size)
  const totalPages = Math.ceil(all.length / size)
  return {
    content,
    number,
    size,
    totalElements: all.length,
    totalPages,
    numberOfElements: content.length,
    first: number === 0,
    last: number + 1 >= totalPages,
    empty: content.length === 0,
  }
}

function placeholderSvg(name: string): string {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="hsl(${hue} 55% 82%)"/><text x="200" y="200" font-family="Georgia, serif" font-size="180" fill="hsl(${hue} 45% 30%)" text-anchor="middle" dominant-baseline="central">${initial}</text></svg>`
}
