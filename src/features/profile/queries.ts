import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type Schema } from '@/api'

export type OwnerProfile = Schema<'OwnerProfileResponse'>

// Owner-only data: the key starts with 'owner', so signing out drops it (see use-session.ts).
export const profileKeys = { profile: ['owner', 'profile'] as const }

/** The Owner's own profile, including the bakery's time zone every owner page shows times in. */
export const profileQuery = () =>
  queryOptions({
    queryKey: profileKeys.profile,
    queryFn: ({ signal }) => unwrap(api.GET('/api/owner/profile', { signal })),
    staleTime: 5 * 60_000,
  })

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Schema<'OwnerProfileRequest'>) =>
      unwrap(api.PUT('/api/owner/profile', { body })),
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileKeys.profile, profile)
      // The name and time zone show up all over the app (the sidebar, the storefront's bakery
      // details, every pickup time), so mark everything stale: what's on screen refetches now,
      // the rest the next time it's shown.
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'owner' || query.queryKey[1] !== 'profile',
      })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: Schema<'ChangePasswordRequest'>) =>
      unwrap(api.POST('/api/owner/password', { body })),
  })
}
