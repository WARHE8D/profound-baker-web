// Runs before every test file (vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setUploadTransport } from '@/api/client'
import { fetchTransport } from '@/api/upload-transport'
import { session } from '@/features/auth/session'
import { cartStore } from '@/features/cart/cart-store'
import { mockStore } from './msw/handlers'
import { server } from './msw/server'

// Any request without a handler fails the test, so tests never hit a real API by accident.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

// MSW intercepts fetch but not jsdom's XMLHttpRequest, which uploads use in the browser.
setUploadTransport(fetchTransport)

afterEach(() => {
  cleanup()
  // Drop handlers added with server.use() in a single test, and orders placed through the mocks.
  server.resetHandlers()
  mockStore.reset()
  cartStore.clear()
  localStorage.clear()
  sessionStorage.clear()
  // After localStorage: the session re-reads it and starts signed out.
  session.resetForTests()
})

afterAll(() => server.close())

// jsdom has no <dialog> behaviour. Enough of it for our Dialog: open/close toggle the `open`
// attribute and close() fires "close". Esc is simulated in tests by dispatching "cancel".
function openDialog(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

function closeDialog(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = openDialog
  HTMLDialogElement.prototype.show = openDialog
  HTMLDialogElement.prototype.close = closeDialog
}

// jsdom has no scrolling: React Router's <ScrollRestoration> calls window.scrollTo on navigation, and
// pages scroll sections into view.
window.scrollTo = () => {}
Element.prototype.scrollIntoView ??= () => {}

// Node's fetch (undici) can't read jsdom's FormData and File: it sends the file as an empty "blob".
// Uploads in tests use Node's own classes, which have everything the app uses (name, type, size,
// arrayBuffer). Nothing here builds FormData from a <form> element, which only jsdom's could do.
const { process: node } = globalThis as unknown as {
  process: { getBuiltinModule: (id: 'node:buffer') => { File: typeof File } }
}
globalThis.File = node.getBuiltinModule('node:buffer').File
globalThis.FormData = (
  await new Response('', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).formData()
).constructor as typeof FormData

// jsdom has no object URLs (previews of files picked for upload).
let objectUrlCount = 0
URL.createObjectURL ??= () => `blob:test/${(objectUrlCount += 1)}`
URL.revokeObjectURL ??= () => {}
