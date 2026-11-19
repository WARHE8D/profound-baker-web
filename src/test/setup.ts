// Runs before every test file (vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cartStore } from '@/features/cart/cart-store'
import { mockStore } from './msw/handlers'
import { server } from './msw/server'

// Any request without a handler fails the test, so tests never hit a real API by accident.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  // Drop handlers added with server.use() in a single test, and orders placed through the mocks.
  server.resetHandlers()
  mockStore.reset()
  cartStore.clear()
  localStorage.clear()
  sessionStorage.clear()
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

// jsdom has no scrolling; React Router's <ScrollRestoration> calls window.scrollTo on navigation.
window.scrollTo = () => {}
