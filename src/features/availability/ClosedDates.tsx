import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { isApiError } from '@/api'
import { Badge, Button, Dialog, ErrorState, Field, Input, Spinner, useToast } from '@/components'
import { formatPlainDateRange } from '@/lib/date'
import {
  blockedFieldError,
  blockedFormSchema,
  closureLength,
  describeDates,
  emptyBlockedForm,
  isClosedToday,
  nextOccurrence,
  overlapping,
  REASON_MAX,
  splitClosures,
  toBlockedForm,
  toBlockedRequest,
  type BlockedDate,
  type BlockedForm,
} from './blocked-dates'
import {
  activeOrdersDuringQuery,
  blockedDatesQuery,
  useDeleteBlockedDate,
  useSaveBlockedDate,
} from './queries'

type Problem = { message: string; requestId: string | null }

const problemOf = (error: unknown): Problem => ({
  message: isApiError(error) ? error.message : 'Something went wrong. Please try again.',
  requestId: isApiError(error) ? error.requestId : null,
})

/**
 * Days the bakery is closed on top of the weekly hours: holidays, vacations, a one-off closure.
 * `today` and `zone` are the bakery's, not the viewer's.
 */
export function ClosedDates({ today, zone }: { today: string; zone: string }) {
  const closures = useQuery(blockedDatesQuery())
  // null: closed; 'new': adding; a closure: editing it.
  const [editing, setEditing] = useState<BlockedDate | 'new' | null>(null)
  const [removing, setRemoving] = useState<BlockedDate | null>(null)

  let content
  if (closures.data) {
    const { upcoming, past } = splitClosures(closures.data, today)
    content = (
      <>
        {upcoming.length > 0 ? (
          <ul aria-label="Upcoming closed dates" className="flex flex-col divide-y divide-border">
            {upcoming.map((b) => (
              <ClosureRow
                key={b.id}
                closure={b}
                today={today}
                onEdit={() => setEditing(b)}
                onRemove={() => setRemoving(b)}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No closed dates coming up. Guests can pick any day the bakery is open.
          </p>
        )}
        {past.length > 0 && (
          <details className="group text-sm">
            <summary className="cursor-pointer text-muted hover:text-text">
              Past closed dates ({past.length})
            </summary>
            <ul
              aria-label="Past closed dates"
              className="mt-2 flex flex-col divide-y divide-border"
            >
              {past.map((b) => (
                <ClosureRow key={b.id} closure={b} today={today} onRemove={() => setRemoving(b)} />
              ))}
            </ul>
          </details>
        )}
      </>
    )
  } else if (closures.isError) {
    content = (
      <ErrorState
        error={closures.error}
        title="We couldn't load your closed dates"
        onRetry={() => void closures.refetch()}
        retrying={closures.isFetching}
      />
    )
  } else {
    content = (
      <div className="flex justify-center py-8">
        <Spinner label="Loading closed dates" />
      </div>
    )
  }

  return (
    <section
      aria-labelledby="closed-heading"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <h2 id="closed-heading" className="text-lg font-semibold">
            Closed dates
          </h2>
          <p className="text-sm text-muted">
            Holidays and days off, on top of the weekly hours. Guests can't choose these days for
            pickup.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" className="size-4" />
          Add closed dates
        </Button>
      </div>

      {content}

      {editing && (
        <ClosureDialog
          closure={editing === 'new' ? null : editing}
          others={closures.data ?? []}
          today={today}
          zone={zone}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && <RemoveClosureDialog closure={removing} onClose={() => setRemoving(null)} />}
    </section>
  )
}

function ClosureRow({
  closure: b,
  today,
  onEdit,
  onRemove,
}: {
  closure: BlockedDate
  today: string
  /** Missing for past closures: they can only be removed. */
  onEdit?: () => void
  onRemove: () => void
}) {
  const dates = describeDates(b)
  const next = b.recurringAnnually ? nextOccurrence(b, today) : null
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <CalendarOff aria-hidden="true" className="size-5 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{dates}</span>
          {b.recurringAnnually && <Badge>Every year</Badge>}
          {isClosedToday(b, today) && <Badge tone="warning">Closed today</Badge>}
        </p>
        <p className="text-sm text-muted">
          {closureLength(b)} · {b.reason?.trim() ? b.reason : 'No reason given'}
          {next && <> · next {formatPlainDateRange(next.start, next.end, 'medium-date')}</>}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${dates}`}>
            <Pencil aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Edit</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:text-danger"
          onClick={onRemove}
          aria-label={`Remove ${dates}`}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Remove</span>
        </Button>
      </div>
    </li>
  )
}

function ClosureDialog({
  closure,
  others,
  today,
  zone,
  onClose,
}: {
  closure: BlockedDate | null
  others: readonly BlockedDate[]
  today: string
  zone: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const save = useSaveBlockedDate()
  const [problem, setProblem] = useState<Problem | null>(null)
  const form = useForm<BlockedForm>({
    resolver: zodResolver(blockedFormSchema(today)),
    defaultValues: closure ? toBlockedForm(closure) : emptyBlockedForm,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, setError, setValue, getValues, control, formState } = form
  const { errors } = formState
  const values = useWatch({ control }) as BlockedForm
  const clashes = overlapping(others, values, closure?.id ?? null)

  async function submit(submitted: BlockedForm) {
    setProblem(null)
    try {
      await save.mutateAsync({ id: closure?.id ?? null, request: toBlockedRequest(submitted) })
      const dates = describeDates(submitted)
      toast({ tone: 'success', title: closure ? `Saved ${dates}` : `Closed ${dates}` })
      onClose()
    } catch (error) {
      const fieldError = isApiError(error) ? blockedFieldError(error) : null
      if (fieldError) {
        setError(
          fieldError.field,
          { type: 'server', message: fieldError.message },
          { shouldFocus: true },
        )
      } else {
        setProblem(problemOf(error))
      }
    }
  }

  const firstDay = register('startDate', {
    // A single day is the common case: the last day follows the first until it's set later.
    onChange: () => {
      const { startDate, endDate } = getValues()
      if (startDate && (!endDate || endDate < startDate)) setValue('endDate', startDate)
    },
  })

  return (
    <Dialog
      open
      onClose={() => !save.isPending && onClose()}
      title={closure ? 'Edit closed dates' : 'Add closed dates'}
      description="Guests can't choose these days for pickup."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="closure-form" loading={save.isPending}>
            {closure ? 'Save' : 'Close these days'}
          </Button>
        </>
      }
    >
      <form
        id="closure-form"
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day" required error={errors.startDate?.message}>
            <Input type="date" {...firstDay} />
          </Field>
          <Field label="Last day" required error={errors.endDate?.message}>
            <Input type="date" min={values.startDate || undefined} {...register('endDate')} />
          </Field>
        </div>
        <Field
          label="Reason"
          hint="Optional. Guests see it at checkout, e.g. “Christmas” or “Summer holiday”."
          error={errors.reason?.message}
        >
          <Input maxLength={REASON_MAX} {...register('reason')} />
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...register('recurringAnnually')}
          />
          <span>
            <span className="font-medium">Every year</span>
            <span className="block text-muted">
              Closed on the same dates every year, like a holiday.
            </span>
          </span>
        </label>

        <ActiveOrdersNotice values={values} today={today} zone={zone} />
        {clashes.length > 0 && (
          <p className="rounded-control bg-surface-muted px-4 py-3 text-sm">
            Already closed on some of these days:{' '}
            {clashes
              .map((b) => `${describeDates(b)}${b.reason ? ` (${b.reason})` : ''}`)
              .join('; ')}
            .
          </p>
        )}
        {problem && (
          <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm">
            <p>{problem.message}</p>
            {problem.requestId && (
              <p className="mt-2 text-xs text-muted">
                Reference: <code className="font-mono select-all">{problem.requestId}</code>
              </p>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Closing days doesn't cancel orders already due then: say so while the dates are chosen. */
function ActiveOrdersNotice({
  values,
  today,
  zone,
}: {
  values: BlockedForm
  today: string
  zone: string
}) {
  const valid =
    ISO_DATE.test(values.startDate) &&
    ISO_DATE.test(values.endDate) &&
    values.endDate >= values.startDate
  // For a yearly closure, the occurrence that comes next.
  const range = valid
    ? nextOccurrence({ ...values, id: '', reason: null }, today)
    : { start: '', end: '' }
  const orders = useQuery({
    ...activeOrdersDuringQuery(range.start, range.end, zone),
    enabled: valid && range.end >= today,
  })
  const count = orders.data ?? 0
  if (!valid || count === 0) return null
  return (
    <output className="block rounded-control bg-warning/15 px-4 py-3 text-sm">
      {count === 1 ? '1 order is' : `${count} orders are`} due for pickup on{' '}
      {formatPlainDateRange(range.start, range.end, 'medium-date')}. Closing these days doesn't
      cancel {count === 1 ? 'it' : 'them'}: contact the {count === 1 ? 'guest' : 'guests'} or
      reschedule from Orders.
    </output>
  )
}

function RemoveClosureDialog({ closure, onClose }: { closure: BlockedDate; onClose: () => void }) {
  const { toast } = useToast()
  const remove = useDeleteBlockedDate()
  const dates = describeDates(closure)

  async function confirm() {
    try {
      await remove.mutateAsync(closure.id)
      toast({ tone: 'success', title: `Reopened ${dates}` })
      onClose()
    } catch {
      // Shown in the dialog.
    }
  }

  return (
    <Dialog
      open
      onClose={() => !remove.isPending && onClose()}
      title="Remove these closed dates?"
      description={`${dates}${closure.reason ? ` (${closure.reason})` : ''}: guests can choose these days again wherever the weekly hours have the bakery open.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={remove.isPending}>
            Remove
          </Button>
        </>
      }
    >
      {remove.error && (
        <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm">
          <p>{problemOf(remove.error).message}</p>
          {problemOf(remove.error).requestId && (
            <p className="mt-2 text-xs text-muted">
              Reference:{' '}
              <code className="font-mono select-all">{problemOf(remove.error).requestId}</code>
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
