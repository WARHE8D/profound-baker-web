import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api'
import { checkoutKeys } from '@/features/checkout/queries'
import type { DayChange, DayOfWeek, WorkingHours } from './working-hours'

// Owner-only data: keys start with 'owner', so signing out drops them (see use-session.ts).
export const availabilityKeys = {
  workingHours: ['owner', 'working-hours'] as const,
}

export const workingHoursQuery = () =>
  queryOptions({
    queryKey: availabilityKeys.workingHours,
    queryFn: ({ signal }) => unwrap(api.GET('/api/availability/working-hours', { signal })),
  })

export type DayResult = { day: DayOfWeek; error: unknown }
export type SaveResult = {
  /** Only the days that failed, with why. */
  failed: DayResult[]
  /** The week as the server now has it. */
  hours: WorkingHours[]
}

function applyChange(change: DayChange): Promise<unknown> {
  const params = { path: { dayOfWeek: change.day } }
  return change.kind === 'close'
    ? unwrap(api.DELETE('/api/availability/working-hours/{dayOfWeek}', { params }))
    : unwrap(
        api.PUT('/api/availability/working-hours/{dayOfWeek}', { params, body: change.request }),
      )
}

/**
 * Saves the week's changes, one request per day (the API sets or removes a day at a time; both are
 * idempotent). Every day is attempted, so one rejected day doesn't hold back the others: the result
 * says which failed, next to the week as it now is. Guests' pickup slots are reloaded afterwards.
 */
export function useSaveWorkingHours() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: DayChange[]): Promise<SaveResult> => {
      const settled = await Promise.allSettled(changes.map(applyChange))
      const failed = changes.flatMap((change, i): DayResult[] => {
        const outcome = settled[i]!
        return outcome.status === 'rejected' ? [{ day: change.day, error: outcome.reason }] : []
      })
      const hours = await unwrap(api.GET('/api/availability/working-hours'))
      queryClient.setQueryData(availabilityKeys.workingHours, hours)
      return { failed, hours }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: checkoutKeys.availabilityAll }),
  })
}
