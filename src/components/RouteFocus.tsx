import { useEffect } from 'react'
import { useLocation } from 'react-router'

export const APP_NAME = 'SugarCrumbs'

/**
 * The page shown before, across every RouteFocus: the sign-in page and each layout render their
 * own, and signing in (one to the other) is a move to another page too.
 */
let lastPathname: string | null = null

/**
 * What a full page load would do, for client-side navigation:
 *
 * - The tab's title names the page: the page's `<h1>`, then the app's name. It follows the
 *   heading as it changes (an item's name once it has loaded).
 * - After moving to another page, focus moves to that `<h1>` (to `<main>` until it renders), so a
 *   screen reader announces the new page and Tab continues from the top of its content rather
 *   than from a link that is gone. A page that focused something itself keeps it.
 *
 * - When the focused control disappears (a "Mark paid" button once the invoice is paid), focus
 *   would fall back to the start of the document: it goes to the page's `<h1>` instead, so Tab
 *   continues from this page's content.
 *
 * Changes to the query string alone (filters, sort, page) are not navigation and leave focus
 * where it is. Rendered once by every layout, next to `<main id="main">`.
 */
export function RouteFocus() {
  const { pathname } = useLocation()

  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    // On page load the browser starts at the top already; only a move to another page moves focus.
    const moveFocus = lastPathname !== null && lastPathname !== pathname
    lastPathname = pathname

    let focusPending = false
    if (moveFocus) {
      const active = document.activeElement
      const pageFocusedItself = active !== null && active !== main && main.contains(active)
      if (!pageFocusedItself) {
        main.focus({ preventScroll: true })
        focusPending = true
      }
    }

    // The element focused last, to notice when it is removed with focus on it.
    let lastFocused: Element | null = document.activeElement
    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target as Element
    }
    document.addEventListener('focusin', onFocusIn)

    function sync() {
      const heading = main!.querySelector('h1')
      if (!heading) return
      const name = heading.textContent?.trim()
      document.title = name ? `${name} · ${APP_NAME}` : APP_NAME
      const focusLost =
        document.activeElement === document.body &&
        lastFocused !== null &&
        lastFocused !== document.body &&
        // Removed, or in a dialog that has closed with nothing to give focus back to.
        (!lastFocused.isConnected || lastFocused.closest('dialog:not([open])') !== null)
      // On navigation, only if nothing took focus while the page was loading.
      if ((focusPending && document.activeElement === main) || focusLost) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
      focusPending = false
    }

    sync()
    const observer = new MutationObserver(sync)
    observer.observe(main, {
      childList: true,
      subtree: true,
      characterData: true,
      // A dialog closing.
      attributes: true,
      attributeFilter: ['open'],
    })
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [pathname])

  return null
}
