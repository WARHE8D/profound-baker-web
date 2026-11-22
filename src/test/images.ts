// Image files for tests: just the headers the client and the mock server read (no pixels).

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff]
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
const u32le = (n: number) => u32be(n).toReversed()
const text = (s: string) => [...s].map((c) => c.charCodeAt(0))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Bit depth 8, RGBA, default compression, filter and interlacing. */
const IHDR_REST = [8, 6, 0, 0, 0]

export function pngBytes(width: number, height: number): Uint8Array {
  const ihdr = [...text('IHDR'), ...u32be(width), ...u32be(height), ...IHDR_REST]
  return new Uint8Array([...PNG_SIGNATURE, ...u32be(13), ...ihdr])
}

/** Three components (Y, Cb, Cr): id, sampling factors, quantisation table. */
const SOF_COMPONENTS = [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]

/** A JPEG with an EXIF segment in front of the frame header, like a phone photo. */
export function jpegBytes(width: number, height: number): Uint8Array {
  const exif = [0xff, 0xe1, ...u16be(10), ...text('Exif'), 0, 0, 0, 0]
  const sof = [0xff, 0xc2, ...u16be(17), 8, ...u16be(height), ...u16be(width), ...SOF_COMPONENTS]
  return new Uint8Array([0xff, 0xd8, ...exif, ...sof, 0xff, 0xda])
}

/** The first chunk of a lossy (VP8), lossless (VP8L) or extended (VP8X) WebP. */
function webpChunk(kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number) {
  if (kind === 'VP8 ') return [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)]
  if (kind === 'VP8X') return [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]
  const [w, h] = [width - 1, height - 1]
  return [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f]
}

export function webpBytes(width: number, height: number, kind: 'VP8 ' | 'VP8L' | 'VP8X' = 'VP8 ') {
  const chunk = webpChunk(kind, width, height)
  const body = [
    ...text(kind),
    ...u32le(chunk.length),
    ...chunk,
    ...Array.from({ length: 8 }, () => 0),
  ]
  return new Uint8Array([...text('RIFF'), ...u32le(body.length + 4), ...text('WEBP'), ...body])
}

export const imageFile = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as BlobPart], name, { type })
