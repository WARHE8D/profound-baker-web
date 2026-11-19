import type { CheckoutFormInput } from './checkout-form'

const KEY = 'sugarcrumbs.checkout-draft.v1'

/**
 * What the guest has typed into the checkout form, kept for this tab (sessionStorage) so a detour
 * to the cart, or a reload, doesn't lose it. Cleared once the order is placed.
 */
export function loadCheckoutDraft(): CheckoutFormInput | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const draft = raw as Record<string, unknown>
    const text = (key: string) => (typeof draft[key] === 'string' ? draft[key] : '')
    return { name: text('name'), email: text('email'), phone: text('phone'), notes: text('notes') }
  } catch {
    return null
  }
}

export function saveCheckoutDraft(values: CheckoutFormInput): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(values))
  } catch {
    // Storage blocked or full: the form still works, it just won't survive a reload.
  }
}

export function clearCheckoutDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
