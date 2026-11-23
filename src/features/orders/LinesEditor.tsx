import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button, Input, Select, useToast } from '@/components'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { ActionError } from './ActionError'
import { OrderChangedError, orderChangedToast, useOrderAction } from './order-actions'
import {
  draftChanged,
  draftProblem,
  draftSubtotal,
  isValidQuantity,
  MAX_LINES,
  MAX_QUANTITY,
  toDraft,
  toLinesRequest,
  type DraftLine,
} from './order-detail'
import type { OwnerOrder } from './orders-list'
import { orderableItemsQuery } from './owner-queries'

type LinesEditorProps = {
  order: OwnerOrder
  onDone: () => void
}

/**
 * Edits a pending order's items. Lines already on the order keep the price the guest saw; added
 * items take today's price. Saving replaces every line (PUT), so it's refused if the order
 * changed since the editor opened.
 */
export function LinesEditor({ order, onDone }: LinesEditorProps) {
  const id = useId()
  const { toast } = useToast()
  const action = useOrderAction()
  const items = useQuery(orderableItemsQuery())
  // The order as it was when editing started: what the draft is based on.
  const [seen] = useState(order)
  const [draft, setDraft] = useState<DraftLine[]>(() => toDraft(order))
  const [adding, setAdding] = useState('')
  const [showProblem, setShowProblem] = useState(false)

  const problem = draftProblem(draft)
  const changed = draftChanged(seen, draft)
  const onOrder = new Set(draft.map((line) => line.itemId))
  const addable = (items.data ?? []).filter((item) => item.orderable && !onOrder.has(item.id))
  const keptCount = draft.filter((line) => line.itemId).length
  const error = action.error instanceof OrderChangedError ? null : action.error

  const update = (index: number, change: Partial<DraftLine>) =>
    setDraft((lines) => lines.map((line, i) => (i === index ? { ...line, ...change } : line)))

  function add(itemId: string) {
    const item = items.data?.find((i) => i.id === itemId)
    if (!item) return
    setDraft((lines) => [
      ...lines,
      { itemId: item.id, itemName: item.name, unitPrice: item.price, quantity: 1, added: true },
    ])
    setAdding('')
  }

  function save() {
    if (problem) {
      setShowProblem(true)
      return
    }
    action.mutate(
      { action: { type: 'lines', lines: toLinesRequest(draft) }, seen },
      {
        onSuccess: () => {
          toast({ tone: 'success', title: 'Items saved' })
          onDone()
        },
        onError: (failure) => {
          if (failure instanceof OrderChangedError) {
            toast(orderChangedToast(failure))
            onDone()
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
        {draft.map((line, index) => (
          <li
            key={line.itemId ?? `deleted-${index}`}
            className={cn(
              'flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5',
              !line.itemId && 'bg-surface-muted text-muted',
            )}
          >
            <div className="min-w-40 flex-1">
              <span className="block font-medium">{line.itemName}</span>
              <span className="text-xs text-muted">
                {line.itemId
                  ? `${formatMoney(line.unitPrice)} each${line.added ? ' (today’s price)' : ''}`
                  : 'No longer in the catalogue: removed when you save'}
              </span>
            </div>
            {line.itemId && (
              <>
                <QuantityInput
                  label={`Quantity of ${line.itemName}`}
                  value={line.quantity}
                  onChange={(quantity) => update(index, { quantity })}
                />
                <span className="w-20 text-right tabular-nums">
                  {isValidQuantity(line.quantity)
                    ? formatMoney(line.unitPrice * line.quantity)
                    : '–'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${line.itemName}`}
                  onClick={() => setDraft((lines) => lines.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </>
            )}
          </li>
        ))}
        {draft.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">No items.</li>}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-add`} className="text-sm font-medium">
            Add an item
          </label>
          <Select
            id={`${id}-add`}
            className="w-64 max-w-full"
            value={adding}
            disabled={!items.data || keptCount >= MAX_LINES}
            onChange={(event) => add(event.target.value)}
          >
            <option value="">
              {items.isError
                ? 'Couldn’t load the items'
                : !items.data
                  ? 'Loading items…'
                  : addable.length === 0
                    ? 'No other items available'
                    : 'Choose an item…'}
            </option>
            {addable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({formatMoney(item.price)})
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm">
          New subtotal <strong className="tabular-nums">{formatMoney(draftSubtotal(draft))}</strong>
          {draftSubtotal(draft) !== seen.subtotal && (
            <span className="text-muted"> (was {formatMoney(seen.subtotal)})</span>
          )}
        </p>
      </div>

      {showProblem && problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      )}
      <ActionError error={error} />

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={action.isPending}>
          Discard changes
        </Button>
        <Button onClick={save} disabled={!changed} loading={action.isPending}>
          Save items
        </Button>
      </div>
    </div>
  )
}

/** A whole number from 1 to MAX_QUANTITY, with − and + buttons. */
function QuantityInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const valid = isValidQuantity(value)
  return (
    <fieldset aria-label={label} className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-label="One fewer"
        disabled={!valid || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden="true" className="size-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        aria-label="Quantity"
        min={1}
        max={MAX_QUANTITY}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        aria-invalid={!valid || undefined}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className="w-16 text-center tabular-nums"
      />
      <Button
        variant="ghost"
        size="sm"
        aria-label="One more"
        disabled={!valid || value >= MAX_QUANTITY}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" className="size-4" />
      </Button>
    </fieldset>
  )
}
