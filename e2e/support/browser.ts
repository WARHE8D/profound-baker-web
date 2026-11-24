import type { Item } from './api'
import { ownerLogin } from './api'
import type { Page } from '@playwright/test'

/**
 * Starts the page signed in as the Owner, without the login form: a new session's refresh token,
 * stored where the app looks for it. Set only once: the app swaps it for a new one on its first
 * refresh, and offering the spent one again would look like theft to the server.
 */
export async function signInAsOwner(page: Page) {
  const { refreshToken } = await ownerLogin()
  await page.addInitScript((token) => {
    const key = 'sugarcrumbs.owner.refreshToken'
    if (!localStorage.getItem(key)) localStorage.setItem(key, token)
  }, refreshToken)
}

/** Starts the page with `item` in the cart. */
export async function fillCart(page: Page, item: Item, quantity = 2) {
  const line = { itemId: item.id, name: item.name, price: item.price, thumbnailUrl: null, quantity }
  await page.addInitScript(
    (value) => {
      const key = 'sugarcrumbs.cart.v1'
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
    },
    JSON.stringify([line]),
  )
}
