import { isRouteErrorResponse, useRouteError } from 'react-router'
import { isApiError } from '@/api'
import { Button, EmptyState } from '@/components'
import { NotFoundPage } from './NotFoundPage'

/**
 * Route-level error boundary: a crash in one page shows this inside the layout, so the header and
 * navigation keep working. API errors show their message and request id, which the Owner can
 * quote to find the server's logs.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  if (isApiError(error) && error.status === 404) return <NotFoundPage />

  const apiError = isApiError(error) ? error : undefined
  const detail =
    !apiError && import.meta.env.DEV && error instanceof Error ? error.message : undefined

  return (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        icon="🍞"
        title="Something went wrong"
        description={
          <>
            {apiError?.message ??
              'This page hit an unexpected problem. Reloading usually fixes it.'}
            {apiError?.requestId && (
              <span className="mt-3 block text-xs">
                Reference: <code className="font-mono select-all">{apiError.requestId}</code>
              </span>
            )}
            {detail && (
              <code className="mt-3 block rounded-control bg-surface-muted px-3 py-2 text-left text-xs break-words text-text">
                {detail}
              </code>
            )}
          </>
        }
        action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
      />
    </div>
  )
}
