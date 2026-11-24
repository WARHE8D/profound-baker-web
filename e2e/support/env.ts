/** Where the end-to-end tests find the app and the backend. Defaults match e2e/compose.yaml. */

export const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:4173'
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080'

/** The Owner the backend creates on its first start (APP_OWNER_* in e2e/compose.yaml). */
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
