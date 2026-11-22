// In-memory state behind the MSW handlers: orders placed through checkout, so a mocked flow can
// check out, open the magic link and cancel. Tests reset it after each test.
import type { Schema } from '@/api'
import { slotToUtc, todayIn } from '@/lib/time'
import {
  blockedDates,
  categories as fixtureCategories,
  FIXTURE_OWNER_CREDENTIALS,
  FIXTURE_TIME_ZONE,
  items as fixtureItems,
  ownerProfile,
  workingHours,
} from './fixtures'

export type StoredOrder = Schema<'OrderResponse'> & {
  /** The guest's magic-link token. The real backend stores only its hash. */
  accessToken: string
}

const ACTIVE: Schema<'OrderResponse'>['status'][] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS']
const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const
/** Guests may cancel until this long before pickup (the backend's default cutoff). */
export const GUEST_CANCEL_CUTOFF_HOURS = 24

/** The closure reason for a date, if a blocked range covers it (recurring ones ignore the year). */
function isBlocked(date: string): string | null {
  for (const b of blockedDates) {
    const inRange = b.recurringAnnually
      ? date.slice(5) >= b.startDate.slice(5) && date.slice(5) <= b.endDate.slice(5)
      : date >= b.startDate && date <= b.endDate
    if (inRange) return b.reason ?? 'Closed'
  }
  return null
}

export type MockStore = ReturnType<typeof createMockStore>

