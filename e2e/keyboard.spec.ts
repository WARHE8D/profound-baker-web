import { expect, test, type Locator, type Page } from '@playwright/test'
import { bakeryDate, placeOrder, seedBakery, type PlacedOrder } from './support/api'
import { OWNER, SEED } from './support/env'

/**
 * The guest and Owner flows with the keyboard alone: every control is reached with Tab (never
 * clicked), used with Enter, Space or typing, and focus lands somewhere sensible after each
 * page change and dialog.
 */

/** Presses Tab (or Shift+Tab) until `target` has focus: proof it can be reached that way. */
async function tabTo(page: Page, target: Locator, { back = false, max = 80 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`Couldn't reach ${target} with ${back ? 'Shift+Tab' : 'Tab'}`)
}

/** After a page change, focus is on the new page's main heading. */
async function expectPage(page: Page, name: string | RegExp) {
  const heading = page.getByRole('heading', { level: 1, name })
  await expect(heading).toBeFocused()
  return heading
}

/** "Wednesday, November 25", as the pickup calendar names a day. */
function dayLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

test('a guest orders and cancels with the keyboard alone', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // The skip link is the first stop, and goes past the header.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()

  // Item → cart.
  await tabTo(page, page.getByRole('link', { name: SEED.item }).first())
  await page.keyboard.press('Enter')
  await expectPage(page, SEED.item)
  await tabTo(page, page.getByRole('button', { name: 'Add to cart' }))
  await page.keyboard.press('Enter')
  await expect(page.getByText(`Added 1 × ${SEED.item} to your cart`)).toBeVisible()

  // The cart drawer: Esc closes it and gives focus back to the cart button.
  const cartButton = page.getByRole('button', { name: 'Cart 1 item' })
  await tabTo(page, cartButton, { back: true })
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog', { name: 'Your cart' })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator(':focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(cartButton).toBeFocused()
  await page.keyboard.press('Enter')
  await tabTo(page, drawer.getByRole('link', { name: 'Checkout' }))
  await page.keyboard.press('Enter')
  await expectPage(page, 'Checkout')

  // Pickup: a day three days ahead, then its first time.
  const date = bakeryDate(3)
  await expect(page.getByRole('group', { name: /^Pickup times on/ })).toBeVisible({
    timeout: 30_000,
  })
  const day = page.getByRole('button', { name: new RegExp(`^${dayLabel(date)},`) })
  if (!(await day.isVisible())) {
    await tabTo(page, page.getByRole('button', { name: 'Next month' }))
    await page.keyboard.press('Enter')
  }
  await tabTo(page, day)
  await page.keyboard.press('Enter')
  const slots = page.getByRole('group', { name: `Pickup times on ${dayLabel(date)}` })
  // A radio group is one Tab stop, on its first enabled time; Space picks it.
  const slot = slots.getByRole('radio', { disabled: false }).first()
  await tabTo(page, slot)
  await page.keyboard.press('Space')
  await expect(slot).toBeChecked()
  await expect(slots.getByRole('radio', { checked: true })).toHaveCount(1)

  // Details, then Enter in the last field places the order.
  await tabTo(page, page.getByRole('textbox', { name: /^Name/ }))
  await page.keyboard.type('Ada Lovelace')
  await page.keyboard.press('Tab')
  await page.keyboard.type('ada@example.com')
  await page.keyboard.press('Tab')
  await page.keyboard.type('+1 555 0199')
  await tabTo(page, page.getByRole('button', { name: /^Place order/ }))
  await page.keyboard.press('Enter')
  await expectPage(page, 'Thank you, your order is placed')

  // The magic link (a full URL, so a full page load), then cancel in its dialog.
  await tabTo(page, page.getByRole('link', { name: /\/orders\// }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: /^Order SC-/ })).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Cancel order' }))
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Cancel this order?' })
  await expect(dialog).toBeVisible()
  await tabTo(page, dialog.getByRole('textbox', { name: /Reason/ }))
  await page.keyboard.type('Plans changed')
  await tabTo(page, dialog.getByRole('button', { name: 'Cancel order' }))
  await page.keyboard.press('Enter')
  await expect(page.getByText('This order was cancelled.')).toBeVisible()
  // The button that opened the dialog is gone: focus waits on the page's heading, not <body>.
  await expect(page.getByRole('heading', { level: 1, name: /^Order SC-/ })).toBeFocused()
})

let order: PlacedOrder

test.describe('Owner', () => {
  test.beforeEach(async () => {
    order = await placeOrder(await seedBakery())
  })

  test('confirms an order and records its payment with the keyboard alone', async ({ page }) => {
    await page.goto('/owner/login')
    await expect(page.getByRole('heading', { name: 'Owner sign in' })).toBeVisible()
    await tabTo(page, page.getByLabel(/^Email/))
    await page.keyboard.type(OWNER.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(OWNER.password)
    await page.keyboard.press('Enter')
    await expectPage(page, 'Dashboard')

    // Navigation, search, and into the order.
    const nav = page.getByRole('navigation', { name: 'Owner' })
    await tabTo(page, nav.getByRole('link', { name: /^Orders/ }), { back: true })
    await page.keyboard.press('Enter')
    await expectPage(page, 'Orders')
    await tabTo(page, page.getByLabel('Search orders'))
    await page.keyboard.type(order.reference)
    await expect(page.getByRole('link', { name: order.reference })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`q=${order.reference}`))
    await tabTo(page, page.getByRole('link', { name: order.reference }))
    await page.keyboard.press('Enter')
    await expectPage(page, order.reference)

    // Confirm: the button goes away with the status, and focus moves to the heading.
    await tabTo(page, page.getByRole('button', { name: 'Confirm order' }))
    await page.keyboard.press('Enter')
    await expect(page.getByText('Order confirmed')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: order.reference })).toBeFocused()

    // The invoice, and its payment dialog.
    const invoice = page.getByRole('link', { name: /^INV-/ })
    const number = await invoice.innerText()
    await tabTo(page, invoice)
    await page.keyboard.press('Enter')
    await expectPage(page, number)
    const markPaid = page.getByRole('button', { name: 'Mark paid…' })
    await tabTo(page, markPaid)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: `Record payment for ${number}` })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator(':focus')).toHaveCount(1)
    // Esc closes it, back to the button that opened it.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(markPaid).toBeFocused()
    await page.keyboard.press('Enter')
    await tabTo(page, dialog.getByRole('button', { name: 'Mark paid' }))
    await page.keyboard.press('Enter')
    await expect(page.getByText(/^Paid .* by cash\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeFocused()
  })
})
