// Mocked dev mode (`npm run dev:mock`): the service worker answers API calls from the fixtures, so
// the SPA runs without profound-baker-server. Never imported in production builds.
import { setupWorker } from 'msw/browser'
import { seedDemo } from './demo-orders'
import { createHandlers } from './handlers'
import { createMockStore } from './store'

const store = createMockStore()
seedDemo(store)

export const worker = setupWorker(...createHandlers(store))
