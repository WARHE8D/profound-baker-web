import { isApiError } from '@/api'

/** A failed action's message, with the request id that finds it in the server's logs. */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {isApiError(error) ? error.message : 'Something went wrong. Please try again.'}
      {isApiError(error) && error.requestId && (
        <span className="block text-xs text-muted">
          Reference: <code className="font-mono select-all">{error.requestId}</code>
        </span>
      )}
    </p>
  )
}
