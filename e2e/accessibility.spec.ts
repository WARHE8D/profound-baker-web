import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from './support/test'
import { confirmOrder, placeOrder, seedBakery, type Item, type PlacedOrder } from './support/api'
import { fillCart, signInAsOwner } from './support/browser'

/**
 * Every page, at a phone (360 px), a tablet and a desktop width, in light and dark: no axe
 * violations of WCAG 2.2 A/AA (colour contrast included) and nothing wider than the screen.
 */

// Each test audits a dozen pages or more, axe on every one.
test.describe.configure({ timeout: 180_000 })

const WIDTHS = { phone: 360, tablet: 768, desktop: 1280 } as const
const SCHEMES = ['light', 'dark'] as const

let item: Item
let order: PlacedOrder
let invoiceId: string
let pendingOrder: PlacedOrder

test.beforeAll(async () => {
  item = await seedBakery()
  order = await placeOrder(item)
  invoiceId = (await confirmOrder(order.id)).id
  // Pending: its page shows the guest's cancel button and the Owner's confirm/reject.
  pendingOrder = await placeOrder(item)
})

type Check = { path: string; name: string; open?: (page: Page) => Promise<void> }

const guestPages = (): Check[] => [
  { path: '/', name: 'menu' },
  { path: `/items/${item.id}`, name: 'item' },
  { path: '/cart', name: 'cart' },
  { path: '/checkout', name: 'checkout' },
  {
    path: '/',
    name: 'cart drawer',
    open: (page) => page.getByRole('button', { name: /^Cart \d/ }).click(),
  },
  { path: `/orders/${pendingOrder.accessToken}`, name: 'guest order' },
  {
    path: `/orders/${pendingOrder.accessToken}`,
    name: 'guest cancel dialog',
    open: (page) => page.getByRole('button', { name: 'Cancel order' }).click(),
  },
  { path: '/no-such-page', name: 'not found' },
]

const ownerPages = (): Check[] => [
  { path: '/owner', name: 'dashboard' },
  { path: '/owner/orders', name: 'orders' },
  { path: `/owner/orders/${pendingOrder.id}`, name: 'pending order' },
  {
    path: `/owner/orders/${pendingOrder.id}`,
    name: 'reject dialog',
    open: (page) => page.getByRole('button', { name: 'Reject…' }).click(),
  },
  { path: `/owner/orders/${order.id}`, name: 'confirmed order' },
  { path: '/owner/invoices', name: 'invoices' },
  { path: `/owner/invoices/${invoiceId}`, name: 'invoice' },
  {
    path: `/owner/invoices/${invoiceId}`,
    name: 'payment dialog',
    open: (page) => page.getByRole('button', { name: 'Mark paid…' }).click(),
  },
  { path: '/owner/production', name: 'production' },
  { path: '/owner/items', name: 'items' },
  { path: '/owner/items/new', name: 'new item' },
  { path: `/owner/items/${item.id}`, name: 'edit item' },
  { path: '/owner/categories', name: 'categories' },
  { path: '/owner/availability', name: 'availability' },
  { path: '/owner/profile', name: 'profile' },
]

/** Opens the page, waits until it has settled, and returns what is wrong with it. */
async function audit(page: Page, { path, name, open }: Check): Promise<string[]> {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  // Nothing still loading.
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0)
  if (open) {
    await open(page)
    await expect(page.getByRole('dialog')).toBeVisible()
  }
  // Let transitions (dialogs fading in, toasts) finish before colours are measured.
  await page.waitForTimeout(300)

  const problems: string[] = []
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  for (const v of violations) {
    const where = v.nodes
      .slice(0, 3)
      .map(
        (n) =>
          `${n.target.join(' ')}${n.failureSummary ? `: ${n.failureSummary.split('\n')[1]?.trim()}` : ''}`,
      )
      .join('; ')
    problems.push(`${name} (${path}): ${v.id} (${v.impact}) ${v.help}: ${where}`)
  }

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth <= doc.clientWidth) return null
    // The widest offenders, to say where to look.
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')}`)
    return `${doc.scrollWidth}px wide in ${doc.clientWidth}px: ${wide.join(', ')}`
  })
  if (overflow) problems.push(`${name} (${path}): scrolls sideways, ${overflow}`)
  return problems
}

for (const [size, width] of Object.entries(WIDTHS)) {
  for (const colorScheme of SCHEMES) {
    test.describe(`${size}, ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 900 }, colorScheme })

      test('guest pages', async ({ page }) => {
        await fillCart(page, item)
        const problems: string[] = []
        for (const check of guestPages()) problems.push(...(await audit(page, check)))
        expect(problems, problems.join('\n')).toEqual([])
      })

      test('owner pages', async ({ page }) => {
        await signInAsOwner(page)
        const problems: string[] = []
        for (const check of ownerPages()) problems.push(...(await audit(page, check)))
        expect(problems, problems.join('\n')).toEqual([])
      })

      test('sign-in page', async ({ page }) => {
        const problems = await audit(page, { path: '/owner/login', name: 'sign in' })
        expect(problems, problems.join('\n')).toEqual([])
      })
    })
  }
}
