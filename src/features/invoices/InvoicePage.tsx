import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { isApiError } from '@/api'
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Spinner } from '@/components'
import { ownerOrderQuery } from '@/features/orders/owner-queries'
import { profileQuery, type OwnerProfile } from '@/features/profile/queries'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { DiscountDialog, PaymentDialog, RefundDialog } from './InvoiceDialogs'
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  type Invoice,
} from './invoices-list'
import { invoiceQuery } from './queries'

/** What the invoices list passes along, so "Back" returns to the same filters. */
export type InvoiceLinkState = { listSearch?: string }

/**
 * `/owner/invoices/:invoiceId`: the invoice as the guest would get it, ready to print, with the
 * Owner's actions (discount, payment, refund) around it. Those are left off the printout.
 */
export function InvoicePage() {
  const invoiceId = useParams().invoiceId ?? ''
  const invoice = useQuery(invoiceQuery(invoiceId))
  const profile = useQuery(profileQuery())
  const listSearch = (useLocation().state as InvoiceLinkState | null)?.listSearch ?? ''
  const back = `/owner/invoices${listSearch ? `?${listSearch}` : ''}`

  let content: ReactNode
  if (isApiError(invoice.error) && (invoice.error.status === 404 || invoice.error.status === 400)) {
    content = (
      <EmptyState
        icon="🧾"
        title="Invoice not found"
        description="It may have been mistyped, or the link is out of date."
        action={<ButtonLink to={back}>Back to invoices</ButtonLink>}
      />
    )
  } else if (invoice.data && profile.data) {
    content = <InvoiceView invoice={invoice.data} bakery={profile.data} />
  } else if (invoice.isError || profile.isError) {
    const failed = invoice.isError ? invoice : profile
    content = (
      <ErrorState
        error={failed.error}
        title="We couldn't load this invoice"
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    )
  } else {
    content = (
      <div className="flex justify-center py-12">
        <Spinner label="Loading the invoice" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={back}
        className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-text print:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All invoices
      </Link>
      {content}
    </div>
  )
}

/** What the invoice's status means, and what's left to do. */
const STATUS_HINTS: Record<Invoice['status'], string> = {
  PENDING: 'Not paid yet. Apply a discount before recording the payment, if there is one.',
  PAID: 'Paid. If you give the money back, record the refund.',
  REFUNDED: 'Paid, then refunded.',
  VOID: 'Void: the order was cancelled before it was paid. Nothing is owed.',
}

function InvoiceView({ invoice, bakery }: { invoice: Invoice; bakery: OwnerProfile }) {
  const zone = bakery.timeZone
  const [dialog, setDialog] = useState<'discount' | 'pay' | 'refund' | null>(null)
  const close = () => setDialog(null)

  return (
    <>
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold">{invoice.number}</h1>
          <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </Badge>
        </div>
        <p className="text-muted">{STATUS_HINTS[invoice.status]}</p>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'PENDING' && (
            <>
              <Button onClick={() => setDialog('pay')}>Mark paid…</Button>
              <Button variant="secondary" onClick={() => setDialog('discount')}>
                {invoice.discountAmount > 0 ? 'Change discount…' : 'Apply discount…'}
              </Button>
            </>
          )}
          {invoice.status === 'PAID' && (
            <Button variant="danger" onClick={() => setDialog('refund')}>
              Refund…
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} bakery={bakery} />

      {/* Mounted while open, so each opening starts from the invoice as it is. */}
      {dialog === 'discount' && (
        <DiscountDialog invoice={invoice} zone={zone} open onClose={close} />
      )}
      {dialog === 'pay' && <PaymentDialog invoice={invoice} zone={zone} open onClose={close} />}
      {dialog === 'refund' && <RefundDialog invoice={invoice} zone={zone} open onClose={close} />}
    </>
  )
}

/** The invoice itself: what's printed. */
function InvoiceDocument({ invoice, bakery }: { invoice: Invoice; bakery: OwnerProfile }) {
  const zone = bakery.timeZone
  const order = useQuery(ownerOrderQuery(invoice.orderId))
  const address = bakery.address

  return (
    <article
      aria-label={`Invoice ${invoice.number}`}
      className="flex flex-col gap-8 rounded-card border border-border bg-surface p-6 sm:p-10 print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-display text-2xl font-semibold text-text">{bakery.businessName}</p>
          {address && (
            <address className="text-muted not-italic">
              {address.street && <span className="block">{address.street}</span>}
              <span className="block">
                {[address.city, address.region, address.postalCode].filter(Boolean).join(' ')}
              </span>
              {address.country && <span className="block">{address.country}</span>}
            </address>
          )}
          <p className="text-muted">{[bakery.phone, bakery.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:text-right">
          <h2 className="text-2xl font-semibold">Invoice</h2>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 sm:justify-end">
            <dt className="text-muted">Number</dt>
            <dd className="font-mono">{invoice.number}</dd>
            <dt className="text-muted">Issued</dt>
            <dd>{formatLocal(invoice.issuedAt, zone, 'date')}</dd>
            <dt className="text-muted">Order</dt>
            <dd>
              <Link
                to={`/owner/orders/${invoice.orderId}`}
                className="font-mono underline-offset-4 hover:underline print:no-underline"
              >
                {invoice.orderReference}
              </Link>
            </dd>
            {order.data && (
              <>
                <dt className="text-muted">Pickup</dt>
                <dd>{formatLocal(order.data.pickupAt, zone, 'datetime')}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      {order.data && (
        <section aria-label="Billed to" className="flex flex-col gap-0.5 text-sm">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Billed to</h3>
          <p className="font-medium">{order.data.guestContact.name}</p>
          <p>{order.data.guestContact.email}</p>
          <p>{order.data.guestContact.phone}</p>
        </section>
      )}

      <table className="w-full text-sm">
        <caption className="sr-only">Items</caption>
        <thead className="border-b-2 border-text/80 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 pr-2 font-semibold">
              Item
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Qty
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Unit price
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-semibold">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {order.data ? (
            order.data.lines.map((line) => (
              <tr key={line.lineNo}>
                <td className="py-2 pr-2">{line.itemName}</td>
                <td className="px-2 py-2 text-right tabular-nums">{line.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMoney(line.unitPrice)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(line.lineTotal)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="py-3 text-muted">
                {order.isError ? "We couldn't load the order's items." : 'Loading the items…'}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="text-right tabular-nums">
          <Total label="Subtotal" amount={formatMoney(invoice.subtotal)} first />
          {invoice.discountAmount > 0 && (
            <Total label="Discount" amount={`−${formatMoney(invoice.discountAmount)}`} />
          )}
          <Total label="Total" amount={formatMoney(invoice.total)} strong />
        </tfoot>
      </table>

      <PaymentLine invoice={invoice} zone={zone} />
    </article>
  )
}

function Total({
  label,
  amount,
  first = false,
  strong = false,
}: {
  label: string
  amount: string
  first?: boolean
  strong?: boolean
}) {
  return (
    <tr className={first ? 'border-t-2 border-text/80' : undefined}>
      <th
        scope="row"
        colSpan={3}
        className={
          strong ? 'pt-2 pr-2 text-base font-semibold' : 'pt-2 pr-2 font-normal text-muted'
        }
      >
        {label}
      </th>
      <td className={strong ? 'pt-2 pl-2 text-base font-semibold' : 'pt-2 pl-2'}>{amount}</td>
    </tr>
  )
}

/** How it was settled, as printed at the bottom. */
function PaymentLine({ invoice, zone }: { invoice: Invoice; zone: string }) {
  const method = invoice.paymentMethod ? PAYMENT_METHOD_LABELS[invoice.paymentMethod] : null
  const paid =
    method && invoice.paidAt
      ? `Paid ${formatLocal(invoice.paidAt, zone, 'date')} by ${method.toLowerCase()}${invoice.paymentReference ? ` (${invoice.paymentReference})` : ''}.`
      : null

  let text: string
  if (invoice.status === 'PAID') text = paid ?? 'Paid.'
  else if (invoice.status === 'REFUNDED') {
    text = `${paid ?? 'Paid.'} Refunded ${invoice.refundedAt ? formatLocal(invoice.refundedAt, zone, 'date') : ''}.`
  } else if (invoice.status === 'VOID') text = 'Void: the order was cancelled. Nothing is owed.'
  else text = 'Payable at pickup, in cash or by bank transfer. No payment is taken online.'

  return <p className="border-t border-border pt-4 text-sm text-muted print:text-text">{text}</p>
}
