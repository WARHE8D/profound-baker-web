import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { setUploadTransport } from '@/api/client'
import { fetchTransport, type UploadTransport } from '@/api/upload-transport'
import { ids } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { imageFile, jpegBytes, pngBytes, webpBytes } from '@/test/images'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

const UPLOAD_URL = `http://localhost:8080/api/catalogue/items/${ids.items.baguette}/images/upload`

beforeAll(async () => {
  await import('@/features/items/ItemEditorPage')
})

afterEach(() => setUploadTransport(fetchTransport))

async function openBaguette() {
  await signInAsOwner()
  const result = renderRoute(`/owner/items/${ids.items.baguette}`)
  await screen.findByRole('heading', { name: 'Photos' })
  return result
}

const picker = () => screen.getByLabelText('Add photos')
const photos = () => within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('img')
const uploads = () => screen.queryByRole('list', { name: 'Uploads' })
const storedPhotos = () => mockStore.findItem(ids.items.baguette)!.imageUrls

/** A transport that reports `fraction` sent, then holds the response until `release()`. */
function heldTransport(fraction: number) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const transport: UploadTransport = async (request, onProgress) => {
    onProgress({ loaded: fraction * 100, total: 100 })
    await new Promise<void>((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
      void held.then(resolve)
    })
    return fetchTransport(request, () => {})
  }
  return { transport, release: () => release() }
}

test('adds several photos in the order picked, after the existing cover', async () => {
  await openBaguette()
  expect(photos()).toHaveLength(1)
  expect(screen.getByText('Cover')).toBeInTheDocument()

  await userEvent.upload(picker(), [
    imageFile(jpegBytes(4032, 3024), 'crust.jpg', 'image/jpeg'),
    imageFile(webpBytes(1600, 900), 'crumb.webp', 'image/webp'),
  ])

  expect(await screen.findByText('2 photos added')).toBeInTheDocument()
  await waitFor(() => expect(photos()).toHaveLength(3))
  expect(uploads()).not.toBeInTheDocument()
  expect(storedPhotos()).toHaveLength(3)
  expect(storedPhotos()[1]).toMatch(/\.jpg$/)
  expect(storedPhotos()[2]).toMatch(/\.jpg$/) // WebP is stored as JPEG, like the server does
})

test('checks each file before uploading and only sends the good ones', async () => {
  await openBaguette()
  // As if dropped: the picker's accept filter doesn't apply.
  const user = userEvent.setup({ applyAccept: false })

  await user.upload(picker(), [
    imageFile(new TextEncoder().encode('GIF89a'), 'animated.gif', 'image/gif'),
    imageFile(pngBytes(12_000, 800), 'scan.png', 'image/png'),
    imageFile(pngBytes(9000, 6000), 'panorama.png', 'image/png'),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }),
    imageFile(pngBytes(800, 800), 'good.png', 'image/png'),
  ])

  const list = await screen.findByRole('list', { name: 'Uploads' })
  await waitFor(() => expect(within(list).getAllByRole('alert')).toHaveLength(4))
  const problems = within(list)
    .getAllByRole('alert')
    .map((alert) => alert.textContent)
  expect(problems).toEqual([
    'Only JPEG, PNG and WebP photos can be added.',
    expect.stringMatching(/12,000 × 800 px; photos can be at most 10,000 px on each side/),
    expect.stringMatching(/9,000 × 6,000 px; photos can be at most 50 megapixels/),
    expect.stringMatching(/It's 10.1 MB; photos can be at most 10 MB/),
  ])
  expect(await screen.findByText('Photo added')).toBeInTheDocument()
  expect(storedPhotos()).toHaveLength(2)

  // Problems stay listed until dismissed.
  await user.click(within(list).getByRole('button', { name: 'Dismiss animated.gif' }))
  expect(within(list).getAllByRole('alert')).toHaveLength(3)
})

test('a failed upload explains why and can be retried', async () => {
  await openBaguette()
  server.use(http.post(UPLOAD_URL, () => HttpResponse.json({}, { status: 500 }), { once: true }))

  await userEvent.upload(picker(), imageFile(pngBytes(800, 800), 'loaf.png', 'image/png'))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The server had a problem. Please try again in a moment.',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Photo added')).toBeInTheDocument()
  expect(uploads()).not.toBeInTheDocument()
  expect(storedPhotos()).toHaveLength(2)
})

test('shows upload progress, and cancelling stops the upload', async () => {
  const held = heldTransport(0.4)
  setUploadTransport(held.transport)
  await openBaguette()

  await userEvent.upload(picker(), imageFile(pngBytes(800, 800), 'loaf.png', 'image/png'))

  const progress = await screen.findByRole('progressbar', { name: 'Uploading loaf.png' })
  expect(progress).toHaveAttribute('value', '0.4')
  expect(screen.getByText('Uploading… 40%')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Cancel loaf.png' }))
  held.release()

  expect(uploads()).not.toBeInTheDocument()
  expect(storedPhotos()).toHaveLength(1)
})

test('asks before leaving while photos are still uploading', async () => {
  const held = heldTransport(1)
  setUploadTransport(held.transport)
  const { router } = await openBaguette()

  await userEvent.upload(picker(), imageFile(pngBytes(800, 800), 'loaf.png', 'image/png'))
  expect(await screen.findByText('Processing…')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'All items' }))

  const dialog = await screen.findByRole('dialog', { name: 'Leave before the photos finish?' })
  expect(dialog).toHaveTextContent("Photos that haven't finished uploading won't be added.")
  await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
  expect(router.state.location.pathname).toBe(`/owner/items/${ids.items.baguette}`)

  held.release()
  expect(await screen.findByText('Photo added')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'All items' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/items'))
})

test('removes a photo after asking', async () => {
  await openBaguette()

  await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Remove this photo?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

  expect(await screen.findByText('Photo removed')).toBeInTheDocument()
  expect(screen.getByText(/No photos yet/)).toBeInTheDocument()
  expect(storedPhotos()).toEqual([])
})

test('a new item gets its photos once it exists', async () => {
  await signInAsOwner()
  renderRoute('/owner/items/new')

  expect(await screen.findByText(/Add the item first/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Add photos')).not.toBeInTheDocument()
})
