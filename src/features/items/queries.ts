import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  api,
  isApiError,
  postMultipart,
  readPage,
  unwrap,
  type Schema,
  type UploadProgress,
} from '@/api'
import { catalogueKeys } from '@/features/catalogue/queries'
import {
  mergeEdits,
  stateOfItem,
  toItemRequest,
  type Item,
  type ItemFormValues,
  type ItemState,
  type ItemStateKey,
} from './item-form'

export const PAGE_SIZE = 20

export type SortField = 'name' | 'category.name' | 'price' | 'leadTimeHours' | 'stockQuantity'
export type ItemListParams = {
  search: string
  categoryId: string | null
  /** null: all items; true: on the storefront; false: hidden. */
  available: boolean | null
  sort: SortField
  direction: 'asc' | 'desc'
  /** Zero-based. */
  page: number
}

// Owner-only data: keys start with 'owner', so signing out drops them (see use-session.ts).
export const itemKeys = {
  all: ['owner', 'items'] as const,
  list: (params: ItemListParams) => [...itemKeys.all, 'list', params] as const,
  detail: (id: string) => [...itemKeys.all, 'detail', id] as const,
}

/** One page of the Owner's items: every item, hidden ones included. */
export const ownerItemsQuery = (params: ItemListParams) =>
  queryOptions({
    queryKey: itemKeys.list(params),
    queryFn: async ({ signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/catalogue/items', {
            params: {
              query: {
                search: params.search || undefined,
                categoryId: params.categoryId ?? undefined,
                available: params.available ?? undefined,
                page: params.page,
                size: PAGE_SIZE,
                sort: [`${params.sort},${params.direction}`],
              },
            },
            signal,
          }),
        ),
      ),
    // Keep the current page on screen while the next one (or a new sort) loads.
    placeholderData: keepPreviousData,
  })

export const ownerItemQuery = (id: string) =>
  queryOptions({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/catalogue/items/{id}', { params: { path: { id } }, signal })),
  })

const getItem = (id: string) =>
  unwrap(api.GET('/api/catalogue/items/{id}', { params: { path: { id } } }))

const setAvailability = (id: string, available: boolean) =>
  unwrap(
    api.PATCH('/api/catalogue/items/{id}/availability', {
      params: { path: { id } },
      body: { available },
    }),
  )

/** After any write: the Owner's lists and this item, and the storefront's catalogue. */
function useRefreshItems() {
  const queryClient = useQueryClient()
  return (item?: Item) => {
    if (item) queryClient.setQueryData(itemKeys.detail(item.id), item)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: [...itemKeys.all, 'list'] }),
      queryClient.invalidateQueries({ queryKey: catalogueKeys.all }),
    ])
  }
}

export type SaveResult = {
  item: Item
  updatedElsewhere: ItemStateKey[]
  overwritten: ItemStateKey[]
}

/** The server's answer when two writes to the same item collided (optimistic locking). */
export const isConcurrencyConflict = (error: unknown) => isApiError(error) && error.status === 409

/**
 * Saves an edited item: loads it as it is now, applies only the Owner's edits (see `mergeEdits`),
 * and `PUT`s that. A 409 means another write hit the item at the same moment: reload and re-apply
 * once more before giving up. Availability has its own endpoint, called only if it changed.
 */
export function useUpdateItem(id: string) {
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: async ({ loaded, values }: { loaded: ItemState; values: ItemFormValues }) => {
      for (let attempt = 1; ; attempt += 1) {
        const fresh = await getItem(id)
        const merge = mergeEdits(loaded, stateOfItem(fresh), values)
        try {
          let item = await unwrap(
            api.PUT('/api/catalogue/items/{id}', {
              params: { path: { id } },
              body: toItemRequest(merge.state),
            }),
          )
          if (item.available !== merge.state.available) {
            item = await setAvailability(id, merge.state.available)
          }
          return { item, updatedElsewhere: merge.updatedElsewhere, overwritten: merge.overwritten }
        } catch (error) {
          if (attempt < 2 && isConcurrencyConflict(error)) continue
          throw error
        }
      }
    },
    onSuccess: ({ item }: SaveResult) => refresh(item),
  })
}

export function useCreateItem() {
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: async ({
      request,
      available,
    }: {
      request: Schema<'ItemRequest'>
      available: boolean
    }) => {
      const created = await unwrap(api.POST('/api/catalogue/items', { body: request }))
      // New items start on the storefront; hide it straight away if the Owner unticked that.
      return available ? created : setAvailability(created.id, false)
    },
    onSuccess: (item) => refresh(item),
  })
}

export function useSetAvailability() {
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      setAvailability(id, available),
    onSuccess: (item) => refresh(item),
  })
}

export type UploadImageVariables = {
  file: File
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

/**
 * Adds one photo to the item (the server appends it: the first photo stays the cover). A 409 means
 * another write hit the item at that moment (an order, another tab): send it once more.
 */
export function useUploadImage(itemId: string) {
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: async ({ file, onProgress, signal }: UploadImageVariables) => {
      for (let attempt = 1; ; attempt += 1) {
        const form = new FormData()
        form.append('file', file)
        try {
          return await postMultipart<Item>(
            `/api/catalogue/items/${encodeURIComponent(itemId)}/images/upload`,
            form,
            { onProgress, signal },
          )
        } catch (error) {
          if (attempt < 2 && isConcurrencyConflict(error)) continue
          throw error
        }
      }
    },
    onSuccess: (item) => refresh(item),
  })
}

/** Detaches a photo; the server deletes the file once nothing else shows it. */
export function useRemoveImage(itemId: string) {
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: (url: string) =>
      unwrap(
        api.DELETE('/api/catalogue/items/{id}/images', {
          params: { path: { id: itemId }, query: { url } },
        }),
      ),
    onSuccess: (item) => refresh(item),
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  const refresh = useRefreshItems()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/catalogue/items/{id}', { params: { path: { id } } })),
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: itemKeys.detail(id) })
      await refresh()
    },
  })
}
