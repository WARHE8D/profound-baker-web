import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, readPage, unwrap } from '@/api'
import { addDays } from '@/lib/date'
import { slotToUtc } from '@/lib/time'
import { PAGE_SIZE, type OrderListParams } from './orders-list'

// Owner-only data: keys start with 'owner', so signing out drops them (see use-session.ts).
export const ownerOrderKeys = {
  all: ['owner', 'orders'] as const,
  list: (params: OrderListParams, zone: string) =>
    [...ownerOrderKeys.all, 'list', params, zone] as const,
  pendingCount: ['owner', 'orders', 'pending-count'] as const,
}

/** New orders arrive while the page is open: look again this often. */
const REFRESH_MS = 60_000

/**
 * One page of the Owner's orders. Pickup dates are whole days in the bakery's time zone, sent as the
 * instants the server filters on: from the start of `from` up to the start of the day after `to`.
 */
export const ownerOrdersQuery = (params: OrderListParams, zone: string) =>
  queryOptions({
    queryKey: ownerOrderKeys.list(params, zone),
    queryFn: async ({ signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/orders', {
            params: {
              query: {
                q: params.search || undefined,
                status: params.statuses.length > 0 ? params.statuses : undefined,
                from: params.from ? slotToUtc(params.from, '00:00', zone) : undefined,
                to: params.to ? slotToUtc(addDays(params.to, 1), '00:00', zone) : undefined,
                page: params.page,
                size: PAGE_SIZE,
                sort: [`${params.sort},${params.direction}`],
              },
            },
            signal,
          }),
        ),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  })

/** How many orders wait for the Owner to confirm or reject them: the sidebar's badge. */
export const pendingCountQuery = () =>
  queryOptions({
    queryKey: ownerOrderKeys.pendingCount,
    queryFn: async ({ signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/orders', {
            params: { query: { status: ['PENDING'], size: 1 } },
            signal,
          }),
        ),
      ).totalElements,
    refetchInterval: REFRESH_MS,
  })
