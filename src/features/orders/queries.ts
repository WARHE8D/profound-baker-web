import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type Schema } from '@/api'

export type GuestOrder = Schema<'GuestOrderResponse'>

/**
 * The token is the guest's only credential for the order, so it lives in the query key (memory)
 * and the request path, and nowhere that is logged or shown: not in titles, errors or toasts.
 */
export const guestOrderKeys = {
  byToken: (token: string) => ['guest-order', token] as const,
}

/**
 * One guest order by its magic-link token. The bakery moves it along (confirm, prepare, fulfil), so
 * it is refetched when the guest comes back to the tab. No polling: magic-link lookups are
 * rate-limited per IP (30 per 10 minutes).
 */
export const guestOrderQuery = (token: string) =>
  queryOptions({
    queryKey: guestOrderKeys.byToken(token),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/public/orders/by-token/{token}', { params: { path: { token } }, signal }),
      ),
    refetchOnWindowFocus: true,
  })

/** Cancels the order; on success the cached order becomes the cancelled one the server returns. */
export function useCancelGuestOrder(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST('/api/public/orders/by-token/{token}/cancel', {
          params: { path: { token } },
          // An empty reason is left out; the server then records its own default.
          body: reason ? { reason } : {},
        }),
      ),
    onSuccess: (order) => queryClient.setQueryData(guestOrderKeys.byToken(token), order),
  })
}

/** Whether the guest may still cancel online at `now` (ms): the server says until when. */
export function canCancel(order: GuestOrder, now: number): boolean {
  return order.cancellableUntil !== null && now < Date.parse(order.cancellableUntil)
}
