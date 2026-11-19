import { describe, expect, test } from 'vitest'
import { slotToUtc } from '@/lib/time'
import {
  bookingWindow,
  earliestPickupMs,
  longestLeadTime,
  toPickupDays,
  type DayAvailability,
} from './slots'

const ZONE = 'America/New_York'
// Friday 20 Nov 2026, 12:00 in New York.
const NOW = Date.parse('2026-11-20T17:00:00Z')

function slot(date: string, start: string, end: string, remaining = 2) {
  return {
    startTime: start,
    endTime: end,
    startsAt: slotToUtc(date, start, ZONE),
    endsAt: slotToUtc(date, end, ZONE),
    capacity: 2,
    remainingCapacity: remaining,
    bookable: remaining > 0,
  }
}

const friday: DayAvailability = {
  date: '2026-11-20',
  open: true,
  reason: null,
  slots: [
    slot('2026-11-20', '11:30', '12:00'),
    slot('2026-11-20', '12:00', '12:30'),
    slot('2026-11-20', '12:30', '13:00', 0),
    slot('2026-11-20', '13:00', '13:30'),
  ],
}
const sunday: DayAvailability = {
  date: '2026-11-22',
  open: false,
  reason: 'Closed on Sundays',
  slots: [],
}

describe('earliestPickupMs and bookingWindow', () => {
  test('the earliest pickup is the lead time from now', () => {
    expect(earliestPickupMs(NOW, 0)).toBe(NOW)
    expect(new Date(earliestPickupMs(NOW, 48)).toISOString()).toBe('2026-11-22T17:00:00.000Z')
  })

  test('the window starts on the bakery’s date of the earliest pickup and spans 62 days', () => {
    expect(bookingWindow(NOW, ZONE)).toEqual({ from: '2026-11-20', to: '2027-01-20' })
    // 23:30 in New York is already the next day in UTC; the bakery's date counts.
    expect(bookingWindow(Date.parse('2026-11-21T04:30:00Z'), ZONE).from).toBe('2026-11-20')
    expect(bookingWindow(earliestPickupMs(NOW, 48), ZONE).from).toBe('2026-11-22')
  })
})

describe('toPickupDays', () => {
  test('drops slots that already started, and marks full ones unavailable', () => {
    const [day] = toPickupDays([friday], NOW, NOW)

    // 11:30 started half an hour ago; 12:00 starts exactly now, which checkout refuses.
    expect(day?.slots.map((s) => [s.startTime, s.available])).toEqual([
      ['12:30', false],
      ['13:00', true],
    ])
    expect(day?.availableCount).toBe(1)
    expect(day?.closedReason).toBeNull()
  })

  test('drops slots within the lead time', () => {
    const earliest = earliestPickupMs(NOW, 1) // 13:00
    const [day] = toPickupDays([friday], earliest, NOW)

    expect(day?.slots.map((s) => s.startTime)).toEqual(['13:00'])
  })

  test('a closed day keeps its reason and has no slots', () => {
    expect(toPickupDays([sunday], NOW, NOW)).toEqual([
      { date: '2026-11-22', closedReason: 'Closed on Sundays', slots: [], availableCount: 0 },
    ])
  })
})

test('longestLeadTime is the slowest item’s, or 0 for an empty cart', () => {
  expect(longestLeadTime([0, 12, 48, 24])).toBe(48)
  expect(longestLeadTime([])).toBe(0)
})
