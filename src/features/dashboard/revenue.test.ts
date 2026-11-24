import { describe, expect, test } from 'vitest'
import { formatMonth, monthOverMonth, niceTicks } from './revenue'

describe('niceTicks', () => {
  test('steps of 1, 2 or 5 × a power of ten, topping out at or above the maximum', () => {
    expect(niceTicks(173.5)).toEqual([0, 50, 100, 150, 200])
    expect(niceTicks(1000)).toEqual([0, 500, 1000])
    expect(niceTicks(9)).toEqual([0, 5, 10])
    expect(niceTicks(0.6)).toEqual([0, 0.2, 0.4, 0.6])
  })

  test('nothing to show still gives an axis', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

test('formatMonth names a calendar month, whatever the viewer’s time zone', () => {
  expect(formatMonth('2026-01')).toBe('Jan')
  expect(formatMonth('2026-11', { long: true })).toBe('November 2026')
})

test('monthOverMonth compares with the month before, when there was one', () => {
  expect(monthOverMonth(120, 100)).toBe('+20%')
  expect(monthOverMonth(80, 100)).toBe('−20%')
  expect(monthOverMonth(100, 100)).toBe('same as')
  expect(monthOverMonth(50, 0)).toBeNull()
})
