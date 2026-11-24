import { useQuery } from '@tanstack/react-query'
import { Receipt, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import {
  Badge,
  Button,
  DateRangeFilter,
  EmptyState,
  ErrorState,
  FilterChips,
  Pagination,
  QuickViews,
  SearchInput,
  SortHeader,
  Spinner,
} from '@/components'
import { bakeryQuery } from '@/features/checkout/queries'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { useSearchUpdate } from '@/lib/use-search-update'
import type { InvoiceLinkState } from './InvoicePage'
import {
  INVOICE_SEARCH_MAX,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  INVOICE_STATUSES,
  isFiltered,
  PAYMENT_METHOD_LABELS,
  readInvoiceParams,
  type Invoice,
  type InvoiceListParams,
  type InvoiceSortField,
  type InvoiceStatus,
} from './invoices-list'
import { invoicesQuery } from './queries'

/** `/owner/invoices`: every invoice, newest first, with filters kept in the URL. */
export function InvoicesPage() {
  const bakery = useQuery(bakeryQuery())
  const zone = bakery.data?.timeZone

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Invoices</h1>
        <p className="text-muted">
          Each confirmed order gets an invoice. Record payments taken in the shop or by bank
          transfer here.
        </p>
      </div>
      {zone ? (
        <InvoicesList zone={zone} />
      ) : bakery.isError ? (
        <ErrorState
          error={bakery.error}
          title="We couldn't load your invoices"
          onRetry={() => void bakery.refetch()}
          retrying={bakery.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading invoices" />
        </div>
      )}
    </div>
  )
}

const QUICK_VIEWS = [
  { label: 'Unpaid', search: 'status=PENDING&dir=asc' },
  { label: 'Paid', search: 'status=PAID' },
  { label: 'All invoices', search: '' },
]

function InvoicesList({ zone }: { zone: string }) {
  const [search, update] = useSearchUpdate()
  const params = readInvoiceParams(search)
  const invoices = useQuery(invoicesQuery(params, zone))

  function sortBy(field: InvoiceSortField) {
    const direction = params.sort === field && params.direction === 'desc' ? 'asc' : 'desc'
    update({
      sort: field === 'number' ? 'number' : null,
      dir: direction === 'desc' ? null : 'asc',
    })
  }

  function toggleStatus(status: InvoiceStatus) {
    const next = params.statuses.includes(status)
      ? params.statuses.filter((s) => s !== status)
      : [...params.statuses, status]
    update({ status: next })
  }

  const page = invoices.data
  const clear = () => update({ q: null, status: null, from: null, to: null })

  return (
    <>
      <QuickViews views={QUICK_VIEWS} />

      <search className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <SearchInput
            label="Search invoices"
            placeholder="Invoice number or order reference"
            maxLength={INVOICE_SEARCH_MAX}
            value={params.search}
            onChange={(q) => update({ q })}
          />
          <DateRangeFilter
            label="Issued"
            from={params.from}
            to={params.to}
            onChange={(change) => update(change)}
          />
        </div>
        <FilterChips
          legend="Status"
          options={INVOICE_STATUSES}
          labels={INVOICE_STATUS_LABELS}
          selected={params.statuses}
          onToggle={toggleStatus}
        >
          {isFiltered(params) && (
            <Button variant="ghost" size="sm" onClick={clear} className="ml-auto">
              Clear filters
            </Button>
          )}
        </FilterChips>
      </search>

      {page ? (
        page.items.length === 0 ? (
          isFiltered(params) ? (
            <EmptyState
              icon={<Search className="size-8 text-muted" />}
              title="No invoices match"
              description="Try another search or dates, or clear the filters."
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Receipt className="size-8 text-muted" />}
              title="No invoices yet"
              description="An invoice is issued when you confirm an order."
            />
          )
        ) : (
          <>
            <InvoicesTable
              invoices={page.items}
              params={params}
              onSort={sortBy}
              busy={invoices.isPlaceholderData}
              zone={zone}
            />
            <Pagination
              page={page.number}
              totalPages={page.totalPages}
              total={page.totalElements}
              noun={['invoice', 'invoices']}
              onPage={(n) => update({ page: n === 0 ? null : String(n + 1) }, { keepPage: true })}
            />
          </>
        )
      ) : invoices.isError ? (
        <ErrorState
          error={invoices.error}
          title="We couldn't load your invoices"
          onRetry={() => void invoices.refetch()}
          retrying={invoices.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading invoices" />
        </div>
      )}
    </>
  )
}

type InvoicesTableProps = {
  invoices: Invoice[]
  params: InvoiceListParams
  onSort: (field: InvoiceSortField) => void
  busy: boolean
  zone: string
}

function InvoicesTable({ invoices, params, onSort, busy, zone }: InvoicesTableProps) {
  const header = (field: InvoiceSortField, label: string, className?: string) => (
    <SortHeader
      field={field}
      label={label}
      sort={params.sort}
      direction={params.direction}
      onSort={onSort}
      className={className}
    />
  )
  const sortName = params.sort === 'number' ? 'number' : 'date issued'
  const order =
    params.sort === 'number'
      ? params.direction === 'asc'
        ? 'lowest first'
        : 'highest first'
      : params.direction === 'asc'
        ? 'oldest first'
        : 'newest first'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface transition-opacity',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Invoices, sorted by {sortName}, {order}
        </caption>
        <thead className="border-b border-border bg-surface-muted/60 text-left text-xs text-muted">
          <tr>
            {header('number', 'Invoice')}
            <th scope="col" className="hidden px-4 py-2 font-semibold sm:table-cell">
              Order
            </th>
            {header('createdAt', 'Issued', 'hidden md:table-cell')}
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Total
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} zone={zone} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceRow({ invoice, zone }: { invoice: Invoice; zone: string }) {
  // The invoice's "All invoices" link comes back to these filters.
  const listSearch = useLocation().search.slice(1)
  return (
    <tr
      className={cn((invoice.status === 'VOID' || invoice.status === 'REFUNDED') && 'text-muted')}
    >
      <td className="px-4 py-3 align-top">
        <Link
          to={`/owner/invoices/${invoice.id}`}
          state={{ listSearch } satisfies InvoiceLinkState}
          className="font-mono font-medium text-text underline-offset-4 hover:underline"
        >
          {invoice.number}
        </Link>
        <span className="block text-xs text-muted sm:hidden">
          {invoice.orderReference} · {formatLocal(invoice.issuedAt, zone, 'date')}
        </span>
      </td>
      <td className="hidden px-4 py-3 align-top sm:table-cell">
        <Link
          to={`/owner/orders/${invoice.orderId}`}
          className="font-mono text-muted underline-offset-4 hover:text-text hover:underline"
        >
          {invoice.orderReference}
        </Link>
      </td>
      <td className="hidden px-4 py-3 align-top whitespace-nowrap md:table-cell">
        {formatLocal(invoice.issuedAt, zone, 'date')}
      </td>
      <td className="px-4 py-3 text-right align-top tabular-nums">
        {formatMoney(invoice.total)}
        {invoice.discountAmount > 0 && (
          <span className="block text-xs text-muted">
            {formatMoney(invoice.discountAmount)} off
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>
          {INVOICE_STATUS_LABELS[invoice.status]}
        </Badge>
        <span className="mt-1 block text-xs text-muted">{statusDetail(invoice, zone)}</span>
      </td>
    </tr>
  )
}

/** "Cash, Nov 18" for a payment; when a refund was made. */
function statusDetail(invoice: Invoice, zone: string): string | null {
  if (invoice.status === 'REFUNDED' && invoice.refundedAt) {
    return `Refunded ${formatLocal(invoice.refundedAt, zone, 'date')}`
  }
  if (invoice.status === 'PAID' && invoice.paymentMethod && invoice.paidAt) {
    return `${PAYMENT_METHOD_LABELS[invoice.paymentMethod]}, ${formatLocal(invoice.paidAt, zone, 'date')}`
  }
  return null
}
