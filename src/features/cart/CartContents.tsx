import { AlertTriangle, Croissant, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { apiUrl } from '@/api'
import { Button, ButtonLink, EmptyState } from '@/components'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { useCheckedCart, type CheckedCart, type CheckedLine } from './cart-check'
import { cartStore } from './cart-store'
import { QuantityInput } from './QuantityInput'

type CartContentsProps = {
  /** Called when a link inside navigates away, so a drawer can close itself. */
  onNavigate?: () => void
  /** The buttons under the subtotal, e.g. Checkout. Given the checked cart to decide on. */
  renderActions: (cart: CheckedCart) => ReactNode
}

/**
 * The cart's lines, re-checked against the catalogue, with quantity, remove and subtotal. Shared by
 * the cart drawer and the cart page.
 */
export function CartContents({ onNavigate, renderActions }: CartContentsProps) {
  const cart = useCheckedCart()

  if (cart.lines.length === 0) {
    return (
      <EmptyState
        icon="🧺"
        title="Your cart is empty"
        description="Fresh bread, cakes and pastries are a click away."
        action={
          <ButtonLink to="/" onClick={onNavigate}>
            Browse the menu
          </ButtonLink>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border">
        {cart.lines.map((line) => (
          <li key={line.itemId} className="py-4 first:pt-0">
            <CartLineRow line={line} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>

      {cart.blocked.length > 0 && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-control bg-warning/10 px-4 py-3 text-sm"
        >
          <p>
            {cart.blocked.length === 1
              ? "1 item can't be ordered right now."
              : `${cart.blocked.length} items can't be ordered right now.`}{' '}
            Remove {cart.blocked.length === 1 ? 'it' : 'them'} to check out.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => cart.blocked.forEach((line) => cartStore.remove(line.itemId))}
          >
            Remove unavailable items
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <p className="flex items-baseline justify-between text-base font-semibold">
          <span>Subtotal</span>
          <span aria-live="polite">{formatMoney(cart.subtotal)}</span>
        </p>
        <p className="text-sm text-muted">You choose the pickup time at checkout.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">{renderActions(cart)}</div>
    </div>
  )
}

function CartLineRow({ line, onNavigate }: { line: CheckedLine; onNavigate?: () => void }) {
  const { check } = line
  const name = 'item' in check ? check.item.name : line.name

  return (
    <div className="flex gap-3">
      <LineThumbnail src={apiUrl(line.thumbnailUrl)} dimmed={!line.orderable} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {check.status === 'gone' ? (
              <p className="font-semibold">{name}</p>
            ) : (
              <Link
                to={`/items/${line.itemId}`}
                onClick={onNavigate}
                className="font-semibold underline-offset-4 hover:underline"
              >
                {name}
              </Link>
            )}
            <p className="text-sm text-muted">{formatMoney(line.unitPrice)} each</p>
          </div>
          <p
            className={cn(
              'shrink-0 font-semibold tabular-nums',
              !line.orderable && 'text-muted line-through',
            )}
          >
            {formatMoney(line.total)}
          </p>
        </div>

        <LineNotice line={line} name={name} />

        <div className="flex items-center justify-between gap-3">
          {line.orderable ? (
            <QuantityInput
              label={`Quantity of ${name}`}
              value={line.quantity}
              onChange={(quantity) => cartStore.setQuantity(line.itemId, quantity)}
            />
          ) : (
            <p className="text-sm text-muted">Quantity: {line.quantity}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cartStore.remove(line.itemId)}
            aria-label={`Remove ${name}`}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Remove</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

function LineNotice({ line, name }: { line: CheckedLine; name: string }) {
  const { check } = line
  switch (check.status) {
    case 'priceChanged':
      return (
        <Notice>
          <span>
            The price changed from {formatMoney(check.was)} to {formatMoney(check.item.price)}.
          </span>
          <button
            type="button"
            onClick={() => cartStore.refresh(check.item)}
            aria-label={`OK, keep ${name} at the new price`}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            OK
          </button>
        </Notice>
      )
    case 'soldOut':
      return <Notice>Sold out right now.</Notice>
    case 'gone':
      return <Notice>No longer on the menu.</Notice>
    case 'unchecked':
      return (
        <p className="text-xs text-muted">
          We couldn&apos;t check the latest price. It is confirmed at checkout.
        </p>
      )
    default:
      return null
  }
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-warning">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  )
}

function LineThumbnail({ src, dimmed }: { src: string | undefined; dimmed: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-control bg-surface-muted sm:size-20">
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className={cn('size-full object-cover', dimmed && 'opacity-60 grayscale')}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted">
          <Croissant aria-hidden="true" className="size-6" />
        </div>
      )}
    </div>
  )
}
