import { defineConfig, devices } from '@playwright/test'
import { API_URL, APP_URL } from './e2e/support/env'

const CI = Boolean(process.env.CI)

/**
 * End-to-end tests: the built SPA in a real browser against a real backend.
 * Start the backend first (`npm run e2e:backend`, see README.md "End-to-end tests");
 * Playwright builds and serves the SPA itself.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // Every test shares one backend: more browsers at once only slow it down.
  workers: CI ? 2 : 4,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    // The bakery's slots are in New York; so is the browser, as the guests' would be.
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Locally, the installed Chrome: no browser download needed.
      use: { ...devices['Desktop Chrome'], ...(CI ? {} : { channel: 'chrome' }) },
    },
  ],
  webServer: {
    command: 'npm run e2e:serve',
    url: APP_URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: { VITE_API_BASE_URL: API_URL },
  },
})
