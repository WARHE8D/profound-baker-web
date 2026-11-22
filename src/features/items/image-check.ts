import { readImageHeader } from '@/lib/image-header'

/** The server's limits (spring.servlet.multipart and its ImageProcessor). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_SIDE = 10_000
export const MAX_IMAGE_PIXELS = 50_000_000

/** What the file picker offers; the bytes decide in the end, as on the server. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'

const number = new Intl.NumberFormat()
const megabytes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

/** Rounded up, so a file just over the limit never shows as exactly the limit. */
export const formatFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${number.format(Math.max(1, Math.ceil(bytes / 1024)))} KB`
    : `${megabytes.format(Math.ceil((bytes / 1024 / 1024) * 10) / 10)} MB`

/**
 * Checks a picked file against the server's rules before uploading it, so the Owner doesn't wait
 * for a 10 MB upload just to hear it was a HEIC. Returns what's wrong, or null if it can go.
 * Only the header is read for the size in pixels: nothing is decoded.
 */
export async function checkImageFile(file: File): Promise<string | null> {
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_IMAGE_BYTES) {
    return `It's ${formatFileSize(file.size)}; photos can be at most ${formatFileSize(MAX_IMAGE_BYTES)}.`
  }
  const header = readImageHeader(new Uint8Array(await file.arrayBuffer()))
  if (!header) return 'Only JPEG, PNG and WebP photos can be added.'
  if (!header.size) return "This photo couldn't be read. It may be damaged; try exporting it again."
  const { width, height } = header.size
  const dimensions = `${number.format(width)} × ${number.format(height)} px`
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    return `It's ${dimensions}; photos can be at most ${number.format(MAX_IMAGE_SIDE)} px on each side. Scale it down and try again.`
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    return `It's ${dimensions}; photos can be at most ${number.format(MAX_IMAGE_PIXELS / 1e6)} megapixels. Scale it down and try again.`
  }
  return null
}
