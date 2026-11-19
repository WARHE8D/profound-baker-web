import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button, EmptyState } from '@/components'
import { NotFoundPage } from './NotFoundPage'

/**
 * Route-level error boundary: a crash in one page shows this inside the layout, so the header and
 * navigation keep working. The request id from API errors is added once ApiError exists (S1.2).
 */
export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />

  const detail = import.meta.env.DEV && error instanceof Error ? error.message : undefined

  return (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        icon="🍞"
        title="Something went wrong"
        description={
          <>
            This page hit an unexpected problem. Reloading usually fixes it.
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
