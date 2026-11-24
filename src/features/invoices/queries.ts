import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, isApiError, readPage, unwrap, type ApiError } from '@/api'
import type { ToastOptions } from '@/components'
import { ownerOrderKeys } from '@/features/orders/owner-queries'
import { addDays } from '@/lib/date'
import { slotToUtc } from '@/lib/time'
import {
  INVOICE_STATUS_LABELS,
  PAGE_SIZE,
  type Invoice,
  type InvoiceListParams,
  type PaymentMethod,
} from './invoices-list'

// Owner-only data: keys start with 'owner', so signing out drops them (see use-session.ts).
export const invoiceKeys = {
  all: ['owner', 'invoices'] as const,
  list: (params: InvoiceListParams, zone: string) =>
    [...invoiceKeys.all, 'list', params, zone] as const,
  detail: (id: string) => [...invoiceKeys.all, 'detail', id] as const,
}

/**
 * One page of invoices. Issue dates are whole days in the bakery's time zone, sent as the
 * instants the server filters on: from the start of `from` up to the start of the day after `to`.
 */
export const invoicesQuery = (params: InvoiceListParams, zone: string) =>
  queryOptions({
    queryKey: invoiceKeys.list(params, zone),
    queryFn: async ({ signal }) =>
      readPage(
        await unwrap(
          api.GET('/api/invoices', {
            params: {
              query: {
                q: params.search || undefined,
                status: params.statuses.length > 0 ? params.statuses : undefined,
                from: params.from ? slotToUtc(params.from, '00:00', zone) : undefined,
                to: params.to ? slotToUtc(addDays(params.to, 1), '00:00', zone) : undefined,
                page: params.page,
                size: PAGE_SIZE,
                sort: [`${params.sort},${params.direction}`],
              },
            },
            signal,
          }),
        ),
      ),
    placeholderData: keepPreviousData,
  })

const getInvoice = (id: string, signal?: AbortSignal) =>
  unwrap(api.GET('/api/invoices/{id}', { params: { path: { id } }, signal }))

export const invoiceQuery = (id: string) =>
  queryOptions({
    queryKey: invoiceKeys.detail(id),
    queryFn: ({ signal }) => getInvoice(id, signal),
  })

export type InvoiceAction =
  | { type: 'discount'; amount: number }
  | { type: 'pay'; method: PaymentMethod; reference: string; paidAt?: string }
  | { type: 'refund' }

function send(id: string, action: InvoiceAction): Promise<Invoice> {
  const path = { params: { path: { id } } }
  switch (action.type) {
    case 'discount':
      return unwrap(
        api.PATCH('/api/invoices/{id}/discount', { ...path, body: { amount: action.amount } }),
      )
    case 'pay':
      return unwrap(
        api.PATCH('/api/invoices/{id}/pay', {
          ...path,
          body: {
            method: action.method,
            // Empty is left out: a cash payment then has no note.
            reference: action.reference || undefined,
            // Left out: paid now, by the server's clock.
            paidAt: action.paidAt,
          },
        }),
      )
    case 'refund':
      return unwrap(api.PATCH('/api/invoices/{id}/refund', path))
  }
}

/**
 * The invoice changed after the Owner loaded it (in another tab: paid, discounted, refunded, or
 * voided by cancelling its order), so their action was refused. Holds the invoice as it is now.
 */
export class InvoiceChangedError extends Error {
  readonly invoice: Invoice
  readonly refusal: ApiError

  constructor(invoice: Invoice, refusal: ApiError) {
    super('this invoice was changed by someone else')
    this.name = 'InvoiceChangedError'
    this.invoice = invoice
    this.refusal = refusal
  }
}

/** Invoices carry no version or updatedAt: these are what an action can change. */
const hasChanged = (seen: Invoice, fresh: Invoice) =>
  fresh.status !== seen.status ||
  fresh.discountAmount !== seen.discountAmount ||
  fresh.paidAt !== seen.paidAt ||
  fresh.refundedAt !== seen.refundedAt

export function invoiceChangedToast(error: InvoiceChangedError): ToastOptions {
  return {
    tone: 'error',
    title: 'Someone else changed this invoice',
    description: `It's now ${INVOICE_STATUS_LABELS[error.invoice.status].toLowerCase()}, and shown as it is. Check it, then try again if you still need to.`,
  }
}

export type InvoiceActionVariables = { action: InvoiceAction; seen: Invoice }

/**
 * Discounts, records a payment on or refunds an invoice. A 400 without field errors (a move from
 * the wrong status) or a 409 usually means it changed under the Owner: it's loaded again and, if
 * it did change, the action fails with {@link InvoiceChangedError} holding it.
 */
export function useInvoiceAction() {
  const queryClient = useQueryClient()

  function refresh(invoice: Invoice) {
    queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice)
    queryClient.setQueryData(ownerOrderKeys.invoice(invoice.orderId), invoice)
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: [...invoiceKeys.all, 'list'] }),
      // Revenue by month counts paid invoices.
      queryClient.invalidateQueries({ queryKey: ['owner', 'dashboard'] }),
    ])
  }

  return useMutation({
    mutationFn: async ({ action, seen }: InvoiceActionVariables) => {
      try {
        return await send(seen.id, action)
      } catch (error) {
        const aboutTheInvoice =
          isApiError(error) &&
          (error.status === 400 || error.status === 409) &&
          error.fieldErrors.length === 0
        if (aboutTheInvoice) {
          const fresh = await getInvoice(seen.id).catch(() => null)
          if (fresh && hasChanged(seen, fresh)) throw new InvoiceChangedError(fresh, error)
        }
        throw error
      }
    },
    onSuccess: (invoice) => refresh(invoice),
    onError: (error) => {
      if (error instanceof InvoiceChangedError) return refresh(error.invoice)
    },
  })
}
