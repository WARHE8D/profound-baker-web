import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ErrorState, Spinner } from '@/components'
import { loginPath } from './redirect'
import { session } from './session'
import { useSession } from './use-session'

/**
 * Lets only a signed-in Owner through. A stored session is restored first (page reload); without
 * one, it goes to the login page, which comes back here afterwards.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const state = useSession()
  const location = useLocation()
  const [restoreError, setRestoreError] = useState<unknown>(null)

  useEffect(() => {
    if (state.status === 'unknown') session.restore().catch(setRestoreError)
  }, [state.status])

  function retry() {
    setRestoreError(null)
    session.restore().catch(setRestoreError)
  }

  if (state.status === 'signedIn') return children

  if (state.status === 'signedOut') {
    // After an explicit sign-out (here or in another tab), start over from the dashboard.
    const from = state.ended === 'signedOut' ? null : `${location.pathname}${location.search}`
    return <Navigate to={loginPath(from)} replace state={{ ended: state.ended }} />
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      {restoreError ? (
        <ErrorState error={restoreError} title="We couldn't check your session" onRetry={retry} />
      ) : (
        <Spinner label="Checking your session…" />
      )}
    </div>
  )
}
