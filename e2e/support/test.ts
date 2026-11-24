import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'
export type { Locator, Page } from '@playwright/test'

/**
 * Playwright's `test`, failing any test whose page broke its Content Security Policy: against the
 * production image (npm run e2e:production) that catches a CSP too strict for what the app does.
 */
export const test = base.extend<{ cspViolations: void }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = []
      page.on('console', (message) => {
        if (/Content Security Policy|Refused to/i.test(message.text())) {
          violations.push(message.text())
        }
      })
      await use()
      if (violations.length > 0) {
        throw new Error(`The page broke its Content Security Policy:\n${violations.join('\n')}`)
      }
    },
    { auto: true },
  ],
})
