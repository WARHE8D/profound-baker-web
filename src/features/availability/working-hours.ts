import { z } from 'zod'
import type { ApiError, Schema } from '@/api'

export type WorkingHours = Schema<'WorkingHoursResponse'>
export type DayOfWeek = WorkingHours['dayOfWeek']

/** Monday first, like the server's list. */
export const WEEK: readonly DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

/** 1 January 2024 was a Monday. */
const dayName = (day: DayOfWeek, weekday: 'long' | 'short', locale?: string) =>
  new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + WEEK.indexOf(day))),
  )
export const dayLabel = (day: DayOfWeek, locale?: string) => dayName(day, 'long', locale)
export const dayShortLabel = (day: DayOfWeek, locale?: string) => dayName(day, 'short', locale)

/** WorkingHours.MIN_SLOT_DURATION_MINUTES on the server. */
export const MIN_SLOT_MINUTES = 5
/** Offered in the slot-length menu; any other length the server holds is added to it. */
export const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60, 90, 120]

/** A day as the form holds it. Closed days keep their times, so re-opening one restores them. */
export type DayForm = {
  open: boolean
  startTime: string
  endTime: string
  slotMinutes: string
  capacity: string
}
export type HoursForm = { days: Record<DayOfWeek, DayForm> }

/** What a day starts with when it has never been open. */
const NEW_DAY: Omit<DayForm, 'open'> = {
  startTime: '09:00',
  endTime: '17:00',
  slotMinutes: '30',
  capacity: '2',
}

/** "08:00" or "08:00:00" (Jackson writes seconds only when set) as "HH:mm" for <input type=time>. */
const hhmm = (time: string) => time.slice(0, 5)

export function toHoursForm(list: readonly WorkingHours[]): HoursForm {
  // A closed day suggests the first open day's settings, the likeliest wish when opening it.
  const first = list[0]
  const suggestion = first ? toDayForm(first) : NEW_DAY
  const days = Object.fromEntries(
    WEEK.map((day) => {
      const hours = list.find((h) => h.dayOfWeek === day)
      return [day, hours ? { ...toDayForm(hours), open: true } : { ...suggestion, open: false }]
    }),
  ) as Record<DayOfWeek, DayForm>
  return { days }
}

function toDayForm(hours: WorkingHours): Omit<DayForm, 'open'> {
  return {
    startTime: hhmm(hours.startTime),
    endTime: hhmm(hours.endTime),
    slotMinutes: String(hours.slotDurationMinutes),
    capacity: String(hours.maxConcurrentBookings),
  }
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Minutes after midnight, or null if not a "HH:mm" time. */
export function minutesOf(time: string): number | null {
  const match = TIME.exec(time)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : null)

export type Slot = { startTime: string; endTime: string }
export type DayPlan = {
  slots: Slot[]
  /** Minutes at the end of the day too short for a whole slot: not offered. */
  leftoverMinutes: number
  capacity: number
}

/**
 * The pickup slots a day's settings give, exactly as the server cuts them (AvailabilityService):
 * from the opening time, back to back, and only whole slots; whatever is left before closing is
 * not offered. Null while the settings can't be read.
 */
export function planDay(day: DayForm): DayPlan | null {
  const start = minutesOf(day.startTime)
  const end = minutesOf(day.endTime)
  const length = wholeNumber(day.slotMinutes)
  const capacity = wholeNumber(day.capacity)
  if (start === null || end === null || start >= end) return null
  if (length === null || length < MIN_SLOT_MINUTES || capacity === null || capacity < 1) return null
  const slots: Slot[] = []
  let cursor = start
  for (; cursor + length <= end; cursor += length) {
    slots.push({ startTime: timeOf(cursor), endTime: timeOf(cursor + length) })
  }
  return { slots, leftoverMinutes: end - cursor, capacity }
}

const dayFormSchema = z
  .object({
    open: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    slotMinutes: z.string(),
    capacity: z.string(),
  })
  .superRefine((day, ctx) => {
    if (!day.open) return
    const issue = (path: keyof DayForm, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    const start = minutesOf(day.startTime)
    const end = minutesOf(day.endTime)
    if (start === null) issue('startTime', 'Enter the opening time')
    if (end === null) issue('endTime', 'Enter the closing time')
    else if (start !== null && end <= start) issue('endTime', 'Close after you open')
    const length = wholeNumber(day.slotMinutes)
    if (length === null || length < MIN_SLOT_MINUTES) {
      issue('slotMinutes', `Slots last at least ${MIN_SLOT_MINUTES} minutes`)
    } else if (start !== null && end !== null && end > start && start + length > end) {
      issue('slotMinutes', 'No slot this long fits between opening and closing')
    }
    const capacity = wholeNumber(day.capacity)
    if (capacity === null || capacity < 1) issue('capacity', 'At least 1 order per slot')
  })

export const hoursFormSchema = z.object({
  days: z.object(
    Object.fromEntries(WEEK.map((day) => [day, dayFormSchema])) as Record<
      DayOfWeek,
      typeof dayFormSchema
    >,
  ),
})

export function toRequest(day: DayForm): Schema<'WorkingHoursRequest'> {
  return {
    startTime: day.startTime,
    endTime: day.endTime,
    slotDurationMinutes: Number(day.slotMinutes),
    maxConcurrentBookings: Number(day.capacity),
  }
}

export type DayChange =
  | { day: DayOfWeek; kind: 'set'; request: Schema<'WorkingHoursRequest'> }
  | { day: DayOfWeek; kind: 'close' }

/** What saving sends: hours for each day opened or edited, a removal for each day closed. */
export function changesBetween(loaded: HoursForm, values: HoursForm): DayChange[] {
  return WEEK.flatMap((day): DayChange[] => {
    const before = loaded.days[day]
    const after = values.days[day]
    if (!after.open) return before.open ? [{ day, kind: 'close' }] : []
    const request = toRequest(after)
    const same = before.open && JSON.stringify(toRequest(before)) === JSON.stringify(request)
    return same ? [] : [{ day, kind: 'set', request }]
  })
}

const SERVER_FIELDS: Record<string, keyof DayForm> = {
  startTime: 'startTime',
  endTime: 'endTime',
  slotDurationMinutes: 'slotMinutes',
  maxConcurrentBookings: 'capacity',
}

/** A server rejection of one day's hours, as a message for one of that day's fields. */
export function dayFieldError(error: ApiError): { field: keyof DayForm; message: string } | null {
  if (error.message === 'startTime must be before endTime') {
    return { field: 'endTime', message: 'Close after you open' }
  }
  const first = error.fieldErrors.find((e) => SERVER_FIELDS[e.field])
  return first ? { field: SERVER_FIELDS[first.field]!, message: first.message } : null
}
