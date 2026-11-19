// Runs before every test file (vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw/server'

// Any request without a handler fails the test, so tests never hit a real API by accident.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterEach(() => {
  cleanup()
  // Drop handlers added with server.use() in a single test.
  server.resetHandlers()
})

afterAll(() => server.close())
