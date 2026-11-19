import { createHandlers } from '@/mocks/handlers'
import { createMockStore } from '@/mocks/store'

/**
 * The store behind the default handlers. Reset after every test (setup.ts), so orders placed in one
 * test never leak into another.
 */
export const mockStore = createMockStore()

// Default API mocks shared by every test: the same handlers as `npm run dev:mock`.
// Override per test with server.use(...).
export const handlers = createHandlers(mockStore)
