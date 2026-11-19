import { expect, test } from 'vitest'
import { addDays, addMonths, formatPlainDate, monthOf, monthWeeks } from './date'

test('addDays crosses months, years and DST changes', () => {
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  expect(addDays('2026-11-20', 61)).toBe('2027-01-20')
})

test('monthOf and addMonths', () => {
  expect(monthOf('2026-11-30')).toBe('2026-11')
  expect(addMonths('2026-11', 2)).toBe('2027-01')
  expect(addMonths('2027-01', -1)).toBe('2026-12')
})

test('monthWeeks pads to whole Sunday-first weeks', () => {
  // November 2026 starts on a Sunday and has 30 days: 5 weeks.
  const november = monthWeeks('2026-11')
  expect(november).toHaveLength(5)
  expect(november[0]).toEqual([
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07',
  ])
  expect(november[4]).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null])

  // January 2027 starts on a Friday.
  const january = monthWeeks('2027-01')
  expect(january[0]).toEqual([null, null, null, null, null, '2027-01-01', '2027-01-02'])
  expect(january.flat().filter(Boolean)).toHaveLength(31)
})

test('formatPlainDate shows the date as written, whatever the viewer’s zone', () => {
  expect(formatPlainDate('2026-11-23', 'weekday-date', 'en-US')).toBe('Monday, November 23')
  expect(formatPlainDate('2026-11-23', 'month-year', 'en-US')).toBe('November 2026')
  expect(formatPlainDate('2026-11-23', 'day', 'en-US')).toBe('23')
  expect(formatPlainDate('2026-11-23', 'weekday-short', 'en-US')).toBe('Mon')
})
