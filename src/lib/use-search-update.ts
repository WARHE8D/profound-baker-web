import { useSearchParams } from 'react-router'

export type SearchChanges = Record<string, string | string[] | null>

/**
 * A list page's filters, sort and page live in the URL. Returns the current params and `update`,
 * which sets some of them (null or '' removes one; an array sets it several times) and, unless
 * told otherwise, goes back to page 1. It replaces the history entry: filtering isn't navigation.
 */
export function useSearchUpdate() {
  const [search, setSearch] = useSearchParams()

  function update(changes: SearchChanges, { keepPage = false } = {}) {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          next.delete(key)
          for (const v of Array.isArray(value) ? value : [value]) {
            if (v !== null && v !== '') next.append(key, v)
          }
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  return [search, update] as const
}
