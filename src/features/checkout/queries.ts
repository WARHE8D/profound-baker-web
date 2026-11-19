import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api'

export const checkoutKeys = {
  bakery: ['bakery'] as const,
  availability: (from: string, to: string) => ['availability', { from, to }] as const,
}

/** The bakery's name, contact details and time zone. Changes almost never. */
export const bakeryQuery = () =>
  queryOptions({
    queryKey: checkoutKeys.bakery,
    queryFn: ({ signal }) => unwrap(api.GET('/api/public/bakery', { signal })),
    staleTime: 60 * 60_000,
  })

/**
 * Pickup availability for an inclusive date range of at most 62 days. Capacity changes as other
 * guests book, so it is refetched whenever the picker mounts and every minute while it is open.
 */
export const availabilityQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: checkoutKeys.availability(from, to),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/public/availability', { params: { query: { from, to } }, signal })),
    staleTime: 0,
    refetchInterval: 60_000,
  })
