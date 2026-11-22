import { queryOptions, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { api, unwrap } from '@/api'
import { session, type SessionState } from './session'

/** The session state, re-rendering when it changes (sign-in, sign-out, another tab). */
export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState)
}

/**
 * Owner-only data uses query keys starting with 'owner' or 'auth', so signing out can drop it
 * without throwing away the public catalogue.
 */
export const authKeys = { me: ['auth', 'me'] as const }

export const meQuery = () =>
  queryOptions({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => unwrap(api.GET('/api/auth/me', { signal })),
    staleTime: Infinity,
  })

const isOwnerData = (key: readonly unknown[]) => key[0] === 'owner' || key[0] === 'auth'

/** Drops the Owner's cached data when the session ends, here or in another tab. */
export function useClearOwnerDataOnSignOut() {
  const queryClient = useQueryClient()
  const { status } = useSession()
  const previous = useRef(status)

  useEffect(() => {
    if (previous.current !== 'signedOut' && status === 'signedOut') {
      queryClient.removeQueries({ predicate: (query) => isOwnerData(query.queryKey) })
    }
    previous.current = status
  }, [status, queryClient])
}
