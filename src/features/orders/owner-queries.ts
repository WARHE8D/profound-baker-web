import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, isApiError, readPage, unwrap } from '@/api'
import { addDays } from '@/lib/date'
import { slotToUtc } from '@/lib/time'
import { PAGE_SIZE, type OrderListParams } from './orders-list'

// Owner-only data: keys start with 'owner', so signing out drops them (see use-session.ts).
export const ownerOrderKeys = {
  all: ['owner', 'orders'] as const,
  list: (params: OrderListParams, zone: string) =>
    [...ownerOrderKeys.all, 'list', params, zone] as const,
  pendingCount: ['owner', 'orders', 'pending-count'] as const,
  detail: (id: string) => ['owner', 'orders', 'detail', id] as const,
  invoice: (orderId: string) => ['owner', 'orders', 'invoice', orderId] as const,
  orderableItems: ['owner', 'orders', 'orderable-items'] as const,
}

export const getOrder = (id: string, signal?: AbortSignal) =>
  unwrap(api.GET('/api/orders/{id}', { params: { path: { id } }, signal }))

/** One order, as the Owner sees it. Others change it too (the auto-cancel job, a guest). */
export const ownerOrderQuery = (id: string) =>
  queryOptions({
    queryKey: ownerOrderKeys.detail(id),
    queryFn: ({ signal }) => getOrder(id, signal),
    refetchInterval: REFRESH_MS,
  })

/** The order's invoice, issued when it was confirmed; null if it has none (the server's 404). */
export const orderInvoiceQuery = (orderId: string) =>
  queryOptions({
    queryKey: ownerOrderKeys.invoice(orderId),
    queryFn: async ({ signal }) => {
      try {
        return await unwrap(
          api.GET('/api/orders/{orderId}/invoice', { params: { path: { orderId } }, signal }),
        )
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null
        throw error
      }
    },
  })

/** The most items one request lists (the server caps page size at 100). */
export const ORDERABLE_ITEMS_LIMIT = 100

/** Items the Owner can add to an order: those on the storefront, by name. */
export const orderableItemsQuery = () =>
  queryOptions({
    queryKey: ownerOrderKeys.orderableItems,
    queryFn: async ({ signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/catalogue/items', {
            params: {
              query: { available: true, page: 0, size: ORDERABLE_ITEMS_LIMIT, sort: ['name,asc'] },
            },
            signal,
          }),
        ),
      ).items,
  })

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
