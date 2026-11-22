import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { useBlocker } from 'react-router'
import { isApiError } from '@/api'
import { Button, Dialog, ErrorState, Field, Input, Select, Spinner, useToast } from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import { cn } from '@/lib/cn'
import { formatSlotTime, formatUtcOffset } from '@/lib/time'
import { useSaveWorkingHours, workingHoursQuery } from './queries'
import {
  changesBetween,
  dayFieldError,
  dayLabel,
  dayShortLabel,
  hoursFormSchema,
  planDay,
  SLOT_LENGTHS,
  toHoursForm,
  WEEK,
  type DayForm,
  type DayOfWeek,
  type DayPlan,
  type HoursForm,
  type WorkingHours,
} from './working-hours'

type Problem = { message: string; requestId: string | null }

/** `/owner/availability`: when guests can pick up orders. */
export function AvailabilityPage() {
  const hours = useQuery(workingHoursQuery())
  const bakery = useQuery(bakeryQuery())
  const zone = bakery.data?.timeZone

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Availability</h1>
        <p className="text-muted">
          When guests can pick up their orders.
          {zone && (
            <>
              {' '}
              Times are in your bakery's time zone, {zone} ({formatUtcOffset(zone)}).
            </>
          )}
        </p>
      </div>

      {hours.data ? (
        <WorkingHoursEditor hours={hours.data} />
      ) : hours.isError ? (
        <ErrorState
          error={hours.error}
          title="We couldn't load your working hours"
          onRetry={() => void hours.refetch()}
          retrying={hours.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading working hours" />
        </div>
      )}
    </div>
  )
}

const sameForm = (a: HoursForm, b: HoursForm) => JSON.stringify(a) === JSON.stringify(b)

function WorkingHoursEditor({ hours }: { hours: WorkingHours[] }) {
  const { toast } = useToast()
  const save = useSaveWorkingHours()
  const [problems, setProblems] = useState<Problem[]>([])
  /** The week as last loaded or saved: what the Owner's edits are compared with. */
  const [initial] = useState(() => toHoursForm(hours))
  const baseline = useRef(initial)
  const form = useForm<HoursForm>({
    resolver: zodResolver(hoursFormSchema),
    defaultValues: initial,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, control, formState, setError, setValue, getValues } = form
  const { isDirty, isSubmitSuccessful } = formState
  const saving = save.isPending

  // The server's week changed (another tab, a refetch) while nothing is being edited: show it.
  useEffect(() => {
    const next = toHoursForm(hours)
    if (isDirty || saving || sameForm(next, baseline.current)) return
    baseline.current = next
    form.reset(next)
  }, [hours, isDirty, saving, form])

  // Leaving with unsaved changes asks first (in-app navigation and closing the tab).
  const unsaved = isDirty && !isSubmitSuccessful && !saving
  const blocker = useBlocker(unsaved)
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  async function submit(values: HoursForm) {
    setProblems([])
    const changes = changesBetween(baseline.current, values)
    if (changes.length === 0) {
      // Only closed days' hidden settings changed: nothing the server keeps.
      form.reset(values)
      return
    }
    let result
    try {
      result = await save.mutateAsync(changes)
    } catch (error) {
      setProblems([
        {
          message: isApiError(error) ? error.message : 'Something went wrong. Please try again.',
          requestId: isApiError(error) ? error.requestId : null,
        },
      ])
      return
    }

    const saved = toHoursForm(result.hours)
    baseline.current = saved
    form.reset(saved)
    if (result.failed.length === 0) {
      toast({ tone: 'success', title: 'Working hours saved' })
      return
    }
    // Saved days now show the server's copy; failed days keep the Owner's edits, still unsaved.
    const unsavedProblems: Problem[] = []
    for (const { day, error } of result.failed) {
      setValue(`days.${day}`, values.days[day], { shouldDirty: true })
      const fieldError = isApiError(error) ? dayFieldError(error) : null
      if (fieldError) {
        setError(`days.${day}.${fieldError.field}`, { type: 'server', message: fieldError.message })
      } else {
        unsavedProblems.push({
          message: `${dayLabel(day)}: ${isApiError(error) ? error.message : 'Something went wrong.'}`,
          requestId: isApiError(error) ? error.requestId : null,
        })
      }
    }
    const names = result.failed.map(({ day }) => dayLabel(day)).join(', ')
    setProblems([
      { message: `Not saved: ${names}. The other days were saved.`, requestId: null },
      ...unsavedProblems,
    ])
  }

  /** Gives every other open day this day's hours, slot length and capacity. */
  function copyToOpenDays(from: DayOfWeek) {
    const source = getValues(`days.${from}`)
    for (const day of WEEK) {
      if (day === from || !getValues(`days.${day}.open`)) continue
      setValue(
        `days.${day}`,
        { ...source, open: true },
        { shouldDirty: true, shouldValidate: formState.isSubmitted },
      )
    }
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        aria-labelledby="hours-heading"
        className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="hours-heading" className="text-lg font-semibold">
            Working hours
          </h2>
          <p className="text-sm text-muted">
            Guests pick a pickup slot within these hours. Changes apply to new orders; orders
            already placed keep their pickup time.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="hidden gap-4 border-b border-border pb-2 text-xs font-medium tracking-wide text-muted uppercase lg:grid lg:grid-cols-[10rem_repeat(4,minmax(0,1fr))]"
        >
          <span>Day</span>
          <span>Opens</span>
          <span>Closes</span>
          <span>Slot length</span>
          <span>Orders per slot</span>
        </div>

        <ul className="flex flex-col divide-y divide-border" aria-label="Days of the week">
          {WEEK.map((day) => (
            <DayRow
              key={day}
              day={day}
              control={control}
              register={register}
              errors={formState.errors.days?.[day]}
              onCopy={() => copyToOpenDays(day)}
            />
          ))}
        </ul>

        {problems.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-control bg-danger/10 px-4 py-3 text-sm"
          >
            {problems.map((problem) => (
              <p key={problem.message}>
                {problem.message}
                {problem.requestId && (
                  <span className="mt-1 block text-xs text-muted">
                    Reference: <code className="font-mono select-all">{problem.requestId}</code>
                  </span>
                )}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" loading={saving} disabled={!isDirty}>
            Save changes
          </Button>
          {isDirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setProblems([])
                form.reset(baseline.current)
              }}
              disabled={saving}
            >
              Discard changes
            </Button>
          )}
        </div>
      </form>

      <SlotPreview control={control} />

      <Dialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to the working hours will be lost."
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </>
        }
      />
    </>
  )
}

type DayErrors = Partial<Record<keyof DayForm, { message?: string }>> | undefined

const formatLength = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h > 0 && `${h} h`, m > 0 && `${m} min`].filter(Boolean).join(' ')
}

