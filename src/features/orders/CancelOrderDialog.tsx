import { useState } from 'react'
import { isApiError } from '@/api'
import { Button, Dialog, Field, Textarea, useToast } from '@/components'
import { useCancelGuestOrder } from './queries'

/** The server's limit on a cancellation reason. */
export const MAX_REASON_LENGTH = 300

type CancelOrderDialogProps = {
  token: string
  open: boolean
  onClose: () => void
  /** Called when the server says the order can't be cancelled any more (409): reload it. */
  onConflict: () => void
}

export function CancelOrderDialog({ token, open, onClose, onConflict }: CancelOrderDialogProps) {
  const { toast } = useToast()
  const cancel = useCancelGuestOrder(token)
  const [reason, setReason] = useState('')

  const error = cancel.error
  const reasonError = isApiError(error) ? error.fieldError('reason') : undefined

  function close() {
    if (cancel.isPending) return
    cancel.reset()
    onClose()
  }

  function submit() {
    cancel.mutate(reason.trim(), {
      onSuccess: () => {
        onClose()
        toast({ tone: 'success', title: 'Your order is cancelled' })
      },
      onError: (failure) => {
        if (isApiError(failure) && failure.status === 409) {
          // The order moved on (confirmed late, or the cutoff passed): show it as it is now.
          cancel.reset()
          onClose()
          onConflict()
          toast({
            tone: 'error',
            title: "This order can't be cancelled any more",
            description: requestIdNote(failure.message, failure.requestId),
          })
        }
      },
    })
  }

  // Errors other than 409 (which closes the dialog) and a field error stay here, by the buttons.
  const generalError =
    error && !reasonError && !(isApiError(error) && error.status === 409) ? error : null

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Cancel this order?"
      description="The bakery will be told straight away. This can't be undone."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={cancel.isPending}>
            Keep my order
          </Button>
          <Button variant="danger" onClick={submit} loading={cancel.isPending}>
            Cancel order
          </Button>
        </>
      }
    >
      <Field
        label="Reason (optional)"
        hint={`Helps the bakery. Up to ${MAX_REASON_LENGTH} characters.`}
        error={reasonError}
      >
        <Textarea
          rows={3}
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {generalError && (
        <p role="alert" className="text-sm text-danger">
          {isApiError(generalError)
            ? requestIdNote(generalError.message, generalError.requestId)
            : 'Something went wrong. Please try again.'}
        </p>
      )}
    </Dialog>
  )
}

function requestIdNote(message: string, requestId: string | null): string {
  return requestId ? `${message} (reference ${requestId})` : message
}
