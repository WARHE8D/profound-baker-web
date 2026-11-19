import { expect, test } from 'vitest'
import { formatLeadTime } from './lead-time'

test.each([
  [0, 'No notice needed'],
  [1, 'Order 1 hour ahead'],
  [12, 'Order 12 hours ahead'],
  [24, 'Order 1 day ahead'],
  [36, 'Order 36 hours ahead'],
  [48, 'Order 2 days ahead'],
  [168, 'Order 7 days ahead'],
])('%i hours reads "%s"', (hours, text) => {
  expect(formatLeadTime(hours)).toBe(text)
})
