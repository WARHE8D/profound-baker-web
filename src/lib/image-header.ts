/**
 * What an image file really is, read from its first bytes the way the server does (it ignores the
 * file name and Content-Type), plus its size in pixels from the header alone. Nothing is decoded,
 * so a small file claiming to be 50 000 px wide costs nothing to check.
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

export type ImageHeader = {
  format: ImageFormat
  /** null when the header is cut short or malformed: the server can't read it either. */
  size: { width: number; height: number } | null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const ascii = (bytes: Uint8Array, offset: number, length = 4) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))
const uint16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const uint16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8)
const uint24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
const uint32be = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset).getUint32(i)

/** The format, from the magic bytes; null for anything that isn't a PNG, JPEG or WebP. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 12 && ascii(bytes, 0) === 'RIFF' && ascii(bytes, 8) === 'WEBP') return 'webp'
  return null
}

export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  const format = detectImageFormat(bytes)
  if (!format) return null
  const size =
    format === 'png' ? pngSize(bytes) : format === 'jpeg' ? jpegSize(bytes) : webpSize(bytes)
  return { format, size: size && size.width > 0 && size.height > 0 ? size : null }
}

/** The IHDR chunk always comes first, right after the signature. */
function pngSize(b: Uint8Array) {
  if (b.length < 24 || ascii(b, 12) !== 'IHDR') return null
  return { width: uint32be(b, 16), height: uint32be(b, 20) }
}

/** Walks the marker segments up to the frame header (SOFn); EXIF and other APPn come before it. */
function jpegSize(b: Uint8Array) {
  let i = 2
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]!
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    // Standalone markers (TEM, RSTn) carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    // Start of scan, or end of image: the pixels began without a frame header.
    if (marker === 0xda || marker === 0xd9) return null
    const length = uint16be(b, i + 2)
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null
      return { height: uint16be(b, i + 5), width: uint16be(b, i + 7) }
    }
    if (length < 2) return null
    i += 2 + length
  }
  return null
}

/** The first chunk says which kind of WebP it is; each keeps its size in its own way. */
function webpSize(b: Uint8Array) {
  if (b.length < 30) return null
  switch (ascii(b, 12)) {
    case 'VP8 ': // lossy: 14-bit sizes after the frame tag and start code
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
      return { width: uint16le(b, 26) & 0x3fff, height: uint16le(b, 28) & 0x3fff }
    case 'VP8L': // lossless: two 14-bit fields, minus one, after the 0x2f signature
      if (b[20] !== 0x2f) return null
      return {
        width: 1 + (((b[22]! & 0x3f) << 8) | b[21]!),
        height: 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)),
      }
    case 'VP8X': // extended (alpha, animation, EXIF): 24-bit canvas size, minus one
      return { width: 1 + uint24le(b, 24), height: 1 + uint24le(b, 27) }
    default:
      return null
  }
}
