// Time-zone helpers built on Intl only (no date library).
//
// The backend speaks two kinds of time:
//   - instants: `pickupAt`, `createdAt`, … ISO strings in UTC ("2026-11-21T10:00:00Z")
//   - local times in the Owner's time zone: availability `date` ("2026-11-21") and slot `startTime`
//     ("10:00" or "10:00:00")
// The zone comes from GET /api/public/bakery (`timeZone`). Show instants with
// formatLocal(instant, zone). For checkout, send the chosen slot's own `startsAt` as `pickupAt`:
// the server computed it. slotToUtc(date, time, zone) is the same conversion done client-side, for
// local times that come without an instant.

const MINUTE = 60_000
const HALF_DAY = 12 * 60 * MINUTE

type LocalFields = { year: number; month: number; day: number; hour: number; minute: number }

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

/**
 * The UTC instant of a local date and time in `zone`, as an ISO string ("…Z") ready to send as
 * `pickupAt`. Daylight-saving edge cases follow the backend (Java's LocalDateTime.atZone), so the
 * instant matches the slot the server offered:
 *   - a time skipped by spring-forward moves later by the gap (02:30 → 03:30)
 *   - a time repeated by fall-back is the earlier of the two
 */
export function slotToUtc(date: string, time: string, zone: string): string {
  const d = DATE.exec(date)
  const t = TIME.exec(time)
  if (!d || !t) throw new RangeError(`Invalid local date/time: ${date} ${time}`)
  const fields: LocalFields = {
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
  }
  const seconds = Number(t[3] ?? 0)
  const daysInMonth = new Date(Date.UTC(fields.year, fields.month, 0)).getUTCDate()
  if (
    fields.month < 1 ||
    fields.month > 12 ||
    fields.day < 1 ||
    fields.day > daysInMonth ||
    fields.hour > 23 ||
    fields.minute > 59 ||
    seconds > 59
  ) {
    throw new RangeError(`Invalid local date/time: ${date} ${time}`)
  }
  // The local wall-clock reading, as if it were UTC.
  const wall = Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    seconds,
  )

  // At most one offset change happens within ±12 h: the offsets on either side are the candidates.
  const before = offsetMs(wall - HALF_DAY, zone)
  const after = offsetMs(wall + HALF_DAY, zone)
  const candidates = [wall - before, wall - after].filter(
    (instant) => instant + offsetMs(instant, zone) === wall,
  )
  // Both valid: the repeated hour; take the earlier. None valid: the skipped hour; Java keeps the
  // offset from before the change, which lands later on the wall clock by the gap.
  const instant = candidates.length > 0 ? Math.min(...candidates) : wall - before
  return new Date(instant).toISOString().replace('.000Z', 'Z')
}

export type LocalFormat = 'date' | 'time' | 'datetime' | 'weekday-date'

const formatOptions: Record<LocalFormat, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  time: { timeStyle: 'short' },
  datetime: { dateStyle: 'medium', timeStyle: 'short' },
  'weekday-date': { weekday: 'long', day: 'numeric', month: 'long' },
}

/** Shows an instant as the Owner's local time, e.g. "21 Nov 2026, 10:00". */
export function formatLocal(
  instant: string | Date,
  zone: string,
  format: LocalFormat = 'datetime',
  locale?: string,
): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(instant)}`)
  return new Intl.DateTimeFormat(locale, { ...formatOptions[format], timeZone: zone }).format(date)
}

/** A slot's local "HH:mm[:ss]" for display, e.g. "10:00 AM" / "10:00" depending on the locale. */
export function formatSlotTime(time: string, locale?: string): string {
  const t = TIME.exec(time)
  if (!t) throw new RangeError(`Invalid local time: ${time}`)
  // Any fixed date works: the time is shown as-is, in UTC, with no zone conversion.
  const date = new Date(Date.UTC(2000, 0, 1, Number(t[1]), Number(t[2])))
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(date)
}

/** Today's date ("YYYY-MM-DD") in `zone`: the bakery's today, not the viewer's. */
export function todayIn(zone: string, now: Date = new Date()): string {
  const { year, month, day } = localFields(now.getTime(), zone)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Whether `zone` is an IANA time-zone name this browser knows. */
export function isValidTimeZone(zone: string): boolean {
  try {
    // Throws a RangeError for an unknown zone.
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== ''
  } catch {
    return false
  }
}

/** The zone's UTC offset at `instant`, in milliseconds (positive east of UTC). */
function offsetMs(instant: number, zone: string): number {
  const f = localFields(instant, zone)
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute)
  return asUtc - Math.floor(instant / MINUTE) * MINUTE
}

const fieldFormatters = new Map<string, Intl.DateTimeFormat>()

function localFields(instant: number, zone: string): LocalFields {
  let formatter = fieldFormatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    fieldFormatters.set(zone, formatter)
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
