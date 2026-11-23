// Orders for `npm run dev:mock`, so the Owner's pages have something to show: a few that need
// action (one about to be auto-cancelled), today's pickups, and a history that runs over a page.
// Times are relative to now. Tests start with no orders and add their own.
import type { Schema } from '@/api'
import { addDays } from '@/lib/date'
import { slotToUtc, todayIn } from '@/lib/time'
import { FIXTURE_TIME_ZONE, items } from './fixtures'
import type { StoredOrder } from './store'

const HOUR = 3_600_000

const GUESTS = [
  ['Jane Baker', 'jane@example.com', '+1 555 0101'],
  ['Omar Haddad', 'omar.h@example.com', '+1 555 0144'],
  ['Mei Chen', 'mei.chen@example.com', '+1 555 0178'],
  ['Lucas Moreau', 'lucas@example.com', '+1 555 0123'],
  ['Priya Nair', 'priya.nair@example.com', '+1 555 0190'],
  ['Sam Okafor', 'sam.o@example.com', '+1 555 0166'],
] as const

type Demo = {
  status: StoredOrder['status']
  /** Days from today, and the slot's local time. */
  day: number
  time: string
  /** Hours before now it was placed. */
  placedHoursAgo: number
  lines: [itemIndex: number, quantity: number][]
  notes?: string
  rejectionReason?: string
  cancellationReason?: string
}

const DEMOS: Demo[] = [
  { status: 'PENDING', day: 1, time: '10:00', placedHoursAgo: 23.75, lines: [[1, 2]] },
  {
    status: 'PENDING',
    day: 2,
    time: '09:30',
    placedHoursAgo: 21,
    lines: [
      [2, 1],
      [4, 6],
    ],
  },
  {
    status: 'PENDING',
    day: 4,
    time: '14:00',
    placedHoursAgo: 2,
    lines: [[0, 1]],
    notes: 'Sliced, please',
  },
  {
    status: 'CONFIRMED',
    day: 0,
    time: '15:00',
    placedHoursAgo: 30,
    lines: [
      [3, 4],
      [1, 1],
    ],
  },
  { status: 'IN_PROGRESS', day: 0, time: '11:30', placedHoursAgo: 40, lines: [[2, 1]] },
  { status: 'CONFIRMED', day: 3, time: '08:30', placedHoursAgo: 26, lines: [[4, 12]] },
  {
    status: 'REJECTED',
    day: 1,
    time: '08:00',
    placedHoursAgo: 20,
    lines: [[2, 3]],
    rejectionReason: 'We can only make one fudge cake that morning, sorry!',
  },
  {
    status: 'CANCELLED',
    day: 2,
    time: '12:00',
    placedHoursAgo: 50,
    lines: [[0, 2]],
    cancellationReason: 'Cancelled by the customer',
  },
  // History: fulfilled orders over the past weeks.
  ...Array.from({ length: 18 }, (_, i): Demo => ({
    status: 'FULFILLED',
    day: -1 - Math.floor(i * 1.6),
    time: ['09:00', '10:30', '12:00', '14:30'][i % 4]!,
    placedHoursAgo: 48 + i * 40,
    lines: [[i % 5, 1 + (i % 3)]],
  })),
]

export function demoOrders(now: Date): StoredOrder[] {
  const today = todayIn(FIXTURE_TIME_ZONE, now)
  return DEMOS.map((demo, index) => {
    const lines = demo.lines.map(([itemIndex, quantity], i): Schema<'OrderLineResponse'> => {
      const item = items[itemIndex]!
      return {
        lineNo: i + 1,
        itemId: item.id,
        itemName: item.name,
        unitPrice: item.price,
        quantity,
        lineTotal: Math.round(item.price * 100 * quantity) / 100,
      }
    })
    const [name, email, phone] = GUESTS[index % GUESTS.length]!
    const createdAt = new Date(now.getTime() - demo.placedHoursAgo * HOUR).toISOString()
    const n = String(index + 1).padStart(3, '0')
    return {
      id: `d0000000-0000-4000-8000-000000000${n}`,
      reference: `SC-D${n}`,
      pickupAt: slotToUtc(addDays(today, demo.day), demo.time, FIXTURE_TIME_ZONE),
      status: demo.status,
      lines,
      subtotal: Math.round(lines.reduce((sum, l) => sum + l.lineTotal * 100, 0)) / 100,
      guestContact: { name, email, phone },
      notes: demo.notes ?? null,
      cancellationReason: demo.cancellationReason ?? null,
      rejectionReason: demo.rejectionReason ?? null,
      createdAt,
      updatedAt: createdAt,
      accessToken: `mock-token-demo-${n}`,
    }
  })
}
