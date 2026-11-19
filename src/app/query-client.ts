import { QueryClient } from '@tanstack/react-query'

const MAX_RETRIES = 2

/** HTTP status of an error, if it carries one (ApiError from S1.2 will). */
function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error as { status: unknown }
    if (typeof status === 'number') return status
  }
  return undefined
}

/**
 * Retry network failures and 5xx a couple of times; never retry a 4xx. A 4xx is the request's
 * fault (bad input, not signed in, not found, conflict, rate-limited) and retrying cannot fix it.
 * 429 Retry-After handling lives in the HTTP client (S1.2).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = statusOf(error)
  if (status !== undefined && status >= 400 && status < 500) return false
  return failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Catalogue and availability change rarely within a visit; avoid refetch storms.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Writes are never retried automatically: a timeout may still have succeeded on the server.
        retry: false,
      },
    },
  })
}
