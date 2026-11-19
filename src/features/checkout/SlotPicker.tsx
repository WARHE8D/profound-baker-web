import { useQuery } from '@tanstack/react-query'
import { CalendarX, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState, ErrorState, Spinner } from '@/components'
import { formatLeadTime } from '@/features/catalogue/lead-time'
import { formatPlainDate, monthOf } from '@/lib/date'
import { formatLocal } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { PickupCalendar } from './PickupCalendar'
import { availabilityQuery, bakeryQuery } from './queries'
import { SlotList } from './SlotList'
import { bookingWindow, earliestPickupMs, toPickupDays, type PickupSlot } from './slots'

export type PickupSelection = {
  /** "YYYY-MM-DD" in the bakery's zone. */
  date: string
  slot: PickupSlot
  /** The bakery's IANA time zone, for showing the slot elsewhere. */
  zone: string
}

type SlotPickerProps = {
  /** The cart's longest lead time: slots sooner than this from now are not offered. */
  leadTimeHours: number
  /** The chosen slot. `selection.slot.startsAt` (UTC) is what checkout sends as `pickupAt`. */
  value: PickupSelection | null
  onChange: (selection: PickupSelection | null) => void
}

/**
 * Pickup time: a calendar of the days with free slots, then the chosen day's slots. Everything is
 * in the bakery's time zone, whatever the guest's device says.
 */
export function SlotPicker({ leadTimeHours, value, onChange }: SlotPickerProps) {
  const bakery = useQuery(bakeryQuery())
  const zone = bakery.data?.timeZone

  if (bakery.isError) {
    return (
      <ErrorState
        error={bakery.error}
        title="We couldn't load the pickup times"
        onRetry={() => void bakery.refetch()}
        retrying={bakery.isFetching}
      />
    )
  }
  if (!zone) return <Loading />
  return (
    <ZonedSlotPicker zone={zone} leadTimeHours={leadTimeHours} value={value} onChange={onChange} />
  )
}

function ZonedSlotPicker({
  zone,
  leadTimeHours,
  value,
  onChange,
}: SlotPickerProps & { zone: string }) {
  const now = useNow()
  const earliest = earliestPickupMs(now, leadTimeHours)
  const range = bookingWindow(earliest, zone)
  const availability = useQuery(availabilityQuery(range.from, range.to))

  const days = new Map(toPickupDays(availability.data ?? [], earliest, now).map((d) => [d.date, d]))
  const firstOpen = [...days.values()].find((d) => d.availableCount > 0)?.date ?? null

  // The chosen slot filled up or became too soon on a refetch: drop it and say why.
  const chosenGone =
    value !== null &&
    availability.data !== undefined &&
    !days.get(value.date)?.slots.some((s) => s.startsAt === value.slot.startsAt && s.available)
  const [lostSlot, setLostSlot] = useState<PickupSelection | null>(null)
  if (chosenGone && lostSlot?.slot.startsAt !== value.slot.startsAt) setLostSlot(value)
  // The selection lives in the parent, so clearing it is a separate update after this render.
  useEffect(() => {
    if (chosenGone) onChange(null)
  }, [chosenGone, onChange])

  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const pickedDay = pickedDate ? days.get(pickedDate) : undefined
  const selectedDate =
    (pickedDay && pickedDay.availableCount > 0 ? pickedDate : null) ?? value?.date ?? firstOpen
  const [shownMonth, setShownMonth] = useState<string | null>(null)
  const month = shownMonth ?? monthOf(selectedDate ?? range.from)

  if (availability.isError && !availability.data) {
    return (
      <ErrorState
        error={availability.error}
        title="We couldn't load the pickup times"
        onRetry={() => void availability.refetch()}
        retrying={availability.isFetching}
      />
    )
  }
  if (!availability.data) return <Loading />
  if (firstOpen === null) {
    return (
      <EmptyState
        icon={<CalendarX className="mx-auto size-10" />}
        title="No pickup times available"
        description="Every pickup time in the next two months is taken or closed. Please check back later or contact the bakery."
      />
    )
  }

  const selectedDay = selectedDate ? days.get(selectedDate) : undefined

  return (
    <div className="flex flex-col gap-5">
      <PickupNotes zone={zone} leadTimeHours={leadTimeHours} firstOpen={firstOpen} now={now} />

      {lostSlot && (
        <p role="alert" className="rounded-control bg-warning/10 px-4 py-3 text-sm">
          The time you picked ({formatLocal(lostSlot.slot.startsAt, zone, 'datetime')}) is no longer
          available. Please choose another.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-8">
        <PickupCalendar
          days={days}
          month={month}
          onMonthChange={setShownMonth}
          firstMonth={monthOf(range.from)}
          lastMonth={monthOf(range.to)}
          selectedDate={selectedDate}
          onSelect={(date) => {
            setPickedDate(date)
            setLostSlot(null)
          }}
        />
        {selectedDay && (
          <SlotList
            day={selectedDay}
            value={value?.date === selectedDay.date ? value.slot.startsAt : null}
            onChange={(slot) => {
              setLostSlot(null)
              onChange({ date: selectedDay.date, slot, zone })
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Lead time and time-zone notes, only when they matter. */
function PickupNotes({
  zone,
  leadTimeHours,
  firstOpen,
  now,
}: {
  zone: string
  leadTimeHours: number
  /** The first day with a free slot. */
  firstOpen: string
  now: number
}) {
  const viewerZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
  const zoneName =
    new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? zone

  if (leadTimeHours <= 0 && viewerZone === zone) return null
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted">
      {leadTimeHours > 0 && (
        <li className="flex items-start gap-2">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Some items are baked to order ({formatLeadTime(leadTimeHours).toLowerCase()}), so the
            first pickup times are on{' '}
            <strong className="font-semibold text-text">
              {formatPlainDate(firstOpen, 'weekday-date')}
            </strong>
            .
          </span>
        </li>
      )}
      {viewerZone !== zone && <li>Times are in the bakery&apos;s time zone ({zoneName}).</li>}
    </ul>
  )
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted">
      <Spinner label={null} />
      <output>Loading pickup times…</output>
    </div>
  )
}
