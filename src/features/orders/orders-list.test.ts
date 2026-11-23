import { expect, test } from 'vitest'
import { demoOrders } from '@/mocks/demo-orders'
import {
  formatRemaining,
  itemCount,
  pendingDeadline,
  readOrderParams,
  type OwnerOrder,
} from './orders-list'

const read = (search: string) => readOrderParams(new URLSearchParams(search))

test('without params: every order, latest pickup first', () => {
  expect(read('')).toEqual({
    search: '',
    statuses: [],
    from: null,
    to: null,
    sort: 'pickupAt',
    direction: 'desc',
    page: 0,
  })
})

test('reads filters from the URL, ignoring what it doesn’t know', () => {
  expect(
    read(
      'q=jane&status=CONFIRMED&status=PENDING&status=LOST&from=2026-11-20&to=bad&sort=placed&dir=asc&page=3',
    ),
  ).toEqual({
    search: 'jane',
    // In the order an order moves through them.
    statuses: ['PENDING', 'CONFIRMED'],
    from: '2026-11-20',
    to: null,
    sort: 'createdAt',
    direction: 'asc',
    page: 2,
  })
})

test('dates given the wrong way round are swapped, which the server would refuse', () => {
  expect(read('from=2026-11-27&to=2026-11-20')).toMatchObject({
    from: '2026-11-20',
    to: '2026-11-27',
  })
})

const NOW = new Date('2026-11-20T17:00:00Z')
const [aboutToGo, soonish, fresh] = demoOrders(NOW)
const HOUR = 3_600_000

test('a pending order is auto-cancelled 24 hours after it was placed', () => {
  expect(pendingDeadline(fresh!, NOW.getTime())).toEqual({
    at: NOW.getTime() + 22 * HOUR,
    remaining: 22 * HOUR,
    urgent: false,
  })
  expect(pendingDeadline(soonish!, NOW.getTime())).toMatchObject({
    remaining: 3 * HOUR,
    urgent: true,
  })
  expect(pendingDeadline(aboutToGo!, NOW.getTime() + HOUR)).toMatchObject({
    remaining: 0,
    urgent: true,
  })
  const confirmed: OwnerOrder = { ...fresh!, status: 'CONFIRMED' }
  expect(pendingDeadline(confirmed, NOW.getTime())).toBeNull()
})

test('time left reads in hours and minutes', () => {
  expect(formatRemaining(2 * HOUR + 15 * 60_000)).toBe('2 h 15 min')
  expect(formatRemaining(3 * HOUR)).toBe('3 h')
  expect(formatRemaining(45 * 60_000)).toBe('45 min')
  expect(formatRemaining(30_000)).toBe('under a minute')
})

test('items are counted by quantity', () => {
  expect(itemCount(soonish!)).toBe('7 items')
  expect(itemCount(fresh!)).toBe('1 item')
})
