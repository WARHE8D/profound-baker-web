import { expect, test, type Page } from '@playwright/test'
import { placeOrder, seedBakery, type PlacedOrder } from './support/api'
import { OWNER, SEED } from './support/env'

const REFRESH_TOKEN_KEY = 'sugarcrumbs.owner.refreshToken'

let order: PlacedOrder

test.beforeEach(async () => {
  // A guest's order, waiting for the Owner.
  order = await placeOrder(await seedBakery())
})

async function signIn(page: Page) {
  await expect(page.getByRole('heading', { name: 'Owner sign in' })).toBeVisible()
  await page.getByLabel(/^Email/).fill(OWNER.email)
  await page.getByLabel(/^Password/).fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const refreshToken = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), REFRESH_TOKEN_KEY)

test('the Owner confirms an order and records its payment', async ({ page }) => {
  // Signed out, the orders page asks to sign in first, then comes back.
  await page.goto('/owner/orders')
  await signIn(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
  await expect(page).toHaveURL(/\/owner\/orders$/)

  // Find the order and open it.
  await page.getByLabel('Search orders').fill(order.reference)
  await page.getByRole('link', { name: order.reference }).click()
  await expect(page.getByRole('heading', { level: 1, name: order.reference })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Items ordered' }).getByRole('row', { name: SEED.item }),
  ).toHaveText(/2\s*CA\$7\.50\s*CA\$15\.00/)

  // Confirming it issues the invoice.
  await page.getByRole('button', { name: 'Confirm order' }).click()
  await expect(page.getByText('Order confirmed')).toBeVisible()
  const invoice = page.getByRole('link', { name: /^INV-/ })
  await expect(invoice).toBeVisible()
  const number = await invoice.innerText()
  await invoice.click()

  // Record the payment, in cash.
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible()
  await page.getByRole('button', { name: 'Mark paid…' }).click()
  const dialog = page.getByRole('dialog', { name: `Record payment for ${number}` })
  await dialog.getByRole('radio', { name: 'Cash' }).check()
  await dialog.getByRole('button', { name: 'Mark paid' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(/^Paid .* by cash\.$/)).toBeVisible()

  // The order shows it too.
  await page.goto(`/owner/orders/${order.id}`)
  await expect(page.getByRole('heading', { level: 1, name: order.reference })).toBeVisible()
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible()
})

test('the session outlives its 15-minute access token, and a reload', async ({ page }) => {
  // Time in the page runs on a clock the test can move forward.
  await page.clock.install()
  await page.goto('/owner/login')
  await signIn(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  const first = await refreshToken(page)
  expect(first).toBeTruthy()

  // 16 minutes on, the access token has expired: the next request refreshes it first.
  await page.clock.fastForward('16:00')
  await page
    .getByRole('navigation', { name: 'Owner' })
    .getByRole('link', { name: 'Orders' })
    .click()
  await page.getByLabel('Search orders').fill(order.reference)
  await expect(page.getByRole('link', { name: order.reference })).toBeVisible()
  await expect.poll(() => refreshToken(page)).not.toBe(first)
  const second = await refreshToken(page)

  // A reload forgets the access token; the stored refresh token restores the session.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible()
  await expect(page.getByRole('link', { name: order.reference })).toBeVisible()
  await expect.poll(() => refreshToken(page)).not.toBe(second)

  // Signing out ends it: the owner pages ask to sign in again.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Owner sign in' })).toBeVisible()
  expect(await refreshToken(page)).toBeNull()
  await page.goto('/owner/orders')
  await expect(page.getByRole('heading', { name: 'Owner sign in' })).toBeVisible()
})
