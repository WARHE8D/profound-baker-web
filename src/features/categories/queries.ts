import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type Schema } from '@/api'
import { catalogueKeys } from '@/features/catalogue/queries'

export type Category = Schema<'CategoryResponse'>

/** The server's limit on a category name. */
export const CATEGORY_NAME_MAX = 100

// Owner-only data: the key starts with 'owner', so signing out drops it (see use-session.ts).
export const categoryKeys = { all: ['owner', 'categories'] as const }

/** Every category, sorted by name (the API returns them in no particular order). */
export const ownerCategoriesQuery = () =>
  queryOptions({
    queryKey: categoryKeys.all,
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET('/api/catalogue/categories', { signal }))).toSorted(byName),
  })

export const byName = (a: Category, b: Category) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

/**
 * Writes refresh the Owner's list and the storefront's catalogue (its category filter, and the
 * category names on items).
 */
function useCategoryMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogueKeys.all }),
      ]),
  })
}

export const useCreateCategory = () =>
  useCategoryMutation((name: string) =>
    unwrap(api.POST('/api/catalogue/categories', { body: { name } })),
  )

export const useRenameCategory = () =>
  useCategoryMutation(({ id, name }: { id: string; name: string }) =>
    unwrap(api.PUT('/api/catalogue/categories/{id}', { params: { path: { id } }, body: { name } })),
  )

export const useDeleteCategory = () =>
  useCategoryMutation((id: string) =>
    unwrap(api.DELETE('/api/catalogue/categories/{id}', { params: { path: { id } } })),
  )

/**
 * Checks a name the way the server will, so most mistakes show without a round trip. Names are
 * unique ignoring case; `exceptId` is the category being renamed.
 */
export function categoryNameError(
  name: string,
  categories: readonly Category[],
  exceptId?: string,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name'
  if (trimmed.length > CATEGORY_NAME_MAX) return `Use at most ${CATEGORY_NAME_MAX} characters`
  const taken = categories.some(
    (c) =>
      c.id !== exceptId &&
      c.name.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0,
  )
  return taken ? `There’s already a category called “${trimmed}”` : null
}
