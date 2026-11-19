import type { ReactNode } from 'react'
import { isApiError } from '@/api'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

type ErrorStateProps = {
  /** Usually a query's `error`. An ApiError shows its message and request id. */
  error: unknown
  title?: ReactNode
  /** Shows a "Try again" button. */
  onRetry?: () => void
  /** The retry is running: the button shows a spinner. */
  retrying?: boolean
  className?: string
}

/**
 * A failed load, shown in place of the content. The request id lets the Owner (or a guest talking
 * to them) find the failed request in the server's logs.
 */
export function ErrorState({
  error,
  title = "We couldn't load this",
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  const apiError = isApiError(error) ? error : undefined

  return (
    <div role="alert" className={className}>
      <EmptyState
        icon="🥖"
        title={title}
        description={
          <>
            {apiError?.message ?? 'Something went wrong. Please try again.'}
            {apiError?.requestId && (
              <span className="mt-3 block text-xs">
                Reference: <code className="font-mono select-all">{apiError.requestId}</code>
              </span>
            )}
          </>
        }
        action={
          onRetry && (
            <Button variant="secondary" onClick={onRetry} loading={retrying}>
              Try again
            </Button>
          )
        }
      />
    </div>
  )
}
