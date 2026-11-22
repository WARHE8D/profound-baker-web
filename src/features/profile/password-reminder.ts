import { useSyncExternalStore } from 'react'

/**
 * The backend can't tell whether the Owner still uses the bootstrap password
 * (APP_OWNER_INITIAL_PASSWORD), so the reminder to change it is remembered per browser and per
 * Owner: it goes away once the password is changed here or the reminder is dismissed. It may show
 * again on a new device. Replace with a server flag if the API ever offers one.
 */
const key = (ownerId: string) => `sugarcrumbs.owner.passwordReminder.${ownerId}`
const listeners = new Set<() => void>()

function read(ownerId: string): boolean {
  try {
    return localStorage.getItem(key(ownerId)) === null
  } catch {
    // Storage blocked: don't nag on every page.
    return false
  }
}

/** Hides the reminder for this Owner in this browser. */
export function dismissPasswordReminder(ownerId: string): void {
  try {
    localStorage.setItem(key(ownerId), new Date().toISOString())
  } catch {
    // Storage blocked: hidden until the page reloads.
  }
  listeners.forEach((listener) => listener())
}

/** Whether to remind this Owner to replace the setup password. */
export function usePasswordReminder(ownerId: string | undefined): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (ownerId ? read(ownerId) : false),
  )
}
