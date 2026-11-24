import { queryOptions } from '@tanstack/react-query'
import { api, unwrap } from '@/api'

/** Months of revenue the chart shows, this one included (the server's default; at most 24). */
export const REVENUE_MONTHS = 12

// Owner-only data: the key starts with 'owner', so signing out drops it (see use-session.ts).
export const dashboardKeys = {
  summary: (months: number) => ['owner', 'dashboard', 'summary', months] as const,
}

/**
 * Today's pickups, the pending count and revenue by month, all in the bakery's time zone. Orders
 * arrive and are collected while the page is open, so it's looked at again every minute.
 */
export const dashboardSummaryQuery = (months = REVENUE_MONTHS) =>
  queryOptions({
    queryKey: dashboardKeys.summary(months),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/dashboard/summary', { params: { query: { months } }, signal })),
    refetchInterval: 60_000,
  })

export const productionKeys = {
  day: (date: string) => ['owner', 'dashboard', 'production', date] as const,
}

/** What to make for one day's pickups (a "YYYY-MM-DD" in the bakery's time zone). */
export const productionQuery = (date: string) =>
  queryOptions({
    queryKey: productionKeys.day(date),
    queryFn: ({ signal }) =>
      unwrap(api.GET('/api/dashboard/production', { params: { query: { date } }, signal })),
    refetchInterval: 60_000,
  })
