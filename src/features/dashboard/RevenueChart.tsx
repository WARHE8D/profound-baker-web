import { useState } from 'react'
import type { Schema } from '@/api'
import { cn } from '@/lib/cn'
import { formatMoney, formatMoneyWhole } from '@/lib/money'
import { useMediaQuery } from '@/lib/use-media-query'
import { formatMonth, niceTicks } from './revenue'

type MonthlyRevenue = Schema<'MonthlyRevenue'>

type RevenueChartProps = {
  /** Oldest first; the last is the current month. */
  months: MonthlyRevenue[]
}

/**
 * Paid revenue per month as columns: one series, so one colour and no legend (the section's title
 * names it). Each column is a button the size of its whole slot, so hovering or focusing anywhere
 * above a short bar shows its tooltip. A table view carries the same numbers.
 *
 * Phones plot the last six months only: twelve columns would be too narrow to tap (WCAG's 24 px
 * target size). The table still lists them all.
 */
export function RevenueChart({ months: all }: RevenueChartProps) {
  const wide = useMediaQuery('(min-width: 40rem)', true)
  const months = wide ? all : all.slice(-6)
  const [active, setActive] = useState<number | null>(null)
  const ticks = niceTicks(Math.max(...months.map((m) => m.revenue)))
  const top = ticks.at(-1)!
  const empty = months.every((m) => m.revenue === 0)
  const shown = active === null ? null : months[active]

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex gap-3 pt-3">
        {/* Y axis: recessive labels on the left, gridlines behind the bars. */}
        <div
          aria-hidden="true"
          className="relative h-48 w-14 shrink-0 text-right text-xs text-muted tabular-nums"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {formatMoneyWhole(tick)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-48">
            {ticks.map((tick) => (
              <span
                key={tick}
                className={cn(
                  'absolute inset-x-0 border-t',
                  tick === 0 ? 'border-border' : 'border-dashed border-border/60',
                )}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
          </div>
          <ul aria-label="Paid revenue by month" className="relative flex h-48 items-end gap-0.5">
            {months.map((month, index) => {
              const current = index === months.length - 1
              const label = `${formatMonth(month.month, { long: true })}${current ? ' so far' : ''}: ${formatMoney(month.revenue)} from ${month.paidInvoices} paid ${month.paidInvoices === 1 ? 'invoice' : 'invoices'}`
              return (
                <li key={month.month} className="flex h-full min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={label}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className="group flex h-full w-full items-end justify-center rounded-control px-[12%] focus-visible:outline-offset-0"
                  >
                    <span
                      className={cn(
                        'w-full max-w-10 rounded-t-[4px] bg-chart transition-opacity',
                        active !== null && active !== index && 'opacity-50',
                      )}
                      // A paid month always shows a sliver, so it doesn't read as no revenue.
                      style={{
                        height:
                          month.revenue > 0 ? `max(2px, ${(month.revenue / top) * 100}%)` : '0',
                      }}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
          {empty && (
            <p className="absolute inset-x-0 top-16 text-center text-sm text-muted">
              No payments recorded in these months yet.
            </p>
          )}
          {shown && (
            <output
              className={cn(
                'pointer-events-none absolute -top-2 z-10 block -translate-y-full rounded-control border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-card',
                // Near either edge, keep it inside the chart.
                active! < 2
                  ? '-translate-x-4'
                  : active! > months.length - 3
                    ? '-translate-x-[calc(100%-1rem)]'
                    : '-translate-x-1/2',
              )}
              style={{ left: `${((active! + 0.5) / months.length) * 100}%` }}
            >
              <span className="block font-semibold text-text">
                {formatMonth(shown.month, { long: true })}
                {active === months.length - 1 && ' (so far)'}
              </span>
              <span className="block text-text tabular-nums">{formatMoney(shown.revenue)}</span>
              <span className="block text-muted">
                {shown.paidInvoices} paid {shown.paidInvoices === 1 ? 'invoice' : 'invoices'}
              </span>
            </output>
          )}
          {/* X axis: every month, with the year under January and the first month. */}
          <ol aria-hidden="true" className="mt-2 flex gap-0.5 text-center text-xs text-muted">
            {months.map((month, index) => (
              <li key={month.month} className="min-w-0 flex-1 truncate">
                {/* Narrow screens get one letter a month; the table view has the full names. */}
                <span className="sm:hidden">{formatMonth(month.month).charAt(0)}</span>
                <span className="hidden sm:inline">{formatMonth(month.month)}</span>
                {(index === 0 || month.month.endsWith('-01')) && (
                  <span className="hidden text-[10px] sm:block">{month.month.slice(0, 4)}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {!wide && all.length > months.length && (
        <p className="text-xs text-muted">
          The last {months.length} months. The table has all {all.length}.
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-text">Show as a table</summary>
        <table className="mt-2 w-full max-w-md">
          <caption className="sr-only">Paid revenue by month</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="py-1.5 pr-2 font-semibold">
                Month
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                Paid invoices
              </th>
              <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {all.map((month) => (
              <tr key={month.month}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {formatMonth(month.month, { long: true })}
                </th>
                <td className="px-2 py-1.5 text-right">{month.paidInvoices}</td>
                <td className="py-1.5 pl-2 text-right">{formatMoney(month.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
