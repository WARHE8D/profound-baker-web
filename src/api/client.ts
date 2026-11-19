import createClient, { type Middleware } from 'openapi-fetch'
import { apiBaseUrl } from './config'
import { ApiError, parseRetryAfter } from './errors'
import type { paths } from './types'

/** Longest Retry-After we wait out silently; longer waits surface as an ApiError with the wait. */
export const MAX_RATE_LIMIT_WAIT_SECONDS = 10

type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

const sleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })

/**
 * fetch with one retry on 429 when Retry-After is short. A 429 is the rate limiter rejecting the
 * request before the server handled it, so repeating it once is safe even for POSTs.
 * `globalThis.fetch` is looked up on every call (not captured once), so test mocks that patch it
 * later still apply.
 */
export async function fetchWithRateLimitRetry(
  request: Request,
  deps: { fetch?: (request: Request) => Promise<Response>; sleep?: Sleep } = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? ((r: Request) => globalThis.fetch(r))
  const wait = deps.sleep ?? sleep
  const retry = request.clone() // the body can be read only once
  const response = await doFetch(request)
  if (response.status !== 429) return response

  const seconds = parseRetryAfter(response.headers.get('Retry-After'))
  if (seconds === null || seconds > MAX_RATE_LIMIT_WAIT_SECONDS) return response
  await wait(seconds * 1000, request.signal)
  return doFetch(retry)
}

type AccessTokenProvider = () => string | null | undefined | Promise<string | null | undefined>

let accessTokenProvider: AccessTokenProvider = () => null

/**
 * Hook for owner auth (S4.1 fills it in): the client asks this for the current access token and
 * sends it as `Authorization: Bearer …`. Pass null to stop sending one (logout).
 */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider ?? (() => null)
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.headers.has('Authorization')) return undefined
    const token = await accessTokenProvider()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

/** The one API client. Paths, params and bodies are typed from the OpenAPI spec. */
export const api = createClient<paths>({
  baseUrl: apiBaseUrl,
  fetch: (request) => fetchWithRateLimitRetry(request),
})
api.use(authMiddleware)

type ApiResult = { data?: unknown; error?: unknown; response: Response }
type SuccessData<R> = R extends { data: infer D } ? D : never

/**
 * Turns an `api.GET/POST/…` call into its data, or throws an {@link ApiError}. Made for TanStack
 * Query: `queryFn: () => unwrap(api.GET('/api/public/catalogue/categories'))`.
 * Aborts (a query cancelled because the component unmounted) are re-thrown as they are.
 */
export async function unwrap<R extends ApiResult>(call: Promise<R>): Promise<SuccessData<R>> {
  let result: R
  try {
    result = await call
  } catch (error) {
    // Checked by name: the AbortError may come from another realm's DOMException class.
    if ((error as { name?: unknown } | null)?.name === 'AbortError') throw error
    throw ApiError.network(error)
  }
  if (result.error !== undefined || !result.response.ok) {
    throw ApiError.fromResponse(result.response, result.error)
  }
  return result.data as SuccessData<R>
}
