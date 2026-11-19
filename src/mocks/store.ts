// In-memory state behind the MSW handlers: orders placed through checkout, so a mocked flow can
// check out, open the magic link and cancel. Tests reset it after each test.
import type { Schema } from '@/api'
import { slotToUtc, todayIn } from '@/lib/time'
import { blockedDates, FIXTURE_TIME_ZONE, items, workingHours } from './fixtures'

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
    const nowMs = now().getTime()
    for (
      let minutes = startH * 60 + startM;
      minutes + hours.slotDurationMinutes <= endH * 60 + endM;
      minutes += hours.slotDurationMinutes
    ) {
      const startTime = hhmm(minutes)
      const pickupAt = slotToUtc(date, startTime, FIXTURE_TIME_ZONE)
      const booked = orders.filter(
        (o) => o.pickupAt === pickupAt && ACTIVE.includes(o.status),
      ).length
      const remainingCapacity = Math.max(0, hours.maxConcurrentBookings - booked)
      slots.push({
        startTime,
        endTime: hhmm(minutes + hours.slotDurationMinutes),
        capacity: hours.maxConcurrentBookings,
        remainingCapacity,
        bookable: remainingCapacity > 0 && Date.parse(pickupAt) > nowMs,
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
    today: () => todayIn(FIXTURE_TIME_ZONE, now()),
    dayAvailability,

    /** The slot `pickupAt` falls on, if any. */
    findSlot(pickupAt: string) {
      const date = todayIn(FIXTURE_TIME_ZONE, new Date(pickupAt))
      return dayAvailability(date).slots.find(
        (s) => slotToUtc(date, s.startTime, FIXTURE_TIME_ZONE) === pickupAt,
      )
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
    },
  }
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
