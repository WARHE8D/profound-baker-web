import { expect, test } from 'vitest'
import { workingHours } from '@/mocks/fixtures'
import {
  changesBetween,
  hoursFormSchema,
  planDay,
  toHoursForm,
  type DayForm,
  type HoursForm,
} from './working-hours'

const day = (changes: Partial<DayForm> = {}): DayForm => ({
  open: true,
  startTime: '08:00',
  endTime: '16:00',
  slotMinutes: '30',
  capacity: '2',
  ...changes,
})

test('slots are cut from opening time, back to back, like the server does', () => {
  const plan = planDay(day({ startTime: '09:00', endTime: '10:30', slotMinutes: '45' }))
  expect(plan).toEqual({
    slots: [
      { startTime: '09:00', endTime: '09:45' },
      { startTime: '09:45', endTime: '10:30' },
    ],
    leftoverMinutes: 0,
    capacity: 2,
  })
})

test('time before closing too short for a whole slot is not offered', () => {
  const plan = planDay(day({ startTime: '09:00', endTime: '10:20', slotMinutes: '30' }))
  expect(plan?.slots.map((s) => s.startTime)).toEqual(['09:00', '09:30'])
  expect(plan?.leftoverMinutes).toBe(20)
})

test('a slot can end exactly at 23:59 closing but never runs past it', () => {
  const plan = planDay(day({ startTime: '23:00', endTime: '23:59', slotMinutes: '30' }))
  expect(plan?.slots).toEqual([{ startTime: '23:00', endTime: '23:30' }])
  expect(plan?.leftoverMinutes).toBe(29)
})

test('unreadable settings give no plan', () => {
  expect(planDay(day({ endTime: '' }))).toBeNull()
  expect(planDay(day({ endTime: '07:00' }))).toBeNull()
  expect(planDay(day({ slotMinutes: '4' }))).toBeNull()
  expect(planDay(day({ capacity: '0' }))).toBeNull()
})

const errors = (form: HoursForm) =>
  hoursFormSchema
    .safeParse(form)
    .error?.issues.map((i) => `${i.path.slice(1).join('.')}: ${i.message}`)

const week = toHoursForm(workingHours)
const withDay = (name: keyof HoursForm['days'], changes: Partial<DayForm>): HoursForm => ({
  days: { ...week.days, [name]: { ...week.days[name], ...changes } },
})

test('the fixture week loads Monday first, with Sunday closed', () => {
  expect(week.days.MONDAY).toEqual(day())
  expect(week.days.SATURDAY).toMatchObject({ open: true, startTime: '09:00', endTime: '13:00' })
  // A closed day suggests the first open day's settings for when it opens.
  expect(week.days.SUNDAY).toEqual(day({ open: false }))
})

test('times the server sends with seconds are shown without them', () => {
  const form = toHoursForm([{ ...workingHours[0]!, startTime: '08:00:00', endTime: '16:00:00' }])
  expect(form.days.MONDAY).toMatchObject({ startTime: '08:00', endTime: '16:00' })
})

test('validation follows the server’s rules, for open days only', () => {
  expect(errors(week)).toBeUndefined()
  expect(errors(withDay('MONDAY', { startTime: '', endTime: '16:00' }))).toEqual([
    'MONDAY.startTime: Enter the opening time',
  ])
  expect(errors(withDay('MONDAY', { startTime: '16:00', endTime: '09:00' }))).toEqual([
    'MONDAY.endTime: Close after you open',
  ])
  expect(errors(withDay('MONDAY', { startTime: '09:00', endTime: '09:20' }))).toEqual([
    'MONDAY.slotMinutes: No slot this long fits between opening and closing',
  ])
  expect(errors(withDay('MONDAY', { capacity: '1.5' }))).toEqual([
    'MONDAY.capacity: At least 1 order per slot',
  ])
  expect(errors(withDay('SUNDAY', { capacity: '' }))).toBeUndefined()
})

test('saving sends only the days that changed', () => {
  const edited: HoursForm = {
    days: {
      ...week.days,
      MONDAY: day({ endTime: '17:00' }),
      SATURDAY: { ...week.days.SATURDAY, open: false },
      SUNDAY: day({ startTime: '10:00', endTime: '12:00' }),
      // Closed and still closed: its hidden settings don't count.
      TUESDAY: week.days.TUESDAY,
    },
  }

  expect(changesBetween(week, edited)).toEqual([
    {
      day: 'MONDAY',
      kind: 'set',
      request: {
        startTime: '08:00',
        endTime: '17:00',
        slotDurationMinutes: 30,
        maxConcurrentBookings: 2,
      },
    },
    { day: 'SATURDAY', kind: 'close' },
    {
      day: 'SUNDAY',
      kind: 'set',
      request: {
        startTime: '10:00',
        endTime: '12:00',
        slotDurationMinutes: 30,
        maxConcurrentBookings: 2,
      },
    },
  ])
  expect(changesBetween(week, withDay('SUNDAY', { startTime: '06:00' }))).toEqual([])
})
