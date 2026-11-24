/**
 * Axis ticks for amounts from 0 to `max`: a "nice" step (1, 2 or 5 × a power of ten) giving at most
 * `count` intervals, and the top tick at or above `max`. With nothing to show, one empty interval.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!
  const top = Math.ceil(max / step) * step
  return Array.from(
    { length: Math.round(top / step) + 1 },
    (_, i) => Math.round(i * step * 100) / 100,
  )
}

/** "2026-11" → "Nov"; with `long`, "November 2026". Calendar months, no time zone involved. */
export function formatMonth(month: string, { long = false } = {}): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return new Intl.DateTimeFormat(undefined, {
    month: long ? 'long' : 'short',
    ...(long && { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, m - 1, 1)))
}

/** The change from one month to the next, as "+12%" / "−8%"; null when there's nothing to compare. */
export function monthOverMonth(current: number, previous: number): string | null {
  if (previous <= 0) return null
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return 'same as'
  return `${change > 0 ? '+' : '−'}${Math.abs(change)}%`
}
