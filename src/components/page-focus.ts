/**
 * Puts focus on the page's `<h1>` (or `<main>` while there is none): where a screen reader should
 * start reading and Tab should continue from, when the focused element has gone.
 */
export function focusPageHeading() {
  const main = document.getElementById('main')
  const heading = main?.querySelector('h1')
  if (heading) heading.tabIndex = -1
  ;(heading ?? main)?.focus({ preventScroll: true })
}
