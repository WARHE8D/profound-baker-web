import { formatLocal } from '@/lib/time'
import type { GuestOrder } from './queries'

export type Step = {
  label: string
  state: 'done' | 'current' | 'upcoming' | 'stopped'
  detail?: string
}

/** Who reads the timeline: the guest, or the Owner (who is "the bakery"). */
export type Audience = 'guest' | 'owner'

/** What the timeline needs of an order; the guest and the Owner get different shapes. */
export type TimelineOrder = Pick<
  GuestOrder,
  'status' | 'placedAt' | 'rejectionReason' | 'cancellationReason'
>

const FLOWS = {
  guest: ['Order placed', 'Confirmed by the bakery', 'Being prepared', 'Picked up'],
  owner: ['Order placed', 'Confirmed', 'Being prepared', 'Picked up'],
} as const

/**
 * The step in play for each status: the one the order is waiting on (confirmation, preparation),
 * or the one under way (being prepared). A fulfilled order has none: every step is done.
 */
const CURRENT_STEP = { PENDING: 1, CONFIRMED: 2, IN_PROGRESS: 2, FULFILLED: 4 } as const

/**
 * The steps to show for an order. The API gives only the current status (no history), so a
 * rejected or cancelled order shows "placed" and then where it stopped.
 */
export function timelineSteps(
  order: TimelineOrder,
  zone: string,
  audience: Audience = 'guest',
): Step[] {
  const placed = formatLocal(order.placedAt, zone, 'datetime')

  if (order.status === 'REJECTED' || order.status === 'CANCELLED') {
    const rejected = order.status === 'REJECTED'
    return [
      { label: 'Order placed', state: 'done', detail: placed },
      {
        label: rejected
          ? audience === 'owner'
            ? 'Rejected'
            : 'Declined by the bakery'
          : 'Cancelled',
        state: 'stopped',
        detail: (rejected ? order.rejectionReason : order.cancellationReason) ?? undefined,
      },
    ]
  }

  const current = CURRENT_STEP[order.status]
  return FLOWS[audience].map((label, index): Step => {
    // CONFIRMED and IN_PROGRESS share a current step; an order being prepared is past "confirmed".
    const done = index < current
    const state = done ? 'done' : index === current ? 'current' : 'upcoming'
    return {
      label,
      state,
      detail: index === 0 ? placed : waitingDetail(order.status, index, state, audience),
    }
  })
}

/** A word on the current step, so "confirmed, not started" and "being prepared" read differently. */
function waitingDetail(
  status: GuestOrder['status'],
  index: number,
  state: Step['state'],
  audience: Audience,
) {
  if (state !== 'current') return undefined
  if (status === 'PENDING')
    return audience === 'owner' ? 'Waiting for you' : 'Waiting for the bakery'
  if (status === 'CONFIRMED' && index === 2) return 'Not started yet'
  if (status === 'IN_PROGRESS') return 'Under way'
  return undefined
}
