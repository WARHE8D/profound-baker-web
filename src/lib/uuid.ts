const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

/**
 * True for a UUID in its usual 8-4-4-4-12 form. The backend answers a malformed id in a path or
 * query with 400, so URLs check ids with this before calling it.
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID.test(value)
}
