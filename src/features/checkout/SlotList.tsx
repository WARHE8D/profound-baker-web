import { formatPlainDate } from '@/lib/date'
import { cn } from '@/lib/cn'
import { formatSlotTime } from '@/lib/time'
import type { PickupDay, PickupSlot } from './slots'

type SlotListProps = {
  day: PickupDay
  /** The chosen slot's startsAt. */
  value: string | null
  onChange: (slot: PickupSlot) => void
}

/** The chosen day's pickup times as radio buttons; full ones are shown but can't be picked. */
export function SlotList({ day, value, onChange }: SlotListProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-base font-semibold">
        Pickup times on {formatPlainDate(day.date, 'weekday-date')}
      </legend>
      <ul className="grid grid-cols-2 gap-2">
        {day.slots.map((slot) => {
          const id = `slot-${slot.startsAt}`
          return (
            <li key={slot.startsAt}>
              <input
                type="radio"
                id={id}
                name="pickup-slot"
                value={slot.startsAt}
                checked={slot.startsAt === value}
                disabled={!slot.available}
                onChange={() => onChange(slot)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer flex-col items-center rounded-control border border-border bg-surface px-2 py-2 text-center transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:border-primary',
                  'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-fg',
                  'peer-disabled:cursor-not-allowed peer-disabled:bg-surface-muted peer-disabled:text-muted peer-disabled:hover:border-border',
                )}
              >
                {/* Each time stays on one line; a narrow cell breaks only at the dash. */}
                <span className="text-[0.8125rem] font-semibold tabular-nums sm:text-sm">
                  <span className="whitespace-nowrap">{formatSlotTime(slot.startTime)}</span> –{' '}
                  <span className="whitespace-nowrap">{formatSlotTime(slot.endTime)}</span>
                </span>
                <span className="text-xs opacity-80">{remaining(slot)}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

function remaining(slot: PickupSlot): string {
  if (!slot.available) return 'Full'
  return `${slot.remainingCapacity} ${slot.remainingCapacity === 1 ? 'place' : 'places'} left`
}
