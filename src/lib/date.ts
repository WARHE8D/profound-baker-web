// Calendar-date helpers for plain "YYYY-MM-DD" strings (no time, no zone), as the API uses for
// availability days and blocked dates.

/** "2026-11-30" + 1 → "2026-12-01". Works in UTC, so daylight saving never shifts the day. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** "2026-11-30" → "2026-11". */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** "2026-11" + 2 → "2027-01". */
export function addMonths(month: string, months: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(year, m - 1 + months, 1)).toISOString().slice(0, 7)
}

/**
 * A month as calendar weeks, Sunday first: each week has 7 cells, a "YYYY-MM-DD" date or null for
 * the padding before the 1st and after the last day.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`
  const lead = toUtcDate(first).getUTCDay()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let date = first; monthOf(date) === month; date = addDays(date, 1)) cells.push(date)
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

export type PlainDateFormat = 'day' | 'weekday-date' | 'month-year' | 'weekday-short'

const plainFormats: Record<PlainDateFormat, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric' },
  'weekday-date': { weekday: 'long', day: 'numeric', month: 'long' },
  'month-year': { month: 'long', year: 'numeric' },
  'weekday-short': { weekday: 'short' },
}

/**
 * Formats a plain date as it is written, with no zone conversion ("Monday, November 23"). A
 * calendar date has no time zone, so it is shown in UTC, where the date never shifts.
 */
export function formatPlainDate(date: string, format: PlainDateFormat, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { ...plainFormats[format], timeZone: 'UTC' }).format(
    toUtcDate(date),
  )
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day))
}
