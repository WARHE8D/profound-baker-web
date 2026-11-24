import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, isApiError, unwrap, type ApiError, type Schema } from '@/api'
import type { ToastOptions } from '@/components'
import { checkoutKeys } from '@/features/checkout/queries'
import { STATUS_LABELS, type OwnerOrder } from './orders-list'
import { getOrder, ownerOrderKeys } from './owner-queries'

export type OrderAction =
  | { type: 'confirm' }
  | { type: 'reject'; reason: string }
  | { type: 'start-preparation' }
  | { type: 'fulfill' }
  | { type: 'cancel'; reason: string }
  | { type: 'reschedule'; pickupAt: string }
  | { type: 'lines'; lines: Schema<'OrderLineRequest'>[] }
  | { type: 'notes'; notes: string }

function send(id: string, action: OrderAction): Promise<OwnerOrder> {
  const path = { params: { path: { id } } }
  switch (action.type) {
    case 'confirm':
      return unwrap(api.PATCH('/api/orders/{id}/confirm', path))
    case 'reject':
      return unwrap(
        api.PATCH('/api/orders/{id}/reject', { ...path, body: { reason: action.reason } }),
      )
    case 'start-preparation':
      return unwrap(api.PATCH('/api/orders/{id}/start-preparation', path))
    case 'fulfill':
      return unwrap(api.PATCH('/api/orders/{id}/fulfill', path))
    case 'cancel':
      // An empty reason is left out: the order then has none.
      return unwrap(
        api.PATCH('/api/orders/{id}/cancel', {
          ...path,
          body: action.reason ? { reason: action.reason } : {},
        }),
      )
    case 'reschedule':
      return unwrap(
        api.PUT('/api/orders/{id}/schedule', { ...path, body: { pickupAt: action.pickupAt } }),
      )
    case 'lines':
      return unwrap(api.PUT('/api/orders/{id}/lines', { ...path, body: { lines: action.lines } }))
    case 'notes':
      return unwrap(api.PUT('/api/orders/{id}/notes', { ...path, body: { notes: action.notes } }))
  }
}

/** Writes that replace what the Owner saw (lines, notes, pickup): checked against it first. */
const REPLACING: readonly OrderAction['type'][] = ['lines', 'notes', 'reschedule']

/**
 * The order changed after the Owner loaded it (in another tab, by the auto-cancel job, by the
 * guest), so their action was refused or would have undone that change. Holds the order as it
 * is now.
 */
export class OrderChangedError extends Error {
  readonly order: OwnerOrder
  /** The server's refusal, if the action was sent at all. */
  readonly refusal: ApiError | null

  constructor(order: OwnerOrder, refusal: ApiError | null) {
    super('this order was changed by someone else')
    this.name = 'OrderChangedError'
    this.order = order
    this.refusal = refusal
  }
}

/** The toast for an action refused because someone else changed the order first. */
export function orderChangedToast(error: OrderChangedError): ToastOptions {
  return {
    tone: 'error',
    title: 'Someone else changed this order',
    description: `It's now ${STATUS_LABELS[error.order.status].toLowerCase()}, and shown as it is. Check it, then try again if you still need to.`,
  }
}

const hasChanged = (seen: OwnerOrder, fresh: OwnerOrder) =>
  fresh.updatedAt !== seen.updatedAt || fresh.status !== seen.status

export type OrderActionVariables = {
  action: OrderAction
  /** The order as the Owner saw it when they chose the action or opened the editor. */
  seen: OwnerOrder
}

/**
 * Confirms, rejects, reschedules or edits an order. The server answers a move from the wrong
 * status with a 400, and a write that collided with another with a 409: both usually mean the
 * order changed under the Owner. So the order is loaded again and, if it did change, the action
 * fails with {@link OrderChangedError} holding it. Lines, notes and pickup replace what the Owner
 * saw, so those are checked before sending: a change made meanwhile is never silently undone.
 */
export function useOrderAction() {
  const queryClient = useQueryClient()

  function refresh(order: OwnerOrder) {
    queryClient.setQueryData(ownerOrderKeys.detail(order.id), order)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: [...ownerOrderKeys.all, 'list'] }),
      queryClient.invalidateQueries({ queryKey: ownerOrderKeys.pendingCount }),
      queryClient.invalidateQueries({ queryKey: ownerOrderKeys.invoice(order.id) }),
      // Rejecting, cancelling and moving an order frees its place in a pickup slot.
      queryClient.invalidateQueries({ queryKey: checkoutKeys.availabilityAll }),
    ])
  }

  return useMutation({
    mutationFn: async ({ action, seen }: OrderActionVariables) => {
      if (REPLACING.includes(action.type)) {
        const fresh = await getOrder(seen.id)
        if (hasChanged(seen, fresh)) throw new OrderChangedError(fresh, null)
      }
      try {
        return await send(seen.id, action)
      } catch (error) {
        // A field error is about what the Owner typed, not about the order.
        const aboutTheOrder =
          isApiError(error) &&
          (error.status === 400 || error.status === 409) &&
          error.fieldErrors.length === 0
        if (aboutTheOrder) {
          const fresh = await getOrder(seen.id).catch(() => null)
          if (fresh && hasChanged(seen, fresh)) throw new OrderChangedError(fresh, error)
        }
        throw error
      }
    },
    onSuccess: (order) => refresh(order),
    onError: (error) => {
      if (error instanceof OrderChangedError) return refresh(error.order)
    },
  })
}
