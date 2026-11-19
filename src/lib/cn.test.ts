import { expect, test } from 'vitest'
import { cn } from './cn'

test('joins conditional class names', () => {
  const selected = false as boolean
  expect(cn('a', selected && 'b', undefined, ['c', { d: true, e: false }])).toBe('a c d')
})

test('later Tailwind classes win over conflicting earlier ones', () => {
  expect(cn('px-4 py-2', 'px-2')).toBe('py-2 px-2')
})

test('theme colours and font sizes do not cancel each other out', () => {
  // text-muted is a colour token, text-sm a font size: both must survive.
  expect(cn('text-sm text-muted')).toBe('text-sm text-muted')
  expect(cn('text-muted', 'text-danger')).toBe('text-danger')
})
