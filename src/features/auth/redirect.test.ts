import { expect, test } from 'vitest'
import { loginPath, safeNext } from './redirect'

test.each([
  ['/owner/orders', '/owner/orders'],
  ['/owner/orders?status=PENDING#top', '/owner/orders?status=PENDING#top'],
  ['/owner', '/owner'],
  [null, '/owner'],
  ['', '/owner'],
  ['/', '/owner'],
  ['/checkout', '/owner'],
  ['/ownerx', '/owner'],
  ['/owner/login', '/owner'],
  ['https://evil.example/owner', '/owner'],
  ['//evil.example/owner', '/owner'],
  ['/\\evil.example', '/owner'],
  ['javascript:alert(1)', '/owner'],
])('safeNext(%j) is %j', (next, expected) => {
  expect(safeNext(next)).toBe(expected)
})

test('loginPath carries the page to come back to, except the dashboard home', () => {
  expect(loginPath('/owner/items?page=2')).toBe('/owner/login?next=%2Fowner%2Fitems%3Fpage%3D2')
  expect(loginPath('/owner')).toBe('/owner/login')
  expect(loginPath(null)).toBe('/owner/login')
})
