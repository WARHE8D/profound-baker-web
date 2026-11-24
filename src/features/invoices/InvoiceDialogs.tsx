import { useState } from 'react'
import { isApiError } from '@/api'
import { ActionError, Button, Dialog, Field, Input, Textarea, useToast } from '@/components'
import { cn } from '@/lib/cn'
import { formatMoney, parseMoney } from '@/lib/money'
import { formatLocal } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from './invoices-list'
import {
  fromLocalInput,
  paymentProblems,
  REFERENCE_MAX,
  toLocalInput,
  type PaymentForm,
} from './payment'
import { InvoiceChangedError, invoiceChangedToast, useInvoiceAction } from './queries'

type DialogProps = { invoice: Invoice; zone: string; open: boolean; onClose: () => void }

/** The mutation, closing on success or when the invoice turned out to have changed. */
function useDialogAction(onClose: () => void) {
  const { toast } = useToast()
  const action = useInvoiceAction()
  const error = action.error instanceof InvoiceChangedError ? null : action.error

  function close() {
    if (action.isPending) return
    action.reset()
    onClose()
  }

  function run(variables: Parameters<typeof action.mutate>[0], done: string) {
    action.mutate(variables, {
      onSuccess: () => {
        action.reset()
        onClose()
        toast({ tone: 'success', title: done })
      },
      onError: (failure) => {
        if (failure instanceof InvoiceChangedError) {
          action.reset()
          onClose()
          toast(invoiceChangedToast(failure))
        }
      },
    })
  }

  return { action, error, close, run }
}

/** Sets the discount: an amount off the subtotal, at most all of it; zero removes it. */
export function DiscountDialog({ invoice, open, onClose }: DialogProps) {
  const { action, error, close, run } = useDialogAction(onClose)
  const [text, setText] = useState(
    invoice.discountAmount > 0 ? invoice.discountAmount.toFixed(2) : '',
  )
  const [touched, setTouched] = useState(false)

  const amount = text.trim() === '' ? 0 : parseMoney(text)
  const problem =
    amount === null
      ? 'Enter an amount, like 2.50.'
      : amount > invoice.subtotal
        ? `At most the subtotal, ${formatMoney(invoice.subtotal)}.`
        : null
  const fieldError = isApiError(error) ? error.fieldError('amount') : undefined

  function submit() {
    setTouched(true)
    if (problem || amount === null) return
    run(
      { action: { type: 'discount', amount }, seen: invoice },
      amount === 0 ? 'Discount removed' : `Discount of ${formatMoney(amount)} applied`,
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Discount on ${invoice.number}`}
      description={`Subtotal ${formatMoney(invoice.subtotal)}. The discount replaces any given before; 0 removes it.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={action.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={action.isPending}>
            Apply discount
          </Button>
        </>
      }
    >
      <Field
        label="Amount off"
        hint={
          amount !== null && !problem
            ? `New total ${formatMoney(Math.round((invoice.subtotal - amount) * 100) / 100)}`
            : undefined
        }
        error={(touched && problem) || fieldError}
      >
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="w-40 tabular-nums"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {[5, 10, 20].map((percent) => (
          <Button
            key={percent}
            variant="secondary"
            size="sm"
            onClick={() => setText((Math.round(invoice.subtotal * percent) / 100).toFixed(2))}
          >
            {percent}%
          </Button>
        ))}
      </div>
      {!fieldError && <ActionError error={error} />}
    </Dialog>
  )
}

/** Records a payment taken outside the app: cash or a bank transfer, when it was paid. */
export function PaymentDialog({ invoice, zone, open, onClose }: DialogProps) {
  const { action, error, close, run } = useDialogAction(onClose)
  const [openedAt] = useState(() => toLocalInput(new Date(), zone))
  const [form, setForm] = useState<PaymentForm>({
    method: 'CASH',
    reference: '',
    paidAt: openedAt,
  })
  const [touched, setTouched] = useState(false)
  const now = useNow(30_000)
  const problems = touched ? paymentProblems(form, zone, now) : {}
  const serverError = (field: string) => (isApiError(error) ? error.fieldError(field) : undefined)
  const fieldErrors = ['method', 'reference', 'paidAt'].some((f) => serverError(f))

  function submit() {
    setTouched(true)
    if (Object.keys(paymentProblems(form, zone, Date.now())).length > 0) return
    run(
      {
        action: {
          type: 'pay',
          method: form.method,
          reference: form.reference.trim(),
          // Untouched: paid now, by the server's clock.
          paidAt: form.paidAt === openedAt ? undefined : fromLocalInput(form.paidAt, zone)!,
        },
        seen: invoice,
      },
      `${invoice.number} marked paid`,
    )
  }

  const methods: PaymentMethod[] = ['CASH', 'BANK_TRANSFER']

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Record payment for ${invoice.number}`}
      description={`${formatMoney(invoice.total)} due. Once paid, the discount can't be changed.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={action.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={action.isPending}>
            Mark paid
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Paid by</legend>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((method) => (
            <label
              key={method}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                form.method === method
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="payment-method"
                className="accent-primary"
                checked={form.method === method}
                onChange={() => setForm({ ...form, method })}
              />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label={form.method === 'BANK_TRANSFER' ? 'Transfer reference' : 'Note (optional)'}
        required={form.method === 'BANK_TRANSFER'}
        hint={
          form.method === 'BANK_TRANSFER'
            ? 'As it appears on your bank statement.'
            : 'For example, who took the payment.'
        }
        error={problems.reference ?? serverError('reference')}
      >
        <Textarea
          rows={2}
          maxLength={REFERENCE_MAX}
          value={form.reference}
          onChange={(event) => setForm({ ...form, reference: event.target.value })}
        />
      </Field>
      <Field label="Paid on" error={problems.paidAt ?? serverError('paidAt')}>
        <Input
          type="datetime-local"
          className="w-auto"
          value={form.paidAt}
          max={toLocalInput(new Date(now), zone)}
          onChange={(event) => setForm({ ...form, paidAt: event.target.value })}
        />
      </Field>
      {!fieldErrors && <ActionError error={error} />}
    </Dialog>
  )
}

/** Records that a paid invoice's money was given back. */
export function RefundDialog({ invoice, zone, open, onClose }: DialogProps) {
  const { action, error, close, run } = useDialogAction(onClose)
  const paid =
    invoice.paymentMethod && invoice.paidAt
      ? ` (${PAYMENT_METHOD_LABELS[invoice.paymentMethod].toLowerCase()}, ${formatLocal(invoice.paidAt, zone, 'date')})`
      : ''

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Refund ${invoice.number}?`}
      description={`Record that you gave back the ${formatMoney(invoice.total)} paid${paid}. Do this after the money is returned: it can't be undone.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={action.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              run({ action: { type: 'refund' }, seen: invoice }, `${invoice.number} refunded`)
            }
            loading={action.isPending}
          >
            Record refund
          </Button>
        </>
      }
    >
      <ActionError error={error} />
    </Dialog>
  )
}
