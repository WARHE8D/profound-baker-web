import { slotToUtc } from '@/lib/time'
import type { PaymentMethod } from './invoices-list'

/** PaymentRequest.reference's limit. */
export const REFERENCE_MAX = 200

/** A `datetime-local` value ("2026-11-20T09:05") for `instant` in `zone`. */
export function toLocalInput(instant: Date, zone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** The instant a `datetime-local` value in `zone` stands for, or null if it isn't one. */
export function fromLocalInput(value: string, zone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value)
  return match ? slotToUtc(match[1]!, match[2]!, zone) : null
}

export type PaymentForm = { method: PaymentMethod; reference: string; paidAt: string }

/** What's wrong with the form, by field; empty when it can be sent. Mirrors Invoice.markPaid. */
export function paymentProblems(form: PaymentForm, zone: string, now: number) {
  const problems: Partial<Record<keyof PaymentForm, string>> = {}
  if (form.method === 'BANK_TRANSFER' && !form.reference.trim()) {
    problems.reference = 'Enter the transfer’s reference, to match it to your bank statement.'
  }
  const paidAt = fromLocalInput(form.paidAt, zone)
  if (!paidAt) problems.paidAt = 'Enter the date and time it was paid.'
  // The input is to the minute: the current minute is fine.
  else if (Date.parse(paidAt) > now) problems.paidAt = 'A payment can’t be in the future.'
  return problems
}
