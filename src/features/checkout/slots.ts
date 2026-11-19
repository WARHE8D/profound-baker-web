import type { Schema } from '@/api'
import { addDays } from '@/lib/date'
import { todayIn } from '@/lib/time'

export type TimeSlot = Schema<'TimeSlotResponse'>
export type DayAvailability = Schema<'DayAvailabilityResponse'>

/** The backend refuses availability ranges longer than this. */
export const MAX_AVAILABILITY_DAYS = 62

const HOUR_MS = 3_600_000

/** A slot the guest may see: it starts late enough for the cart's lead time. */
export type PickupSlot = TimeSlot & {
  /** Has room left: the guest can pick it. */
  available: boolean
}

export type PickupDay = {
  /** "YYYY-MM-DD" in the bakery's zone. */
  date: string
  /** Closed all day (Sunday, a holiday): the reason from the server, e.g. "Christmas". */
  closedReason: string | null
  /** Slots late enough for the lead time; earlier ones are left out entirely. */
  slots: PickupSlot[]
  /** How many of those slots still have room. */
  availableCount: number
}

/**
 * The earliest instant a pickup can start: the cart's longest lead time from now. Checkout
 * refuses anything sooner, and anything not strictly in the future.
 */
export function earliestPickupMs(nowMs: number, leadTimeHours: number): number {
  return nowMs + Math.max(0, leadTimeHours) * HOUR_MS
}

/**
 * The days to ask the server about: from the bakery's date at the earliest pickup, for
 * {@link MAX_AVAILABILITY_DAYS} days (one request). Days before it can't be booked, so they are
 * never shown.
 */
export function bookingWindow(earliestMs: number, zone: string): { from: string; to: string } {
  const from = todayIn(zone, new Date(earliestMs))
  return { from, to: addDays(from, MAX_AVAILABILITY_DAYS - 1) }
}

/**
 * Applies the rules the server leaves to the client. `bookable` only says a slot has room; it may
 * still start in the past or within the lead time, so those slots are dropped here.
 */
export function toPickupDays(
  days: readonly DayAvailability[],
  earliestMs: number,
  nowMs: number,
): PickupDay[] {
  return days.map((day) => {
    const slots = day.open
      ? day.slots
          .filter((slot) => {
            const startsAt = Date.parse(slot.startsAt)
            return startsAt > nowMs && startsAt >= earliestMs
          })
          .map((slot) => ({ ...slot, available: slot.bookable && slot.remainingCapacity > 0 }))
      : []
    return {
      date: day.date,
      closedReason: day.open ? null : (day.reason ?? 'Closed'),
      slots,
      availableCount: slots.filter((slot) => slot.available).length,
    }
  })
}

/** Longest lead time among the cart's items: the whole order is ready when its slowest item is. */
export function longestLeadTime(leadTimes: readonly number[]): number {
  return leadTimes.reduce((max, hours) => Math.max(max, hours), 0)
}
