import type { Schema } from '@/api'
import type { BadgeTone, SortDirection } from '@/components'

export type Invoice = Schema<'InvoiceResponse'>
export type InvoiceStatus = Invoice['status']
export type PaymentMethod = NonNullable<Invoice['paymentMethod']>

/** In the order an invoice moves through them; VOID is an unpaid one whose order was cancelled. */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['PENDING', 'PAID', 'REFUNDED', 'VOID']

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Unpaid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  VOID: 'Void',
}

export const INVOICE_STATUS_TONES: Record<InvoiceStatus, BadgeTone> = {
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'neutral',
  VOID: 'neutral',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
}

export const PAGE_SIZE = 20
/** InvoiceService.MAX_SEARCH_LENGTH on the server. */
export const INVOICE_SEARCH_MAX = 50

/** `createdAt` is when the invoice was issued (the response calls it issuedAt). */
export type InvoiceSortField = 'createdAt' | 'number'

export type InvoiceListParams = {
  search: string
  /** Empty: every status. */
  statuses: InvoiceStatus[]
  /** Issue dates, "YYYY-MM-DD" in the bakery's time zone, both included. */
  from: string | null
  to: string | null
  sort: InvoiceSortField
  direction: SortDirection
  /** Zero-based. */
  page: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const date = (value: string | null) => (value && DATE.test(value) ? value : null)

/**
 * The list's filters, sort and page, as kept in the URL:
 * `?q=&status=PENDING&from=2026-11-01&to=2026-11-30&sort=number&dir=asc&page=2`.
 * Without a sort, the newest invoices come first.
 */
export function readInvoiceParams(search: URLSearchParams): InvoiceListParams {
  const statuses = search
    .getAll('status')
    .filter((s): s is InvoiceStatus => INVOICE_STATUSES.includes(s as InvoiceStatus))
  let from = date(search.get('from'))
  let to = date(search.get('to'))
  // The server refuses a range that ends before it starts; the dates were meant the other way.
  if (from && to && from > to) [from, to] = [to, from]
  return {
    search: (search.get('q') ?? '').slice(0, INVOICE_SEARCH_MAX),
    statuses: INVOICE_STATUSES.filter((s) => statuses.includes(s)),
    from,
    to,
    sort: search.get('sort') === 'number' ? 'number' : 'createdAt',
    direction: search.get('dir') === 'asc' ? 'asc' : 'desc',
    page: Math.max(0, (Number(search.get('page')) || 1) - 1),
  }
}

export const isFiltered = (p: InvoiceListParams) =>
  p.search !== '' || p.statuses.length > 0 || p.from !== null || p.to !== null
