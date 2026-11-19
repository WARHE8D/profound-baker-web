import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { api, isApiError, unwrap, type Schema } from '@/api'
import { Button, Field, Input, Textarea } from '@/components'
import type { CheckedCart } from '@/features/cart/cart-check'
import { catalogueKeys } from '@/features/catalogue/queries'
import { formatMoney } from '@/lib/money'
import { useNow } from '@/lib/use-now'
import {
  checkoutFormSchema,
  emptyCheckoutForm,
  mapServerFieldErrors,
  NOTES_MAX_LENGTH,
  toCheckoutRequest,
  type CheckoutFormInput,
  type CheckoutFormValues,
} from './checkout-form'
import { clearCheckoutDraft, loadCheckoutDraft, saveCheckoutDraft } from './checkout-draft'
import { checkoutKeys } from './queries'
import type { PickupSelection } from './SlotPicker'

const NO_PICKUP_MESSAGE = 'Choose a pickup time before placing your order.'

export type CheckoutConfirmationState = { order: Schema<'CheckoutResponse'>; zone: string }

type CheckoutFormProps = {
  cart: CheckedCart
  pickup: PickupSelection | null
  /**
   * Sends the guest back to the pickup step with a message (no slot, slot taken, too soon).
   * `focus: false` shows it without moving focus, when a form field is being focused instead.
   */
  onPickupProblem: (message: string, options?: { focus?: boolean }) => void
}

/** A problem with the whole submission, shown above the button. */
type FormProblem = { message: string; requestId: string | null }

/** Step 2: the guest's details, then placing the order. */
export function CheckoutForm({ cart, pickup, onPickupProblem }: CheckoutFormProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [problem, setProblem] = useState<FormProblem | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  // A second submit while the first is in flight would place a second order.
  const submitting = useRef(false)

  const form = useForm<CheckoutFormInput, unknown, CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: loadCheckoutDraft() ?? emptyCheckoutForm,
    // Check on submit, then again as each field changes. Not on blur: a server error on a field
    // the client thinks is fine must stay until the guest edits it.
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, setError, formState } = form
  const { errors } = formState

  const placeOrder = useMutation({
    mutationFn: (body: Schema<'CheckoutRequest'>) =>
      unwrap(api.POST('/api/public/orders', { body })),
  })

  async function submit(values: CheckoutFormValues) {
    if (submitting.current) return
    if (!pickup) {
      onPickupProblem(NO_PICKUP_MESSAGE)
      return
    }
    submitting.current = true
    setProblem(null)
    try {
      const order = await placeOrder.mutateAsync(
        toCheckoutRequest(values, pickup.slot.startsAt, cart.lines),
      )
      clearCheckoutDraft()
      const state: CheckoutConfirmationState = { order, zone: pickup.zone }
      await navigate('/checkout/confirmation', { replace: true, state })
    } catch (error) {
      handleFailure(error)
    } finally {
      submitting.current = false
    }
  }

  /** Refetches what may have changed under the guest: slot capacity and the cart's items. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: checkoutKeys.availabilityAll })
    void queryClient.invalidateQueries({ queryKey: catalogueKeys.all })
  }

  function handleFailure(error: unknown) {
    if (!isApiError(error)) {
      setProblem({ message: 'Something went wrong. Please try again.', requestId: null })
      return
    }

    if (error.status === 409) {
      // The slot filled up, or an item sold out or ran short, since the page loaded. Refreshing
      // makes the slot picker drop a taken slot and the cart flag the item.
      refresh()
      onPickupProblem(
        `Sorry, something changed while you were checking out: ${error.message}. We've refreshed the pickup times and your cart. Please check them and try again.`,
      )
      return
    }
    if (error.status === 429) {
      const seconds = error.retryAfterSeconds ?? 30
      setRetryAt(Date.now() + seconds * 1000)
      setProblem({
        message: `Too many attempts. Please wait ${seconds} seconds, then try again.`,
        requestId: error.requestId,
      })
      return
    }
    if (error.status === 400) {
      const mapped = mapServerFieldErrors(error)
      Object.entries(mapped.fields).forEach(([field, message], index) => {
        setError(
          field as keyof CheckoutFormValues,
          { type: 'server', message },
          { shouldFocus: index === 0 },
        )
      })
      if (mapped.pickup) {
        refresh()
        onPickupProblem(mapped.pickup)
      }
      const hasFieldErrors = Object.keys(mapped.fields).length > 0 || mapped.pickup !== null
      if (mapped.other.length > 0 || !hasFieldErrors) {
        // E.g. the lead-time rule, which the server reports as a message without a field.
        if (!hasFieldErrors) refresh()
        setProblem({
          message: [error.message, ...mapped.other].join('. '),
          requestId: error.requestId,
        })
      }
      return
    }
    if (error.isNetworkError) {
      setProblem({
        message:
          "We lost the connection before your order was confirmed, so it may or may not have gone through. Please check your connection and try again. If you end up with two orders, contact the bakery and they'll cancel one.",
        requestId: null,
      })
      return
    }
    setProblem({
      message: `${error.message} Your order was not placed.`,
      requestId: error.requestId,
    })
  }

  return (
    <form
      noValidate
      aria-labelledby="details-heading"
      onSubmit={(event) =>
        void handleSubmit(submit, () => {
          // Invalid details: report a missing pickup time too, so both get fixed in one go.
          if (!pickup) onPickupProblem(NO_PICKUP_MESSAGE, { focus: false })
        })(event)
      }
      onChange={() => saveCheckoutDraft(form.getValues())}
      className="flex flex-col gap-4"
    >
      <h2 id="details-heading" className="text-xl font-semibold">
        2. Your details
      </h2>
      <p className="-mt-2 text-sm text-muted">
        The bakery uses these only for this order, to confirm it or tell you about changes.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
          <Input autoComplete="name" maxLength={150} {...register('name')} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" autoComplete="email" maxLength={254} {...register('email')} />
        </Field>
        <Field label="Phone" required error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" maxLength={30} {...register('phone')} />
        </Field>
        <Field
          label="Notes for the bakery"
          hint="Optional: allergies, a message to write on a cake, anything they should know."
          error={errors.notes?.message}
          className="sm:col-span-2"
        >
          <Textarea rows={3} maxLength={NOTES_MAX_LENGTH} {...register('notes')} />
        </Field>
      </div>

      <SubmitArea
        total={cart.subtotal}
        sending={placeOrder.isPending}
        retryAt={retryAt}
        problem={problem}
      />
    </form>
  )
}

function SubmitArea({
  total,
  sending,
  retryAt,
  problem,
}: {
  total: number
  sending: boolean
  retryAt: number | null
  problem: FormProblem | null
}) {
  const now = useNow(1000)
  const waitSeconds = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000))

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {problem && (
        <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm text-text">
          <p>{problem.message}</p>
          {problem.requestId && (
            <p className="mt-2 text-xs text-muted">
              Reference: <code className="font-mono select-all">{problem.requestId}</code>
            </p>
          )}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        loading={sending}
        disabled={waitSeconds > 0}
        className="w-full sm:w-auto sm:self-end"
      >
        {sending
          ? 'Placing your order…'
          : waitSeconds > 0
            ? `Try again in ${waitSeconds} s`
            : `Place order · ${formatMoney(total)}`}
      </Button>
      <p className="text-xs text-muted sm:self-end">
        No payment is taken online. The bakery confirms your order after you place it.
      </p>
    </div>
  )
}
