import { useSyncExternalStore } from 'react'
import type { Schema } from '@/api'

/**
 * Most of one item a guest can put in the cart. The public API doesn't expose stock, so this is a
 * sanity cap only; checkout rejects an order the bakery can't fill.
 */
export const MAX_QUANTITY_PER_ITEM = 20

/** One cart line. Name, price and thumbnail are as last seen, so the cart renders offline. */
export type CartLine = {
  itemId: string
  name: string
  price: number
  thumbnailUrl: string | null
  quantity: number
}

export const CART_STORAGE_KEY = 'sugarcrumbs.cart.v1'

type Listener = () => void

/**
 * The cart, kept in localStorage so it survives reloads, and synced between tabs through the
 * `storage` event. A tiny external store rather than context: any component can read it with
 * {@link useCart} without a provider.
 */
export function createCartStore(storage: () => Storage | undefined = defaultStorage) {
  let lines: CartLine[] | undefined
  const listeners = new Set<Listener>()

  function read(): CartLine[] {
    lines ??= load(storage())
    return lines
  }

  function write(next: CartLine[]) {
    lines = next
    try {
      storage()?.setItem(CART_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Private mode or a full quota: the cart still works for this page view.
    }
    listeners.forEach((listener) => listener())
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== CART_STORAGE_KEY && event.key !== null) return
    lines = undefined // re-read on the next snapshot
    listeners.forEach((listener) => listener())
  }

  return {
    getLines: read,

    subscribe(listener: Listener): () => void {
      if (listeners.size === 0) globalThis.addEventListener?.('storage', onStorage)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) globalThis.removeEventListener?.('storage', onStorage)
      }
    },

    /**
     * Adds `quantity` of an item (or more of it, if already in the cart), up to
     * {@link MAX_QUANTITY_PER_ITEM}. Refreshes the remembered name, price and thumbnail.
     * Returns how many were actually added (0 when the line was already full).
     */
    add(item: Schema<'PublicItemResponse'>, quantity: number): number {
      const current = read()
      const existing = current.find((line) => line.itemId === item.id)
      const before = existing?.quantity ?? 0
      const after = clampQuantity(before + quantity)
      const line: CartLine = {
        itemId: item.id,
        name: item.name,
        price: item.price,
        thumbnailUrl: item.thumbnailUrls[0] ?? null,
        quantity: after,
      }
      write(existing ? current.map((l) => (l.itemId === item.id ? line : l)) : [...current, line])
      return after - before
    },

    /** Sets a line's quantity, clamped to 1…{@link MAX_QUANTITY_PER_ITEM}. */
    setQuantity(itemId: string, quantity: number) {
      const current = read()
      if (!current.some((line) => line.itemId === itemId)) return
      write(
        current.map((line) =>
          line.itemId === itemId ? { ...line, quantity: clampQuantity(quantity) } : line,
        ),
      )
    },

    remove(itemId: string) {
      const current = read()
      if (!current.some((line) => line.itemId === itemId)) return
      write(current.filter((line) => line.itemId !== itemId))
    },

    /**
     * Takes the item's current name, price and thumbnail into its line, e.g. once the guest has
     * seen a price change. Does nothing if the item isn't in the cart or nothing changed.
     */
    refresh(item: Schema<'PublicItemResponse'>) {
      const current = read()
      const thumbnailUrl = item.thumbnailUrls[0] ?? null
      const stale = current.find(
        (line) =>
          line.itemId === item.id &&
          (line.name !== item.name ||
            line.price !== item.price ||
            line.thumbnailUrl !== thumbnailUrl),
      )
      if (!stale) return
      write(
        current.map((line) =>
          line === stale ? { ...line, name: item.name, price: item.price, thumbnailUrl } : line,
        ),
      )
    },

    clear() {
      if (read().length === 0) return
      write([])
    },
  }
}

export type CartStore = ReturnType<typeof createCartStore>

/** localStorage, or nothing when the browser blocks it (reading the property itself can throw). */
function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** The app's cart. */
export const cartStore = createCartStore()

const getServerSnapshot = (): CartLine[] => []

/** The cart's lines; re-renders when they change, in this tab or another. */
export function useCartLines(): CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.getLines, getServerSnapshot)
}

/** Total number of pieces in the cart, for the header badge. */
export function useCartCount(): number {
  return useCartLines().reduce((sum, line) => sum + line.quantity, 0)
}

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.min(MAX_QUANTITY_PER_ITEM, Math.max(1, Math.trunc(quantity)))
}

/** Reads the saved cart, dropping anything that isn't a valid line (old format, hand edits). */
function load(storage: Storage | undefined): CartLine[] {
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(CART_STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw.filter(isCartLine).map((line) => ({ ...line, quantity: clampQuantity(line.quantity) }))
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return (
    typeof line.itemId === 'string' &&
    typeof line.name === 'string' &&
    typeof line.price === 'number' &&
    typeof line.quantity === 'number' &&
    (line.thumbnailUrl === null || typeof line.thumbnailUrl === 'string')
  )
}
