import { useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches, kept up to date as the window changes. `fallback` is the
 * answer where there is no `matchMedia` (jsdom).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {}
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => (typeof matchMedia === 'function' ? matchMedia(query).matches : fallback),
    () => fallback,
  )
}
