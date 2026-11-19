import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, readPage, unwrap } from '@/api'

/** Items per "Show more" step. The backend caps a page at 100. */
export const CATALOGUE_PAGE_SIZE = 24

export const catalogueKeys = {
  all: ['catalogue'] as const,
  categories: () => [...catalogueKeys.all, 'categories'] as const,
  items: (categoryId: string | null) => [...catalogueKeys.all, 'items', { categoryId }] as const,
}

/** Every category, for the storefront filter. They change rarely, so they stay fresh longer. */
export const categoriesQuery = () =>
  queryOptions({
    queryKey: catalogueKeys.categories(),
    queryFn: ({ signal }) => unwrap(api.GET('/api/public/catalogue/categories', { signal })),
    staleTime: 5 * 60_000,
  })

/**
 * Available items, optionally in one category, a page at a time. The backend sorts by name, so the
 * pages line up as more are loaded.
 */
export const catalogueItemsQuery = (categoryId: string | null) =>
  infiniteQueryOptions({
    queryKey: catalogueKeys.items(categoryId),
    queryFn: async ({ pageParam, signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/public/catalogue/items', {
            params: {
              query: {
                categoryId: categoryId ?? undefined,
                page: pageParam,
                size: CATALOGUE_PAGE_SIZE,
              },
            },
            signal,
          }),
        ),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasNext ? last.number + 1 : undefined),
  })
