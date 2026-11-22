import { expect, test } from 'vitest'
import {
  addDays,
  addMonths,
  daysBetween,
  formatPlainDate,
  formatPlainDateRange,
  monthOf,
  monthWeeks,
} from './date'

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

// Intl puts thin spaces around the dash; plain ones read the same here.
const range = (...args: Parameters<typeof formatPlainDateRange>) =>
  formatPlainDateRange(...args).replace(/\s/g, ' ')

test('formatPlainDateRange shares what the two dates have in common', () => {
  expect(range('2026-12-24', '2026-12-26', 'medium-date', 'en-US')).toBe(
    'Thu, Dec 24 – Sat, Dec 26, 2026',
  )
  expect(range('2026-12-31', '2027-01-02', 'medium-date', 'en-US')).toBe(
    'Thu, Dec 31, 2026 – Sat, Jan 2, 2027',
  )
  expect(range('2026-12-25', '2026-12-26', 'month-day', 'en-US')).toBe('December 25 – 26')
  expect(range('2026-12-25', '2026-12-25', 'medium-date', 'en-US')).toBe('Fri, Dec 25, 2026')
})

test('daysBetween counts both ends, across months and DST', () => {
  expect(daysBetween('2026-12-25', '2026-12-25')).toBe(1)
  expect(daysBetween('2026-10-30', '2026-11-02')).toBe(4)
  expect(daysBetween('2027-02-27', '2027-03-01')).toBe(3)
})
