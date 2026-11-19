import { expect, test } from 'vitest'
import { isUuid } from './uuid'

test('accepts UUIDs in either case and rejects anything else', () => {
  expect(isUuid('20000000-0000-4000-8000-000000000001')).toBe(true)
  expect(isUuid('ABCDEF00-0000-4000-8000-00000000000A')).toBe(true)
  expect(isUuid('20000000-0000-4000-8000-00000000000')).toBe(false)
  expect(isUuid('not-a-uuid')).toBe(false)
  expect(isUuid('')).toBe(false)
  expect(isUuid(null)).toBe(false)
  expect(isUuid(undefined)).toBe(false)
})
