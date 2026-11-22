import { z } from 'zod'
import type { ApiError, Schema } from '@/api'
import { addDays, daysBetween, formatPlainDateRange } from '@/lib/date'

export type BlockedDate = Schema<'BlockedDateResponse'>

/** BlockedDate.reason's column size on the server. */
export const REASON_MAX = 200

export type BlockedForm = {
  startDate: string
  endDate: string
  reason: string
  recurringAnnually: boolean
}

export const emptyBlockedForm: BlockedForm = {
  startDate: '',
  endDate: '',
  reason: '',
  recurringAnnually: false,
}

export const toBlockedForm = (b: BlockedDate): BlockedForm => ({
  startDate: b.startDate,
  endDate: b.endDate,
  reason: b.reason ?? '',
  recurringAnnually: b.recurringAnnually,
})

export function toBlockedRequest(form: BlockedForm): Schema<'BlockedDateRequest'> {
  const reason = form.reason.trim()
  return {
    startDate: form.startDate,
    endDate: form.endDate,
    reason: reason || undefined,
    recurringAnnually: form.recurringAnnually,
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Rules the server enforces, plus two it doesn't but the Owner would regret breaking. */
export const blockedFormSchema = (today: string) =>
  z
    .object({
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().max(REASON_MAX, `Keep the reason under ${REASON_MAX} characters`),
      recurringAnnually: z.boolean(),
    })
    .superRefine((form, ctx) => {
      const issue = (path: keyof BlockedForm, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
      const startOk = ISO_DATE.test(form.startDate)
      const endOk = ISO_DATE.test(form.endDate)
      if (!startOk) issue('startDate', 'Choose the first closed day')
      if (!endOk) issue('endDate', 'Choose the last closed day')
      if (!startOk || !endOk) return
      if (form.endDate < form.startDate) {
        issue('endDate', "The last day can't be before the first")
      } else if (
        form.recurringAnnually &&
        form.endDate.slice(0, 4) !== form.startDate.slice(0, 4)
      ) {
        // The server matches yearly closures by month and day, so Dec 24 – Jan 2 would match nothing.
        issue(
          'endDate',
          'A yearly closure must end by December 31. Add the days after New Year as a second one.',
        )
      } else if (!form.recurringAnnually && form.endDate < today) {
        issue('endDate', 'These days have already passed')
      }
    })

/** Whether the closure covers `date`, as the server decides it (BlockedDate.covers). */
export function covers(
  b: Pick<BlockedDate, 'startDate' | 'endDate' | 'recurringAnnually'>,
  date: string,
) {
  if (!b.recurringAnnually) return date >= b.startDate && date <= b.endDate
  const monthDay = date.slice(5)
  return monthDay >= b.startDate.slice(5) && monthDay <= b.endDate.slice(5)
}

/** "MM-DD" in `year`; 29 February falls back to the 28th when the year has none. */
function onYear(monthDay: string, year: number): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return monthDay === '02-29' && !leap ? `${year}-02-28` : `${year}-${monthDay}`
}

/**
 * The dates the closure next applies to, from `today` on: its own for a one-off, this year's or
 * next year's for a yearly one (this year's while it hasn't ended).
 */
export function nextOccurrence(b: BlockedDate, today: string): { start: string; end: string } {
  if (!b.recurringAnnually) return { start: b.startDate, end: b.endDate }
  const year = Number(today.slice(0, 4))
  const thisYear = {
    start: onYear(b.startDate.slice(5), year),
    end: onYear(b.endDate.slice(5), year),
  }
  return thisYear.end >= today
    ? thisYear
    : { start: onYear(b.startDate.slice(5), year + 1), end: onYear(b.endDate.slice(5), year + 1) }
}

export type ClosureLists = { upcoming: BlockedDate[]; past: BlockedDate[] }

/** Upcoming closures soonest first (yearly ones are always upcoming); past ones latest first. */
export function splitClosures(list: readonly BlockedDate[], today: string): ClosureLists {
  const upcoming = list
    .filter((b) => b.recurringAnnually || b.endDate >= today)
    .toSorted((a, b) =>
      nextOccurrence(a, today).start.localeCompare(nextOccurrence(b, today).start),
    )
  const past = list
    .filter((b) => !b.recurringAnnually && b.endDate < today)
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate))
  return { upcoming, past }
}

export const isClosedToday = (b: BlockedDate, today: string) => covers(b, today)

/** "Thu, Dec 24 – Sat, Dec 26, 2026" for a one-off; "December 25 – 26" for a yearly closure. */
export function describeDates(b: Pick<BlockedDate, 'startDate' | 'endDate' | 'recurringAnnually'>) {
  return b.recurringAnnually
    ? formatPlainDateRange(b.startDate, b.endDate, 'month-day')
    : formatPlainDateRange(b.startDate, b.endDate, 'medium-date')
}

export const closureLength = (b: Pick<BlockedDate, 'startDate' | 'endDate'>) => {
  const days = daysBetween(b.startDate, b.endDate)
  return days === 1 ? '1 day' : `${days} days`
}

/**
 * Other closures that already cover one of these days: worth knowing, not wrong (the server allows
 * overlaps). Yearly ones are checked over the range's own year.
 */
export function overlapping(
  list: readonly BlockedDate[],
  form: BlockedForm,
  exceptId: string | null,
): BlockedDate[] {
  if (!ISO_DATE.test(form.startDate) || !ISO_DATE.test(form.endDate)) return []
  if (form.endDate < form.startDate || daysBetween(form.startDate, form.endDate) > 366) return []
  const days: string[] = []
  for (let d = form.startDate; d <= form.endDate; d = addDays(d, 1)) days.push(d)
  const probe = form.recurringAnnually
    ? (b: BlockedDate) => days.some((d) => covers({ ...b, recurringAnnually: true }, d))
    : (b: BlockedDate) => days.some((d) => covers(b, d))
  return list.filter((b) => b.id !== exceptId && probe(b))
}

const SERVER_FIELDS: Record<string, keyof BlockedForm> = {
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
}

/** A server rejection as a message for one field, or null to show it on its own. */
export function blockedFieldError(
  error: ApiError,
): { field: keyof BlockedForm; message: string } | null {
  if (error.message === 'endDate cannot be before startDate') {
    return { field: 'endDate', message: "The last day can't be before the first" }
  }
  const first = error.fieldErrors.find((e) => SERVER_FIELDS[e.field])
  return first ? { field: SERVER_FIELDS[first.field]!, message: first.message } : null
}
