import { expect, test } from '@playwright/test'
import { bakeryDate } from './support/api'
import { SEED } from './support/env'

/** "Wednesday, November 25", as the pickup calendar names a day. */
function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

test('a guest orders from the menu, follows the magic link and cancels', async ({ page }) => {
  // Browse.
  await page.goto('/')
  await page.getByRole('link', { name: SEED.item }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: SEED.item })).toBeVisible()

  // Cart.
  await page.getByRole('button', { name: 'Increase quantity' }).click()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText(`Added 2 × ${SEED.item} to your cart`)).toBeVisible()
  await page.getByRole('button', { name: 'Cart 2 items' }).click()
  const drawer = page.getByRole('dialog', { name: 'Your cart' })
  await drawer.getByRole('link', { name: 'Checkout' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()

  // Slot: three days ahead, so the guest may still cancel online (until 24 hours before).
  const day = page.getByRole('button', { name: new RegExp(`^${dayLabel(bakeryDate(3))},`) })
  // Two months of availability: allow for a backend that has only just started.
  await expect(page.getByRole('group', { name: /^Pickup times on/ })).toBeVisible({
    timeout: 30_000,
  })
  if (!(await day.isVisible())) await page.getByRole('button', { name: 'Next month' }).click()
  await day.click()
  const slots = page.getByRole('group', { name: `Pickup times on ${dayLabel(bakeryDate(3))}` })
  // The radios are drawn as their labels: click the first time with places left, as a guest would.
  const slot = slots.getByRole('radio', { disabled: false }).first()
  await page.locator(`label[for="${await slot.getAttribute('id')}"]`).click()
  await expect(slot).toBeChecked()

  // Checkout.
  await page.getByRole('textbox', { name: /^Name/ }).fill('Ada Lovelace')
  await page.getByRole('textbox', { name: /^Email/ }).fill('ada@example.com')
  await page.getByRole('textbox', { name: /^Phone/ }).fill('+1 555 0199')
  await page.getByRole('button', { name: /^Place order/ }).click()

  await expect(page.getByRole('heading', { name: 'Thank you, your order is placed' })).toBeVisible()
  const reference = await page.locator('strong', { hasText: /^SC-/ }).innerText()
  await expect(page.getByRole('button', { name: 'Cart 0 items' })).toBeVisible()

  // The magic link: the only way back to the order.
  const link = await page.getByRole('link', { name: /\/orders\// }).getAttribute('href')
  expect(link).toMatch(/\/orders\/[\w-]{43}$/)
  await page.goto(link!)
  await expect(page.getByRole('heading', { name: `Order ${reference}` })).toBeVisible()
  await expect(page.getByText('Waiting for confirmation')).toBeVisible()
  await expect(page.getByText(`2 × ${SEED.item}`)).toBeVisible()

  // Cancel.
  await page.getByRole('button', { name: 'Cancel order' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('Plans changed')
  await dialog.getByRole('button', { name: 'Cancel order' }).click()
  await expect(page.getByText('Your order is cancelled')).toBeVisible()

  // Still cancelled when the link is opened again.
  await page.reload()
  await expect(page.getByText('This order was cancelled.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeHidden()
})
