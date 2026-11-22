// MSW handlers that mirror profound-baker-server closely enough to build and test the SPA without
// it: same paths, same JSON shapes (typed from the spec), same ApiError bodies and status codes.
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { FieldError, Schema } from '@/api'
import { apiBaseUrl } from '@/api/config'
import { addDays } from '@/lib/date'
import {
  categories,
  FIXTURE_OWNER_CREDENTIALS,
  items,
  ownerProfile,
  toPublicItem,
} from './fixtures'
import type { MockStore, StoredOrder } from './store'

const MAX_AVAILABILITY_DAYS = 62
const ACCESS_TOKEN_SECONDS = 15 * 60

const api = (path: string) => `${apiBaseUrl}${path}`

/** Owner endpoints accept the access tokens the mocked login hands out. */
const isOwner = (request: Request) =>
  (request.headers.get('Authorization') ?? '').startsWith('Bearer mock-access-')

/** The owner's view of an order: everything except the guest's magic-link token. */
const ownerView = ({ accessToken: _token, ...order }: StoredOrder): Schema<'OrderResponse'> => order

export function createHandlers(store: MockStore): HttpHandler[] {
  let requestCount = 0
  let tokenCount = 0
  const usedRefreshTokens = new Set<string>()

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

  function issueTokens(): Schema<'TokenResponse'> {
    tokenCount += 1
    return {
      accessToken: `mock-access-${tokenCount}-${crypto.randomUUID()}`,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken: `mock-refresh-${tokenCount}-${crypto.randomUUID()}`,
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
        businessName: ownerProfile.businessName,
        timeZone: ownerProfile.timeZone,
        logoUrl: ownerProfile.logoUrl,
        phone: ownerProfile.phone,
        address: ownerProfile.address,
      }
      return HttpResponse.json(bakery)
    }),

    // ---- Catalogue (public) ----
    http.get(api('/api/public/catalogue/categories'), () => HttpResponse.json(categories)),

    http.get(api('/api/public/catalogue/items'), ({ request }) => {
      const params = new URL(request.url).searchParams
      const categoryId = params.get('categoryId')
      const search = params.get('search')?.trim().toLowerCase()
      const visible = items
        .filter((i) => i.available)
        .filter((i) => !categoryId || i.category.id === categoryId)
        .filter((i) => !search || i.name.toLowerCase().includes(search))
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map(toPublicItem)
      const page: Schema<'PagePublicItemResponse'> = springPage(visible, params)
      return HttpResponse.json(page)
    }),

    http.get(api('/api/public/catalogue/items/:id'), ({ request, params }) => {
      const item = items.find((i) => i.id === params.id && i.available)
      if (!item) return apiError(request, 404, 'item not found')
      return HttpResponse.json(toPublicItem(item))
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
        const item = items.find((i) => i.id === line.itemId)
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
        ...body.lines.map((l) => items.find((i) => i.id === l.itemId)?.leadTimeHours ?? 0),
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
      if (
        body.email !== FIXTURE_OWNER_CREDENTIALS.email ||
        body.password !== FIXTURE_OWNER_CREDENTIALS.password
      ) {
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
        id: ownerProfile.id,
        email: ownerProfile.email,
        ownerName: ownerProfile.ownerName,
        businessName: ownerProfile.businessName,
      }
      return HttpResponse.json(me)
    }),

    http.get(api('/api/owner/profile'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      return HttpResponse.json(ownerProfile)
    }),

    // ---- Owner orders ----
    http.get(api('/api/orders'), ({ request }) => {
      if (!isOwner(request)) return apiError(request, 401, 'authentication required')
      const params = new URL(request.url).searchParams
      const statuses = params.getAll('status')
      const query = params.get('q')?.trim().toLowerCase()
      const list = store.orders
        .filter((o) => statuses.length === 0 || statuses.includes(o.status))
        .filter(
          (o) =>
            !query ||
            o.reference.toLowerCase().includes(query) ||
            o.guestContact.name.toLowerCase().includes(query),
        )
        .toSorted((a, b) => a.pickupAt.localeCompare(b.pickupAt))
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

    // ---- Uploaded images: a generated placeholder per item ----
    http.get(`${apiBaseUrl}/uploads/items/:file`, ({ params }) => {
      const id = String(params.file).replace(/(-thumb)?\.\w+$/, '')
      const item = items.find((i) => i.id === id)
      return new HttpResponse(placeholderSvg(item?.name ?? '?'), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' },
      })
    }),
  ]
}

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
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
