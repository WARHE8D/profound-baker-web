// Mocked dev mode (`npm run dev:mock`): the service worker answers API calls from the fixtures, so
// the SPA runs without profound-baker-server. Never imported in production builds.
import { setupWorker } from 'msw/browser'
import { createHandlers } from './handlers'
import { createMockStore } from './store'

export const worker = setupWorker(...createHandlers(createMockStore()))
