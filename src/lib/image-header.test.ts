import { expect, test } from 'vitest'
import { jpegBytes, pngBytes, webpBytes } from '@/test/images'
import { readImageHeader } from './image-header'

test.each([
  ['PNG', pngBytes(1200, 800), 'png', 1200, 800],
  ['JPEG with EXIF first', jpegBytes(4032, 3024), 'jpeg', 4032, 3024],
  ['lossy WebP', webpBytes(1600, 900, 'VP8 '), 'webp', 1600, 900],
  ['lossless WebP', webpBytes(1600, 901, 'VP8L'), 'webp', 1600, 901],
  ['extended WebP', webpBytes(12_000, 900, 'VP8X'), 'webp', 12_000, 900],
] as const)('reads a %s header', (_, bytes, format, width, height) => {
  expect(readImageHeader(bytes)).toEqual({ format, size: { width, height } })
})

test('the format comes from the bytes, not the name or type', () => {
  expect(readImageHeader(new TextEncoder().encode('GIF89a……'))).toBeNull()
  expect(
    readImageHeader(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  ).toBeNull()
})

test('a cut-off header is recognised but has no size', () => {
  expect(readImageHeader(pngBytes(10, 10).subarray(0, 20))).toEqual({ format: 'png', size: null })
  expect(readImageHeader(jpegBytes(10, 10).subarray(0, 12))).toEqual({ format: 'jpeg', size: null })
})
