import { useState } from 'react'
import { isApiError } from '@/api'
import { ActionError, Button, Dialog, useToast } from '@/components'
import { SlotPicker, type PickupSelection } from '@/features/checkout/SlotPicker'
import { formatLocal } from '@/lib/time'
import { OrderChangedError, orderChangedToast, useOrderAction } from './order-actions'
import type { OwnerOrder } from './orders-list'

type RescheduleDialogProps = {
  order: OwnerOrder
  zone: string
  open: boolean
  onClose: () => void
}

/**
 * Moves the pickup to another free slot, chosen with checkout's picker. The Owner may waive the
 * items' lead time (the server allows it), so every future slot with room is offered.
 */
export function RescheduleDialog({ order, zone, open, onClose }: RescheduleDialogProps) {
  const { toast } = useToast()
  const action = useOrderAction()
  const [pickup, setPickup] = useState<PickupSelection | null>(null)

  const error = action.error instanceof OrderChangedError ? null : action.error
  const unchanged = pickup?.slot.startsAt === order.pickupAt

  function close() {
    if (action.isPending) return
    action.reset()
    setPickup(null)
    onClose()
  }

  function submit() {
    if (!pickup || unchanged) return
    action.mutate(
      { action: { type: 'reschedule', pickupAt: pickup.slot.startsAt }, seen: order },
      {
        onSuccess: (moved) => {
          close()
          toast({
            tone: 'success',
            title: 'Pickup moved',
            description: `${order.reference} is now due ${formatLocal(moved.pickupAt, zone, 'datetime')}. Let the guest know.`,
          })
        },
        onError: (failure) => {
          if (failure instanceof OrderChangedError) {
            close()
            toast(orderChangedToast(failure))
          } else if (isApiError(failure) && failure.status === 409) {
            // The slot filled up or the day closed since the picker loaded: show it as it is now.
            setPickup(null)
          }
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Reschedule ${order.reference}`}
      description={`Now due ${formatLocal(order.pickupAt, zone, 'datetime')}. Any free pickup time can be chosen, even sooner than the items' usual notice.`}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={action.isPending}>
            Keep current time
          </Button>
          <Button onClick={submit} disabled={!pickup || unchanged} loading={action.isPending}>
            {pickup && !unchanged
              ? `Move to ${formatLocal(pickup.slot.startsAt, zone, 'datetime')}`
              : 'Move pickup'}
          </Button>
        </>
      }
    >
      {/* Mounted only while open: the picker loads (and polls) availability. */}
      {open && <SlotPicker leadTimeHours={0} value={pickup} onChange={setPickup} />}
      {unchanged && <p className="text-sm text-muted">That's the current pickup time.</p>}
      <ActionError error={error} />
    </Dialog>
  )
}