export function createMockStore(options: { now?: () => Date } = {}) {
  const realNow = options.now ?? (() => new Date())
  let fixedNow: Date | null = null
  const now = () => fixedNow ?? realNow()
  let orders: StoredOrder[] = []
  let sequence = 0
  let profile: Schema<'OwnerProfileResponse'> = structuredClone(ownerProfile)
  let password: string = FIXTURE_OWNER_CREDENTIALS.password
  let categories: Schema<'CategoryResponse'>[] = structuredClone(fixtureCategories)
  let items: Schema<'ItemResponse'>[] = structuredClone(fixtureItems)

  const nextId = (prefix: string) => {
    sequence += 1
    return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, '0')}`
  }

  /** One day of availability, computed like the backend: hours, closures, booked capacity. */
  function dayAvailability(date: string): Schema<'DayAvailabilityResponse'> {
    const weekday = DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()]
    const hours = workingHours.find((h) => h.dayOfWeek === weekday)
    const blockedReason = isBlocked(date)
    if (!hours || blockedReason) {
      return { date, open: false, reason: blockedReason ?? 'Closed on Sundays', slots: [] }
    }

    const slots: Schema<'TimeSlotResponse'>[] = []
    const [startH, startM] = hours.startTime.split(':').map(Number) as [number, number]
    const [endH, endM] = hours.endTime.split(':').map(Number) as [number, number]
    for (
      let minutes = startH * 60 + startM;
      minutes + hours.slotDurationMinutes <= endH * 60 + endM;
      minutes += hours.slotDurationMinutes
    ) {
      const startTime = hhmm(minutes)
      const endTime = hhmm(minutes + hours.slotDurationMinutes)
      // The slot's instants, as the backend now sends them; checkout sends startsAt as pickupAt.
      const startsAt = slotToUtc(date, startTime, FIXTURE_TIME_ZONE)
      const endsAt = slotToUtc(date, endTime, FIXTURE_TIME_ZONE)
      const booked = orders.filter(
        (o) => o.pickupAt === startsAt && ACTIVE.includes(o.status),
      ).length
      const remainingCapacity = Math.max(0, hours.maxConcurrentBookings - booked)
      slots.push({
        startTime,
        endTime,
        startsAt,
        endsAt,
        capacity: hours.maxConcurrentBookings,
        remainingCapacity,
        // Like the backend: capacity only. Past and too-soon slots are the client's to hide, and
        // checkout rejects them (pickupAt in the past, or within the lead time).
        bookable: remainingCapacity > 0,
      })
    }
    return { date, open: true, reason: null, slots }
  }

  return {
    now,
    /** Freezes the mocks' clock (availability, lead time, cancel cutoff); null unfreezes it. */
    setNow(date: Date | null) {
      fixedNow = date
    },
    get orders(): readonly StoredOrder[] {
      return orders
    },
    /** The Owner's profile, as edited through PUT /api/owner/profile. */
    get profile(): Schema<'OwnerProfileResponse'> {
      return profile
    },
    setProfile(next: Schema<'OwnerProfileResponse'>) {
      profile = next
    },
    /** Categories as created, renamed and deleted through the owner API (unsorted, like the DB). */
    get categories(): readonly Schema<'CategoryResponse'>[] {
      return categories
    },
    setCategories(next: Schema<'CategoryResponse'>[]) {
      categories = next
    },
    /** The Owner's items, as created, edited and deleted through the owner API. */
    get items(): readonly Schema<'ItemResponse'>[] {
      return items
    },
    setItems(next: Schema<'ItemResponse'>[]) {
      items = next
    },
    findItem: (id: string) => items.find((i) => i.id === id),
    /** Replaces one item (or adds it), recomputing `orderable` and `updatedAt` like the backend. */
    saveItem(item: Schema<'ItemResponse'>): Schema<'ItemResponse'> {
      const saved = {
        ...item,
        orderable: item.available && (item.stockQuantity === null || item.stockQuantity > 0),
        updatedAt: now().toISOString(),
      }
      items = items.some((i) => i.id === saved.id)
        ? items.map((i) => (i.id === saved.id ? saved : i))
        : [...items, saved]
      return saved
    },
    /** Whether any order (cancelled ones included) has a line for the item. */
    hasOrderHistory: (itemId: string) =>
      orders.some((o) => o.lines.some((line) => line.itemId === itemId)),
    /** An item's category as it is now (renamed categories show their new name). */
    categoryOf(item: Schema<'ItemResponse'>): Schema<'CategoryResponse'> {
      return categories.find((c) => c.id === item.category.id) ?? item.category
    },
    /** The Owner's current password (the fixture one until changed). */
    get password(): string {
      return password
    },
    setPassword(next: string) {
      password = next
    },
    today: () => todayIn(FIXTURE_TIME_ZONE, now()),
    dayAvailability,

    /** The slot `pickupAt` falls on, if any. */
    findSlot(pickupAt: string) {
      const date = todayIn(FIXTURE_TIME_ZONE, new Date(pickupAt))
      return dayAvailability(date).slots.find((s) => s.startsAt === pickupAt)
    },

    placeOrder(request: Schema<'CheckoutRequest'>): StoredOrder {
      const timestamp = now().toISOString()
      const lines = request.lines.map((line, index): Schema<'OrderLineResponse'> => {
        const item = items.find((i) => i.id === line.itemId)!
        const quantity = line.quantity ?? 1
        return {
          lineNo: index + 1,
          itemId: item.id,
          itemName: item.name,
          unitPrice: item.price,
          quantity,
          lineTotal: Math.round(item.price * 100 * quantity) / 100,
        }
      })
      const order: StoredOrder = {
        id: nextId('50000000'),
        reference: `SC-${String(1000 + sequence).slice(-4)}${'KQXZ'[sequence % 4]}`,
        pickupAt: request.pickupAt,
        status: 'PENDING',
        lines,
        subtotal: Math.round(lines.reduce((sum, l) => sum + l.lineTotal * 100, 0)) / 100,
        guestContact: { ...request.guestContact },
        notes: request.notes ?? null,
        cancellationReason: null,
        rejectionReason: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        accessToken: `mock-token-${crypto.randomUUID()}`,
      }
      orders = [...orders, order]
      return order
    },

    findById: (id: string) => orders.find((o) => o.id === id),
    findByToken: (token: string) => orders.find((o) => o.accessToken === token),

    cancellableUntil(order: StoredOrder): string | null {
      if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') return null
      return new Date(
        Date.parse(order.pickupAt) - GUEST_CANCEL_CUTOFF_HOURS * 3_600_000,
      ).toISOString()
    },

    cancel(order: StoredOrder, reason: string | null): StoredOrder {
      const updated: StoredOrder = {
        ...order,
        status: 'CANCELLED',
        cancellationReason: reason ?? 'Cancelled by the customer',
        updatedAt: now().toISOString(),
      }
      orders = orders.map((o) => (o.id === order.id ? updated : o))
      return updated
    },

    /** Adds an order directly, e.g. to set up a test. */
    seed(order: StoredOrder) {
      orders = [...orders, order]
    },

    reset() {
      orders = []
      sequence = 0
      fixedNow = null
      profile = structuredClone(ownerProfile)
      password = FIXTURE_OWNER_CREDENTIALS.password
      categories = structuredClone(fixtureCategories)
      items = structuredClone(fixtureItems)
    },
  }
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