/** The label a screen reader hears ("Monday: Opens"); sighted users see the column or field name. */
function DayFieldLabel({ day, label }: { day: DayOfWeek; label: string }) {
  return (
    <>
      {/* The space sits between the spans: one at the end of a hidden span is dropped. */}
      <span className="sr-only">{dayLabel(day)}:</span> <span className="lg:sr-only">{label}</span>
    </>
  )
}

function DayRow({
  day,
  control,
  register,
  errors,
  onCopy,
}: {
  day: DayOfWeek
  control: Control<HoursForm>
  register: UseFormRegister<HoursForm>
  errors: DayErrors
  onCopy: () => void
}) {
  const values = useWatch({ control, name: `days.${day}` })
  const plan = values.open ? planDay(values) : null
  const lengths = SLOT_LENGTHS.includes(Number(values.slotMinutes))
    ? SLOT_LENGTHS
    : [...SLOT_LENGTHS, Number(values.slotMinutes)].filter((n) => n > 0).toSorted((a, b) => a - b)

  return (
    <li className="flex flex-col gap-3 py-4 lg:grid lg:grid-cols-[10rem_repeat(4,minmax(0,1fr))] lg:items-start lg:gap-4">
      <label className="flex items-center gap-2.5 lg:h-10">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          {...register(`days.${day}.open`)}
        />
        <span className="font-medium">{dayLabel(day)}</span>
        {!values.open && <span className="text-sm text-muted">Closed</span>}
      </label>

      {values.open ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:contents">
            <Field
              label={<DayFieldLabel day={day} label="Opens" />}
              error={errors?.startTime?.message}
            >
              <Input type="time" {...register(`days.${day}.startTime`)} />
            </Field>
            <Field
              label={<DayFieldLabel day={day} label="Closes" />}
              error={errors?.endTime?.message}
            >
              <Input type="time" {...register(`days.${day}.endTime`)} />
            </Field>
            <Field
              label={<DayFieldLabel day={day} label="Slot length" />}
              error={errors?.slotMinutes?.message}
            >
              <Select {...register(`days.${day}.slotMinutes`)}>
                {lengths.map((minutes) => (
                  <option key={minutes} value={String(minutes)}>
                    {formatLength(minutes)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={<DayFieldLabel day={day} label="Orders per slot" />}
              error={errors?.capacity?.message}
            >
              <Input inputMode="numeric" {...register(`days.${day}.capacity`)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted lg:col-span-4 lg:col-start-2">
            <DaySummary plan={plan} />
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopy}
              aria-label={`Copy to other open days from ${dayLabel(day)}`}
            >
              <Copy aria-hidden="true" className="size-4" />
              Copy to other open days
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted lg:col-span-4 lg:flex lg:h-10 lg:items-center">
          Guests can't pick up orders on {dayLabel(day)}s.
        </p>
      )}
    </li>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function DaySummary({ plan }: { plan: DayPlan | null }) {
  if (!plan) return <span>Fix the hours to see the pickup slots.</span>
  const { slots, capacity, leftoverMinutes } = plan
  return (
    <span>
      {plural(slots.length, 'pickup slot', 'pickup slots')}, up to{' '}
      {plural(slots.length * capacity, 'order', 'orders')} a day
      {leftoverMinutes > 0 && (
        <span className="text-warning">
          {' '}
          · the last {leftoverMinutes} min before closing aren't a whole slot and aren't offered
        </span>
      )}
    </span>
  )
}

/** The slots guests will be offered with the settings as they stand, saved or not. */
function SlotPreview({ control }: { control: Control<HoursForm> }) {
  const days = useWatch({ control, name: 'days' })
  const plans = WEEK.map((day) => ({ day, plan: days[day].open ? planDay(days[day]) : null }))
  const firstOpen = plans.find((p) => p.plan)?.day ?? 'MONDAY'
  const [chosen, setChosen] = useState<DayOfWeek | null>(null)
  const day = chosen ?? firstOpen
  const selected = plans.find((p) => p.day === day)!
  const open = days[day].open

  const openDays = plans.filter((p) => p.plan)
  const weekSlots = openDays.reduce((sum, p) => sum + p.plan!.slots.length, 0)
  const weekOrders = openDays.reduce((sum, p) => sum + p.plan!.slots.length * p.plan!.capacity, 0)

  return (
    <section
      aria-labelledby="preview-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="preview-heading" className="text-lg font-semibold">
          Preview
        </h2>
        <p className="text-sm text-muted">
          What guests are offered at checkout, from the hours above (saved or not). Open{' '}
          {plural(openDays.length, 'day', 'days')} a week: {plural(weekSlots, 'slot', 'slots')}, up
          to {plural(weekOrders, 'order', 'orders')}.
        </p>
      </div>

      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Day to preview</legend>
        {plans.map(({ day: d, plan }) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === day}
            onClick={() => setChosen(d)}
            className={cn(
              'h-9 min-w-12 rounded-control border px-3 text-sm font-medium transition-colors',
              d === day
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-border bg-surface hover:bg-surface-muted',
              !plan && d !== day && 'text-muted line-through decoration-muted/60',
            )}
          >
            <span aria-hidden="true">{dayShortLabel(d)}</span>
            <span className="sr-only">{dayLabel(d)}</span>
          </button>
        ))}
      </fieldset>

      {!open ? (
        <p className="text-sm text-muted">Closed on {dayLabel(day)}s: no pickup slots.</p>
      ) : !selected.plan ? (
        <p className="text-sm text-muted">Fix {dayLabel(day)}'s hours to see its pickup slots.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-medium">{dayLabel(day)}</span>:{' '}
            {plural(selected.plan.slots.length, 'slot', 'slots')}, each for up to{' '}
            {plural(selected.plan.capacity, 'order', 'orders')}.
          </p>
          <ul
            aria-label={`Pickup slots on ${dayLabel(day)}`}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          >
            {selected.plan.slots.map((slot) => (
              <li
                key={slot.startTime}
                className="rounded-control border border-border px-3 py-2 text-center text-sm tabular-nums"
              >
                <span className="whitespace-nowrap">{formatSlotTime(slot.startTime)}</span> –{' '}
                <span className="whitespace-nowrap">{formatSlotTime(slot.endTime)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
