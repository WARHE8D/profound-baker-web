/** A page of results in the SPA's own shape, independent of how the backend nests it. */
export type Page<T> = {
  items: T[]
  /** Zero-based page index. */
  number: number
  size: number
  totalElements: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
}

type PageMeta = {
  number?: number
  size?: number
  totalElements?: number
  totalPages?: number
}

/**
 * What list endpoints return. Today: Spring Data's default `Page` JSON, with the counts at the top
 * level. Planned: `content` plus a `page { number, size, totalElements, totalPages }` object. Both
 * are accepted, so switching the backend needs no SPA change.
 */
export type SpringPage<T> = PageMeta & { content?: T[]; page?: PageMeta }

/** Reads any list response into a {@link Page}. Always use this instead of reading fields directly. */
export function readPage<T>(raw: SpringPage<T>): Page<T> {
  const items = raw.content ?? []
  const meta = raw.page ?? raw
  const number = meta.number ?? 0
  const size = meta.size ?? items.length
  const totalElements = meta.totalElements ?? items.length
  const totalPages = meta.totalPages ?? (size > 0 ? Math.ceil(totalElements / size) : 0)
  return {
    items,
    number,
    size,
    totalElements,
    totalPages,
    hasPrevious: number > 0,
    hasNext: number + 1 < totalPages,
  }
}
