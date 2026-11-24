import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { addDays, addMonths, formatPlainDate, monthWeeks } from '@/lib/date'
import { cn } from '@/lib/cn'
import type { PickupDay } from './slots'

type PickupCalendarProps = {
  /** The booking window's days, keyed by date. Dates outside it are shown but can't be chosen. */
  days: ReadonlyMap<string, PickupDay>
  /** "YYYY-MM" shown. */
  month: string
  onMonthChange: (month: string) => void
  firstMonth: string
  lastMonth: string
  selectedDate: string | null
  onSelect: (date: string) => void
}

// Any Sunday-to-Saturday week gives the weekday names in the viewer's language.
const WEEK = Array.from({ length: 7 }, (_, i) => addDays('2026-11-01', i))

/** A month of days; days with free pickup times can be chosen. */
export function PickupCalendar({
  days,
  month,
  onMonthChange,
  firstMonth,
  lastMonth,
  selectedDate,
  onSelect,
}: PickupCalendarProps) {
  const title = formatPlainDate(`${month}-01`, 'month-year')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 aria-live="polite" className="text-base font-semibold">
          {title}
        </h3>
        <div className="flex gap-1">
          <MonthButton
            label="Previous month"
            disabled={month <= firstMonth}
            onClick={() => onMonthChange(addMonths(month, -1))}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </MonthButton>
          <MonthButton
            label="Next month"
            disabled={month >= lastMonth}
            onClick={() => onMonthChange(addMonths(month, 1))}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </MonthButton>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-center">
        <caption className="sr-only">Pickup days in {title}</caption>
        <thead>
          <tr>
            {WEEK.map((date) => (
              <th key={date} scope="col" className="pb-1 text-xs font-medium text-muted">
                {formatPlainDate(date, 'weekday-short')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week) => (
            <tr key={week.find(Boolean)}>
              {week.map((date, i) => (
                <td key={date ?? `pad-${i}`} className="p-0.5">
                  {date && (
                    <DayCell
                      date={date}
                      day={days.get(date)}
                      selected={date === selectedDate}
                      onSelect={onSelect}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DayCell({
  date,
  day,
  selected,
  onSelect,
}: {
  date: string
  day: PickupDay | undefined
  selected: boolean
  onSelect: (date: string) => void
}) {
  const number = formatPlainDate(date, 'day')
  const bookable = (day?.availableCount ?? 0) > 0

  if (!day) {
    // Before the earliest possible pickup, or past the booking window.
    return (
      <span className="flex h-10 items-center justify-center text-sm text-muted">{number}</span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      disabled={!bookable}
      aria-pressed={selected}
      aria-label={`${formatPlainDate(date, 'weekday-date')}, ${describe(day)}`}
      className={cn(
        'relative flex h-10 w-full items-center justify-center rounded-control text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:text-muted/60 disabled:line-through',
        selected
          ? 'bg-primary text-primary-fg'
          : bookable && 'bg-primary/10 text-text hover:bg-primary/20',
      )}
    >
      {number}
    </button>
  )
}

function describe(day: PickupDay): string {
  if (day.closedReason) return `closed: ${day.closedReason}`
  if (day.availableCount === 0) {
    return day.slots.length > 0 ? 'fully booked' : 'no pickup times left'
  }
  return `${day.availableCount} pickup ${day.availableCount === 1 ? 'time' : 'times'} available`
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-control text-text hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
