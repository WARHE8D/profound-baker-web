import createClient from 'openapi-fetch'
import type { components, paths } from '../../src/api/schema'
import { API_URL, BAKERY_ZONE, OWNER, SEED } from './env'

/**
 * Talks to the backend directly, around the UI: seeds the bakery and sets up the state a test
 * starts from (a pending order for the Owner to confirm), so each test only clicks through
 * the part it is about.
 */

type Schema<K extends keyof components['schemas']> = components['schemas'][K]
export type Item = Schema<'ItemResponse'>
export type PlacedOrder = Schema<'CheckoutResponse'>

const client = createClient<paths>({ baseUrl: API_URL })

/** The response's data, or a thrown error naming the call and what the server said. */
async function ok<T>(
  call: string,
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request
  if (!response.ok) {
    throw new Error(`${call}: ${response.status} ${JSON.stringify(error)}`)
  }
  return data as T
}

/** A new session for the Owner: an access and a refresh token. */
export function ownerLogin(): Promise<Schema<'TokenResponse'>> {
  return ok(
    'login',
    client.POST('/api/auth/login', { body: { email: OWNER.email, password: OWNER.password } }),
  )
}

/** An access token for the Owner. */
export async function ownerToken(): Promise<string> {
  return (await ownerLogin()).accessToken
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

/**
 * Makes sure the bakery can take orders: a profile in {@link BAKERY_ZONE}, open every day with
 * room for many orders per slot (tests run again and again against one database), and one
 * category with one item. Safe to run any number of times.
 */
export async function seedBakery(): Promise<Item> {
  const token = await ownerToken()

  await ok(
    'profile',
    client.PUT('/api/owner/profile', {
      ...auth(token),
      body: {
        businessName: 'Sugarcrumbs',
        ownerName: 'Ada Baker',
        phone: '+1 555 0100',
        timeZone: BAKERY_ZONE,
      },
    }),
  )

  const days = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ] as const
  for (const dayOfWeek of days) {
    await ok(
      `hours ${dayOfWeek}`,
      client.PUT('/api/availability/working-hours/{dayOfWeek}', {
        ...auth(token),
        params: { path: { dayOfWeek } },
        body: {
          startTime: '08:00',
          endTime: '18:00',
          slotDurationMinutes: 30,
          maxConcurrentBookings: 100,
        },
      }),
    )
  }

  const categories = await ok(
    'categories',
    client.GET('/api/catalogue/categories', { ...auth(token) }),
  )
  const category =
    categories.find((c) => c.name === SEED.category) ??
    (await ok(
      'new category',
      client.POST('/api/catalogue/categories', { ...auth(token), body: { name: SEED.category } }),
    ))

  const found = await ok(
    'items',
    client.GET('/api/catalogue/items', {
      ...auth(token),
      params: { query: { search: SEED.item } },
    }),
  )
  const existing = found.content?.find((item) => item.name === SEED.item)
  if (existing) return existing
  return ok(
    'new item',
    client.POST('/api/catalogue/items', {
      ...auth(token),
      body: {
        name: SEED.item,
        description: 'Dark, dense and sour. Baked fresh for every order.',
        price: SEED.price,
        categoryId: category.id,
        leadTimeHours: 0,
      },
    }),
  )
}

/** Today's date in the bakery, plus `days`, as `YYYY-MM-DD`. */
export function bakeryDate(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: BAKERY_ZONE }).format(new Date())
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

/** Places an order as a guest would, for pickup `daysAhead` days from today. */
export async function placeOrder(item: Item, daysAhead = 3): Promise<PlacedOrder> {
  const date = bakeryDate(daysAhead)
  const [day] = await ok(
    'availability',
    client.GET('/api/public/availability', { params: { query: { date } } }),
  )
  const slot = day?.slots.find((s) => s.bookable)
  if (!slot) throw new Error(`No bookable slot on ${date}`)
  return ok(
    'checkout',
    client.POST('/api/public/orders', {
      body: {
        pickupAt: slot.startsAt,
        guestContact: { name: 'Grace Hopper', email: 'grace@example.com', phone: '+1 555 0142' },
        lines: [{ itemId: item.id, quantity: 2 }],
      },
    }),
  )
}

/** Confirms an order as the Owner and returns the invoice that issues. */
export async function confirmOrder(orderId: string): Promise<Schema<'InvoiceResponse'>> {
  const token = await ownerToken()
  const path = { params: { path: { id: orderId } }, ...auth(token) }
  await ok('confirm', client.PATCH('/api/orders/{id}/confirm', path))
  return ok(
    'invoice',
    client.GET('/api/orders/{orderId}/invoice', { params: { path: { orderId } }, ...auth(token) }),
  )
}
