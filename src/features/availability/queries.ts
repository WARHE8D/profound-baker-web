import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, readPage, unwrap, type Schema } from '@/api'
import { checkoutKeys } from '@/features/checkout/queries'
import { addDays } from '@/lib/date'
import { slotToUtc } from '@/lib/time'
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

// ---- Closed dates ----

export const blockedDateKeys = {
  all: ['owner', 'blocked-dates'] as const,
  activeOrders: (startDate: string, endDate: string, zone: string) =>
    ['owner', 'orders', 'active-during', { startDate, endDate, zone }] as const,
}

export const blockedDatesQuery = () =>
  queryOptions({
    queryKey: blockedDateKeys.all,
    queryFn: ({ signal }) => unwrap(api.GET('/api/availability/blocked-dates', { signal })),
  })

/** Orders still to be handed over: these keep their pickup time when the day is closed. */
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const

/**
 * How many active orders are due for pickup between two plain dates (both included), in the
 * bakery's time zone. Closing those days doesn't cancel them, so the Owner should know. The dates
 * are only read when it runs: a form can hold this disabled while its dates are still incomplete.
 */
export const activeOrdersDuringQuery = (startDate: string, endDate: string, zone: string) =>
  queryOptions({
    queryKey: blockedDateKeys.activeOrders(startDate, endDate, zone),
    queryFn: async ({ signal }) => {
      const from = slotToUtc(startDate, '00:00', zone)
      const to = slotToUtc(addDays(endDate, 1), '00:00', zone)
      const page = await unwrap(
        api.GET('/api/orders', {
          params: { query: { from, to, status: [...ACTIVE_STATUSES], size: 1 } },
          signal,
        }),
      )
      return readPage(page).totalElements
    },
  })

/** After any change: the list, and the days guests can pick at checkout. */
function useRefreshClosures() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: blockedDateKeys.all }),
      queryClient.invalidateQueries({ queryKey: checkoutKeys.availabilityAll }),
    ])
}

export function useSaveBlockedDate() {
  const refresh = useRefreshClosures()
  return useMutation({
    mutationFn: ({ id, request }: { id: string | null; request: Schema<'BlockedDateRequest'> }) =>
      id
        ? unwrap(
            api.PUT('/api/availability/blocked-dates/{id}', {
              params: { path: { id } },
              body: request,
            }),
          )
        : unwrap(api.POST('/api/availability/blocked-dates', { body: request })),
    onSuccess: () => refresh(),
  })
}

export function useDeleteBlockedDate() {
  const refresh = useRefreshClosures()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/availability/blocked-dates/{id}', { params: { path: { id } } })),
    onSuccess: () => refresh(),
  })
}
