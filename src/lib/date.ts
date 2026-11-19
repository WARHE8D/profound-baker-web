// Calendar-date helpers for plain "YYYY-MM-DD" strings (no time, no zone), as the API uses for
// availability days and blocked dates.

/** "2026-11-30" + 1 → "2026-12-01". Works in UTC, so daylight saving never shifts the day. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
