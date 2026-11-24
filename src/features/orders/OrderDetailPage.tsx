import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Mail, Pencil, Phone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { isApiError } from '@/api'
import {
  ActionError,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  useToast,
} from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from '@/features/invoices/invoices-list'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { LinesEditor } from './LinesEditor'
import { OrderChangedError, orderChangedToast, useOrderAction } from './order-actions'
import {
  canEditContents,
  canReschedule,
  mayHaveInvoice,
  NOTES_MAX,
  transitionsFor,
  type Transition,
} from './order-detail'
import {
  formatRemaining,
  pendingDeadline,
  STATUS_LABELS,
  STATUS_TONES,
  type OwnerOrder,
} from './orders-list'
import { orderInvoiceQuery, ownerOrderQuery } from './owner-queries'
import { ReasonDialog } from './ReasonDialog'
import { RescheduleDialog } from './RescheduleDialog'
import { StatusTimeline } from './StatusTimeline'

/** What the orders list passes along, so "Back" returns to the same filters. */
export type OrderLinkState = { listSearch?: string }

/** `/owner/orders/:orderId`: one order, with the actions its status allows. */
export function OrderDetailPage() {
  const orderId = useParams().orderId ?? ''
  const order = useQuery(ownerOrderQuery(orderId))
  const bakery = useQuery(bakeryQuery())
  const listSearch = (useLocation().state as OrderLinkState | null)?.listSearch ?? ''
  const back = `/owner/orders${listSearch ? `?${listSearch}` : ''}`

  let content: ReactNode
  if (isApiError(order.error) && (order.error.status === 404 || order.error.status === 400)) {
    content = (
      <EmptyState
        level={1}
        icon="🔎"
        title="Order not found"
        description="It may have been mistyped, or the link is out of date."
        action={<ButtonLink to={back}>Back to orders</ButtonLink>}
      />
    )
  } else if (order.data && bakery.data) {
    content = <OrderDetail order={order.data} zone={bakery.data.timeZone} />
  } else if (order.isError || bakery.isError) {
    const failed = order.isError ? order : bakery
    content = (
      <ErrorState
        level={1}
        error={failed.error}
        title="We couldn't load this order"
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    )
  } else {
    content = (
      <div className="flex justify-center py-12">
        <Spinner label="Loading the order" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={back}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-text"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All orders
      </Link>
      {content}
    </div>
  )
}

/** The buttons for each status change, most likely first. */
const TRANSITION_BUTTONS: Record<
  Transition,
  { label: string; variant: 'primary' | 'secondary' | 'danger'; done: string }
> = {
  confirm: { label: 'Confirm order', variant: 'primary', done: 'Order confirmed' },
  reject: { label: 'Reject…', variant: 'danger', done: 'Order rejected' },
  'start-preparation': {
    label: 'Start preparing',
    variant: 'primary',
    done: 'Preparation started',
  },
  fulfill: { label: 'Mark picked up', variant: 'primary', done: 'Marked as picked up' },
  cancel: { label: 'Cancel order…', variant: 'danger', done: 'Order cancelled' },
}

/** What each status asks of the Owner next. */
const STATUS_HINTS: Record<OwnerOrder['status'], string> = {
  PENDING: 'Confirm it to accept the order and issue its invoice, or reject it with a reason.',
  CONFIRMED: 'Accepted. Start preparing it when you begin, or mark it picked up.',
  IN_PROGRESS: 'Being prepared. Mark it picked up when the guest collects it.',
  FULFILLED: 'Picked up. Nothing more to do.',
  REJECTED: 'You turned this order down.',
  CANCELLED: 'This order was called off.',
}

function OrderDetail({ order, zone }: { order: OwnerOrder; zone: string }) {
  const { toast } = useToast()
  const action = useOrderAction()
  const now = useNow(30_000)
  const [dialog, setDialog] = useState<'reject' | 'cancel' | 'reschedule' | null>(null)
  const [editing, setEditing] = useState<'lines' | 'notes' | null>(null)
  const deadline = pendingDeadline(order, now)
  const transitions = transitionsFor(order.status)
  const editable = canEditContents(order.status)
  const running = action.isPending ? action.variables.action.type : null
  const directError = action.error instanceof OrderChangedError ? null : action.error

  function run(transition: Transition) {
    if (transition === 'reject' || transition === 'cancel') {
      action.reset()
      setDialog(transition)
      return
    }
    action.mutate(
      { action: { type: transition }, seen: order },
      {
        onSuccess: () => toast({ tone: 'success', title: TRANSITION_BUTTONS[transition].done }),
        onError: (failure) => {
          if (failure instanceof OrderChangedError) toast(orderChangedToast(failure))
        },
      },
    )
  }

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold">{order.reference}</h1>
          <Badge tone={STATUS_TONES[order.status]}>{STATUS_LABELS[order.status]}</Badge>
        </div>
        <p className="text-muted">
          {STATUS_HINTS[order.status]}
          {order.status === 'REJECTED' && order.rejectionReason && (
            <> Reason given: “{order.rejectionReason}”</>
          )}
          {order.status === 'CANCELLED' && order.cancellationReason && (
            <> Reason: “{order.cancellationReason}”</>
          )}
        </p>
        {deadline && (
          <output
            className={
              deadline.urgent
                ? 'block rounded-control bg-warning/10 px-4 py-3 text-sm font-medium text-warning'
                : 'block text-sm text-muted'
            }
          >
            {deadline.remaining === 0
              ? 'Not confirmed in time: it’s being cancelled automatically.'
              : `Cancelled automatically in ${formatRemaining(deadline.remaining)} (${formatLocal(new Date(deadline.at).toISOString(), zone, 'datetime')}) unless you confirm or reject it.`}
          </output>
        )}
        {transitions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {transitions.map((transition, index) => {
              const button = TRANSITION_BUTTONS[transition]
              return (
                <Button
                  key={transition}
                  // After the main action, the other forward ones are secondary.
                  variant={button.variant === 'primary' && index > 0 ? 'secondary' : button.variant}
                  onClick={() => run(transition)}
                  loading={running === transition}
                  disabled={action.isPending && running !== transition}
                >
                  {button.label}
                </Button>
              )
            })}
          </div>
        )}
        {dialog === null && <ActionError error={directError} />}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Section
            title="Pickup"
            action={
              canReschedule(order.status) && (
                <Button variant="secondary" size="sm" onClick={() => setDialog('reschedule')}>
                  <CalendarClock aria-hidden="true" className="size-4" />
                  Reschedule
                </Button>
              )
            }
          >
            <p className="text-lg font-medium">{formatLocal(order.pickupAt, zone, 'datetime')}</p>
          </Section>

          <Section
            title="Items"
            action={
              editable &&
              editing !== 'lines' && (
                <Button variant="secondary" size="sm" onClick={() => setEditing('lines')}>
                  <Pencil aria-hidden="true" className="size-4" />
                  Edit items
                </Button>
              )
            }
          >
            {editable && editing === 'lines' ? (
              <LinesEditor order={order} onDone={() => setEditing(null)} />
            ) : (
              <LinesTable order={order} />
            )}
          </Section>

          <Section
            title="Notes from the guest"
            action={
              editable &&
              editing !== 'notes' && (
                <Button variant="secondary" size="sm" onClick={() => setEditing('notes')}>
                  <Pencil aria-hidden="true" className="size-4" />
                  {order.notes ? 'Edit notes' : 'Add notes'}
                </Button>
              )
            }
          >
            {editable && editing === 'notes' ? (
              <NotesEditor order={order} onDone={() => setEditing(null)} />
            ) : order.notes ? (
              <p className="whitespace-pre-line">{order.notes}</p>
            ) : (
              <p className="text-sm text-muted">No notes.</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Guest">
            <GuestContact contact={order.guestContact} />
          </Section>
          <Section title="Progress">
            <StatusTimeline
              order={{ ...order, placedAt: order.createdAt }}
              zone={zone}
              audience="owner"
            />
            {order.updatedAt !== order.createdAt && (
              <p className="mt-4 text-xs text-muted">
                Last changed {formatLocal(order.updatedAt, zone, 'datetime')}
              </p>
            )}
          </Section>
          <Section title="Invoice">
            <InvoiceSummary order={order} />
          </Section>
        </div>
      </div>

      <ReasonDialog
        kind="reject"
        order={order}
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        kind="cancel"
        order={order}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
      />
      <RescheduleDialog
        order={order}
        zone={zone}
        open={dialog === 'reschedule'}
        onClose={() => setDialog(null)}
      />
    </>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function LinesTable({ order }: { order: OwnerOrder }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Items ordered</caption>
      <thead className="border-b border-border text-left text-xs text-muted">
        <tr>
          <th scope="col" className="py-2 pr-2 font-semibold">
            Item
          </th>
          <th scope="col" className="px-2 py-2 text-right font-semibold">
            Qty
          </th>
          <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">
            Unit price
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-semibold">
            Total
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {order.lines.map((line) => (
          <tr key={line.lineNo}>
            <td className="py-2 pr-2">
              {line.itemName}
              {line.itemId === null && (
                <span className="block text-xs text-muted">No longer in the catalogue</span>
              )}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{line.quantity}</td>
            <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">
              {formatMoney(line.unitPrice)}
            </td>
            <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(line.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-border font-semibold">
        <tr>
          <th scope="row" colSpan={2} className="py-2 pr-2 text-left sm:hidden">
            Subtotal
          </th>
          <th scope="row" colSpan={3} className="hidden py-2 pr-2 text-left sm:table-cell">
            Subtotal
          </th>
          <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(order.subtotal)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Edits a pending order's notes. Saving replaces them, so it's refused if the order changed. */
function NotesEditor({ order, onDone }: { order: OwnerOrder; onDone: () => void }) {
  const { toast } = useToast()
  const action = useOrderAction()
  const [seen] = useState(order)
  const [notes, setNotes] = useState(order.notes ?? '')
  const error = action.error instanceof OrderChangedError ? null : action.error
  const fieldError = isApiError(error) ? error.fieldError('notes') : undefined
  const unchanged = notes.trim() === (seen.notes ?? '')

  function save() {
    action.mutate(
      { action: { type: 'notes', notes: notes.trim() }, seen },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: 'Notes saved' })
          onDone()
        },
        onError: (failure) => {
          if (failure instanceof OrderChangedError) {
            toast(orderChangedToast(failure))
            onDone()
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Notes"
        hint={`What the guest asked for, as you agreed it. Up to ${NOTES_MAX} characters.`}
        error={fieldError}
      >
        <Textarea
          rows={4}
          value={notes}
          maxLength={NOTES_MAX}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      {!fieldError && <ActionError error={error} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={action.isPending}>
          Discard changes
        </Button>
        <Button onClick={save} disabled={unchanged} loading={action.isPending}>
          Save notes
        </Button>
      </div>
    </div>
  )
}

function GuestContact({ contact }: { contact: OwnerOrder['guestContact'] }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <dt className="sr-only">Name</dt>
      <dd className="font-medium">{contact.name}</dd>
      <dt className="sr-only">Email</dt>
      <dd>
        <a
          href={`mailto:${contact.email}`}
          className="inline-flex items-center gap-2 break-all text-primary underline-offset-4 hover:underline"
        >
          <Mail aria-hidden="true" className="size-4 shrink-0" />
          {contact.email}
        </a>
      </dd>
      <dt className="sr-only">Phone</dt>
      <dd>
        <a
          href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
          className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
        >
          <Phone aria-hidden="true" className="size-4 shrink-0" />
          {contact.phone}
        </a>
      </dd>
    </dl>
  )
}

/** The invoice confirming issued; before that, when it will be. */
function InvoiceSummary({ order }: { order: OwnerOrder }) {
  const possible = mayHaveInvoice(order.status)
  const invoice = useQuery({ ...orderInvoiceQuery(order.id), enabled: possible })

  if (!possible) {
    return (
      <p className="text-sm text-muted">
        {order.status === 'PENDING'
          ? 'Issued when you confirm the order.'
          : 'None: the order was never confirmed.'}
      </p>
    )
  }
  if (invoice.isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <ActionError error={invoice.error} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void invoice.refetch()}
          loading={invoice.isFetching}
        >
          Try again
        </Button>
      </div>
    )
  }
  if (invoice.data === undefined) return <Spinner label="Loading the invoice" />
  if (invoice.data === null) {
    return <p className="text-sm text-muted">None: the order was never confirmed.</p>
  }
  const { id, number, status, total } = invoice.data
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/owner/invoices/${id}`}
          className="font-mono font-medium text-primary underline-offset-4 hover:underline"
        >
          {number}
        </Link>
        <Badge tone={INVOICE_STATUS_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
      </div>
      <span className="tabular-nums">{formatMoney(total)}</span>
    </div>
  )
}
