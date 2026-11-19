import { expect, test } from 'vitest'
import { normalizeBaseUrl } from './config'
import { apiUrl, joinUrl } from './url'

test.each([
  [undefined, ''],
  ['', ''],
  ['  http://localhost:8080  ', 'http://localhost:8080'],
  ['https://api.example.com/', 'https://api.example.com'],
  ['https://api.example.com///', 'https://api.example.com'],
])('normalizeBaseUrl(%j) → %j', (input, expected) => {
  expect(normalizeBaseUrl(input)).toBe(expected)
})

test('joinUrl adds exactly one slash between base and path', () => {
  expect(joinUrl('https://api.example.com', '/uploads/a.jpg')).toBe(
    'https://api.example.com/uploads/a.jpg',
  )
  expect(joinUrl('https://api.example.com', 'uploads/a.jpg')).toBe(
    'https://api.example.com/uploads/a.jpg',
  )
})

test('joinUrl with an empty base keeps the path same-origin', () => {
  expect(joinUrl('', '/uploads/a.jpg')).toBe('/uploads/a.jpg')
})

test.each([
  'https://cdn.example.com/a.jpg',
  'http://localhost/a.jpg',
  '//cdn.example.com/a.jpg',
  'data:image/png;base64,AAAA',
  'blob:http://localhost/1234',
])('joinUrl leaves the absolute URL %s untouched', (url) => {
  expect(joinUrl('https://api.example.com', url)).toBe(url)
})

test('apiUrl makes uploads absolute against VITE_API_BASE_URL', () => {
  expect(apiUrl('/uploads/items/abc.jpg')).toBe('http://localhost:8080/uploads/items/abc.jpg')
})

test('apiUrl keeps missing images missing', () => {
  expect(apiUrl(null)).toBeUndefined()
  expect(apiUrl(undefined)).toBeUndefined()
  expect(apiUrl('')).toBeUndefined()
})
