import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { clampQuantity, MAX_QUANTITY_PER_ITEM } from './cart-store'

type QuantityInputProps = {
  value: number
  onChange: (quantity: number) => void
  /** Accessible name, e.g. "Quantity". */
  label: string
  max?: number
  disabled?: boolean
  className?: string
}

/**
 * − [n] + stepper. Typing is allowed; the value is clamped to 1…max when the field loses focus, so
 * clearing the field to type a new number doesn't snap back mid-edit.
 */
export function QuantityInput({
  value,
  onChange,
  label,
  max = MAX_QUANTITY_PER_ITEM,
  disabled = false,
  className,
}: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value))
  // Follow outside changes (the +/− buttons, a reset after adding to the cart).
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDraft(String(value))
  }

  const clamp = (n: number) => Math.min(max, clampQuantity(n))
  const commit = () => {
    const next = clamp(Number(draft))
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const step =
    'flex size-10 items-center justify-center text-text hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      className={cn(
        'inline-flex h-10 items-stretch overflow-hidden rounded-control border border-border bg-surface',
        className,
      )}
    >
      <button
        type="button"
        className={step}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        className="w-12 [appearance:textfield] border-x border-border bg-transparent text-center text-sm font-medium tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={step}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
