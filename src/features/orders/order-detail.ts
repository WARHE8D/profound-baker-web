import type { Schema } from '@/api'
import type { OrderStatus, OwnerOrder } from './orders-list'

/** The status changes the Owner can make, and the statuses each starts from (Order's guards). */
export type Transition = 'confirm' | 'reject' | 'start-preparation' | 'fulfill' | 'cancel'

const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  PENDING: ['confirm', 'reject'],
  // Fulfilling straight from confirmed is allowed: not every order needs preparing.
  CONFIRMED: ['start-preparation', 'fulfill', 'cancel'],
  IN_PROGRESS: ['fulfill', 'cancel'],
  FULFILLED: [],
  REJECTED: [],
  CANCELLED: [],
}

export const transitionsFor = (status: OrderStatus) => TRANSITIONS[status]

/** Moving the pickup: until the order is over. */
export const canReschedule = (status: OrderStatus) =>
  status === 'PENDING' || status === 'CONFIRMED' || status === 'IN_PROGRESS'

/** Lines and notes: only while pending. Once confirmed, the Owner has agreed to the order as it was. */
export const canEditContents = (status: OrderStatus) => status === 'PENDING'

/** Confirming issues the invoice, so only these statuses can have one. */
export const mayHaveInvoice = (status: OrderStatus) =>
  status === 'CONFIRMED' ||
  status === 'IN_PROGRESS' ||
  status === 'FULFILLED' ||
  status === 'CANCELLED'

/** RejectRequest / CancelRequest, NotesRequest and OrderProperties' limits. */
export const REASON_MAX = 300
export const NOTES_MAX = 1000
export const MAX_LINES = 20
export const MAX_QUANTITY = 100

/** One line in the editor: an item on the order or one being added. */
export type DraftLine = {
  /** null: the item was deleted from the catalogue; the line can only be dropped. */
  itemId: string | null
  itemName: string
  /** What the guest pays a unit: the order's snapshot, or today's price for an added item. */
  unitPrice: number
  /** As typed; validated on save. */
  quantity: number
  /** Not on the order yet. */
  added: boolean
}

export const toDraft = (order: OwnerOrder): DraftLine[] =>
  order.lines.map((line) => ({
    itemId: line.itemId,
    itemName: line.itemName,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    added: false,
  }))

/** What PUT /lines is sent: every line kept. A deleted item's line can't be, so it's dropped. */
export const toLinesRequest = (draft: DraftLine[]): Schema<'OrderLineRequest'>[] =>
  draft.flatMap((line) => (line.itemId ? [{ itemId: line.itemId, quantity: line.quantity }] : []))

export const draftSubtotal = (draft: DraftLine[]) =>
  Math.round(
    draft
      .filter((line) => line.itemId)
      .reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0),
  ) / 100

export const isValidQuantity = (quantity: number) =>
  Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY

/** Why the draft can't be saved, or null. */
export function draftProblem(draft: DraftLine[]): string | null {
  const kept = draft.filter((line) => line.itemId)
  if (kept.length === 0) return 'An order needs at least one item. To call it off, reject it.'
  if (kept.length > MAX_LINES) return `An order can have at most ${MAX_LINES} different items.`
  if (kept.some((line) => !isValidQuantity(line.quantity))) {
    return `Quantities are whole numbers from 1 to ${MAX_QUANTITY}.`
  }
  return null
}

/** Whether saving the draft would change the order. */
export function draftChanged(order: OwnerOrder, draft: DraftLine[]): boolean {
  const before = toLinesRequest(toDraft(order))
  const after = toLinesRequest(draft)
  return (
    order.lines.some((line) => line.itemId === null) ||
    before.length !== after.length ||
    before.some(
      (line, i) => line.itemId !== after[i]!.itemId || line.quantity !== after[i]!.quantity,
    )
  )
}
