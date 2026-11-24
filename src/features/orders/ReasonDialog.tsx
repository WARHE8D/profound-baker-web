import { useState } from 'react'
import { isApiError } from '@/api'
import { ActionError, Button, Dialog, Field, Textarea, useToast } from '@/components'
import { OrderChangedError, orderChangedToast, useOrderAction } from './order-actions'
import { REASON_MAX } from './order-detail'
import type { OwnerOrder } from './orders-list'

type ReasonDialogProps = {
  /** Reject a pending order (a reason is required), or cancel a confirmed one. */
  kind: 'reject' | 'cancel'
  order: OwnerOrder
  open: boolean
  onClose: () => void
}

const COPY = {
  reject: {
    title: 'Reject this order?',
    description:
      "The guest is told it's declined, with your reason. Its pickup time and stock are freed.",
    label: 'Reason',
    hint: 'The guest sees this.',
    keep: 'Keep order',
    submit: 'Reject order',
    done: 'Order rejected',
  },
  cancel: {
    title: 'Cancel this order?',
    description:
      'The guest is told, its pickup time and stock are freed, and its unpaid invoice is voided. This can’t be undone.',
    label: 'Reason (optional)',
    hint: 'The guest sees this.',
    keep: 'Keep order',
    submit: 'Cancel order',
    done: 'Order cancelled',
  },
} as const

export function ReasonDialog({ kind, order, open, onClose }: ReasonDialogProps) {
  const copy = COPY[kind]
  const { toast } = useToast()
  const action = useOrderAction()
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)

  const error = action.error instanceof OrderChangedError ? null : action.error
  const fieldError = isApiError(error) ? error.fieldError('reason') : undefined

  function close() {
    if (action.isPending) return
    action.reset()
    setMissing(false)
    onClose()
  }

  function submit() {
    const trimmed = reason.trim()
    if (kind === 'reject' && !trimmed) {
      setMissing(true)
      return
    }
    action.mutate(
      { action: { type: kind, reason: trimmed }, seen: order },
      {
        onSuccess: () => {
          setReason('')
          close()
          toast({ tone: 'success', title: `${copy.done}: ${order.reference}` })
        },
        onError: (failure) => {
          if (failure instanceof OrderChangedError) {
            close()
            toast(orderChangedToast(failure))
          }
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={action.isPending}>
            {copy.keep}
          </Button>
          <Button variant="danger" onClick={submit} loading={action.isPending}>
            {copy.submit}
          </Button>
        </>
      }
    >
      <Field
        label={copy.label}
        hint={`${copy.hint} Up to ${REASON_MAX} characters.`}
        required={kind === 'reject'}
        error={missing ? 'Say why, so the guest knows.' : fieldError}
      >
        <Textarea
          rows={3}
          value={reason}
          maxLength={REASON_MAX}
          onChange={(event) => {
            setReason(event.target.value)
            setMissing(false)
          }}
        />
      </Field>
      {!fieldError && <ActionError error={error} />}
    </Dialog>
  )
}
