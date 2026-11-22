import { expect, test } from 'vitest'
import {
  blockedFormSchema,
  nextOccurrence,
  overlapping,
  splitClosures,
  toBlockedRequest,
  type BlockedDate,
  type BlockedForm,
} from './blocked-dates'

const TODAY = '2026-11-20'

const closure = (id: string, changes: Partial<BlockedDate>): BlockedDate => ({
  id,
  startDate: '2026-12-01',
  endDate: '2026-12-01',
  reason: null,
  recurringAnnually: false,
  ...changes,
})

const christmas = closure('christmas', {
  startDate: '2025-12-25',
  endDate: '2025-12-26',
  reason: 'Christmas',
  recurringAnnually: true,
})
const holiday = closure('holiday', { startDate: '2027-01-11', endDate: '2027-01-15' })
const lastSummer = closure('summer', { startDate: '2026-08-01', endDate: '2026-08-14' })
const newYear = closure('new-year', {
  startDate: '2026-01-01',
  endDate: '2026-01-01',
  recurringAnnually: true,
})

const form = (changes: Partial<BlockedForm>): BlockedForm => ({
  startDate: '2026-12-24',
  endDate: '2026-12-24',
  reason: '',
  recurringAnnually: false,
  ...changes,
})
const errors = (values: BlockedForm) =>
  blockedFormSchema(TODAY)
    .safeParse(values)
    .error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`)

test('the dates must be a range, today or later', () => {
  expect(errors(form({}))).toBeUndefined()
  expect(errors(form({ startDate: '', endDate: '' }))).toEqual([
    'startDate: Choose the first closed day',
    'endDate: Choose the last closed day',
  ])
  expect(errors(form({ endDate: '2026-12-23' }))).toEqual([
    "endDate: The last day can't be before the first",
  ])
  expect(errors(form({ startDate: '2026-11-01', endDate: '2026-11-19' }))).toEqual([
    'endDate: These days have already passed',
  ])
  expect(errors(form({ reason: 'x'.repeat(201) }))).toEqual([
    'reason: Keep the reason under 200 characters',
  ])
})

test('a yearly closure can’t run past December 31, which the server would never match', () => {
  expect(errors(form({ recurringAnnually: true, endDate: '2027-01-02' }))).toEqual([
    'endDate: A yearly closure must end by December 31. Add the days after New Year as a second one.',
  ])
  // A yearly closure may start in the past: it comes round again.
  expect(
    errors(form({ recurringAnnually: true, startDate: '2025-07-01', endDate: '2025-07-01' })),
  ).toBeUndefined()
})

test('a yearly closure next falls this year, or next year once it has passed', () => {
  expect(nextOccurrence(christmas, TODAY)).toEqual({ start: '2026-12-25', end: '2026-12-26' })
  expect(nextOccurrence(christmas, '2026-12-26')).toEqual({
    start: '2026-12-25',
    end: '2026-12-26',
  })
  expect(nextOccurrence(christmas, '2026-12-27')).toEqual({
    start: '2027-12-25',
    end: '2027-12-26',
  })
  const leapDay = closure('leap', {
    startDate: '2024-02-29',
    endDate: '2024-02-29',
    recurringAnnually: true,
  })
  expect(nextOccurrence(leapDay, '2027-01-10')).toEqual({ start: '2027-02-28', end: '2027-02-28' })
  expect(nextOccurrence(holiday, TODAY)).toEqual({ start: '2027-01-11', end: '2027-01-15' })
})

test('upcoming closures come soonest first; past one-offs are kept apart', () => {
  const { upcoming, past } = splitClosures([holiday, lastSummer, newYear, christmas], TODAY)
  expect(upcoming.map((b) => b.id)).toEqual(['christmas', 'new-year', 'holiday'])
  expect(past.map((b) => b.id)).toEqual(['summer'])
})

test('overlaps with other closures are found, yearly ones included', () => {
  const list = [christmas, holiday, lastSummer]
  expect(overlapping(list, form({ startDate: '2026-12-26', endDate: '2026-12-27' }), null)).toEqual(
    [christmas],
  )
  expect(overlapping(list, form({ startDate: '2027-01-15', endDate: '2027-01-20' }), null)).toEqual(
    [holiday],
  )
  // Editing a closure doesn't overlap itself.
  expect(
    overlapping(list, form({ startDate: '2027-01-11', endDate: '2027-01-15' }), 'holiday'),
  ).toEqual([])
})

test('the reason is trimmed, and left out when empty', () => {
  expect(toBlockedRequest(form({ reason: '  Inventory day ' })).reason).toBe('Inventory day')
  expect(toBlockedRequest(form({ reason: '   ' }))).not.toHaveProperty('reason', '')
  expect(toBlockedRequest(form({ reason: '   ' })).reason).toBeUndefined()
})
