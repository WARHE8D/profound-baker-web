import { useQueries } from '@tanstack/react-query'
import { isApiError, type Schema } from '@/api'
import { catalogueItemQuery } from '@/features/catalogue/queries'
import { lineTotal, sumMoney } from '@/lib/money'
import { useCartLines, type CartLine } from './cart-store'

type PublicItem = Schema<'PublicItemResponse'>

/** What re-checking a cart line against the live catalogue found. */
export type LineCheck =
  /** Still being looked up; the line shows its remembered price meanwhile. */
  | { status: 'checking' }
  /** On the menu at the remembered price. */
  | { status: 'ok'; item: PublicItem }
  /** On the menu, but the price is different from when it was added. */
  | { status: 'priceChanged'; item: PublicItem; was: number }
  /** On the menu but can't be ordered right now. */
  | { status: 'soldOut'; item: PublicItem }
  /** Hidden by the Owner or deleted (404). */
  | { status: 'gone' }
  /** The lookup failed (offline, 5xx): unknown, so the remembered details stand. */
  | { status: 'unchecked'; error: unknown }

export type CheckedLine = CartLine & {
  check: LineCheck
  /** The price used in the subtotal: the live one when known, else the remembered one. */
  unitPrice: number
  /** Counts toward the subtotal and can go to checkout. */
  orderable: boolean
  total: number
}

type LookupResult = { data?: PublicItem; error: unknown; isPending: boolean }

/** Compares one cart line with what the catalogue says about its item now. */
export function checkLine(line: CartLine, lookup: LookupResult): LineCheck {
  const item = lookup.data
  if (item) {
    if (!item.orderable) return { status: 'soldOut', item }
    if (item.price !== line.price) return { status: 'priceChanged', item, was: line.price }
    return { status: 'ok', item }
  }
  if (isApiError(lookup.error) && lookup.error.status === 404) return { status: 'gone' }
  if (lookup.error) return { status: 'unchecked', error: lookup.error }
  return { status: 'checking' }
}

export type CheckedCart = {
  lines: CheckedLine[]
  /** Sum of the lines that can be ordered, at their live prices. */
  subtotal: number
  /** Pieces across all lines, orderable or not. */
  count: number
  /** Lines that are sold out or gone; they block checkout until removed. */
  blocked: CheckedLine[]
  /** Some lines are still being looked up. */
  checking: boolean
}

/**
 * The cart, with every line re-checked against the catalogue: each item is fetched (and cached,
 * shared with the item page) so price changes, sold-out and removed items are flagged.
 */
export function useCheckedCart(): CheckedCart {
  const lines = useCartLines()
  const lookups = useQueries({
    queries: lines.map((line) => catalogueItemQuery(line.itemId)),
  })

  const checked = lines.map((line, i): CheckedLine => {
    const check = checkLine(line, lookups[i] ?? { error: null, isPending: true })
    const unitPrice = 'item' in check ? check.item.price : line.price
    const orderable = check.status !== 'soldOut' && check.status !== 'gone'
    return { ...line, check, unitPrice, orderable, total: lineTotal(unitPrice, line.quantity) }
  })

  return {
    lines: checked,
    subtotal: sumMoney(checked.filter((l) => l.orderable).map((l) => l.total)),
    count: checked.reduce((sum, l) => sum + l.quantity, 0),
    blocked: checked.filter((l) => !l.orderable),
    checking: checked.some((l) => l.check.status === 'checking'),
  }
}
