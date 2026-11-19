import type { Schema } from './types'

/** The backend's error body (`ApiError` in the OpenAPI spec). */
export type ApiErrorBody = Schema<'ApiError'>
export type FieldError = Schema<'FieldError'>

type ApiErrorInit = {
  status: number
  message: string
  fieldErrors?: FieldError[]
  requestId?: string | null
  retryAfterSeconds?: number | null
  path?: string | null
  cause?: unknown
}

/**
 * Every failed API call becomes one of these: an HTTP error response, or a network failure
 * (`status` 0). Show `message` to the user, `fieldErrors` next to form fields, and `requestId`
 * with the error so the Owner can quote it (it leads to the server's logs and trace).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number
  readonly fieldErrors: FieldError[]
  /** The response's X-Request-Id, when there was a response. */
  readonly requestId: string | null
  /** From Retry-After on a 429: how long to wait before trying again. */
  readonly retryAfterSeconds: number | null
  /** The API path that failed, as the server reported it. */
  readonly path: string | null

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause })
    this.status = init.status
    this.fieldErrors = init.fieldErrors ?? []
    this.requestId = init.requestId ?? null
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
    this.path = init.path ?? null
  }

  /** Builds the error from a non-2xx response and its parsed body (JSON, text or nothing). */
  static fromResponse(response: Response, body: unknown): ApiError {
    const apiBody = isApiErrorBody(body) ? body : undefined
    const retryAfterSeconds =
      response.status === 429 ? parseRetryAfter(response.headers.get('Retry-After')) : null
    return new ApiError({
      status: response.status,
      message: apiBody?.message || fallbackMessage(response.status, retryAfterSeconds),
      fieldErrors: apiBody?.fieldErrors ?? [],
      requestId: response.headers.get('X-Request-Id'),
      retryAfterSeconds,
      path: apiBody?.path ?? null,
    })
  }

  /** The request never got a response: offline, DNS, CORS, server down. */
  static network(cause: unknown): ApiError {
    return new ApiError({
      status: 0,
      message: "Can't reach SugarCrumbs right now. Check your connection and try again.",
      cause,
    })
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }

  /** The server's message for one form field, e.g. `fieldError('guestContact.email')`. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Retry-After as whole seconds from now. Accepts delta-seconds ("30") or an HTTP date; returns null
 * when the header is missing or unreadable.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  // An HTTP date always names the weekday and month; this keeps "-5" from parsing as a year.
  if (!/[a-z]/i.test(trimmed)) return null
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return null
  return Math.max(0, Math.ceil((date - now) / 1000))
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { message?: unknown }).message === 'string' &&
    typeof (body as { status?: unknown }).status === 'number'
  )
}

/** Used when the body is not an ApiError, e.g. an HTML 502 page from a proxy. */
function fallbackMessage(status: number, retryAfterSeconds: number | null): string {
  if (status === 401) return 'Please sign in again.'
  if (status === 403) return "You don't have access to this."
  if (status === 404) return "We couldn't find that."
  if (status === 409) return 'Someone else changed this first. Reload and try again.'
  if (status === 429) {
    return retryAfterSeconds === null
      ? 'Too many requests. Please wait a moment and try again.'
      : `Too many requests. Please try again in ${retryAfterSeconds} seconds.`
  }
  if (status >= 500) return 'The server had a problem. Please try again in a moment.'
  return `The request failed (HTTP ${status}).`
}
