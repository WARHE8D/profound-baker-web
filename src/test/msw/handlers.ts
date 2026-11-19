import type { HttpHandler } from 'msw'

// Default API mocks shared by every test. Fixtures that mirror the backend arrive in S1.3 (#7).
// Override per test with server.use(...).
export const handlers: HttpHandler[] = []
