/**
 * Where the end-to-end tests find the app and the backend. Defaults match the server's e2e stack
 * (docker-compose.e2e.yml and .env.e2e in profound-baker-server, started by `npm run e2e:stack`).
 */

export const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:4173'
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080'

/**
 * The Owner the tests sign in as (APP_OWNER_* in the server's .env.e2e): created on an empty database,
 * or the real Owner's login switched to it on a copy of production.
 */
export const OWNER = {
  email: process.env.E2E_OWNER_EMAIL ?? 'owner@e2e.test',
  password: process.env.E2E_OWNER_PASSWORD ?? 'e2e-owner-password',
}

/** The bakery's time zone, set by the seed: slots and pickup days are local times in it. */
export const BAKERY_ZONE = 'America/New_York'

/** The catalogue the seed makes sure exists. */
export const SEED = {
  category: 'E2E Breads',
  item: 'E2E Rye loaf',
  price: 7.5,
} as const
