import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * The same tests against the site as it is deployed: the production image behind the server's
 * Caddyfile (`npm run e2e:stack`), one origin on http://localhost:8081.
 */
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: process.env.E2E_APP_URL ?? 'http://localhost:8081' },
  webServer: undefined,
})
